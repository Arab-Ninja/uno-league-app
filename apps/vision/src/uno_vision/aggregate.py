"""Des événements à la feuille de match.

La sortie de ce module a exactement la forme de la table `match_stats` de
l'API : une ligne par joueur et par match, avec `goals`, `assists`, `defenses`
et `saves`. C'est volontaire — la vision n'invente pas un modèle de données
parallèle, elle remplit celui qui existe déjà. Le barème du classement
(`packages/shared/src/ranking.ts`) reste la seule autorité sur ce que valent ces
quatre nombres ; ici on les compte, on ne les pondère pas.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from .events import ASSIST, DEFENSE, GOAL, OWN_GOAL, SAVE, MatchEvent
from .roster import Roster
from .scene import TEAM_A, TEAM_B


@dataclass(slots=True)
class StatLine:
    """Une ligne de `match_stats`."""

    bib: int | None
    player_id: int | None
    display_name: str
    team: str
    goals: int = 0
    assists: int = 0
    defenses: int = 0
    saves: int = 0

    @property
    def total_events(self) -> int:
        return self.goals + self.assists + self.defenses + self.saves


@dataclass(slots=True)
class MatchSheet:
    score_a: int = 0
    score_b: int = 0
    lines: list[StatLine] = field(default_factory=list)
    unassigned: list[MatchEvent] = field(default_factory=list)
    """Événements vus mais non attribués : l'arbitre désigne le joueur."""
    own_goals: list[MatchEvent] = field(default_factory=list)
    """Buts contre son camp : ils comptent au score, à personne au compteur."""
    to_review: list[MatchEvent] = field(default_factory=list)
    """Événements attribués mais peu sûrs : l'arbitre confirme ou corrige."""

    def line_of(self, bib: int) -> StatLine | None:
        for line in self.lines:
            if line.bib == bib:
                return line
        return None

    def score_of(self, team: str) -> int:
        return self.score_a if team == TEAM_A else self.score_b


_CREDITS = {
    GOAL: "goals",
    ASSIST: "assists",
    DEFENSE: "defenses",
    SAVE: "saves",
}


def aggregate_events(
    events: Sequence[MatchEvent],
    roster: Roster,
    review_threshold: float = 0.75,
) -> MatchSheet:
    """Compte les événements par joueur et reconstitue le score.

    Deux subtilités méritent d'être explicites :

    * un but contre son camp compte au score de l'adversaire et **n'est crédité
      à personne** — le porter au compteur du malheureux serait une faute, et
      l'offrir à un attaquant qui n'a rien fait aussi ;
    * un événement dont le dossard n'a pas été lu n'est pas perdu : il part dans
      `unassigned`, où l'arbitre le rattache d'un geste. Le jeter reviendrait à
      fausser silencieusement le classement.
    """
    sheet = MatchSheet()
    sheet.lines = [
        StatLine(
            bib=entry.bib,
            player_id=entry.player_id,
            display_name=entry.display_name,
            team=entry.team,
        )
        for entry in roster.entries
    ]

    for event in events:
        if event.kind in (GOAL, OWN_GOAL) and event.scoring_team is not None:
            if event.scoring_team == TEAM_A:
                sheet.score_a += 1
            elif event.scoring_team == TEAM_B:
                sheet.score_b += 1

        if event.kind == OWN_GOAL:
            sheet.own_goals.append(event)
            continue

        attribute = _CREDITS.get(event.kind)
        if attribute is None:
            continue

        line = sheet.line_of(event.bib) if event.bib is not None else None
        if line is None:
            sheet.unassigned.append(event)
            continue

        setattr(line, attribute, getattr(line, attribute) + 1)
        if event.confidence < review_threshold:
            sheet.to_review.append(event)

    return sheet


def sheet_totals(sheet: MatchSheet) -> dict[str, int]:
    """Totaux tous joueurs confondus, utiles pour un contrôle de cohérence."""
    return {
        "goals": sum(line.goals for line in sheet.lines),
        "assists": sum(line.assists for line in sheet.lines),
        "defenses": sum(line.defenses for line in sheet.lines),
        "saves": sum(line.saves for line in sheet.lines),
    }


def consistency_warnings(sheet: MatchSheet) -> list[str]:
    """Contrôles de bon sens, à afficher à l'arbitre avant validation."""
    warnings: list[str] = []
    totals = sheet_totals(sheet)
    attributed = totals["goals"]
    scored = sheet.score_a + sheet.score_b
    if attributed + len(sheet.own_goals) < scored:
        warnings.append(
            f"{scored} but(s) au score mais {attributed} attribué(s) à un joueur : "
            "des buteurs restent à désigner."
        )
    if totals["assists"] > attributed:
        warnings.append(
            "Plus de passes décisives que de buts : une passe a été comptée en trop."
        )
    if sheet.unassigned:
        warnings.append(
            f"{len(sheet.unassigned)} événement(s) sans joueur identifié."
        )
    return warnings
