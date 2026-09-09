"""Validation par l'arbitre : décisions, recalcul et page autonome."""

from __future__ import annotations

import json

import pytest

from uno_vision.cli import main
from uno_vision.pipeline import analyse_observations
from uno_vision.review import ReviewError, apply_corrections, render_review_page
from synthetic import MatchScript, make_calibration, make_roster


def _report() -> dict:
    """Un but avec passe décisive, tel que la chaîne le propose."""
    script = MatchScript().add(2, "A", 25, 10).add(4, "A", 32, 8).add(11, "B", 38, 16)
    script.hold(2, 1.0).ball_to(32.3, 8.0, 0.5).hold(4, 0.8)
    script.ball_to(41.0, 10.0, 0.5).wait(0.6).ball_to(20.0, 10.0, 1.5)
    return analyse_observations(script.frames, make_calibration("left"), make_roster()).report


def _corrections(decisions=None, added=None) -> dict:
    return {"version": 1, "decisions": decisions or {}, "added": added or []}


def test_valider_ne_change_pas_la_feuille() -> None:
    report = _report()
    but = next(e for e in report["events"] if e["kind"] == "goal")

    corrige, bilan = apply_corrections(
        report, _corrections({but["id"]: {"status": "confirmed"}})
    )

    assert bilan.confirmed == 1
    assert bilan.touched == 0
    ligne = next(r for r in corrige["matchStats"] if r["bib"] == 4)
    assert ligne["goals"] == 1
    assert next(e for e in corrige["events"] if e["id"] == but["id"])["reviewed"] is True


def test_supprimer_un_faux_positif_retire_le_point() -> None:
    report = _report()
    but = next(e for e in report["events"] if e["kind"] == "goal")

    corrige, bilan = apply_corrections(
        report, _corrections({but["id"]: {"status": "rejected"}})
    )

    assert bilan.rejected == 1
    assert all(e["id"] != but["id"] for e in corrige["events"])
    assert next(r for r in corrige["matchStats"] if r["bib"] == 4)["goals"] == 0
    assert corrige["match"]["scoreA"] == 0


def test_reattribuer_un_but_deplace_le_point_et_le_playerid() -> None:
    report = _report()
    but = next(e for e in report["events"] if e["kind"] == "goal")

    corrige, bilan = apply_corrections(
        report, _corrections({but["id"]: {"status": "reassigned", "bib": 5}})
    )

    assert bilan.reassigned == 1
    assert next(r for r in corrige["matchStats"] if r["bib"] == 4)["goals"] == 0
    assert next(r for r in corrige["matchStats"] if r["bib"] == 5)["goals"] == 1
    corrige_but = next(e for e in corrige["events"] if e["id"] == but["id"])
    assert corrige_but["playerId"] == 104          # le playerId suit le dossard
    assert corrige_but["confidence"] == 1.0
    assert corrige["match"]["scoreA"] == 1          # le score, lui, ne bouge pas


def test_ajouter_une_action_manquee_la_compte() -> None:
    """Une chaîne qui ne sait que corriger ce qu'elle a vu reste incomplète."""
    report = _report()

    corrige, bilan = apply_corrections(
        report,
        _corrections(added=[{"kind": "save", "timeMs": 42000, "bib": 11}]),
    )

    assert bilan.added == 1
    assert next(r for r in corrige["matchStats"] if r["bib"] == 11)["saves"] == 1
    ajoute = next(e for e in corrige["events"] if e.get("manual"))
    assert ajoute["playerName"] == "Joueur B11"
    assert ajoute["needsReview"] is False


def test_les_evenements_restent_ordonnes_apres_ajout() -> None:
    report = _report()
    corrige, _ = apply_corrections(
        report, _corrections(added=[{"kind": "goal", "timeMs": 1, "bib": 2}])
    )
    instants = [e["timeMs"] for e in corrige["events"]]
    assert instants == sorted(instants)


def test_un_but_ajoute_compte_au_score() -> None:
    report = _report()
    corrige, _ = apply_corrections(
        report, _corrections(added=[{"kind": "goal", "timeMs": 50000, "bib": 3}])
    )
    assert corrige["match"]["scoreA"] == 2


def test_une_decision_inconnue_est_refusee() -> None:
    report = _report()
    but = report["events"][0]
    with pytest.raises(ReviewError, match="décision inconnue"):
        apply_corrections(report, _corrections({but["id"]: {"status": "peut-être"}}))


def test_un_format_de_corrections_inconnu_est_refuse() -> None:
    with pytest.raises(ReviewError, match="format"):
        apply_corrections(_report(), {"version": 99, "decisions": {}})


def test_la_validation_ne_perd_pas_les_avertissements_de_l_analyse() -> None:
    """C'est au moment de valider qu'une alerte d'échelle compte le plus."""
    report = _report()
    report["review"]["warnings"] = ["Les joueurs semblent courir à 18 m/s."]

    corrige, _ = apply_corrections(report, _corrections())

    assert corrige["review"]["warnings"] == ["Les joueurs semblent courir à 18 m/s."]


def test_un_evenement_corrige_n_est_plus_signale_comme_douteux() -> None:
    report = _report()
    incertain = report["events"][0]
    incertain["needsReview"] = True
    report["review"]["lowConfidenceEvents"] = [incertain["id"]]

    corrige, _ = apply_corrections(
        report, _corrections({incertain["id"]: {"status": "confirmed"}})
    )

    assert incertain["id"] not in corrige["review"]["lowConfidenceEvents"]


def test_les_statistiques_sont_recalculees_jamais_retouchees() -> None:
    """Le compteur doit toujours découler des événements qui le justifient."""
    report = _report()
    passe = next(e for e in report["events"] if e["kind"] == "assist")

    corrige, _ = apply_corrections(
        report, _corrections({passe["id"]: {"status": "rejected"}})
    )
    total_passes = sum(r["assists"] for r in corrige["matchStats"])
    assert total_passes == 0
    assert not [e for e in corrige["events"] if e["kind"] == "assist"]


def test_la_page_de_validation_est_autonome() -> None:
    page = render_review_page(_report())
    assert page.startswith("<!doctype html>")
    assert "REPORT = {" in page
    assert "http://" not in page and "https://" not in page   # aucun appel réseau
    assert "Télécharger les corrections" in page


def test_la_page_echappe_les_fins_de_balise() -> None:
    """Un nom de joueur malicieux ne doit pas pouvoir fermer le script."""
    page = render_review_page({"events": [], "matchStats": [],
                               "note": "</script><script>alert(1)</script>"})
    assert "</script><script>alert" not in page


def test_la_commande_review_ecrit_la_page(tmp_path) -> None:
    report_path = tmp_path / "report.json"
    report_path.write_text(json.dumps(_report()), encoding="utf-8")

    assert main(["review", "--report", str(report_path)]) == 0
    page = (tmp_path / "review.html").read_text(encoding="utf-8")
    assert "Validation UNO League" in page


def test_la_commande_apply_review_ecrit_la_feuille_validee(tmp_path) -> None:
    report = _report()
    but = next(e for e in report["events"] if e["kind"] == "goal")
    report_path = tmp_path / "report.json"
    report_path.write_text(json.dumps(report), encoding="utf-8")
    corrections_path = tmp_path / "corrections.json"
    corrections_path.write_text(
        json.dumps(_corrections({but["id"]: {"status": "reassigned", "bib": 5}})),
        encoding="utf-8",
    )

    code = main(["apply-review", "--report", str(report_path),
                 "--corrections", str(corrections_path)])

    assert code == 0
    valide = json.loads((tmp_path / "report-valide.json").read_text(encoding="utf-8"))
    assert next(r for r in valide["matchStats"] if r["bib"] == 5)["goals"] == 1
    assert valide["reviewOutcome"]["reassigned"] == 1
    # Les avertissements de l'analyse survivent à la validation.
    assert "warnings" in valide["review"]


def test_des_corrections_illisibles_font_echouer_proprement(tmp_path) -> None:
    report_path = tmp_path / "report.json"
    report_path.write_text(json.dumps(_report()), encoding="utf-8")
    corrections_path = tmp_path / "corrections.json"
    corrections_path.write_text(json.dumps({"version": 99}), encoding="utf-8")

    assert main(["apply-review", "--report", str(report_path),
                 "--corrections", str(corrections_path)]) == 1


# -- Lecture de l'action ----------------------------------------------------


def test_la_page_se_positionne_dans_la_video_de_session() -> None:
    """Le mode normal : aucun extrait à découper, donc aucun ffmpeg requis."""
    page = render_review_page(_report(), video="session.mp4")

    assert '"video": "session.mp4"' in page
    assert "loadedmetadata" in page   # la vidéo distante n'est pas prête au rendu
    assert "Revoir l'action" in page


def test_sans_video_ni_extrait_la_page_le_dit(tmp_path) -> None:
    report = _report()
    for event in report["events"]:
        event["clip"] = None
    page = render_review_page(report)

    assert "Ni vidéo de session ni extrait" in page


def test_la_commande_review_accepte_une_url_de_video(tmp_path) -> None:
    report_path = tmp_path / "report.json"
    report_path.write_text(json.dumps(_report()), encoding="utf-8")

    code = main(
        ["review", "--report", str(report_path), "--video", "https://exemple/x.mp4"]
    )

    assert code == 0
    page = (tmp_path / "review.html").read_text(encoding="utf-8")
    assert "https://exemple/x.mp4" in page


def test_la_video_locale_est_designee_relativement_a_la_page(tmp_path) -> None:
    """Le dossier de résultats doit rester déplaçable d'une machine à l'autre."""
    report_path = tmp_path / "report.json"
    report_path.write_text(json.dumps(_report()), encoding="utf-8")
    video = tmp_path / "session.mp4"
    video.write_bytes(b"")

    main(["review", "--report", str(report_path), "--video", str(video)])
    page = (tmp_path / "review.html").read_text(encoding="utf-8")

    assert '"video": "session.mp4"' in page
    assert str(tmp_path) not in page


def test_la_video_est_muette_pour_pouvoir_demarrer_seule() -> None:
    """Les navigateurs refusent de lancer une vidéo sonore sans geste humain.

    Sans cela, la page se positionne au bon endroit et reste figée : le bug
    est silencieux, et l'arbitre croit que l'extrait n'existe pas.
    """
    page = render_review_page(_report(), video="session.mp4")
    balise = page[page.index('<video id="clip"') : page.index("</video>")]
    assert "muted" in balise
    assert "controls" in balise   # le son reste rétablissable


def test_la_fenetre_de_lecture_est_reglable() -> None:
    page = render_review_page(_report(), video="s.mp4", seconds_before=15, seconds_after=5)
    assert '"before": 15' in page
    assert '"after": 5' in page


def test_le_decalage_de_fenetre_est_retenu_entre_les_sessions() -> None:
    """Un horodatage systématiquement décalé se corrige une fois, pas à chaque action."""
    page = render_review_page(_report(), video="s.mp4")
    assert "uno-review-offset" in page
    assert "localStorage" in page


def test_la_commande_review_accepte_une_fenetre_sur_mesure(tmp_path) -> None:
    report_path = tmp_path / "report.json"
    report_path.write_text(json.dumps(_report()), encoding="utf-8")

    main(["review", "--report", str(report_path), "--video", "s.mp4",
          "--before", "20", "--after", "6"])

    page = (tmp_path / "review.html").read_text(encoding="utf-8")
    assert '"before": 20' in page
