"""Découpage d'une session en matchs, et repère d'évaluation."""

from __future__ import annotations

import json

import pytest

from uno_vision.cli import main
from uno_vision.pipeline import analyse_session
from uno_vision.reference import ReferenceGoal, ReferenceTimeline, compare_goals
from uno_vision.roster import Roster, RosterEntry, TeamInfo
from uno_vision.session import MatchWindow, SessionPlan, blank_plan
from synthetic import MatchScript, make_calibration


def _roster(match_order: int, team_of_bib3: str) -> Roster:
    """Feuille où le dossard 3 change d'équipe d'un match à l'autre."""
    entries = [
        RosterEntry(bib=3, player_id=118, display_name="Yassine", team=team_of_bib3),
        RosterEntry(bib=4, player_id=119, display_name="Karim",
                    team="B" if team_of_bib3 == "A" else "A"),
        RosterEntry(bib=11, player_id=120, display_name="Sofiane", team="B",
                    goalkeeper=True),
    ]
    return Roster(
        entries=tuple(entries),
        teams={"A": TeamInfo(team_id=7), "B": TeamInfo(team_id=8)},
        match_order=match_order,
    )


def _two_match_session() -> tuple[list, SessionPlan]:
    """Deux buts, marqués par le même dossard, dans deux équipes différentes."""
    script = MatchScript().add(3, "A", 32, 8).add(11, "B", 38, 16)
    script.hold(3, 1.0).ball_to(41.0, 10.0, 0.5).wait(0.6)     # but du match 1
    script.ball_to(20.0, 10.0, 2.0).wait(2.0)
    fin_match_1 = script.frames[-1].time_s + 0.5
    script.place(3, 8, 12)
    script.ball_to(8.3, 12.0, 3.0).hold(3, 1.0)
    script.ball_to(-0.5, 10.0, 0.6).wait(0.6)                  # but du match 2
    plan = SessionPlan(
        windows=(
            MatchWindow(1, 0.0, fin_match_1, _roster(1, "A")),
            MatchWindow(2, fin_match_1, 9999.0, _roster(2, "B")),
        ),
        proposal_id=42,
    )
    return script.frames, plan


def test_une_session_produit_un_rapport_par_match() -> None:
    frames, plan = _two_match_session()
    session = analyse_session(frames, make_calibration("left"), plan)

    assert len(session.matches) == 2
    assert [m["matchOrder"] for m in session.report["matches"]] == [1, 2]
    assert session.report["proposalId"] == 42


def test_aucune_action_n_enjambe_la_frontiere_entre_deux_matchs() -> None:
    """Sinon le buteur du match 1 hériterait de la possession du match 2."""
    frames, plan = _two_match_session()
    session = analyse_session(frames, make_calibration("left"), plan)

    premier = session.analysis_of(1)
    second = session.analysis_of(2)
    fin = plan.windows[0].end_s

    assert all(e.time_s < fin for e in premier.result.events)
    assert all(e.time_s >= fin for e in second.result.events)


def test_un_joueur_qui_change_d_equipe_est_credite_dans_la_bonne() -> None:
    """C'est la raison d'être du découpage : les équipes sont retirées au sort."""
    frames, plan = _two_match_session()
    session = analyse_session(frames, make_calibration("left"), plan)

    premier = session.analysis_of(1)
    assert premier.sheet.line_of(3).goals == 1
    assert premier.sheet.line_of(3).team == "A"
    assert premier.sheet.score_a == 1

    # Au match 2, le dossard 3 est passé dans l'équipe B : son but contre le
    # camp de gauche, qu'il défend désormais, profite à l'équipe A.
    second = session.analysis_of(2)
    assert second.sheet.line_of(3).team == "B"
    assert second.sheet.line_of(3).goals == 0


def test_des_matchs_qui_se_chevauchent_sont_refuses() -> None:
    with pytest.raises(ValueError, match="chevauchent"):
        SessionPlan(
            windows=(
                MatchWindow(1, 0.0, 600.0, Roster()),
                MatchWindow(2, 500.0, 1100.0, Roster()),
            )
        )


def test_un_match_qui_finit_avant_de_commencer_est_refuse() -> None:
    with pytest.raises(ValueError, match="doit suivre"):
        MatchWindow(1, 600.0, 500.0, Roster())


def test_deux_matchs_ne_portent_pas_le_meme_numero() -> None:
    with pytest.raises(ValueError, match="même numéro"):
        SessionPlan(
            windows=(
                MatchWindow(1, 0.0, 600.0, Roster()),
                MatchWindow(1, 600.0, 1200.0, Roster()),
            )
        )


def test_la_trame_de_session_enchaine_des_matchs_de_dix_minutes() -> None:
    plan = blank_plan(6)
    assert len(plan.windows) == 6
    assert plan.windows[0].duration_s == pytest.approx(600.0)
    assert plan.match_at(1250.0).match_order == 3
    assert plan.match_at(99999.0) is None


def test_le_plan_de_session_survit_a_un_aller_retour_json(tmp_path) -> None:
    _, plan = _two_match_session()
    path = tmp_path / "session.json"
    plan.save(path)
    relu = SessionPlan.load(path)

    assert relu.proposal_id == 42
    assert [w.match_order for w in relu.windows] == [1, 2]
    assert relu.windows[0].roster.team_of(3) == "A"
    assert relu.windows[1].roster.team_of(3) == "B"


# -- Repère d'évaluation ----------------------------------------------------


def test_le_repere_se_controle_lui_meme() -> None:
    """Le décompte des buts doit reconstituer le score final lu séparément."""
    juste = ReferenceTimeline(
        goals=(ReferenceGoal(10.0, "A"), ReferenceGoal(20.0, "B")),
        final_score=(1, 1),
    )
    faux = ReferenceTimeline(
        goals=(ReferenceGoal(10.0, "A"),), final_score=(1, 1)
    )

    assert juste.is_consistent
    assert not faux.is_consistent


def test_la_comparaison_mesure_rappel_et_precision() -> None:
    reference = ReferenceTimeline(
        goals=tuple(ReferenceGoal(t, "A") for t in (100.0, 200.0, 300.0))
    )
    comparaison = compare_goals([104.0, 198.0, 900.0], reference)

    assert len(comparaison.matched) == 2
    assert len(comparaison.missed) == 1
    assert len(comparaison.spurious) == 1
    assert comparaison.recall == pytest.approx(2 / 3)
    assert comparaison.precision == pytest.approx(2 / 3)


def test_un_but_detecte_ne_compte_pas_pour_deux() -> None:
    """Sur une série rapprochée, l'appariement glouton doit rester injectif."""
    reference = ReferenceTimeline(
        goals=(ReferenceGoal(100.0, "A"), ReferenceGoal(105.0, "A"))
    )
    comparaison = compare_goals([102.0], reference)

    assert len(comparaison.matched) == 1
    assert len(comparaison.missed) == 1
    assert comparaison.recall == pytest.approx(0.5)


def test_le_retard_du_tableau_est_mesure_pas_penalise() -> None:
    """Le tableau est actionné à la main : quelques secondes de retard sont normales."""
    reference = ReferenceTimeline(
        goals=tuple(ReferenceGoal(t, "A") for t in (100.0, 200.0))
    )
    comparaison = compare_goals([106.0, 205.0], reference)

    assert comparaison.recall == pytest.approx(1.0)
    assert comparaison.mean_delay_s == pytest.approx(5.5)


def test_le_repere_survit_a_un_aller_retour_json(tmp_path) -> None:
    timeline = ReferenceTimeline(
        goals=(ReferenceGoal(1204.0, "B", score_after=1),),
        video="session.mp4",
        final_score=(0, 1),
    )
    path = tmp_path / "reference.json"
    timeline.save(path)
    relu = ReferenceTimeline.load(path)

    assert relu.goals[0].time_s == pytest.approx(1204.0)
    assert relu.goals[0].side == "B"
    assert relu.final_score == (0, 1)
    assert json.loads(path.read_text(encoding="utf-8"))["consistent"] is True


def test_la_commande_session_template_ecrit_une_trame(tmp_path) -> None:
    destination = tmp_path / "session.json"
    assert main(["session-template", "--out", str(destination), "--matches", "4"]) == 0

    plan = json.loads(destination.read_text(encoding="utf-8"))
    assert len(plan["matches"]) == 4
    assert plan["matches"][1]["startS"] == 600.0


def test_evaluer_contre_un_repere_incoherent_est_refuse(tmp_path) -> None:
    """Mesurer contre une référence fausse serait pire que ne pas mesurer."""
    reference = tmp_path / "reference.json"
    ReferenceTimeline(goals=(ReferenceGoal(10.0, "A"),), final_score=(3, 0)).save(reference)
    report = tmp_path / "report.json"
    report.write_text(json.dumps({"events": []}), encoding="utf-8")

    assert main(["evaluate", "--report", str(report), "--reference", str(reference)]) == 1


def test_la_calibration_accepte_des_reperes_autres_que_les_coins(tmp_path) -> None:
    """La caméra est derrière un but : le terrain n'est jamais entier dans le cadre.

    Les quatre coins sont alors hors champ, et la calibration doit pouvoir
    s'appuyer sur ce qui reste visible et mesurable — poteaux, coins de la
    surface, rond central.
    """
    from uno_vision.calibration import Calibration
    from uno_vision.scene import Point

    destination = tmp_path / "salle.json"
    code = main(
        [
            "calibrate",
            "--points", "180,300 540,300 120,380 600,380",
            "--field-points", "18.5,0 21.5,0 14,6 26,6",
            "--out", str(destination),
        ]
    )

    assert code == 0
    calibration = Calibration.load(destination)
    projete = calibration.to_field(Point(180.0, 300.0))
    assert projete.x == pytest.approx(18.5, abs=0.01)
    assert projete.y == pytest.approx(0.0, abs=0.01)
