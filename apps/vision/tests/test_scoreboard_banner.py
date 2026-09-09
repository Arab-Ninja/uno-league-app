"""Recalage des buts sur le bandeau d'annonce du centre.

Ces fonctions sont en Python pur : le module vidéo ne charge OpenCV qu'à
l'intérieur des fonctions qui décodent réellement des images.
"""

from __future__ import annotations

import pytest

from uno_vision.reference import ReferenceGoal
from uno_vision.video.scoreboard import _align_on_banner, _banner_onsets


def _serie(motif: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return motif


def test_les_fronts_montants_du_bandeau_sont_reperes() -> None:
    serie = [(float(t), 80.0) for t in range(0, 10)]
    serie += [(float(t), 250.0) for t in range(10, 20)]
    serie += [(float(t), 80.0) for t in range(20, 30)]
    serie += [(float(t), 250.0) for t in range(30, 40)]

    assert _banner_onsets(serie) == [10.0, 30.0]


def test_sans_contraste_franc_aucun_bandeau_n_est_invente() -> None:
    """Une salle sans annonce ne doit pas produire de faux repères."""
    serie = [(float(t), 100.0 + (t % 3)) for t in range(60)]
    assert _banner_onsets(serie) == []


def test_une_serie_trop_courte_ne_donne_rien() -> None:
    assert _banner_onsets([(0.0, 80.0), (1.0, 250.0)]) == []


def test_un_but_est_recale_sur_son_annonce() -> None:
    buts = [ReferenceGoal(time_s=1204.0, side="B", score_after=1)]
    recales = _align_on_banner(buts, [1174.0])

    assert recales[0].time_s == pytest.approx(1174.0)
    assert recales[0].announced is True
    assert recales[0].side == "B"          # l'équipe vient toujours des chiffres


def test_deux_buts_rapproches_ne_partagent_pas_un_bandeau() -> None:
    """Le bandeau reste allumé entre deux buts : un seul front pour deux buts.

    Sans exclusion mutuelle, le second reculerait de cinquante secondes au lieu
    de trente — pire que de ne rien corriger.
    """
    buts = [
        ReferenceGoal(time_s=1412.0, side="A", score_after=1),
        ReferenceGoal(time_s=1430.0, side="A", score_after=2),
    ]
    recales = _align_on_banner(buts, [1382.0])

    assert recales[0].time_s == pytest.approx(1382.0)
    assert recales[0].announced is True
    # Le second est estimé au retard médian, et signalé comme tel.
    assert recales[1].time_s == pytest.approx(1400.0)
    assert recales[1].announced is False


def test_une_annonce_trop_ancienne_n_est_pas_rattachee() -> None:
    buts = [ReferenceGoal(time_s=1204.0, side="B", score_after=1)]
    recales = _align_on_banner(buts, [900.0])

    assert recales[0].time_s == pytest.approx(1204.0)
    assert recales[0].announced is False


def test_sans_bandeau_les_instants_restent_ceux_de_la_saisie() -> None:
    buts = [ReferenceGoal(time_s=1204.0, side="B", score_after=1)]
    assert _align_on_banner(buts, []) == buts


def test_le_retard_systematique_est_absorbe_pour_tous_les_buts() -> None:
    """Trente secondes de retard mesurées sur un centre réel."""
    buts = [
        ReferenceGoal(time_s=1204.0, side="B", score_after=1),
        ReferenceGoal(time_s=1412.0, side="A", score_after=1),
        ReferenceGoal(time_s=1590.0, side="B", score_after=2),
    ]
    recales = _align_on_banner(buts, [1174.0, 1382.0, 1560.0])

    assert [round(g.time_s) for g in recales] == [1174, 1382, 1560]
    assert all(g.announced for g in recales)
