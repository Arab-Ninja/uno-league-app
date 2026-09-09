"""Correction d'objectif et rejet du décor — les deux enseignements du terrain."""

from __future__ import annotations

import math

import pytest

from uno_vision.clutter import BallPicker, ClutterMap, find_static_clutter
from uno_vision.lens import LensDistortion, fit_distortion, straightness_error
from uno_vision.scene import BBox, Detection, Point


def _lens(k1: float, width: int = 1280, height: int = 720) -> LensDistortion:
    return LensDistortion(
        center=Point(width / 2, height / 2), k1=k1, scale=math.hypot(width, height) / 2
    )


def test_une_droite_reste_droite_sans_distorsion() -> None:
    droite = [Point(x, 200.0) for x in range(100, 1200, 100)]
    assert straightness_error(droite) == pytest.approx(0.0, abs=1e-9)


def test_l_erreur_de_rectitude_mesure_la_courbure() -> None:
    courbe = [Point(x, 200.0 + ((x - 640) / 200.0) ** 2) for x in range(100, 1200, 100)]
    assert straightness_error(courbe) > 1.0


def test_la_distorsion_courbe_les_droites_du_monde() -> None:
    objectif = _lens(-0.25)
    droite = [Point(x, 200.0) for x in range(100, 1200, 100)]
    vue = [objectif.distort(point) for point in droite]

    assert straightness_error(vue) > 3.0
    assert straightness_error([objectif.undistort(p) for p in vue]) < 0.01


def test_l_objectif_est_retrouve_a_partir_de_lignes_droites() -> None:
    """Le fil à plomb : des points cliqués sur des droites suffisent à calibrer."""
    objectif = _lens(-0.30)
    lignes = [
        [objectif.distort(Point(x, 120.0)) for x in range(80, 1220, 80)],
        [objectif.distort(Point(x, 620.0)) for x in range(80, 1220, 80)],
        [objectif.distort(Point(200.0, y)) for y in range(60, 700, 60)],
    ]

    estime = fit_distortion(lignes, 1280, 720)

    assert estime.k1 == pytest.approx(-0.30, abs=0.02)
    redressee = [estime.undistort(point) for point in lignes[0]]
    assert straightness_error(redressee) < 0.2


def test_la_correction_est_reversible() -> None:
    objectif = _lens(-0.25)
    for point in (Point(50, 50), Point(1230, 690), Point(640, 360)):
        retour = objectif.undistort(objectif.distort(point))
        assert retour.x == pytest.approx(point.x, abs=0.01)
        assert retour.y == pytest.approx(point.y, abs=0.01)


def test_un_objectif_neutre_ne_touche_a_rien() -> None:
    neutre = LensDistortion.none()
    assert neutre.is_identity
    assert neutre.undistort(Point(123, 456)) == Point(123, 456)


def test_la_calibration_d_objectif_survit_au_json() -> None:
    objectif = _lens(-0.28)
    relu = LensDistortion.from_dict(objectif.to_dict())
    assert relu.k1 == pytest.approx(objectif.k1)
    assert relu.scale == pytest.approx(objectif.scale)


def test_sans_ligne_exploitable_la_calibration_est_refusee() -> None:
    with pytest.raises(ValueError, match="trois points"):
        fit_distortion([[Point(0, 0), Point(1, 1)]], 1280, 720)


# -- Rejet du décor ---------------------------------------------------------


def test_un_marquage_immobile_est_reconnu_comme_du_decor() -> None:
    """Vu au même endroit d'un bout à l'autre du clip : ce n'est pas un ballon."""
    sightings = [(index / 25.0, Point(544.0, 305.0)) for index in range(0, 500, 2)]
    carte = find_static_clutter(sightings, frame_count=500)

    assert len(carte) == 1
    assert carte.is_clutter(Point(546.0, 303.0))
    assert not carte.is_clutter(Point(200.0, 200.0))


def test_un_ballon_immobile_quelques_secondes_n_est_pas_du_decor() -> None:
    """Un arrêt de jeu ne doit pas faire bannir le ballon pour le reste du match."""
    sightings = [(index / 25.0, Point(300.0, 400.0)) for index in range(0, 100)]
    sightings += [(index / 25.0, Point(300.0 + index, 400.0)) for index in range(100, 500)]

    carte = find_static_clutter(sightings, frame_count=500)
    assert len(carte) == 0


def test_le_decor_est_ecarte_meme_quand_il_est_mieux_note() -> None:
    carte = ClutterMap((Point(544.0, 305.0),), 14.0)
    picker = BallPicker(clutter=carte)

    choisi = picker.pick(
        [
            Detection(BBox(537, 298, 551, 312), 0.33),  # marquage bien noté
            Detection(BBox(240, 252, 252, 264), 0.10),  # le vrai ballon
        ]
    )

    assert choisi is not None
    assert choisi.score == pytest.approx(0.10)


def test_la_continuite_l_emporte_sur_la_confiance() -> None:
    """Le vrai ballon suit sa trajectoire ; un faux surgit n'importe où."""
    picker = BallPicker()
    picker.pick([Detection(BBox(240, 252, 252, 264), 0.30)])

    choisi = picker.pick(
        [
            Detection(BBox(900, 100, 914, 114), 0.45),  # mieux noté, mais ailleurs
            Detection(BBox(255, 258, 267, 270), 0.12),  # dans la continuité
        ]
    )

    assert choisi is not None
    assert choisi.bbox.x1 == pytest.approx(255)


def test_un_saut_invraisemblable_est_refuse_plutot_qu_accepte() -> None:
    picker = BallPicker(max_jump_px=80.0, continuity_bonus=0.5)
    picker.pick([Detection(BBox(240, 252, 252, 264), 0.30)])

    assert picker.pick([Detection(BBox(1100, 600, 1112, 612), 0.20)]) is None


def test_apres_une_longue_absence_le_ballon_peut_reapparaitre_ailleurs() -> None:
    """Sinon le ballon perdu derrière un joueur ne serait plus jamais retrouvé."""
    picker = BallPicker(max_jump_px=80.0, memory_frames=3)
    picker.pick([Detection(BBox(240, 252, 252, 264), 0.30)])
    for _ in range(5):
        picker.pick([])

    choisi = picker.pick([Detection(BBox(1100, 600, 1112, 612), 0.20)])
    assert choisi is not None


def test_sans_candidat_il_n_y_a_pas_de_ballon() -> None:
    assert BallPicker().pick([]) is None
