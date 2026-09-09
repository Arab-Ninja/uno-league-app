"""Feuille de match : comptage, score et cas à faire trancher par l'arbitre."""

from __future__ import annotations

import pytest

from uno_vision.aggregate import aggregate_events, consistency_warnings, sheet_totals
from uno_vision.events import ASSIST, DEFENSE, GOAL, OWN_GOAL, SAVE, MatchEvent
from uno_vision.roster import Roster, RosterEntry
from synthetic import make_roster


def _event(kind: str, bib: int | None, team: str = "A", **extra) -> MatchEvent:
    return MatchEvent(
        kind=kind,
        time_s=extra.pop("time_s", 10.0),
        team=team,
        track_id=bib,
        bib=bib,
        confidence=extra.pop("confidence", 0.9),
        detail="",
        scoring_team=extra.pop("scoring_team", None),
    )


def test_les_evenements_sont_comptes_par_joueur() -> None:
    sheet = aggregate_events(
        [
            _event(GOAL, 3, scoring_team="A"),
            _event(GOAL, 3, scoring_team="A"),
            _event(ASSIST, 2),
            _event(DEFENSE, 12, team="B"),
            _event(SAVE, 11, team="B"),
        ],
        make_roster(),
    )

    assert sheet.line_of(3).goals == 2
    assert sheet.line_of(2).assists == 1
    assert sheet.line_of(12).defenses == 1
    assert sheet.line_of(11).saves == 1
    assert sheet.score_a == 2
    assert sheet.score_b == 0


def test_la_feuille_liste_tous_les_joueurs_meme_sans_statistique() -> None:
    sheet = aggregate_events([], make_roster())

    assert len(sheet.lines) == 10
    assert all(line.total_events == 0 for line in sheet.lines)
    assert sheet_totals(sheet) == {"goals": 0, "assists": 0, "defenses": 0, "saves": 0}


def test_un_but_contre_son_camp_compte_pour_l_adversaire_sans_buteur() -> None:
    sheet = aggregate_events(
        [_event(OWN_GOAL, 3, team="A", scoring_team="B")], make_roster()
    )

    assert sheet.score_b == 1
    assert sheet.score_a == 0
    assert sheet.line_of(3).goals == 0


def test_un_evenement_sans_dossard_part_a_l_arbitre_plutot_qu_a_la_poubelle() -> None:
    sheet = aggregate_events(
        [_event(GOAL, None, scoring_team="A"), _event(SAVE, None, team="B")],
        make_roster(),
    )

    assert sheet.score_a == 1  # le score reste juste
    assert len(sheet.unassigned) == 2
    assert sheet_totals(sheet)["goals"] == 0


def test_un_dossard_absent_de_la_feuille_n_est_pas_credite() -> None:
    sheet = aggregate_events([_event(GOAL, 99, scoring_team="A")], make_roster())

    assert len(sheet.unassigned) == 1
    assert sheet.score_a == 1


def test_les_evenements_peu_surs_sont_signales() -> None:
    sheet = aggregate_events(
        [_event(DEFENSE, 12, team="B", confidence=0.4)], make_roster()
    )

    assert sheet.line_of(12).defenses == 1
    assert len(sheet.to_review) == 1


def test_les_incoherences_sont_expliquees_a_l_arbitre() -> None:
    sheet = aggregate_events(
        [_event(GOAL, None, scoring_team="A"), _event(ASSIST, 2)], make_roster()
    )
    warnings = consistency_warnings(sheet)

    assert any("buteurs restent à désigner" in w for w in warnings)
    assert any("passes décisives que de buts" in w for w in warnings)


def test_un_dossard_attribue_deux_fois_est_refuse() -> None:
    with pytest.raises(ValueError, match="deux fois"):
        Roster(
            entries=(
                RosterEntry(bib=7, player_id=1, display_name="X", team="A"),
                RosterEntry(bib=7, player_id=2, display_name="Y", team="B"),
            )
        )


def test_une_equipe_ne_peut_pas_avoir_deux_gardiens() -> None:
    with pytest.raises(ValueError, match="gardiens"):
        Roster(
            entries=(
                RosterEntry(bib=1, player_id=1, display_name="X", team="A", goalkeeper=True),
                RosterEntry(bib=2, player_id=2, display_name="Y", team="A", goalkeeper=True),
            )
        )


def test_la_feuille_de_match_survit_a_un_aller_retour_json(tmp_path) -> None:
    roster = make_roster()
    path = tmp_path / "match.json"
    roster.save(path)
    relue = Roster.load(path)

    assert relue.by_bib(11).goalkeeper is True
    assert relue.team_of(3) == "A"
    assert relue.team_id("B") == 8
    assert relue.teams["A"].bib_color == (200, 40, 40)
