"""Découpe du jeu en possessions."""

from __future__ import annotations

import pytest

from uno_vision.config import AnalysisConfig
from uno_vision.possession import ball_samples_from_frames, compute_flights, compute_possessions
from synthetic import MatchScript


def test_deux_joueurs_qui_se_passent_le_ballon_font_deux_possessions() -> None:
    script = MatchScript().add(3, "A", 20, 10).add(12, "B", 30, 10)
    script.hold(3, 1.0).ball_to(30.3, 10, 0.5).hold(12, 1.0)

    possessions = compute_possessions(script.frames)

    assert [p.bib for p in possessions] == [3, 12]
    assert [p.team for p in possessions] == ["A", "B"]
    assert possessions[0].duration_s == pytest.approx(1.0, abs=0.1)


def test_un_ballon_qui_frole_un_joueur_ne_lui_est_pas_attribue() -> None:
    """Sans durée minimale, chaque passe créerait des possessions fantômes."""
    script = MatchScript().add(3, "A", 10, 10).add(12, "B", 20, 10).add(4, "A", 30, 10)
    script.hold(3, 1.0).ball_to(30.3, 10, 0.7).hold(4, 1.0)

    possessions = compute_possessions(script.frames)

    assert [p.bib for p in possessions] == [3, 4]


def test_un_dribble_ne_coupe_pas_la_possession() -> None:
    """Le ballon sort du rayon et y revient : c'est toujours le même porteur."""
    script = MatchScript().add(3, "A", 20, 10)
    script.hold(3, 0.6).ball_to(23.0, 10, 0.15).ball_to(20.3, 10, 0.15).hold(3, 0.6)

    possessions = compute_possessions(script.frames)

    assert len(possessions) == 1
    assert possessions[0].duration_s > 1.0


def test_un_ballon_jamais_vu_ne_donne_aucune_possession() -> None:
    script = MatchScript().add(3, "A", 20, 10)
    script.hold(3, 1.0)
    aveugles = [
        type(frame)(index=frame.index, time_s=frame.time_s, players=frame.players)
        for frame in script.frames
    ]
    assert compute_possessions(aveugles) == []


def test_le_vol_du_ballon_relie_deux_possessions() -> None:
    script = MatchScript().add(3, "A", 20, 10).add(4, "A", 30, 10)
    script.hold(3, 1.0).ball_to(30.3, 10, 0.5).hold(4, 1.0)

    possessions = compute_possessions(script.frames)
    flights = compute_flights(possessions, ball_samples_from_frames(script.frames))

    # Le match se termine ballon aux pieds : il n'y a que la passe.
    assert len(flights) == 1
    passe = flights[0]
    assert passe.origin.bib == 3
    assert passe.destination.bib == 4
    assert passe.release_velocity(0.4).x > 10.0  # le ballon part vers la droite


def test_le_dernier_vol_est_conserve() -> None:
    """C'est souvent le plus important : celui du tir qui finit au fond."""
    script = MatchScript().add(4, "A", 30, 10)
    script.hold(4, 1.0).ball_to(41.0, 10, 0.5)

    possessions = compute_possessions(script.frames)
    flights = compute_flights(possessions, ball_samples_from_frames(script.frames))

    assert len(flights) == 1
    assert flights[0].destination is None
    assert flights[0].arrival_position.x == pytest.approx(41.0)


def test_un_rayon_de_possession_plus_large_change_le_decoupage() -> None:
    script = MatchScript().add(3, "A", 20, 10)
    script.hold(3, 1.0, offset=2.0)  # ballon à deux mètres des pieds

    assert compute_possessions(script.frames, AnalysisConfig()) == []
    large = compute_possessions(script.frames, AnalysisConfig(possession_radius_m=2.5))
    assert len(large) == 1
