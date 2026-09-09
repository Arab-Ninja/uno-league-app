"""Homographie, rayons et polygones."""

from __future__ import annotations

import pytest

from uno_vision.geometry import (
    GeometryError,
    Homography,
    angle_between,
    distance_point_to_segment,
    homography_from_points,
    point_in_polygon,
    ray_segment_intersection,
    segment_intersection,
    solve_linear_system,
)
from uno_vision.scene import Point


def test_solve_linear_system_resout_un_systeme_simple() -> None:
    solution = solve_linear_system([[2.0, 1.0], [1.0, 3.0]], [5.0, 10.0])
    assert solution[0] == pytest.approx(1.0)
    assert solution[1] == pytest.approx(3.0)


def test_systeme_singulier_est_signale() -> None:
    with pytest.raises(GeometryError):
        solve_linear_system([[1.0, 2.0], [2.0, 4.0]], [3.0, 6.0])


def test_homographie_projette_les_coins_sur_le_terrain() -> None:
    image = (Point(100, 700), Point(1800, 700), Point(1500, 300), Point(400, 300))
    terrain = (Point(0, 0), Point(40, 0), Point(40, 20), Point(0, 20))
    homography = homography_from_points(image, terrain)

    for source, expected in zip(image, terrain, strict=True):
        projected = homography.apply(source)
        assert projected.x == pytest.approx(expected.x, abs=1e-6)
        assert projected.y == pytest.approx(expected.y, abs=1e-6)


def test_homographie_inverse_fait_un_aller_retour() -> None:
    image = (Point(100, 700), Point(1800, 700), Point(1500, 300), Point(400, 300))
    terrain = (Point(0, 0), Point(40, 0), Point(40, 20), Point(0, 20))
    homography = homography_from_points(image, terrain)
    inverse = homography.inverse()

    milieu = Point(20.0, 10.0)
    retour = homography.apply(inverse.apply(milieu))
    assert retour.x == pytest.approx(milieu.x, abs=1e-6)
    assert retour.y == pytest.approx(milieu.y, abs=1e-6)


def test_homographie_accepte_plus_de_quatre_reperes() -> None:
    """Six repères cliqués valent mieux que quatre : le résidu doit rester faible."""
    image = [
        Point(0, 0), Point(400, 0), Point(400, 200),
        Point(0, 200), Point(200, 0), Point(200, 200),
    ]
    terrain = [
        Point(0, 0), Point(40, 0), Point(40, 20),
        Point(0, 20), Point(20, 0), Point(20, 20),
    ]
    homography = homography_from_points(image, terrain)
    projected = homography.apply(Point(200, 100))
    assert projected.x == pytest.approx(20.0, abs=1e-3)
    assert projected.y == pytest.approx(10.0, abs=1e-3)


def test_quatre_points_alignes_sont_refuses() -> None:
    image = (Point(0, 0), Point(10, 0), Point(20, 0), Point(30, 0))
    terrain = (Point(0, 0), Point(40, 0), Point(40, 20), Point(0, 20))
    with pytest.raises(GeometryError):
        homography_from_points(image, terrain)


def test_intersection_de_segments() -> None:
    hit = segment_intersection(Point(0, 0), Point(10, 10), Point(0, 10), Point(10, 0))
    assert hit is not None
    assert hit.x == pytest.approx(5.0)
    assert hit.y == pytest.approx(5.0)

    assert segment_intersection(
        Point(0, 0), Point(1, 1), Point(5, 5), Point(6, 6)
    ) is None


def test_rayon_ne_touche_pas_ce_qui_est_derriere_lui() -> None:
    devant = ray_segment_intersection(
        Point(0, 0), Point(1, 0), Point(10, -5), Point(10, 5)
    )
    assert devant is not None
    hit, distance = devant
    assert hit.x == pytest.approx(10.0)
    assert distance == pytest.approx(10.0)

    derriere = ray_segment_intersection(
        Point(0, 0), Point(-1, 0), Point(10, -5), Point(10, 5)
    )
    assert derriere is None


def test_appartenance_a_un_polygone() -> None:
    carre = [Point(0, 0), Point(10, 0), Point(10, 10), Point(0, 10)]
    assert point_in_polygon(Point(5, 5), carre)
    assert not point_in_polygon(Point(15, 5), carre)


def test_distance_a_un_segment() -> None:
    assert distance_point_to_segment(
        Point(5, 3), Point(0, 0), Point(10, 0)
    ) == pytest.approx(3.0)
    # Au-delà de l'extrémité, c'est la distance à l'extrémité qui compte.
    assert distance_point_to_segment(
        Point(13, 4), Point(0, 0), Point(10, 0)
    ) == pytest.approx(5.0)


def test_angle_entre_deux_vecteurs() -> None:
    assert angle_between(Point(1, 0), Point(0, 1)) == pytest.approx(90.0)
    assert angle_between(Point(1, 0), Point(-1, 0)) == pytest.approx(180.0)
    assert angle_between(Point(0, 0), Point(1, 0)) == pytest.approx(0.0)


def test_point_hors_du_plan_du_sol_est_refuse() -> None:
    degeneree = Homography((1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0))
    with pytest.raises(GeometryError):
        degeneree.apply(Point(0.0, 5.0))
