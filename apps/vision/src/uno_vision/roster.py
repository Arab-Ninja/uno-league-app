"""Feuille de match : qui porte quel dossard, dans quelle équipe.

C'est le pont entre ce que voit la caméra — un dossard numéroté — et ce que
connaît l'application — un `playerId`. Sans lui, l'analyse produit des
statistiques anonymes, inutilisables pour le classement.

L'association se fait **une fois par match**, au coup d'envoi, dans l'écran de
calibration : l'arbitre distribue les chasubles et coche qui porte quoi. Tout le
reste est automatique.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .scene import TEAM_A, TEAM_B, TEAMS


@dataclass(frozen=True, slots=True)
class RosterEntry:
    bib: int
    player_id: int
    display_name: str
    team: str
    goalkeeper: bool = False

    def __post_init__(self) -> None:
        if self.team not in TEAMS:
            raise ValueError(f"équipe inconnue pour le dossard {self.bib} : {self.team!r}")
        if self.bib <= 0:
            raise ValueError("un numéro de dossard est un entier strictement positif")


@dataclass(frozen=True, slots=True)
class TeamInfo:
    """Une équipe telle qu'elle existe côté application, plus sa couleur du jour."""

    team_id: int | None = None
    name: str = ""
    bib_color: tuple[int, int, int] | None = None
    """Couleur RVB moyenne des chasubles, mesurée ou saisie à la calibration."""


@dataclass(slots=True)
class Roster:
    entries: tuple[RosterEntry, ...] = ()
    teams: dict[str, TeamInfo] = field(default_factory=dict)
    proposal_id: int | None = None
    match_order: int = 1

    def __post_init__(self) -> None:
        seen: set[int] = set()
        for entry in self.entries:
            if entry.bib in seen:
                raise ValueError(
                    f"dossard {entry.bib} attribué deux fois : l'analyse ne pourrait "
                    "pas distinguer les deux joueurs"
                )
            seen.add(entry.bib)
        for team in TEAMS:
            keepers = [e for e in self.entries if e.team == team and e.goalkeeper]
            if len(keepers) > 1:
                raise ValueError(f"l'équipe {team} déclare {len(keepers)} gardiens")
        self.teams = {team: self.teams.get(team, TeamInfo()) for team in TEAMS}

    def by_bib(self, bib: int | None) -> RosterEntry | None:
        if bib is None:
            return None
        for entry in self.entries:
            if entry.bib == bib:
                return entry
        return None

    def team_of(self, bib: int | None) -> str | None:
        entry = self.by_bib(bib)
        return entry.team if entry else None

    def is_goalkeeper(self, bib: int | None) -> bool:
        entry = self.by_bib(bib)
        return bool(entry and entry.goalkeeper)

    def bibs_of_team(self, team: str) -> tuple[int, ...]:
        return tuple(entry.bib for entry in self.entries if entry.team == team)

    def team_id(self, team: str) -> int | None:
        return self.teams.get(team, TeamInfo()).team_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "proposalId": self.proposal_id,
            "matchOrder": self.match_order,
            "teams": {
                team: {
                    "id": info.team_id,
                    "name": info.name,
                    "bibColor": list(info.bib_color) if info.bib_color else None,
                }
                for team, info in self.teams.items()
            },
            "players": [
                {
                    "bib": entry.bib,
                    "playerId": entry.player_id,
                    "displayName": entry.display_name,
                    "team": entry.team,
                    "goalkeeper": entry.goalkeeper,
                }
                for entry in self.entries
            ],
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "Roster":
        teams: dict[str, TeamInfo] = {}
        for team in (TEAM_A, TEAM_B):
            raw = payload.get("teams", {}).get(team, {}) or {}
            color = raw.get("bibColor")
            if color is not None and len(color) != 3:
                raise ValueError(
                    f"bibColor de l'équipe {team} : trois composantes RVB attendues"
                )
            teams[team] = TeamInfo(
                team_id=raw.get("id"),
                name=raw.get("name", ""),
                bib_color=(int(color[0]), int(color[1]), int(color[2]))
                if color
                else None,
            )
        entries = tuple(
            RosterEntry(
                bib=int(item["bib"]),
                player_id=int(item["playerId"]),
                display_name=str(item.get("displayName", "")),
                team=str(item["team"]),
                goalkeeper=bool(item.get("goalkeeper", False)),
            )
            for item in payload.get("players", [])
        )
        return cls(
            entries=entries,
            teams=teams,
            proposal_id=payload.get("proposalId"),
            match_order=int(payload.get("matchOrder", 1)),
        )

    @classmethod
    def load(cls, path: str | Path) -> "Roster":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))

    def save(self, path: str | Path) -> None:
        Path(path).write_text(
            json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
