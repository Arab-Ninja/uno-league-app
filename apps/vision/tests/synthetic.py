"""Fabrique de matchs synthétiques.

Écrire un test d'analyse vidéo sans vidéo demande de fabriquer la sortie de la
perception : des positions de joueurs et de ballon, image par image. C'est ce que
fait ce module, et c'est ce qui permet de tester la *règle* — un but, une passe
décisive, un arrêt — indépendamment de la qualité du détecteur.

Un scénario s'écrit comme on raconterait l'action :

    script.hold(9, 1.0)          # le 9 tient le ballon une seconde
    script.ball_to(41, 10, 0.5)  # il frappe, le ballon finit au fond
"""

from __future__ import annotations

from dataclasses import dataclass, field

from uno_vision.calibration import Calibration, FieldDimensions
from uno_vision.roster import Roster, RosterEntry, TeamInfo
from uno_vision.scene import BBox, FrameObservation, PlayerObservation, Point

FIELD = FieldDimensions(length_m=40.0, width_m=20.0, goal_width_m=3.0)


def make_calibration(team_a_defends: str = "left") -> Calibration:
    """Calibration d'un terrain fictif, image et terrain à l'échelle 10 px/m.

    Une homographie affine suffit ici : ce sont les règles de jeu qu'on teste,
    pas la projection perspective, qui a ses propres tests.
    """
    return Calibration(
        field=FIELD,
        image_points=(
            Point(0.0, 0.0),
            Point(400.0, 0.0),
            Point(400.0, 200.0),
            Point(0.0, 200.0),
        ),
        team_a_defends=team_a_defends,
        venue="Salle de test",
    )


def make_roster(goalkeepers: tuple[int, int] = (1, 11)) -> Roster:
    """Deux équipes de cinq, dossards 1 à 5 pour A et 11 à 15 pour B."""
    entries = []
    for index, bib in enumerate(range(1, 6)):
        entries.append(
            RosterEntry(
                bib=bib,
                player_id=100 + index,
                display_name=f"Joueur A{bib}",
                team="A",
                goalkeeper=bib == goalkeepers[0],
            )
        )
    for index, bib in enumerate(range(11, 16)):
        entries.append(
            RosterEntry(
                bib=bib,
                player_id=200 + index,
                display_name=f"Joueur B{bib}",
                team="B",
                goalkeeper=bib == goalkeepers[1],
            )
        )
    return Roster(
        entries=tuple(entries),
        teams={
            "A": TeamInfo(team_id=7, name="Rouges", bib_color=(200, 40, 40)),
            "B": TeamInfo(team_id=8, name="Bleus", bib_color=(40, 60, 200)),
        },
        proposal_id=42,
        match_order=1,
    )


@dataclass
class Actor:
    bib: int
    team: str
    position: Point
    track_id: int


@dataclass
class MatchScript:
    """Construit une suite d'images à partir d'actions de jeu."""

    fps: float = 25.0
    actors: dict[int, Actor] = field(default_factory=dict)
    frames: list[FrameObservation] = field(default_factory=list)
    ball: Point = field(default_factory=lambda: Point(20.0, 10.0))
    _index: int = 0

    def add(self, bib: int, team: str, x: float, y: float) -> "MatchScript":
        self.actors[bib] = Actor(bib, team, Point(x, y), track_id=bib)
        return self

    def place(self, bib: int, x: float, y: float) -> "MatchScript":
        self.actors[bib].position = Point(x, y)
        return self

    def hold(self, bib: int, seconds: float, offset: float = 0.3) -> "MatchScript":
        """Le joueur garde le ballon à ses pieds."""
        actor = self.actors[bib]
        self.ball = Point(actor.position.x + offset, actor.position.y)
        self._emit(seconds, self.ball, self.ball)
        return self

    def ball_to(self, x: float, y: float, seconds: float) -> "MatchScript":
        """Le ballon voyage en ligne droite jusqu'au point visé."""
        start = self.ball
        target = Point(x, y)
        self._emit(seconds, start, target)
        self.ball = target
        return self

    def wait(self, seconds: float) -> "MatchScript":
        """Le jeu continue, ballon immobile là où il est."""
        self._emit(seconds, self.ball, self.ball)
        return self

    def _emit(self, seconds: float, start: Point, end: Point) -> None:
        count = max(1, round(seconds * self.fps))
        for step in range(count):
            ratio = (step + 1) / count
            ball = Point(
                start.x + (end.x - start.x) * ratio,
                start.y + (end.y - start.y) * ratio,
            )
            self.frames.append(
                FrameObservation(
                    index=self._index,
                    time_s=self._index / self.fps,
                    players=tuple(
                        PlayerObservation(
                            track_id=actor.track_id,
                            position=actor.position,
                            bbox=_bbox_for(actor.position),
                            team=actor.team,
                            bib=actor.bib,
                        )
                        for actor in self.actors.values()
                    ),
                    ball=ball,
                )
            )
            self._index += 1


def _bbox_for(position: Point) -> BBox:
    """Boîte plausible : 10 px/m, un joueur d'environ 1,8 m."""
    x = position.x * 10.0
    y = position.y * 10.0
    return BBox(x - 5.0, y - 18.0, x + 5.0, y)
