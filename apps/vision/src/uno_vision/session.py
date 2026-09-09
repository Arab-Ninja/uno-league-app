"""Découpage d'une session en matchs indépendants.

Une session UNO League n'est pas un match : c'est une succession de matchs de
dix minutes, et **les équipes changent à chaque fois**. Un joueur peut marquer
pour l'équipe A au premier match et défendre pour l'équipe B au troisième.

C'est pourquoi chaque match porte sa propre feuille : le lien entre un dossard
et un `playerId` peut changer d'un match à l'autre, et le lien entre un joueur
et une équipe change presque toujours. Analyser la session d'un bloc mêlerait
ces trois matchs et attribuerait des buts à des équipes qui n'existaient plus.

Les frontières entre matchs sont saisies, pas devinées. Rien dans l'image ne
les signale de façon fiable — le tableau du centre continue souvent de compter
sans se remettre à zéro — et l'application connaît déjà l'enchaînement.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .roster import Roster
from .scene import FrameObservation


@dataclass(frozen=True, slots=True)
class MatchWindow:
    """Un match dans la vidéo de session : ses bornes et sa feuille."""

    match_order: int
    start_s: float
    end_s: float
    roster: Roster

    def __post_init__(self) -> None:
        if self.end_s <= self.start_s:
            raise ValueError(
                f"match {self.match_order} : la fin ({self.end_s} s) doit suivre "
                f"le début ({self.start_s} s)"
            )
        if self.start_s < 0:
            raise ValueError(f"match {self.match_order} : début négatif")

    @property
    def duration_s(self) -> float:
        return self.end_s - self.start_s

    def contains(self, time_s: float) -> bool:
        return self.start_s <= time_s < self.end_s


@dataclass(slots=True)
class SessionPlan:
    """L'enchaînement des matchs d'une session, tel que l'arbitre le déclare."""

    windows: tuple[MatchWindow, ...] = ()
    proposal_id: int | None = None
    video: str = ""

    def __post_init__(self) -> None:
        ordered = sorted(self.windows, key=lambda w: w.start_s)
        for previous, following in zip(ordered, ordered[1:], strict=False):
            if following.start_s < previous.end_s:
                raise ValueError(
                    f"les matchs {previous.match_order} et {following.match_order} "
                    "se chevauchent : un instant de la vidéo ne peut appartenir "
                    "qu'à un seul match"
                )
        orders = [w.match_order for w in self.windows]
        if len(set(orders)) != len(orders):
            raise ValueError("deux matchs portent le même numéro d'ordre")
        self.windows = tuple(ordered)

    def match_at(self, time_s: float) -> MatchWindow | None:
        for window in self.windows:
            if window.contains(time_s):
                return window
        return None

    def frames_of(
        self, frames: Sequence[FrameObservation], window: MatchWindow
    ) -> list[FrameObservation]:
        """Observations d'un seul match.

        Le filtrage est ce qui rend les matchs réellement indépendants : une
        possession ne peut pas enjamber la frontière, donc aucun but ne peut
        être attribué au vainqueur du match précédent.
        """
        return [frame for frame in frames if window.contains(frame.time_s)]

    def to_dict(self) -> dict[str, Any]:
        return {
            "proposalId": self.proposal_id,
            "video": self.video,
            "matches": [
                {
                    "matchOrder": window.match_order,
                    "startS": window.start_s,
                    "endS": window.end_s,
                    **window.roster.to_dict(),
                }
                for window in self.windows
            ],
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "SessionPlan":
        windows: list[MatchWindow] = []
        for item in payload.get("matches", []):
            roster = Roster.from_dict(item)
            windows.append(
                MatchWindow(
                    match_order=int(item.get("matchOrder", len(windows) + 1)),
                    start_s=float(item["startS"]),
                    end_s=float(item["endS"]),
                    roster=roster,
                )
            )
        return cls(
            windows=tuple(windows),
            proposal_id=payload.get("proposalId"),
            video=payload.get("video", ""),
        )

    @classmethod
    def load(cls, path: str | Path) -> "SessionPlan":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))

    def save(self, path: str | Path) -> None:
        Path(path).write_text(
            json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


def blank_plan(match_count: int, minutes: float = 10.0, team_size: int = 5) -> SessionPlan:
    """Trame de session à compléter : des matchs consécutifs de même durée."""
    windows = []
    for order in range(1, match_count + 1):
        start = (order - 1) * minutes * 60.0
        windows.append(
            MatchWindow(
                match_order=order,
                start_s=start,
                end_s=start + minutes * 60.0,
                roster=Roster.from_dict(
                    {
                        "matchOrder": order,
                        "players": [
                            {
                                "bib": number,
                                "playerId": 0,
                                "displayName": "",
                                "team": "A" if number <= team_size else "B",
                                "goalkeeper": number in (1, team_size + 1),
                            }
                            for number in range(1, team_size * 2 + 1)
                        ],
                    }
                ),
            )
        )
    return SessionPlan(windows=tuple(windows))
