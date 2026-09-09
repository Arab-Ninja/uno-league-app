"""Chaîne complète : un match entier, des observations au rapport."""

from __future__ import annotations

import json

import pytest

from uno_vision.cli import main
from uno_vision.config import AnalysisConfig
from uno_vision.observations import write_observations
from uno_vision.pipeline import analyse_observations
from uno_vision.report import SCHEMA_VERSION, VideoInfo
from synthetic import MatchScript, make_calibration, make_roster


def full_match() -> MatchScript:
    """Un match qui contient les quatre statistiques et un but contre son camp.

    Équipe A défend la cage de gauche, attaque celle de droite.
    """
    script = (
        MatchScript()
        .add(1, "A", 1.5, 10).add(2, "A", 25, 10).add(4, "A", 32, 8).add(5, "A", 30, 10)
        .add(11, "B", 38, 16).add(13, "B", 33, 10).add(14, "B", 10, 10)
    )
    # 1. A2 sert A4, qui marque ; le jeu reprend au centre.
    script.hold(2, 1.0).ball_to(32.3, 8.0, 0.5).hold(4, 0.8)
    script.ball_to(41.0, 10.0, 0.5).wait(0.6)
    script.ball_to(20.0, 10.0, 1.5).wait(0.4)
    # 2. B14 frappe ; le gardien A1 bloque.
    script.ball_to(10.3, 10.0, 1.5).hold(14, 1.0)
    script.ball_to(1.8, 10.0, 0.5).hold(1, 1.0)
    # 3. Relance ; A5 frappe, B13 contre le tir.
    script.ball_to(30.3, 10.0, 4.0).hold(5, 1.0)
    script.ball_to(32.8, 10.0, 0.4).hold(13, 1.0)
    # 4. Longue passe de B13, interceptée par A2 devant sa propre cage.
    script.place(2, 8, 6)
    script.ball_to(8.3, 6.0, 2.0).hold(2, 1.0)
    # 5. A2 trompe son propre gardien, sorti de sa ligne.
    script.place(1, 1.5, 3)
    script.ball_to(-0.5, 10.0, 1.2).wait(0.6)
    return script


@pytest.fixture()
def analysis():
    return analyse_observations(
        full_match().frames, make_calibration("left"), make_roster()
    )


def test_le_score_tient_compte_du_but_contre_son_camp(analysis) -> None:
    assert analysis.sheet.score_a == 1
    assert analysis.sheet.score_b == 1
    assert len(analysis.sheet.own_goals) == 1


def test_chaque_statistique_revient_au_bon_joueur(analysis) -> None:
    sheet = analysis.sheet
    assert sheet.line_of(4).goals == 1  # le buteur
    assert sheet.line_of(2).assists == 1  # le passeur
    assert sheet.line_of(1).saves == 1  # l'arrêt du gardien
    assert sheet.line_of(13).defenses == 1  # le tir contré
    assert sheet.line_of(2).defenses == 1  # l'interception


def test_le_but_contre_son_camp_ne_credite_aucun_buteur(analysis) -> None:
    assert sum(line.goals for line in analysis.sheet.lines) == 1
    assert analysis.sheet.own_goals[0].bib == 2


def test_aucune_statistique_n_est_inventee(analysis) -> None:
    """Sept joueurs ne touchent jamais le ballon : leur ligne doit rester vide."""
    inactifs = [3, 5, 11, 12, 14, 15]
    assert all(analysis.sheet.line_of(bib).total_events == 0 for bib in inactifs)


def test_le_rapport_a_la_forme_attendue_par_l_api(analysis) -> None:
    report = analysis.report

    assert report["schemaVersion"] == SCHEMA_VERSION
    assert report["match"]["proposalId"] == 42
    assert report["match"]["teamAId"] == 7
    assert report["match"]["scoreA"] == 1

    lignes = {row["bib"]: row for row in report["matchStats"]}
    assert set(lignes) == {1, 2, 3, 4, 5, 11, 12, 13, 14, 15}
    assert lignes[4]["playerId"] == 103
    assert lignes[4]["goals"] == 1
    assert set(lignes[4]) >= {"playerId", "goals", "assists", "defenses", "saves"}


def test_chaque_evenement_porte_de_quoi_le_verifier(analysis) -> None:
    for event in analysis.report["events"]:
        assert event["id"]
        assert event["detail"]
        assert 0.0 < event["confidence"] <= 1.0
        assert isinstance(event["timeMs"], int)
        assert event["kind"] in {"goal", "own_goal", "assist", "save", "defense"}


def test_les_evenements_incertains_sont_remontes_a_l_arbitre(analysis) -> None:
    review = analysis.report["review"]
    ids = {event["id"] for event in analysis.report["events"] if event["kind"] == "save"}

    # L'arrêt est le fait de jeu le moins sûr : il doit demander confirmation.
    assert ids <= set(review["lowConfidenceEvents"])


def test_le_rapport_mesure_sa_propre_qualite(analysis) -> None:
    quality = analysis.report["quality"]
    assert quality["possessions"] > 5
    assert quality["shots"] == 3
    assert quality["shotsOnTarget"] == 3
    assert quality["totals"]["goals"] == 1


def test_les_evenements_sont_ordonnes_dans_le_temps(analysis) -> None:
    instants = [event["timeMs"] for event in analysis.report["events"]]
    assert instants == sorted(instants)


def test_des_seuils_plus_stricts_reduisent_les_evenements() -> None:
    """Un réglage sévère doit se traduire par moins de propositions, pas par un plantage."""
    frames = full_match().frames
    severe = AnalysisConfig(
        possession_radius_m=0.8,
        shot_min_speed_m_s=25.0,
        interception_progress_m=40.0,
    )
    stricte = analyse_observations(frames, make_calibration("left"), make_roster(), severe)
    normale = analyse_observations(frames, make_calibration("left"), make_roster())

    assert len(stricte.result.events) < len(normale.result.events)


def test_la_commande_replay_produit_un_rapport_sur_disque(tmp_path) -> None:
    calibration_path = tmp_path / "salle.json"
    roster_path = tmp_path / "match.json"
    observations_path = tmp_path / "observations.jsonl"
    make_calibration("left").save(calibration_path)
    make_roster().save(roster_path)
    write_observations(observations_path, full_match().frames)

    code = main(
        [
            "replay",
            "--observations", str(observations_path),
            "--calibration", str(calibration_path),
            "--roster", str(roster_path),
            "--out", str(tmp_path / "resultats"),
        ]
    )

    assert code == 0
    report = json.loads((tmp_path / "resultats" / "report.json").read_text(encoding="utf-8"))
    assert report["match"]["scoreA"] == 1
    assert report["match"]["scoreB"] == 1
    assert len(report["events"]) == 6


def test_la_commande_roster_template_ecrit_une_feuille_vierge(tmp_path) -> None:
    destination = tmp_path / "roster.json"
    assert main(["roster-template", "--out", str(destination)]) == 0

    template = json.loads(destination.read_text(encoding="utf-8"))
    assert len(template["players"]) == 10
    assert template["players"][0]["goalkeeper"] is True
    assert {player["team"] for player in template["players"]} == {"A", "B"}


def test_la_commande_calibrate_verifie_l_homographie(tmp_path, capsys) -> None:
    destination = tmp_path / "salle.json"
    code = main(
        [
            "calibrate",
            "--points", "0,0 400,0 400,200 0,200",
            "--length", "40", "--width", "20",
            "--out", str(destination),
        ]
    )

    assert code == 0
    assert "rond central" in capsys.readouterr().out
    assert json.loads(destination.read_text(encoding="utf-8"))["teamADefends"] == "left"


def test_un_reglage_inconnu_est_refuse_plutot_qu_ignore() -> None:
    with pytest.raises(ValueError, match="réglages inconnus"):
        AnalysisConfig.from_dict({"possession_radius_m": 2.0, "rayon_possession": 2.0})


def test_les_reglages_se_chargent_depuis_un_fichier(tmp_path) -> None:
    path = tmp_path / "seuils.json"
    path.write_text(json.dumps({"possession_radius_m": 2.4}), encoding="utf-8")

    config = AnalysisConfig.load(path)
    assert config.possession_radius_m == pytest.approx(2.4)
    assert config.shot_min_speed_m_s == AnalysisConfig().shot_min_speed_m_s


def test_le_rapport_reste_lisible_sans_video(analysis) -> None:
    """Rejouer des observations sans la vidéo source reste exploitable."""
    assert analysis.report["video"]["path"] == ""
    assert analysis.report["video"]["durationS"] == 0.0
    # Le ballon est visible sur toutes les images du scénario.
    assert analysis.report["quality"]["ballDetectionRate"] == pytest.approx(1.0)


def test_les_metadonnees_video_remontent_dans_le_rapport() -> None:
    frames = full_match().frames
    video = VideoInfo(path="match.mp4", fps=25.0, frame_count=len(frames), width=1920, height=1080)
    analysis = analyse_observations(
        frames, make_calibration("left"), make_roster(), video=video
    )

    assert analysis.report["video"]["durationS"] == pytest.approx(len(frames) / 25.0, abs=0.01)
    assert analysis.report["quality"]["ballDetectionRate"] > 0.5
