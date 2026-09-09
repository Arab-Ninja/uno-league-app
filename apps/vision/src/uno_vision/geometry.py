"""Géométrie du terrain : homographie, rayons, polygones.

Tout est en Python pur. Une homographie 3×3 se résout par élimination de Gauss
sur un système 8×8 ; importer NumPy pour cela coûterait plus cher que de
l'écrire, et rendrait la logique de jeu dépendante d'une pile scientifique dont
la CI n'a pas besoin.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .scene import Point


class GeometryError(ValueError):
    """Configuration géométrique impossible (points alignés, matrice singulière)."""


def solve_linear_system(matrix: list[list[float]], rhs: list[float]) -> list[float]:
    """Résout `matrix · x = rhs` par élimination de Gauss à pivot partiel."""
    size = len(rhs)
    if any(len(row) != size for row in matrix):
        raise GeometryError("système non carré")

    augmented = [list(row) + [value] for row, value in zip(matrix, rhs, strict=True)]

    for column in range(size):
        pivot_row = max(range(column, size), key=lambda r: abs(augmented[r][column]))
        if abs(augmented[pivot_row][column]) < 1e-12:
            raise GeometryError("système singulier : points dégénérés ou alignés")
        augmented[column], augmented[pivot_row] = augmented[pivot_row], augmented[column]

        pivot = augmented[column][column]
        for row in range(column + 1, size):
            factor = augmented[row][column] / pivot
            if factor == 0.0:
                continue
            for col in range(column, size + 1):
                augmented[row][col] -= factor * augmented[column][col]

    solution = [0.0] * size
    for row in reversed(range(size)):
        total = augmented[row][size]
        for col in range(row + 1, size):
            total -= augmented[row][col] * solution[col]
        solution[row] = total / augmented[row][row]
    return solution


@dataclass(frozen=True, slots=True)
class Homography:
    """Transformation projective d'un plan vers un autre.

    Neuf coefficients ligne par ligne, le dernier normalisé à 1.
    """

    coefficients: tuple[float, ...]

    def apply(self, point: Point) -> Point:
        a, b, c, d, e, f, g, h, i = self.coefficients
        denominator = g * point.x + h * point.y + i
        if abs(denominator) < 1e-12:
            raise GeometryError("point projeté à l'infini (hors du plan du sol)")
        return Point(
            (a * point.x + b * point.y + c) / denominator,
            (d * point.x + e * point.y + f) / denominator,
        )

    def inverse(self) -> "Homography":
        a, b, c, d, e, f, g, h, i = self.coefficients
        cofactors = (
            e * i - f * h,
            c * h - b * i,
            b * f - c * e,
            f * g - d * i,
            a * i - c * g,
            c * d - a * f,
            d * h - e * g,
            b * g - a * h,
            a * e - b * d,
        )
        determinant = a * cofactors[0] + b * cofactors[3] + c * cofactors[6]
        if abs(determinant) < 1e-12:
            raise GeometryError("homographie non inversible")
        scale = 1.0 / cofactors[8] if abs(cofactors[8]) > 1e-12 else 1.0 / determinant
        return Homography(tuple(value * scale for value in cofactors))


def homography_from_points(
    source: Sequence[Point], destination: Sequence[Point]
) -> Homography:
    """Homographie envoyant `source[i]` sur `destination[i]`.

    Exactement quatre paires suffisent (huit inconnues, huit équations). Au-delà,
    le système est résolu au sens des moindres carrés par équations normales :
    cliquer six ou huit repères plutôt que quatre absorbe l'imprécision du clic.
    """
    if len(source) != len(destination):
        raise GeometryError("autant de points source que de points destination")
    if len(source) < 4:
        raise GeometryError("quatre points au minimum pour une homographie")

    rows: list[list[float]] = []
    values: list[float] = []
    for src, dst in zip(source, destination, strict=True):
        rows.append([src.x, src.y, 1.0, 0.0, 0.0, 0.0, -src.x * dst.x, -src.y * dst.x])
        values.append(dst.x)
        rows.append([0.0, 0.0, 0.0, src.x, src.y, 1.0, -src.x * dst.y, -src.y * dst.y])
        values.append(dst.y)

    if len(rows) > 8:
        # Équations normales : Aᵀ A x = Aᵀ b.
        normal = [[sum(r[i] * r[j] for r in rows) for j in range(8)] for i in range(8)]
        projected = [sum(r[i] * v for r, v in zip(rows, values, strict=True)) for i in range(8)]
        solution = solve_linear_system(normal, projected)
    else:
        solution = solve_linear_system(rows, values)

    return Homography(tuple(solution) + (1.0,))


def segment_intersection(
    a1: Point, a2: Point, b1: Point, b2: Point
) -> Point | None:
    """Intersection de deux segments, ou `None` s'ils ne se croisent pas."""
    d1 = a2 - a1
    d2 = b2 - b1
    denominator = d1.x * d2.y - d1.y * d2.x
    if abs(denominator) < 1e-12:
        return None
    delta = b1 - a1
    t = (delta.x * d2.y - delta.y * d2.x) / denominator
    u = (delta.x * d1.y - delta.y * d1.x) / denominator
    if not (0.0 <= t <= 1.0 and 0.0 <= u <= 1.0):
        return None
    return Point(a1.x + d1.x * t, a1.y + d1.y * t)


def ray_segment_intersection(
    origin: Point, direction: Point, s1: Point, s2: Point
) -> tuple[Point, float] | None:
    """Premier point où un rayon rencontre un segment, avec sa distance.

    Le rayon est semi-infini : ce qui se trouve derrière l'origine ne compte pas.
    C'est ainsi qu'on décide qu'un tir est cadré — on prolonge la trajectoire au
    moment de la frappe jusqu'à la ligne de but.
    """
    d2 = s2 - s1
    denominator = direction.x * d2.y - direction.y * d2.x
    if abs(denominator) < 1e-12:
        return None
    delta = s1 - origin
    t = (delta.x * d2.y - delta.y * d2.x) / denominator
    u = (delta.x * direction.y - delta.y * direction.x) / denominator
    if t < 0.0 or not (0.0 <= u <= 1.0):
        return None
    hit = Point(origin.x + direction.x * t, origin.y + direction.y * t)
    return hit, t * direction.norm()


def point_in_polygon(point: Point, polygon: Sequence[Point]) -> bool:
    """Test d'appartenance par lancer de rayon (pair/impair)."""
    inside = False
    count = len(polygon)
    for index in range(count):
        a = polygon[index]
        b = polygon[(index + 1) % count]
        if (a.y > point.y) != (b.y > point.y):
            crossing_x = a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y)
            if point.x < crossing_x:
                inside = not inside
    return inside


def distance_point_to_segment(point: Point, s1: Point, s2: Point) -> float:
    """Distance d'un point au segment `[s1, s2]`."""
    segment = s2 - s1
    length_squared = segment.dot(segment)
    if length_squared < 1e-12:
        return point.distance_to(s1)
    t = max(0.0, min(1.0, (point - s1).dot(segment) / length_squared))
    projection = Point(s1.x + segment.x * t, s1.y + segment.y * t)
    return point.distance_to(projection)


def angle_between(a: Point, b: Point) -> float:
    """Angle non orienté entre deux vecteurs, en degrés (0 à 180)."""
    import math

    na, nb = a.norm(), b.norm()
    if na < 1e-9 or nb < 1e-9:
        return 0.0
    cosine = max(-1.0, min(1.0, a.dot(b) / (na * nb)))
    return math.degrees(math.acos(cosine))
