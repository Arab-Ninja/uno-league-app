"""Suivi des joueurs et lissage de la trajectoire du ballon."""

from __future__ import annotations

import pytest

from uno_vision.boxes import (
    best_detection,
    merge_tiled_detections,
    non_max_suppression,
    offset_detections,
    tile_grid,
)
from uno_vision.config import AnalysisConfig
from uno_vision.scene import BALL, PLAYER, BBox, Detection, Point
from uno_vision.tracking import BallSample, MultiObjectTracker, smooth_ball_trajectory


def _box(x: float, y: float, size: float = 40.0) -> BBox:
    return BBox(x, y, x + size / 2, y + size)


def test_une_piste_garde_son_identite_quand_le_joueur_se_deplace() -> None:
    tracker = MultiObjectTracker(AnalysisConfig())
    identifiants = set()
    for step in range(10):
        confirmed = tracker.update([Detection(_box(100 + step * 12, 200), 0.9, PLAYER)])
        identifiants.update(track.track_id for track in confirmed)

    assert identifiants == {1}


def test_deux_joueurs_recoivent_deux_identites() -> None:
    tracker = MultiObjectTracker(AnalysisConfig())
    for step in range(5):
        confirmed = tracker.update(
            [
                Detection(_box(100 + step * 5, 200), 0.9, PLAYER),
                Detection(_box(600 - step * 5, 210), 0.9, PLAYER),
            ]
        )
    assert {track.track_id for track in confirmed} == {1, 2}


def test_une_detection_faible_sauve_une_piste_occultee() -> None:
    """Un joueur à moitié caché produit une détection peu sûre.

    La jeter créerait une nouvelle identité à sa réapparition — et ses buts
    seraient comptés à un joueur fantôme.
    """
    tracker = MultiObjectTracker(AnalysisConfig())
    for step in range(5):
        tracker.update([Detection(_box(100 + step * 8, 200), 0.9, PLAYER)])

    tracker.update([Detection(_box(140, 200), 0.22, PLAYER)])  # occultation
    confirmed = tracker.update([Detection(_box(148, 200), 0.9, PLAYER)])

    assert [track.track_id for track in confirmed] == [1]


def test_une_piste_perdue_trop_longtemps_est_abandonnee() -> None:
    config = AnalysisConfig(track_max_age_frames=3)
    tracker = MultiObjectTracker(config)
    for _ in range(5):
        tracker.update([Detection(_box(100, 200), 0.9, PLAYER)])
    for _ in range(5):
        tracker.update([])

    assert tracker.tracks == []


def test_le_ballon_impossible_est_ecarte() -> None:
    """Une détection à quarante mètres en une image n'est pas un ballon."""
    samples = [
        BallSample(0.00, 0, Point(10.0, 10.0)),
        BallSample(0.04, 1, Point(38.0, 2.0)),  # aberration
        BallSample(0.08, 2, Point(10.4, 10.1)),
    ]
    lissee = smooth_ball_trajectory(samples, AnalysisConfig())

    # L'aberration disparaît, et le trou qu'elle laisse est comblé par
    # interpolation : la trajectoire reste continue.
    assert all(s.position.x < 15.0 for s in lissee)
    assert [round(s.position.x, 1) for s in lissee] == [10.0, 10.2, 10.4]
    assert lissee[1].interpolated is True


def test_les_trous_courts_sont_interpoles() -> None:
    samples = [
        BallSample(0.00, 0, Point(10.0, 10.0)),
        BallSample(0.16, 4, Point(11.0, 10.0)),
    ]
    lissee = smooth_ball_trajectory(samples, AnalysisConfig())

    assert [s.index for s in lissee] == [0, 1, 2, 3, 4]
    assert lissee[2].position.x == pytest.approx(10.5)
    assert lissee[2].interpolated is True
    assert lissee[0].interpolated is False


def test_un_trou_trop_long_n_est_pas_invente() -> None:
    config = AnalysisConfig(ball_max_gap_seconds=0.3)
    samples = [
        BallSample(0.0, 0, Point(10.0, 10.0)),
        BallSample(2.0, 50, Point(12.0, 10.0)),
    ]
    lissee = smooth_ball_trajectory(samples, config)
    assert [s.index for s in lissee] == [0, 50]


def test_suppression_des_doublons() -> None:
    detections = [
        Detection(BBox(0, 0, 10, 10), 0.9, PLAYER),
        Detection(BBox(1, 1, 11, 11), 0.5, PLAYER),
        Detection(BBox(50, 50, 60, 60), 0.4, PLAYER),
    ]
    gardees = non_max_suppression(detections)
    assert len(gardees) == 2
    assert gardees[0].score == pytest.approx(0.9)


def test_les_tuiles_couvrent_toute_l_image() -> None:
    tuiles = tile_grid(1920, 1080, 640, overlap=0.2)
    assert tuiles
    assert max(x + w for x, _, w, _ in tuiles) == 1920
    assert max(y + h for _, y, _, h in tuiles) == 1080


def test_une_detection_de_tuile_revient_dans_le_repere_de_l_image() -> None:
    decalees = offset_detections([Detection(BBox(0, 0, 10, 10), 0.8, BALL)], 640, 320)
    assert decalees[0].bbox.x1 == pytest.approx(640)
    assert decalees[0].bbox.y2 == pytest.approx(330)


def test_le_meme_ballon_vu_par_deux_tuiles_ne_compte_qu_une_fois() -> None:
    fusionnees = merge_tiled_detections(
        [
            Detection(BBox(100, 100, 112, 112), 0.7, BALL),
            Detection(BBox(101, 101, 113, 113), 0.4, BALL),
        ]
    )
    assert len(fusionnees) == 1
    assert fusionnees[0].score == pytest.approx(0.7)


def test_un_seul_ballon_est_retenu() -> None:
    meilleur = best_detection(
        [
            Detection(BBox(0, 0, 10, 10), 0.2, BALL),
            Detection(BBox(80, 80, 90, 90), 0.6, BALL),
            Detection(BBox(0, 0, 40, 80), 0.9, PLAYER),
        ],
        BALL,
        min_score=0.15,
    )
    assert meilleur is not None
    assert meilleur.score == pytest.approx(0.6)
    assert best_detection([], BALL, 0.15) is None
