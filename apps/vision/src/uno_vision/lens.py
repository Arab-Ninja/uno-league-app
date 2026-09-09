"""Correction de la distorsion de l'objectif.

Les caméras des salles de foot à cinq sont des grands-angles très déformants :
un mur rectiligne devient un arc de cercle dans l'image. Or une homographie
suppose un objectif rectilinéaire — elle transporte les droites en droites. Lui
donner des points déformés produit des distances fausses, d'autant plus fausses
qu'on s'éloigne du centre de l'image, c'est-à-dire précisément là où se jouent
les buts.

On corrige donc **avant** de projeter, avec le modèle par division de Fitzgibbon :

    r_corrigé = r_mesuré / (1 + k₁·r² + k₂·r⁴)

Un seul paramètre suffit en pratique. Et il s'estime sans mire de calibration :
il suffit de cliquer des points le long de lignes qu'on sait droites dans la
réalité — le bas d'une bande publicitaire, une ligne de surface, la jonction du
mur et du sol — et de chercher la valeur qui les rend droites. C'est la méthode
dite « du fil à plomb ».
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

from .scene import Point


@dataclass(frozen=True, slots=True)
class LensDistortion:
    """Distorsion radiale d'un objectif, autour d'un centre optique."""

    center: Point
    k1: float = 0.0
    k2: float = 0.0
    scale: float = 1.0
    """Rayon de normalisation, typiquement la demi-diagonale de l'image.

    Sans lui, `k1` dépendrait de la résolution et une même salle filmée en 720p
    puis en 1080p demanderait deux calibrations.
    """

    @property
    def is_identity(self) -> bool:
        return self.k1 == 0.0 and self.k2 == 0.0

    def undistort(self, point: Point) -> Point:
        """Position que le point occuperait avec un objectif rectilinéaire."""
        if self.is_identity:
            return point
        offset = point - self.center
        radius = offset.norm() / self.scale
        factor = 1.0 + self.k1 * radius**2 + self.k2 * radius**4
        if abs(factor) < 1e-9:
            return point
        return Point(
            self.center.x + offset.x / factor,
            self.center.y + offset.y / factor,
        )

    def distort(self, point: Point) -> Point:
        """Opération inverse : où ce point apparaît dans l'image réelle.

        Sert à tracer sur l'image des repères calculés sur le terrain — un
        contrôle visuel de calibration, essentiellement.
        """
        if self.is_identity:
            return point
        offset = point - self.center
        target = offset.norm() / self.scale
        if target < 1e-12:
            return point

        # Le modèle est monotone jusqu'à son pôle — le rayon où le dénominateur
        # s'annule et au-delà duquel il ne décrit plus rien de physique. La
        # dichotomie reste donc en deçà, et converge en une soixantaine
        # d'itérations sans risque de diverger comme le ferait une méthode de
        # Newton près de ce pôle.
        low, high = 0.0, self.usable_radius
        for _ in range(60):
            middle = (low + high) / 2.0
            denominator = 1.0 + self.k1 * middle**2 + self.k2 * middle**4
            undistorted = middle / denominator if denominator > 1e-9 else float("inf")
            if undistorted < target:
                low = middle
            else:
                high = middle
        radius = (low + high) / 2.0 * self.scale
        direction = offset.normalized()
        return Point(
            self.center.x + direction.x * radius,
            self.center.y + direction.y * radius,
        )

    @property
    def usable_radius(self) -> float:
        """Rayon normalisé au-delà duquel le modèle cesse d'avoir un sens.

        En distorsion en barillet, le dénominateur finit par s'annuler : au
        pôle, un point du monde serait projeté à l'infini. Toute la plage utile
        est en deçà, et l'image réelle y tient largement — le rayon d'un coin
        vaut 1 par construction de `scale`.
        """
        pole = _smallest_positive_pole(self.k1, self.k2)
        return min(4.0, 0.98 * pole) if pole else 4.0

    def to_dict(self) -> dict[str, float | list[float]]:
        return {
            "center": [self.center.x, self.center.y],
            "k1": self.k1,
            "k2": self.k2,
            "scale": self.scale,
        }

    @classmethod
    def from_dict(cls, payload: dict) -> "LensDistortion":
        center = payload.get("center", [0.0, 0.0])
        return cls(
            center=Point(float(center[0]), float(center[1])),
            k1=float(payload.get("k1", 0.0)),
            k2=float(payload.get("k2", 0.0)),
            scale=float(payload.get("scale", 1.0)) or 1.0,
        )

    @classmethod
    def none(cls) -> "LensDistortion":
        return cls(center=Point(0.0, 0.0))


def _smallest_positive_pole(k1: float, k2: float) -> float | None:
    """Plus petit rayon annulant `1 + k₁r² + k₂r⁴`, s'il existe."""
    if abs(k2) < 1e-12:
        if k1 >= 0.0:
            return None
        return math.sqrt(-1.0 / k1)

    discriminant = k1**2 - 4.0 * k2
    if discriminant < 0.0:
        return None
    roots = [
        (-k1 + sign * math.sqrt(discriminant)) / (2.0 * k2) for sign in (1.0, -1.0)
    ]
    positive = [root for root in roots if root > 1e-12]
    return math.sqrt(min(positive)) if positive else None


def straightness_error(points: Sequence[Point]) -> float:
    """Écart quadratique moyen des points à leur meilleure droite.

    La droite est ajustée au sens des moindres carrés **totaux** : la distance
    minimisée est perpendiculaire, et non verticale. Une droite verticale doit
    pouvoir être ajustée comme les autres, ce qu'une régression classique ne
    sait pas faire.

    La somme des carrés des distances perpendiculaires est exactement la plus
    petite valeur propre de la matrice de dispersion, qu'on obtient ici sans
    passer par un solveur.
    """
    count = len(points)
    if count < 3:
        return 0.0

    mean_x = sum(p.x for p in points) / count
    mean_y = sum(p.y for p in points) / count
    sxx = sum((p.x - mean_x) ** 2 for p in points)
    syy = sum((p.y - mean_y) ** 2 for p in points)
    sxy = sum((p.x - mean_x) * (p.y - mean_y) for p in points)

    trace = sxx + syy
    gap = math.sqrt((sxx - syy) ** 2 + 4.0 * sxy**2)
    smallest = (trace - gap) / 2.0
    return math.sqrt(max(0.0, smallest) / count)


def fit_distortion(
    lines: Sequence[Sequence[Point]],
    width: int,
    height: int,
    search: tuple[float, float] = (-0.6, 0.3),
    refine_k2: bool = True,
) -> LensDistortion:
    """Estime la distorsion à partir de lignes droites de la scène.

    Chaque `lines[i]` est une suite d'au moins trois points cliqués le long
    d'une droite du monde réel. Plus les lignes sont longues, éloignées du
    centre et orientées différemment, meilleure est l'estimation.

    La recherche est un balayage suivi d'un affinage par nombre d'or : le
    critère n'est pas convexe partout, et une descente de gradient partirait
    volontiers vers une valeur absurde qui replie l'image sur elle-même.
    """
    usable = [line for line in lines if len(line) >= 3]
    if not usable:
        raise ValueError(
            "au moins une ligne de trois points est nécessaire pour estimer "
            "la distorsion de l'objectif"
        )

    center = Point(width / 2.0, height / 2.0)
    scale = math.hypot(width, height) / 2.0

    def error(k1: float, k2: float) -> float:
        lens = LensDistortion(center, k1, k2, scale)
        return sum(
            straightness_error([lens.undistort(point) for point in line])
            for line in usable
        )

    k1 = _minimize(lambda value: error(value, 0.0), *search)
    k2 = 0.0
    if refine_k2:
        k2 = _minimize(lambda value: error(k1, value), -0.3, 0.3)
        k1 = _minimize(lambda value: error(value, k2), *search)

    return LensDistortion(center, k1, k2, scale)


def _minimize(objective, low: float, high: float, samples: int = 40) -> float:
    """Balayage grossier puis affinage par section dorée."""
    step = (high - low) / samples
    best = min(
        (low + index * step for index in range(samples + 1)), key=objective
    )
    low, high = best - step, best + step

    golden = (math.sqrt(5.0) - 1.0) / 2.0
    for _ in range(60):
        first = high - golden * (high - low)
        second = low + golden * (high - low)
        if objective(first) < objective(second):
            high = second
        else:
            low = first
    return (low + high) / 2.0
