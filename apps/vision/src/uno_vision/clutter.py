"""Choix du ballon parmi les candidats, et rejet du décor.

Sur de vraies images de salle, un détecteur généraliste sort volontiers trois ou
quatre « ballons » par image, et le vrai n'est presque jamais celui qui a la
meilleure note. Les marquages blancs peints sur le gazon, les logos ronds des
panneaux publicitaires et les plots ressemblent davantage à un ballon de
catalogue que le vrai ballon, flou et à moitié caché par une jambe.

Deux propriétés séparent pourtant le ballon du décor, et aucune des deux n'est
une question d'apparence :

* **le décor ne bouge pas.** Un marquage détecté au même endroit pendant tout le
  match est un marquage. Le ballon, lui, finit toujours par se déplacer ;
* **le ballon a une histoire.** D'une image à la suivante, il ne peut pas sauter
  d'un bout du terrain à l'autre : la continuité vaut mieux qu'un score de
  confiance.

Ce module applique les deux, en Python pur, sur des candidats déjà détectés.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from .scene import BBox, Detection, Point


@dataclass(frozen=True, slots=True)
class ClutterMap:
    """Les endroits de l'image où un faux ballon apparaît en permanence."""

    points: tuple[Point, ...]
    radius_px: float

    def is_clutter(self, point: Point) -> bool:
        return any(point.distance_to(spot) <= self.radius_px for spot in self.points)

    def __len__(self) -> int:
        return len(self.points)


def find_static_clutter(
    sightings: Sequence[tuple[float, Point]],
    frame_count: int,
    *,
    radius_px: float = 14.0,
    presence_ratio: float = 0.35,
    span_ratio: float = 0.5,
) -> ClutterMap:
    """Repère les faux ballons immobiles sur l'ensemble d'un clip.

    Un amas de détections est considéré comme du décor s'il est vu sur une
    fraction importante des images **et** réparti d'un bout à l'autre du clip.
    Les deux conditions comptent : la première seule bannirait un ballon resté
    quelques secondes au même endroit pendant un arrêt de jeu, la seconde seule
    bannirait un ballon revenu par hasard à sa position de départ.
    """
    if frame_count <= 0 or not sightings:
        return ClutterMap((), radius_px)

    clusters: list[list[tuple[float, Point]]] = []
    for moment, position in sightings:
        for cluster in clusters:
            if position.distance_to(cluster[0][1]) <= radius_px:
                cluster.append((moment, position))
                break
        else:
            clusters.append([(moment, position)])

    first = min(moment for moment, _ in sightings)
    last = max(moment for moment, _ in sightings)
    duration = max(1e-6, last - first)

    spots: list[Point] = []
    for cluster in clusters:
        moments = [moment for moment, _ in cluster]
        seen_ratio = len(cluster) / frame_count
        cluster_span = (max(moments) - min(moments)) / duration
        if seen_ratio >= presence_ratio and cluster_span >= span_ratio:
            spots.append(_mean_point([position for _, position in cluster]))

    return ClutterMap(tuple(spots), radius_px)


def _mean_point(points: Sequence[Point]) -> Point:
    count = len(points)
    return Point(
        sum(point.x for point in points) / count,
        sum(point.y for point in points) / count,
    )


@dataclass(slots=True)
class BallPicker:
    """Choisit le ballon image après image, en s'appuyant sur sa trajectoire."""

    clutter: ClutterMap = field(default_factory=lambda: ClutterMap((), 14.0))
    max_jump_px: float = 140.0
    """Déplacement plausible du ballon entre deux images consécutives."""
    continuity_bonus: float = 0.5
    """Poids de la continuité face à la confiance du détecteur.

    Il est délibérément élevé. Sur les images observées, le vrai ballon sort à
    0,10 de confiance et un marquage peint à 0,33 : s'en remettre à la note du
    détecteur revient à suivre le décor.
    """
    memory_frames: int = 12
    _last: Point | None = None
    _missing: int = 0

    def reset(self) -> None:
        self._last = None
        self._missing = 0

    def pick(self, candidates: Sequence[Detection]) -> Detection | None:
        """Retient au plus un candidat, ou aucun si tous sont douteux."""
        usable = [
            candidate
            for candidate in candidates
            if not self.clutter.is_clutter(_anchor(candidate.bbox))
        ]
        if not usable:
            self._forget()
            return None

        best = max(usable, key=self._score)
        if self._last is not None and self._score(best) < 0.0:
            # Aucun candidat n'est ni sûr ni cohérent avec la trajectoire :
            # mieux vaut une image sans ballon qu'une position inventée, que
            # l'interpolation saura combler si le trou est court.
            self._forget()
            return None

        self._last = _anchor(best.bbox)
        self._missing = 0
        return best

    def _score(self, candidate: Detection) -> float:
        score = candidate.score
        if self._last is None:
            return score
        jump = _anchor(candidate.bbox).distance_to(self._last)
        tolerance = self.max_jump_px * (1 + self._missing)
        if jump > tolerance:
            return score - self.continuity_bonus
        return score + self.continuity_bonus * (1.0 - jump / tolerance)

    def _forget(self) -> None:
        self._missing += 1
        if self._missing > self.memory_frames:
            self._last = None


def _anchor(bbox: BBox) -> Point:
    return bbox.center
