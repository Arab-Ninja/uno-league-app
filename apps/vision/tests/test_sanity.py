"""Contrôle de vraisemblance de l'échelle du terrain."""

from __future__ import annotations

import pytest

from uno_vision.calibration import FieldDimensions
from uno_vision.sanity import calibration_warnings, measure_speeds
from uno_vision.scene import BBox, FrameObservation, PlayerObservation, Point


def _course(vitesse_m_s: float, secondes: float = 6.0, fps: float = 25.0):
    """Un joueur qui traverse le terrain à vitesse constante."""
    frames = []
    for index in range(int(secondes * fps)):
        t = index / fps
        frames.append(
            FrameObservation(
                index=index,
                time_s=t,
                players=(
                    PlayerObservation(
                        track_id=1,
                        position=Point(2.0 + vitesse_m_s * t, 10.0),
                        bbox=BBox(0, 0, 10, 20),
                        team="A",
                    ),
                ),
            )
        )
    return frames


def test_les_vitesses_sont_mesurees() -> None:
    profil = measure_speeds(_course(7.0))
    assert profil.p95 == pytest.approx(7.0, abs=0.1)
    assert profil.samples > 100


def test_une_vitesse_humaine_ne_declenche_aucune_alerte() -> None:
    assert calibration_warnings(_course(7.5)) == []


def test_un_terrain_trop_grand_est_detecte() -> None:
    """Un terrain déclaré deux fois trop long double toutes les vitesses."""
    alertes = calibration_warnings(_course(16.0))
    assert alertes
    assert "impossible" in alertes[0]
    assert "trop grand" in alertes[0]


def test_un_terrain_trop_petit_est_detecte() -> None:
    alertes = calibration_warnings(_course(1.2))
    assert alertes
    assert "trop petit" in alertes[0]


def test_sans_deplacement_le_controle_se_declare_impuissant() -> None:
    alertes = calibration_warnings(_course(7.0, secondes=0.5))
    assert alertes
    assert "Trop peu de déplacements" in alertes[0]


def test_une_video_vide_ne_fait_pas_planter_le_controle() -> None:
    assert measure_speeds([]).samples == 0


def test_le_prereglage_foot_a_cinq_existe() -> None:
    terrain = FieldDimensions.five_a_side()
    assert terrain.length_m == 30.0
    assert terrain.goal_width_m == 3.0
    # Le but reste normalisé : c'est lui qui fixe l'échelle à la calibration.
    assert terrain.goal_width_m == FieldDimensions().goal_width_m


def test_l_alerte_d_echelle_remonte_dans_le_rapport() -> None:
    """L'arbitre doit la voir avant de valider quoi que ce soit."""
    from uno_vision.pipeline import analyse_observations
    from synthetic import make_calibration, make_roster

    analyse = analyse_observations(_course(18.0), make_calibration(), make_roster())
    assert any("impossible" in w for w in analyse.report["review"]["warnings"])
