"""Les quatre statistiques UNO League, déduites de scénarios de jeu.

Chaque test raconte une action et vérifie que le système en tire le bon
événement — et, tout aussi important, qu'il n'en invente pas d'autres.
"""

from __future__ import annotations

from uno_vision.events import ASSIST, DEFENSE, GOAL, OWN_GOAL, SAVE, detect_events
from uno_vision.scene import FrameObservation
from synthetic import MatchScript, make_calibration, make_roster


def _kinds(events) -> list[str]:
    return [event.kind for event in events]


def test_un_but_est_detecte_et_attribue_au_buteur() -> None:
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(4, "A", 32, 8).add(11, "B", 38, 16)
    script.hold(4, 1.0)
    script.ball_to(41.0, 10.0, 0.5)  # frappe cadrée
    script.wait(0.6)  # ballon au fond
    script.ball_to(20.0, 10.0, 1.5)  # remise en jeu au centre
    script.wait(0.5)

    result = detect_events(script.frames, calibration, roster=make_roster())
    buts = [e for e in result.events if e.kind == GOAL]

    assert len(buts) == 1
    assert buts[0].bib == 4
    assert buts[0].team == "A"
    assert buts[0].scoring_team == "A"
    assert buts[0].confidence > 0.85  # remise en jeu au centre : but confirmé


def test_une_passe_decisive_est_creditee_au_passeur() -> None:
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(2, "A", 25, 10).add(4, "A", 32, 8).add(11, "B", 38, 16)
    script.hold(2, 1.0)
    script.ball_to(32.3, 8.0, 0.5)  # la passe
    script.hold(4, 0.8)  # contrôle bref
    script.ball_to(41.0, 10.0, 0.5)  # la frappe
    script.wait(0.6)
    script.ball_to(20.0, 10.0, 1.5)

    result = detect_events(script.frames, calibration, roster=make_roster())

    assert _kinds(result.events).count(GOAL) == 1
    passes = [e for e in result.events if e.kind == ASSIST]
    assert len(passes) == 1
    assert passes[0].bib == 2
    assert passes[0].team == "A"


def test_un_buteur_qui_garde_le_ballon_trop_longtemps_n_a_pas_de_passeur() -> None:
    """Après huit secondes de conduite de balle, le but n'est plus dû à la passe."""
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(2, "A", 25, 10).add(4, "A", 32, 8).add(11, "B", 38, 16)
    script.hold(2, 1.0)
    script.ball_to(32.3, 8.0, 0.5)
    script.hold(4, 8.0)
    script.ball_to(41.0, 10.0, 0.5)
    script.wait(0.6)

    result = detect_events(script.frames, calibration, roster=make_roster())

    assert _kinds(result.events).count(GOAL) == 1
    assert ASSIST not in _kinds(result.events)


def test_une_recuperation_adverse_annule_la_passe_decisive() -> None:
    calibration = make_calibration(team_a_defends="left")
    script = (
        MatchScript().add(2, "A", 20, 10).add(13, "B", 26, 10).add(4, "A", 32, 8)
    )
    script.hold(2, 1.0)
    script.ball_to(26.3, 10.0, 0.4)
    script.hold(13, 0.6)  # l'adversaire touche le ballon
    script.ball_to(32.3, 8.0, 0.4)
    script.hold(4, 0.6)
    script.ball_to(41.0, 10.0, 0.5)
    script.wait(0.6)

    result = detect_events(script.frames, calibration, roster=make_roster())

    assert _kinds(result.events).count(GOAL) == 1
    assert ASSIST not in _kinds(result.events)


def test_un_but_contre_son_camp_ne_credite_personne_et_profite_a_l_adversaire() -> None:
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(3, "A", 3, 10)
    script.hold(3, 1.0)
    script.ball_to(-0.5, 10.0, 0.4)  # dans sa propre cage
    script.wait(0.6)

    result = detect_events(script.frames, calibration, roster=make_roster())

    assert _kinds(result.events) == [OWN_GOAL]
    contre_son_camp = result.events[0]
    assert contre_son_camp.team == "A"
    assert contre_son_camp.scoring_team == "B"


def test_un_ballon_a_cote_du_poteau_n_est_pas_un_but() -> None:
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(4, "A", 32, 8)
    script.hold(4, 1.0)
    script.ball_to(41.0, 14.0, 0.5)  # largement à côté
    script.wait(0.6)

    result = detect_events(script.frames, calibration, roster=make_roster())

    assert GOAL not in _kinds(result.events)
    assert result.shots and result.shots[0].on_target is False
    assert result.shots[0].outcome == "off_target"


def test_un_arret_du_gardien_est_credite_au_gardien() -> None:
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(5, "A", 30, 10).add(11, "B", 38.5, 10)
    script.hold(5, 1.0)
    script.ball_to(38.2, 10.0, 0.5)  # tir cadré
    script.hold(11, 1.0)  # bloqué par le gardien

    result = detect_events(script.frames, calibration, roster=make_roster())
    arrets = [e for e in result.events if e.kind == SAVE]

    assert len(arrets) == 1
    assert arrets[0].bib == 11
    assert arrets[0].team == "B"
    assert GOAL not in _kinds(result.events)


def test_un_tir_contre_par_un_joueur_de_champ_est_une_defense() -> None:
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(5, "A", 30, 10).add(13, "B", 33, 10)
    script.hold(5, 1.0)
    script.ball_to(32.8, 10.0, 0.4)
    script.hold(13, 1.0)

    result = detect_events(script.frames, calibration, roster=make_roster())
    defenses = [e for e in result.events if e.kind == DEFENSE]

    assert len(defenses) == 1
    assert defenses[0].bib == 13
    assert SAVE not in _kinds(result.events)


def test_une_interception_devant_sa_cage_est_une_defense() -> None:
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(2, "A", 20, 10).add(14, "B", 28, 16)
    script.hold(2, 1.0)
    script.ball_to(28.3, 16.0, 0.6)
    script.hold(14, 1.0)

    result = detect_events(script.frames, calibration, roster=make_roster())
    defenses = [e for e in result.events if e.kind == DEFENSE]

    assert len(defenses) == 1
    assert defenses[0].bib == 14
    assert defenses[0].team == "B"


def test_une_perte_de_balle_au_milieu_n_est_pas_une_defense() -> None:
    """Sinon la statistique compterait les passes ratées de l'adversaire."""
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(2, "A", 12, 10).add(14, "B", 18, 16)
    script.hold(2, 1.0)
    script.ball_to(18.3, 16.0, 0.6)
    script.hold(14, 1.0)

    result = detect_events(script.frames, calibration, roster=make_roster())

    assert DEFENSE not in _kinds(result.events)


def test_une_passe_en_retrait_n_est_pas_une_interception() -> None:
    """Le ballon doit progresser vers le but du défenseur, pas s'en éloigner."""
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(2, "A", 32, 10).add(14, "B", 29, 16)
    script.hold(2, 1.0)
    script.ball_to(29.3, 16.0, 0.6)  # vers l'arrière, loin du but de B
    script.hold(14, 1.0)

    result = detect_events(script.frames, calibration, roster=make_roster())

    assert DEFENSE not in _kinds(result.events)


def test_un_but_sans_porteur_identifie_reste_signale() -> None:
    """Le score doit être juste même quand le buteur échappe à la vision."""
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(11, "B", 20, 2)
    script.ball_to(41.0, 10.0, 2.0)  # ballon venu de nulle part
    script.wait(0.6)

    result = detect_events(script.frames, calibration, roster=make_roster())
    buts = [e for e in result.events if e.kind == GOAL]

    assert len(buts) == 1
    assert buts[0].bib is None
    assert buts[0].scoring_team == "A"
    assert buts[0].needs_review is True


def test_le_meme_but_n_est_pas_compte_deux_fois() -> None:
    """Le ballon rebondit dans les filets : c'est un seul franchissement."""
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(4, "A", 32, 10)
    script.hold(4, 1.0)
    script.ball_to(40.8, 10.0, 0.5)
    script.ball_to(40.2, 10.0, 0.2)  # rebond au fond du filet
    script.ball_to(40.9, 10.0, 0.2)
    script.wait(0.5)

    result = detect_events(script.frames, calibration, roster=make_roster())

    assert _kinds(result.events).count(GOAL) == 1


def test_un_echange_calme_au_milieu_ne_produit_rien() -> None:
    calibration = make_calibration(team_a_defends="left")
    script = MatchScript().add(2, "A", 18, 8).add(3, "A", 22, 12)
    script.hold(2, 1.5).ball_to(22.3, 12.0, 0.5).hold(3, 1.5)
    script.ball_to(18.3, 8.0, 0.5).hold(2, 1.5)

    result = detect_events(script.frames, calibration, roster=make_roster())

    assert result.events == []


def test_une_video_sans_ballon_le_dit_franchement() -> None:
    script = MatchScript().add(2, "A", 20, 10)
    script.hold(2, 1.0)
    sans_ballon = [
        FrameObservation(index=f.index, time_s=f.time_s, players=f.players)
        for f in script.frames
    ]

    result = detect_events(sans_ballon, make_calibration(), roster=make_roster())

    assert result.events == []
    assert any("Ballon jamais détecté" in w for w in result.warnings)
