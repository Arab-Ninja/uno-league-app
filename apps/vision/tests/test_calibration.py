"""Terrain, buts et côtés."""

from __future__ import annotations

import json

import pytest

from uno_vision.calibration import LEFT, RIGHT, Calibration, FieldDimensions
from uno_vision.scene import TEAM_A, TEAM_B, Point
from synthetic import make_calibration


def test_dimensions_absurdes_sont_refusees() -> None:
    with pytest.raises(ValueError):
        FieldDimensions(length_m=0.0)
    with pytest.raises(ValueError):
        FieldDimensions(width_m=2.0, goal_width_m=3.0)


def test_but_encadre_par_les_poteaux() -> None:
    goals = make_calibration().goals
    left = goals[LEFT]
    assert left.mouth_min_y == pytest.approx(8.5)
    assert left.mouth_max_y == pytest.approx(11.5)
    assert left.center.x == pytest.approx(0.0)


def test_ballon_franchissant_la_ligne_compte_comme_but() -> None:
    left = make_calibration().goals[LEFT]
    assert left.contains(Point(-0.4, 10.0), 0.1, 0.3)
    # Sur la ligne, mais pas franchie : ce n'est pas un but.
    assert not left.contains(Point(-0.05, 10.0), 0.1, 0.3)
    # Franchie, mais à côté du poteau.
    assert not left.contains(Point(-0.4, 14.0), 0.1, 0.3)


def test_surface_de_but_delimite_le_domaine_du_gardien() -> None:
    right = make_calibration().goals[RIGHT]
    assert right.in_goal_area(Point(38.0, 10.0))
    assert not right.in_goal_area(Point(20.0, 10.0))


def test_les_equipes_defendent_des_cotes_opposes() -> None:
    calibration = make_calibration(team_a_defends=LEFT)
    assert calibration.side_defended_by(TEAM_A, 0.0) == LEFT
    assert calibration.side_defended_by(TEAM_B, 0.0) == RIGHT
    assert calibration.attacked_goal(TEAM_A, 0.0).side == RIGHT


def test_le_changement_de_camp_inverse_les_cotes() -> None:
    calibration = make_calibration()
    calibration.side_switch_times_s = (1200.0,)

    assert calibration.side_defended_by(TEAM_A, 600.0) == LEFT
    assert calibration.side_defended_by(TEAM_A, 1500.0) == RIGHT
    assert calibration.side_defended_by(TEAM_B, 1500.0) == LEFT


def test_tiers_defensif_est_du_cote_de_sa_propre_cage() -> None:
    calibration = make_calibration(team_a_defends=LEFT)
    assert calibration.is_in_defensive_third(TEAM_A, Point(5.0, 10.0), 0.0)
    assert not calibration.is_in_defensive_third(TEAM_A, Point(35.0, 10.0), 0.0)
    assert calibration.is_in_defensive_third(TEAM_B, Point(35.0, 10.0), 0.0)


def test_calibration_survit_a_un_aller_retour_json(tmp_path) -> None:
    calibration = make_calibration()
    path = tmp_path / "salle.json"
    calibration.save(path)
    relue = Calibration.load(path)

    assert relue.field.length_m == calibration.field.length_m
    assert relue.image_points == calibration.image_points
    assert relue.to_field(Point(200.0, 100.0)).x == pytest.approx(20.0)
    assert json.loads(path.read_text(encoding="utf-8"))["venue"] == "Salle de test"


def test_calibration_incomplete_est_refusee() -> None:
    with pytest.raises(ValueError):
        Calibration(image_points=(Point(0, 0), Point(1, 1)))
