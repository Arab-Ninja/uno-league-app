"""Lecture du tableau d'affichage incrusté par le centre.

Ce module ne produit **jamais** de statistique. Il produit un repère : la suite
des instants où le score a changé, pour mesurer ce que la détection géométrique
a vu et manqué (voir `uno_vision.reference`). Tous les centres n'incrustent pas
de tableau, et ceux qui le font peuvent en changer sans prévenir.

La lecture ne suppose aucune police connue, et c'est ce qui la rend
transposable d'un centre à l'autre. Elle repose sur trois propriétés que le
football garantit et qu'aucune incrustation ne peut contredire :

1. le score part de zéro et passe par chaque unité — les dix premières
   silhouettes vues seules sont donc, dans l'ordre, les chiffres 0 à 9 ;
2. il n'existe que dix chiffres — une fois dix formes connues, toute forme
   nouvelle est un artefact de compression, pas un onzième chiffre ;
3. un score augmente d'exactement un — toute lecture qui saute ou recule est
   fausse, et le repère la signale au lieu de la propager.

La troisième propriété est aussi l'autocontrôle du système : le nombre de
changements comptés doit reconstituer le score affiché à la fin. Sur cinq
sessions de centres différents (55 à 89 min), les deux coïncident exactement.

Reste que les chiffres sont **très en retard** sur l'action : ils sont saisis à
la main par un employé, et la mesure donne une trentaine de secondes. Beaucoup
de systèmes affichent en revanche un bandeau « BUT DE TEAM X » dès le but, et
le retirent au moment de la saisie. L'apparition de ce bandeau est donc l'instant
du but, à la seconde près — vérifié à 19:33,20 pour un bandeau affichant
« 19:33 ». Quand il existe, il sert à recaler chaque but ; les chiffres, eux,
continuent de dire quelle équipe a marqué et combien de fois.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from ..reference import ReferenceGoal, ReferenceTimeline

GREEN_LOW = (40, 90, 90)
GREEN_HIGH = (85, 255, 255)
BANNER_HEIGHT = 45
GLYPH_SHAPE = (10, 14)
DIGITS = 10
BANNER_STRIP = 0.12
"""Fraction basse de l'image où s'affiche l'annonce du but."""
BANNER_CONTRAST = 60.0
"""Écart de luminosité minimal pour croire à un bandeau plutôt qu'à un reflet."""
BANNER_MAX_LEAD_S = 120.0
"""Ancienneté maximale d'un bandeau pour être rattaché à un but."""
BANNER_LAG_TOLERANCE_S = 15.0
"""Écart toléré au retard habituel avant de renoncer à rattacher une annonce."""


@dataclass(frozen=True, slots=True)
class ScoreBox:
    """Rectangle coloré qui porte les deux scores, dans le bandeau supérieur."""

    x: int
    y: int
    width: int
    height: int

    @property
    def half(self) -> int:
        return self.width // 2


def find_score_box(video_path: str | Path, probes: int = 12) -> ScoreBox | None:
    """Repère le bloc des scores, sans savoir où le centre l'a placé.

    Le bloc est un rectangle plein d'une couleur franche dans le bandeau
    supérieur. Le vote sur plusieurs images éparpillées dans la vidéo écarte les
    bandeaux publicitaires défilants, qui contiennent parfois la même couleur
    mais jamais au même endroit.
    """
    import cv2

    capture = cv2.VideoCapture(str(video_path))
    try:
        total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
        votes: dict[tuple[int, int, int, int], int] = {}
        for step in range(probes):
            capture.set(cv2.CAP_PROP_POS_FRAMES, int(total * (step + 1) / (probes + 1)))
            ok, image = capture.read()
            if not ok:
                continue
            mask = cv2.inRange(
                cv2.cvtColor(image[0:BANNER_HEIGHT, :], cv2.COLOR_BGR2HSV),
                GREEN_LOW,
                GREEN_HIGH,
            )
            count, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
            for index in range(1, count):
                x, y, w, h, area = (int(v) for v in stats[index])
                if 25 <= w <= 90 and 12 <= h <= 40 and area >= 0.6 * w * h:
                    votes[(x, y, w, h)] = votes.get((x, y, w, h), 0) + 1
    finally:
        capture.release()

    if not votes:
        return None
    x, y, w, h = max(votes.items(), key=lambda item: item[1])[0]
    return ScoreBox(x, y, w, h)


def _glyphs(part, scale: int = 6) -> list:
    """Silhouettes normalisées des chiffres d'un demi-bloc, de gauche à droite."""
    import cv2
    import numpy as np

    enlarged = cv2.resize(part, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    ink = cv2.bitwise_not(
        cv2.inRange(cv2.cvtColor(enlarged, cv2.COLOR_BGR2HSV), GREEN_LOW, GREEN_HIGH)
    )
    ink = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    count, labels, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    height = enlarged.shape[0]

    found = []
    for index in range(1, count):
        x, y, w, h, area = (int(v) for v in stats[index])
        if h < 0.35 * height or h > 0.95 * height or w < 0.10 * height or area < 40:
            continue
        patch = (labels[y : y + h, x : x + w] == index).astype(np.uint8) * 255
        found.append((x, cv2.resize(patch, GLYPH_SHAPE, interpolation=cv2.INTER_AREA) > 110))
    return [glyph for _, glyph in sorted(found, key=lambda item: item[0])]


def _shift_tolerant_distance(first, second) -> float:
    """Écart entre deux silhouettes, en absorbant un décalage d'un pixel.

    L'incrustation n'est pas alignée au pixel près d'une image à l'autre. Sans
    cette tolérance, le même chiffre forme deux groupes et le score se met à
    osciller entre deux valeurs — c'est la première chose qui casse.
    """
    import numpy as np

    best = 1.0
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            shifted = np.roll(np.roll(second, dy, axis=0), dx, axis=1)
            best = min(best, float((first != shifted).mean()))
    return best


class _GlyphGroups:
    """Regroupe les silhouettes identiques, sans savoir quel chiffre c'est."""

    def __init__(self, threshold: float = 0.16) -> None:
        self.models: list = []
        self.threshold = threshold
        self.counts: list[int] = []

    def key(self, glyph) -> int:
        distances = [
            (_shift_tolerant_distance(glyph, model), index)
            for index, model in enumerate(self.models)
        ]
        if distances:
            distance, index = min(distances)
            if distance <= self.threshold:
                self.counts[index] += 1
                return index
        self.models.append(glyph)
        self.counts.append(1)
        return len(self.models) - 1

    def nearest_known(self, key: int, allowed: Sequence[int]) -> int:
        if key in allowed:
            return key
        glyph = self.models[key]
        return min(
            allowed, key=lambda other: _shift_tolerant_distance(glyph, self.models[other])
        )


def read_scoreboard(
    video_path: str | Path,
    box: ScoreBox | None = None,
    stride: int = 25,
    persistence: int = 3,
    progress: Callable[[int, int], None] | None = None,
) -> ReferenceTimeline:
    """Suite des buts marqués, telle que le tableau du centre la donne."""
    import cv2

    box = box or find_score_box(video_path)
    if box is None:
        return ReferenceTimeline(video=str(video_path), source="scoreboard-absent")

    capture = cv2.VideoCapture(str(video_path))
    fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    groups = _GlyphGroups()
    readings: list[list[tuple[float, tuple[int, ...]]]] = [[], []]
    banner: list[tuple[float, float]] = []

    index = 0
    try:
        while True:
            ok, image = capture.read()
            if not ok:
                break
            if index % stride == 0:
                crop = image[box.y : box.y + box.height, box.x : box.x + box.width]
                for side, part in enumerate((crop[:, : box.half], crop[:, box.half :])):
                    pattern = tuple(groups.key(glyph) for glyph in _glyphs(part))
                    readings[side].append((index / fps, pattern))
                banner.append((index / fps, _banner_brightness(image)))
                if progress is not None and index % (stride * 200) == 0:
                    progress(index, total)
            index += 1
    finally:
        capture.release()

    frequent = sorted(
        sorted(range(len(groups.models)), key=lambda k: groups.counts[k], reverse=True)[
            :DIGITS
        ]
    )
    goals: list[ReferenceGoal] = []
    final: list[int] = []

    for side, label in ((0, "A"), (1, "B")):
        steps = [
            (moment, tuple(groups.nearest_known(key, frequent) for key in pattern))
            for moment, pattern in _stable(readings[side], persistence, stride, fps)
            if pattern
        ]
        score = _read_progression(steps, goals, label)
        final.append(score)

    goals = _align_on_banner(goals, _banner_onsets(banner))
    goals.sort(key=lambda goal: goal.time_s)
    return ReferenceTimeline(
        goals=tuple(goals),
        video=str(video_path),
        final_score=(final[0], final[1]),
    )


def _banner_brightness(image) -> float:
    """Luminosité moyenne du bas de l'image, là où s'affiche l'annonce."""
    height, width = image.shape[:2]
    strip = image[int(height * (1.0 - BANNER_STRIP)) :, int(width * 0.35) : int(width * 0.95)]
    return float(strip.mean())


def _banner_onsets(series: Sequence[tuple[float, float]]) -> list[float]:
    """Instants où le bandeau d'annonce apparaît.

    Le seuil se place au milieu de la plage observée plutôt qu'à une valeur
    fixe : un bandeau blanc sur un sol sombre saute de 80 à 255, mais la mesure
    dépend de l'éclairage de la salle et du cadrage. Sans contraste franc on
    renonce — mieux vaut un repère en retard qu'un repère inventé.
    """
    if len(series) < 10:
        return []
    values = [value for _, value in series]
    low, high = min(values), max(values)
    if high - low < BANNER_CONTRAST:
        return []

    threshold = (low + high) / 2.0
    onsets: list[float] = []
    previous = False
    for moment, value in series:
        visible = value > threshold
        if visible and not previous:
            onsets.append(moment)
        previous = visible
    return onsets


def _align_on_banner(
    goals: list[ReferenceGoal], onsets: Sequence[float]
) -> list[ReferenceGoal]:
    """Recale chaque but sur l'annonce qui l'a précédé.

    Les chiffres disent quelle équipe a marqué — ils sont exacts là-dessus. Le
    bandeau dit quand — il apparaît au but même. Chacun sert à ce qu'il fait le
    mieux.

    L'appariement respecte l'ordre du temps et l'exclusivité, parce que la
    réalité les respecte : deux buts qui s'enchaînent laissent le bandeau allumé
    sans interruption et ne produisent qu'un seul front montant. Sans exclusion,
    le second but se rattacherait au bandeau du premier et reculerait de
    cinquante secondes au lieu de trente — pire que de ne rien corriger.

    Le retard du système étant constant, on cherche pour chaque but l'annonce
    dont l'écart s'approche le plus du retard habituel, plutôt que la plus
    proche dans l'absolu. Les buts restés sans annonce propre sont décalés de ce
    retard ; `announced` distingue les deux cas, car une estimation n'est pas
    une mesure.
    """
    if not onsets or not goals:
        return goals

    per_goal_minimum = sorted(
        min(
            (goal.time_s - onset for onset in onsets if 0.0 < goal.time_s - onset
             <= BANNER_MAX_LEAD_S),
            default=None,
        )
        for goal in goals
        if any(0.0 < goal.time_s - onset <= BANNER_MAX_LEAD_S for onset in onsets)
    )
    if not per_goal_minimum:
        return goals
    # Un quartile bas, et non la médiane : lorsqu'un bandeau est partagé par deux
    # buts qui s'enchaînent, l'écart mesuré pour le second est gonflé. Le partage
    # allonge le retard apparent, il ne le raccourcit jamais — la médiane serait
    # donc tirée vers le haut, et le premier but des paires manquerait son propre
    # bandeau.
    typical = per_goal_minimum[len(per_goal_minimum) // 4]

    used: set[int] = set()
    matched: dict[int, float] = {}
    for index, goal in sorted(enumerate(goals), key=lambda item: item[1].time_s):
        candidates = [
            (abs((goal.time_s - onset) - typical), position)
            for position, onset in enumerate(onsets)
            if position not in used and 0.0 < goal.time_s - onset <= BANNER_MAX_LEAD_S
        ]
        if not candidates:
            continue
        gap, position = min(candidates)
        if gap > BANNER_LAG_TOLERANCE_S:
            continue
        used.add(position)
        matched[index] = onsets[position]

    lags = sorted(goals[index].time_s - onset for index, onset in matched.items())
    median_lag = lags[len(lags) // 2] if lags else typical

    return [
        ReferenceGoal(
            time_s=matched.get(index, max(0.0, goal.time_s - median_lag)),
            side=goal.side,
            score_after=goal.score_after,
            uncertain=goal.uncertain,
            announced=index in matched,
        )
        for index, goal in enumerate(goals)
    ]


def _stable(
    readings: Sequence[tuple[float, tuple[int, ...]]],
    persistence: int,
    stride: int,
    fps: float,
) -> list[tuple[float, tuple[int, ...]]]:
    """Ne retient un motif qu'après plusieurs lectures identiques d'affilée.

    Une image prise pendant la transition d'un chiffre montre les deux à demi :
    sans cette exigence, chaque but produirait deux ou trois valeurs fantômes.
    """
    output: list[tuple[float, tuple[int, ...]]] = []
    current: tuple[int, ...] | None = None
    held: tuple[int, ...] | None = None
    count = 0
    for moment, pattern in readings:
        if pattern == current:
            count += 1
        else:
            current, count = pattern, 1
        if count == persistence and pattern != held:
            held = pattern
            output.append((moment - (persistence - 1) * stride / fps, pattern))
    return output


def _read_progression(
    steps: Sequence[tuple[float, tuple[int, ...]]],
    goals: list[ReferenceGoal],
    label: str,
) -> int:
    """Transforme des motifs en scores, puis en buts.

    Les dix premières silhouettes vues seules sont, dans l'ordre, les chiffres
    0 à 9 : un score part de zéro et passe par chaque unité avant d'atteindre la
    dizaine. Cela suffit à donner un sens numérique aux groupes, sans jamais
    avoir eu à reconnaître une police.
    """
    digit_value: dict[int, int] = {}
    for _, pattern in steps:
        if len(pattern) == 1 and pattern[0] not in digit_value:
            digit_value[pattern[0]] = len(digit_value)
        if len(digit_value) == DIGITS:
            break

    def to_number(pattern: tuple[int, ...]) -> int | None:
        total = 0
        for key in pattern:
            if key not in digit_value:
                return None
            total = total * 10 + digit_value[key]
        return total

    score = 0
    for moment, pattern in steps:
        value = to_number(pattern)
        if value is None or value <= score:
            continue
        skipped = value > score + 1
        for point in range(score + 1, value + 1):
            goals.append(
                ReferenceGoal(
                    time_s=moment,
                    side=label,
                    score_after=point,
                    uncertain=skipped and point < value,
                )
            )
        score = value
    return score
