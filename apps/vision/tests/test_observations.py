"""Cache des observations."""

from __future__ import annotations

import json

import pytest

from uno_vision.observations import FORMAT_VERSION, read_observations, write_observations
from synthetic import MatchScript


def _script() -> MatchScript:
    script = MatchScript().add(3, "A", 20, 10).add(12, "B", 25, 12)
    return script.hold(3, 0.4).ball_to(25.3, 12, 0.3).hold(12, 0.4)


def test_les_observations_survivent_a_un_aller_retour(tmp_path) -> None:
    frames = _script().frames
    path = tmp_path / "observations.jsonl"

    assert write_observations(path, frames) == len(frames)
    relues = list(read_observations(path))

    assert len(relues) == len(frames)
    assert relues[0].index == frames[0].index
    assert relues[0].time_s == pytest.approx(frames[0].time_s)
    assert relues[0].ball.x == pytest.approx(frames[0].ball.x, abs=1e-3)
    assert [p.bib for p in relues[0].players] == [3, 12]
    assert relues[0].players[0].team == "A"


def test_un_format_inconnu_est_refuse_plutot_qu_interprete(tmp_path) -> None:
    path = tmp_path / "observations.jsonl"
    path.write_text(json.dumps({"formatVersion": 999}) + "\n", encoding="utf-8")

    with pytest.raises(ValueError, match="incompatible"):
        list(read_observations(path))


def test_l_entete_porte_la_version_du_format(tmp_path) -> None:
    path = tmp_path / "observations.jsonl"
    write_observations(path, _script().frames)
    entete = json.loads(path.read_text(encoding="utf-8").splitlines()[0])

    assert entete["formatVersion"] == FORMAT_VERSION
