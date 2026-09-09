"""Séparation des équipes par la couleur des chasubles.

La couleur est mesurée sur le buste, jamais sur la boîte entière : le sol, les
jambes et le public dilueraient la teinte. On raisonne en TSV plutôt qu'en RVB
parce qu'une chasuble rouge sous un néon et la même chasuble dans l'ombre ont
la même teinte mais pas la même luminosité — comparer les canaux RVB
classerait le joueur de l'ombre dans l'autre équipe.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field

from .scene import TEAM_A, TEAM_B

Rgb = tuple[int, int, int]


def rgb_to_hsv(color: Rgb) -> tuple[float, float, float]:
    """RVB (0-255) vers TSV — teinte en degrés, saturation et valeur dans [0, 1]."""
    r, g, b = (max(0.0, min(255.0, float(c))) / 255.0 for c in color)
    high = max(r, g, b)
    low = min(r, g, b)
    delta = high - low
    if delta < 1e-9:
        hue = 0.0
    elif high == r:
        hue = 60.0 * (((g - b) / delta) % 6.0)
    elif high == g:
        hue = 60.0 * (((b - r) / delta) + 2.0)
    else:
        hue = 60.0 * (((r - g) / delta) + 4.0)
    saturation = 0.0 if high < 1e-9 else delta / high
    return hue, saturation, high


def color_distance(first: Rgb, second: Rgb) -> float:
    """Distance perceptuelle approchée entre deux couleurs, dans [0, 1].

    La teinte domine quand les deux couleurs sont saturées ; entre une chasuble
    blanche et une noire, il ne reste que la luminosité pour trancher, et c'est
    elle qui pèse alors.
    """
    h1, s1, v1 = rgb_to_hsv(first)
    h2, s2, v2 = rgb_to_hsv(second)

    hue_gap = abs(h1 - h2)
    hue_gap = min(hue_gap, 360.0 - hue_gap) / 180.0
    chroma_weight = min(s1, s2)

    hue_term = hue_gap * chroma_weight
    saturation_term = abs(s1 - s2) * 0.5
    value_term = abs(v1 - v2) * (1.0 - chroma_weight)
    return min(1.0, hue_term + saturation_term + value_term)


@dataclass(frozen=True, slots=True)
class TeamPalette:
    """Les deux couleurs de chasubles du match."""

    color_a: Rgb
    color_b: Rgb

    def classify(self, color: Rgb) -> tuple[str, float]:
        """Équipe la plus proche, et la confiance associée.

        La confiance est l'écart relatif entre les deux distances : deux
        couleurs également proches donnent zéro, ce qui est exactement le
        message à faire remonter à l'arbitre.
        """
        distance_a = color_distance(color, self.color_a)
        distance_b = color_distance(color, self.color_b)
        total = distance_a + distance_b
        if total < 1e-9:
            return TEAM_A, 0.0
        if distance_a <= distance_b:
            return TEAM_A, (distance_b - distance_a) / total
        return TEAM_B, (distance_a - distance_b) / total

    @property
    def separation(self) -> float:
        """Écart entre les deux couleurs : sous 0,2 le match est ininterprétable."""
        return color_distance(self.color_a, self.color_b)


def cluster_two_colors(samples: Sequence[Rgb], iterations: int = 12) -> TeamPalette:
    """Déduit les deux couleurs dominantes d'un nuage d'échantillons.

    Utile quand les couleurs de chasubles n'ont pas été saisies : on part des
    deux échantillons les plus éloignés l'un de l'autre et on itère un k-moyennes
    à deux classes. Les couleurs déclarées restent préférables — le nuage
    contient aussi l'arbitre, les gardiens et les spectateurs au bord.
    """
    if len(samples) < 2:
        raise ValueError("au moins deux échantillons de couleur sont nécessaires")

    seed_a, seed_b = max(
        ((a, b) for i, a in enumerate(samples) for b in samples[i + 1 :]),
        key=lambda pair: color_distance(*pair),
    )
    center_a, center_b = seed_a, seed_b

    for _ in range(iterations):
        group_a = [s for s in samples if color_distance(s, center_a) <= color_distance(s, center_b)]
        group_b = [s for s in samples if s not in group_a]
        if not group_a or not group_b:
            break
        new_a = _mean_color(group_a)
        new_b = _mean_color(group_b)
        if new_a == center_a and new_b == center_b:
            break
        center_a, center_b = new_a, new_b

    return TeamPalette(center_a, center_b)


def _mean_color(colors: Sequence[Rgb]) -> Rgb:
    count = len(colors)
    return (
        round(sum(c[0] for c in colors) / count),
        round(sum(c[1] for c in colors) / count),
        round(sum(c[2] for c in colors) / count),
    )


@dataclass(slots=True)
class TeamVotes:
    """Cumul des votes de couleur, piste par piste.

    Décider de l'équipe image par image ferait clignoter les joueurs d'une
    équipe à l'autre au gré des occultations. On accumule sur toute la durée de
    la piste, pondéré par la confiance de chaque mesure.
    """

    palette: TeamPalette
    _scores: dict[int, dict[str, float]] = field(
        default_factory=lambda: defaultdict(lambda: {TEAM_A: 0.0, TEAM_B: 0.0})
    )

    def observe(self, track_id: int, color: Rgb) -> None:
        team, confidence = self.palette.classify(color)
        self._scores[track_id][team] += confidence

    def resolve(self, track_id: int) -> tuple[str | None, float]:
        scores = self._scores.get(track_id)
        if not scores:
            return None, 0.0
        total = scores[TEAM_A] + scores[TEAM_B]
        if total < 1e-9:
            return None, 0.0
        if scores[TEAM_A] >= scores[TEAM_B]:
            return TEAM_A, scores[TEAM_A] / total
        return TEAM_B, scores[TEAM_B] / total

    def resolve_all(self) -> dict[int, tuple[str | None, float]]:
        return {track_id: self.resolve(track_id) for track_id in self._scores}
