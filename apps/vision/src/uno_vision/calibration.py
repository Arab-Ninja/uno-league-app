"""Calibration d'une salle : où est le terrain dans l'image, où sont les buts.

Avec une caméra fixe, la calibration se fait **une seule fois par salle**. On
clique les repères du terrain sur une image, on obtient l'homographie, et elle
reste valable pour toutes les sessions filmées depuis ce trépied. C'est ce qui
rend l'ensemble du système viable : plus aucune estimation de mouvement de
caméra, donc plus aucune dérive.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .geometry import Homography, homography_from_points, point_in_polygon
from .lens import LensDistortion
from .scene import TEAM_A, Point

LEFT = "left"
RIGHT = "right"


@dataclass(frozen=True, slots=True)
class FieldDimensions:
    """Dimensions réelles de l'aire de jeu, en mètres.

    Les valeurs par défaut sont celles du futsal officiel, mais une salle
    municipale fait rarement 40 × 20 : ces nombres se mesurent au décamètre et
    se saisissent dans le fichier de calibration. Une largeur fausse de deux
    mètres déplace toutes les distances, donc tous les seuils de possession.
    """

    length_m: float = 40.0
    width_m: float = 20.0
    goal_width_m: float = 3.0
    goal_depth_m: float = 1.0
    """Profondeur du filet — la zone derrière la ligne où un but est acquis."""
    goal_area_depth_m: float = 6.0
    """Profondeur de la surface de but, qui délimite la zone du gardien."""

    def __post_init__(self) -> None:
        if min(self.length_m, self.width_m, self.goal_width_m) <= 0:
            raise ValueError("les dimensions du terrain doivent être positives")
        if self.goal_width_m >= self.width_m:
            raise ValueError("le but ne peut pas être plus large que le terrain")

    @property
    def center(self) -> Point:
        return Point(self.length_m / 2.0, self.width_m / 2.0)

    @property
    def corners(self) -> tuple[Point, Point, Point, Point]:
        """Coins du terrain, dans l'ordre attendu par la calibration.

        Convention : on part du coin le plus à gauche du but gauche et on tourne
        dans le sens des aiguilles d'une montre vu de la caméra.
        """
        return (
            Point(0.0, 0.0),
            Point(self.length_m, 0.0),
            Point(self.length_m, self.width_m),
            Point(0.0, self.width_m),
        )


@dataclass(frozen=True, slots=True)
class Goal:
    """Un but : sa ligne, sa cage, et la zone du gardien devant."""

    side: str
    line_x: float
    mouth_min_y: float
    mouth_max_y: float
    depth_m: float
    area_depth_m: float

    @property
    def center(self) -> Point:
        return Point(self.line_x, (self.mouth_min_y + self.mouth_max_y) / 2.0)

    @property
    def left_post(self) -> Point:
        return Point(self.line_x, self.mouth_min_y)

    @property
    def right_post(self) -> Point:
        return Point(self.line_x, self.mouth_max_y)

    @property
    def inward(self) -> float:
        """Signe de la direction terrain : +1 pour le but gauche, -1 pour l'autre."""
        return 1.0 if self.side == LEFT else -1.0

    def contains(self, point: Point, crossing_margin_m: float, mouth_tolerance_m: float) -> bool:
        """Le ballon a-t-il franchi la ligne, entre les poteaux ?

        `crossing_margin_m` exige un franchissement net plutôt qu'un ballon posé
        sur la ligne, et `mouth_tolerance_m` absorbe l'erreur d'homographie sur
        la largeur. Ils ne servent pas la même prudence : le premier évite les
        faux buts, le second évite de rater un but rentré près du poteau.
        """
        if self.side == LEFT:
            if not (-self.depth_m <= point.x <= -crossing_margin_m):
                return False
        else:
            if not (self.line_x + crossing_margin_m <= point.x <= self.line_x + self.depth_m):
                return False
        return (
            self.mouth_min_y - mouth_tolerance_m
            <= point.y
            <= self.mouth_max_y + mouth_tolerance_m
        )

    def in_goal_area(self, point: Point) -> bool:
        """Point situé dans la surface de but — le domaine du gardien."""
        if self.side == LEFT:
            in_depth = 0.0 <= point.x <= self.area_depth_m
        else:
            in_depth = self.line_x - self.area_depth_m <= point.x <= self.line_x
        margin = self.area_depth_m
        return in_depth and (
            self.mouth_min_y - margin <= point.y <= self.mouth_max_y + margin
        )

    def distance_from(self, point: Point) -> float:
        return point.distance_to(self.center)


@dataclass(slots=True)
class Calibration:
    """Tout ce qui relie l'image au terrain pour une salle donnée."""

    field: FieldDimensions = field(default_factory=FieldDimensions)
    image_points: tuple[Point, ...] = ()
    field_points: tuple[Point, ...] = ()
    team_a_defends: str = LEFT
    side_switch_times_s: tuple[float, ...] = ()
    """Instants où les équipes changent de côté (mi-temps). Vide si jamais."""
    venue: str = ""
    lens: LensDistortion | None = None
    """Distorsion de l'objectif, à corriger avant toute projection.

    Les caméras de salle sont des grands-angles très déformants. Sans cette
    correction, l'homographie travaille sur des points courbés et les distances
    deviennent fausses là où l'image l'est le plus — sur les bords, c'est-à-dire
    devant les buts.
    """
    _homography: Homography | None = None

    def __post_init__(self) -> None:
        if self.team_a_defends not in (LEFT, RIGHT):
            raise ValueError("team_a_defends vaut 'left' ou 'right'")
        if self.image_points and not self.field_points:
            if len(self.image_points) != 4:
                raise ValueError(
                    "sans field_points explicites, il faut exactement 4 coins image"
                )
            self.field_points = self.field.corners
        if len(self.image_points) != len(self.field_points):
            raise ValueError("autant de points image que de points terrain")

    @property
    def homography(self) -> Homography:
        """Homographie image redressée → terrain, calculée à la demande.

        Elle est ajustée sur les repères **après** correction de l'objectif :
        mélanger les deux corrections donnerait une homographie qui compense
        tant bien que mal la courbure au centre de l'image et se trompe
        lourdement sur les bords.
        """
        if self._homography is None:
            if not self.image_points:
                raise ValueError("calibration incomplète : aucun repère saisi")
            self._homography = homography_from_points(
                tuple(self.rectify(point) for point in self.image_points),
                self.field_points,
            )
        return self._homography

    def rectify(self, image_point: Point) -> Point:
        """Point de l'image, débarrassé de la distorsion de l'objectif."""
        return self.lens.undistort(image_point) if self.lens else image_point

    def to_field(self, image_point: Point) -> Point:
        return self.homography.apply(self.rectify(image_point))

    def to_image(self, field_point: Point) -> Point:
        rectified = self.homography.inverse().apply(field_point)
        return self.lens.distort(rectified) if self.lens else rectified

    @property
    def goals(self) -> dict[str, Goal]:
        half = self.field.goal_width_m / 2.0
        mouth_min = self.field.width_m / 2.0 - half
        mouth_max = self.field.width_m / 2.0 + half
        return {
            LEFT: Goal(
                LEFT, 0.0, mouth_min, mouth_max, self.field.goal_depth_m,
                self.field.goal_area_depth_m,
            ),
            RIGHT: Goal(
                RIGHT, self.field.length_m, mouth_min, mouth_max,
                self.field.goal_depth_m, self.field.goal_area_depth_m,
            ),
        }

    def side_defended_by(self, team: str, time_s: float) -> str:
        """Côté défendu par une équipe à un instant donné.

        Chaque changement de côté inverse la donne ; on compte les bascules
        antérieures à l'instant demandé.
        """
        switches = sum(1 for moment in self.side_switch_times_s if moment <= time_s)
        base = self.team_a_defends if team == TEAM_A else (
            RIGHT if self.team_a_defends == LEFT else LEFT
        )
        if switches % 2 == 0:
            return base
        return RIGHT if base == LEFT else LEFT

    def defended_goal(self, team: str, time_s: float) -> Goal:
        return self.goals[self.side_defended_by(team, time_s)]

    def attacked_goal(self, team: str, time_s: float) -> Goal:
        side = self.side_defended_by(team, time_s)
        return self.goals[RIGHT if side == LEFT else LEFT]

    def is_in_bounds(self, point: Point, margin_m: float = 0.0) -> bool:
        return (
            -margin_m <= point.x <= self.field.length_m + margin_m
            and -margin_m <= point.y <= self.field.width_m + margin_m
        )

    def is_in_defensive_third(self, team: str, point: Point, time_s: float) -> bool:
        """Le point est-il dans le tiers défensif de l'équipe ?

        C'est le critère qui distingue une récupération anodine au milieu — que
        personne ne considérerait comme une action défensive — d'un tacle
        devant sa propre cage.
        """
        goal = self.defended_goal(team, time_s)
        third = self.field.length_m / 3.0
        if goal.side == LEFT:
            return point.x <= third
        return point.x >= self.field.length_m - third

    def field_polygon(self, margin_m: float = 0.0) -> tuple[Point, ...]:
        return (
            Point(-margin_m, -margin_m),
            Point(self.field.length_m + margin_m, -margin_m),
            Point(self.field.length_m + margin_m, self.field.width_m + margin_m),
            Point(-margin_m, self.field.width_m + margin_m),
        )

    def contains(self, point: Point, margin_m: float = 0.0) -> bool:
        return point_in_polygon(point, self.field_polygon(margin_m))

    # -- Sérialisation ------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        return {
            "venue": self.venue,
            "field": {
                "lengthM": self.field.length_m,
                "widthM": self.field.width_m,
                "goalWidthM": self.field.goal_width_m,
                "goalDepthM": self.field.goal_depth_m,
                "goalAreaDepthM": self.field.goal_area_depth_m,
            },
            "imagePoints": [list(p.as_tuple()) for p in self.image_points],
            "fieldPoints": [list(p.as_tuple()) for p in self.field_points],
            "teamADefends": self.team_a_defends,
            "sideSwitchTimesS": list(self.side_switch_times_s),
            "lens": self.lens.to_dict() if self.lens else None,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "Calibration":
        raw_field = payload.get("field", {})
        dimensions = FieldDimensions(
            length_m=float(raw_field.get("lengthM", 40.0)),
            width_m=float(raw_field.get("widthM", 20.0)),
            goal_width_m=float(raw_field.get("goalWidthM", 3.0)),
            goal_depth_m=float(raw_field.get("goalDepthM", 1.0)),
            goal_area_depth_m=float(raw_field.get("goalAreaDepthM", 6.0)),
        )
        image_points = tuple(
            Point(float(p[0]), float(p[1])) for p in payload.get("imagePoints", [])
        )
        field_points = tuple(
            Point(float(p[0]), float(p[1])) for p in payload.get("fieldPoints", [])
        )
        return cls(
            field=dimensions,
            image_points=image_points,
            field_points=field_points,
            team_a_defends=payload.get("teamADefends", LEFT),
            side_switch_times_s=tuple(
                float(t) for t in payload.get("sideSwitchTimesS", [])
            ),
            venue=payload.get("venue", ""),
            lens=(
                LensDistortion.from_dict(payload["lens"])
                if payload.get("lens")
                else None
            ),
        )

    @classmethod
    def load(cls, path: str | Path) -> "Calibration":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))

    def save(self, path: str | Path) -> None:
        Path(path).write_text(
            json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
