"""Couleurs de chasubles et lecture des dossards."""

from __future__ import annotations

import pytest

from uno_vision.numbers import BibResolver
from uno_vision.scene import TEAM_A, TEAM_B
from uno_vision.teams import TeamPalette, TeamVotes, cluster_two_colors, rgb_to_hsv


def test_conversion_tsv() -> None:
    hue, saturation, value = rgb_to_hsv((255, 0, 0))
    assert hue == pytest.approx(0.0)
    assert saturation == pytest.approx(1.0)
    assert value == pytest.approx(1.0)

    _, saturation_gris, _ = rgb_to_hsv((128, 128, 128))
    assert saturation_gris == pytest.approx(0.0)


def test_palette_separe_le_rouge_du_bleu() -> None:
    palette = TeamPalette((200, 40, 40), (40, 60, 200))
    team, confidence = palette.classify((190, 50, 45))
    assert team == TEAM_A
    assert confidence > 0.3

    team, _ = palette.classify((50, 70, 190))
    assert team == TEAM_B


def test_chasuble_a_l_ombre_reste_dans_son_equipe() -> None:
    """Même teinte, luminosité divisée par deux : l'équipe ne doit pas changer."""
    palette = TeamPalette((200, 40, 40), (40, 60, 200))
    team, _ = palette.classify((100, 20, 20))
    assert team == TEAM_A


def test_deux_couleurs_trop_proches_sont_signalees() -> None:
    proche = TeamPalette((200, 40, 40), (210, 60, 55))
    assert proche.separation < 0.2

    contraste = TeamPalette((200, 40, 40), (40, 60, 200))
    assert contraste.separation > 0.3


def test_clustering_retrouve_les_deux_couleurs_dominantes() -> None:
    echantillons = [(200, 40, 40)] * 8 + [(40, 60, 200)] * 8
    palette = cluster_two_colors(echantillons)
    couleurs = {palette.color_a, palette.color_b}
    assert (200, 40, 40) in couleurs
    assert (40, 60, 200) in couleurs


def test_le_vote_de_couleur_lisse_les_mesures_aberrantes() -> None:
    votes = TeamVotes(TeamPalette((200, 40, 40), (40, 60, 200)))
    for _ in range(20):
        votes.observe(1, (195, 45, 40))
    votes.observe(1, (45, 65, 195))  # une image où le joueur est mal découpé

    team, confidence = votes.resolve(1)
    assert team == TEAM_A
    assert confidence > 0.9


def test_piste_jamais_observee_reste_sans_equipe() -> None:
    votes = TeamVotes(TeamPalette((200, 40, 40), (40, 60, 200)))
    assert votes.resolve(99) == (None, 0.0)


def test_le_vote_de_dossard_l_emporte_sur_les_lectures_isolees() -> None:
    resolver = BibResolver()
    for _ in range(30):
        resolver.observe(1, 7, 0.6)
    for _ in range(4):
        resolver.observe(1, 1, 0.5)

    assignment = resolver.resolve(1)
    assert assignment is not None
    assert assignment.bib == 7
    assert assignment.confidence > 0.8


def test_un_numero_absent_de_la_feuille_est_ecarte() -> None:
    resolver = BibResolver()
    for _ in range(20):
        resolver.observe(1, 8, 0.9)  # personne ne porte le 8
    for _ in range(6):
        resolver.observe(1, 3, 0.7)

    assignment = resolver.resolve(1, allowed_bibs={1, 2, 3, 4, 5})
    assert assignment is not None
    assert assignment.bib == 3


def test_lecture_trop_incertaine_ne_donne_aucun_numero() -> None:
    resolver = BibResolver()
    resolver.observe(1, 6, 0.3)
    resolver.observe(1, 8, 0.3)
    assert resolver.resolve(1) is None


def test_deux_pistes_ne_partagent_pas_un_dossard() -> None:
    resolver = BibResolver()
    for _ in range(30):
        resolver.observe(1, 4, 0.9)
    for _ in range(10):
        resolver.observe(2, 4, 0.5)
    for _ in range(9):
        resolver.observe(2, 5, 0.5)

    resolved = resolver.resolve_all(allowed_bibs={4, 5})
    assert resolved[1].bib == 4
    assert resolved[2].bib == 5
