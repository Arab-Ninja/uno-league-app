"""Cache des observations : la vidéo n'est décodée qu'une fois.

La partie coûteuse de la chaîne — décodage, détection, suivi, OCR — occupe un
GPU pendant plusieurs minutes. La partie qui change souvent — les règles qui
transforment des positions en buts et en arrêts — s'exécute en une fraction de
seconde. Les séparer par un fichier JSONL permet de retravailler les règles sur
des dizaines de matchs déjà analysés, sans GPU et sans réseau, et c'est aussi ce
qui rend la chaîne testable en intégration continue.

Une ligne par image, ce qui permet d'écrire au fil de l'eau : une analyse
interrompue à la 40ᵉ minute laisse 40 minutes d'observations exploitables.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from pathlib import Path

from .scene import BBox, FrameObservation, PlayerObservation, Point

FORMAT_VERSION = 1


def _bbox_to_list(bbox: BBox | None) -> list[float] | None:
    if bbox is None:
        return None
    return [round(bbox.x1, 2), round(bbox.y1, 2), round(bbox.x2, 2), round(bbox.y2, 2)]


def _bbox_from_list(raw: list[float] | None) -> BBox | None:
    if raw is None:
        return None
    return BBox(*(float(value) for value in raw))


def frame_to_dict(frame: FrameObservation) -> dict:
    return {
        "i": frame.index,
        "t": round(frame.time_s, 4),
        "ball": [round(frame.ball.x, 3), round(frame.ball.y, 3)] if frame.ball else None,
        "ballBox": _bbox_to_list(frame.ball_bbox),
        "players": [
            {
                "id": player.track_id,
                "p": [round(player.position.x, 3), round(player.position.y, 3)],
                "box": _bbox_to_list(player.bbox),
                "team": player.team,
                "bib": player.bib,
                "gk": player.is_goalkeeper,
            }
            for player in frame.players
        ],
    }


def frame_from_dict(payload: dict) -> FrameObservation:
    ball = payload.get("ball")
    return FrameObservation(
        index=int(payload["i"]),
        time_s=float(payload["t"]),
        ball=Point(float(ball[0]), float(ball[1])) if ball else None,
        ball_bbox=_bbox_from_list(payload.get("ballBox")),
        players=tuple(
            PlayerObservation(
                track_id=int(item["id"]),
                position=Point(float(item["p"][0]), float(item["p"][1])),
                bbox=_bbox_from_list(item.get("box")) or BBox(0.0, 0.0, 0.0, 0.0),
                team=item.get("team"),
                bib=item.get("bib"),
                is_goalkeeper=bool(item.get("gk", False)),
            )
            for item in payload.get("players", [])
        ),
    )


def write_observations(path: str | Path, frames: Iterable[FrameObservation]) -> int:
    """Écrit les observations au fil de l'eau. Renvoie le nombre d'images."""
    count = 0
    with Path(path).open("w", encoding="utf-8") as handle:
        handle.write(json.dumps({"formatVersion": FORMAT_VERSION}) + "\n")
        for frame in frames:
            handle.write(json.dumps(frame_to_dict(frame), ensure_ascii=False) + "\n")
            count += 1
    return count


def read_observations(path: str | Path) -> Iterator[FrameObservation]:
    with Path(path).open("r", encoding="utf-8") as handle:
        header = json.loads(handle.readline() or "{}")
        version = header.get("formatVersion")
        if version != FORMAT_VERSION:
            raise ValueError(
                f"format d'observations {version!r} incompatible "
                f"(attendu {FORMAT_VERSION})"
            )
        for line in handle:
            line = line.strip()
            if line:
                yield frame_from_dict(json.loads(line))
