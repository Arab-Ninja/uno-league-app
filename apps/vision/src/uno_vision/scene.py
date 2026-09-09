"""La scène observée : géométrie de base, joueurs, ballon.

Deux repères coexistent et ne doivent jamais être confondus :

* le repère **image**, en pixels, origine en haut à gauche — c'est celui des
  détections, des boîtes et des extraits vidéo ;
* le repère **terrain**, en mètres, origine au coin du terrain, `x` dans le sens
  de la longueur et `y` dans celui de la largeur — c'est celui où se décide
  toute la logique de jeu (distances, tirs, zones, buts).

Le passage de l'un à l'autre est le rôle exclusif de `geometry.Homography`. Une
règle de jeu qui raisonnerait en pixels serait fausse : deux joueurs à la même
distance du ballon n'occupent pas le même nombre de pixels selon qu'ils sont au
premier plan ou au fond de la salle.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

TEAM_A = "A"
TEAM_B = "B"
TEAMS = (TEAM_A, TEAM_B)


def other_team(team: str) -> str:
    """Équipe adverse. Lève si l'étiquette n'est pas une équipe connue."""
    if team == TEAM_A:
        return TEAM_B
    if team == TEAM_B:
        return TEAM_A
    raise ValueError(f"équipe inconnue : {team!r}")


@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float

    def __add__(self, other: "Point") -> "Point":
        return Point(self.x + other.x, self.y + other.y)

    def __sub__(self, other: "Point") -> "Point":
        return Point(self.x - other.x, self.y - other.y)

    def scaled(self, factor: float) -> "Point":
        return Point(self.x * factor, self.y * factor)

    def norm(self) -> float:
        return math.hypot(self.x, self.y)

    def distance_to(self, other: "Point") -> float:
        return math.hypot(self.x - other.x, self.y - other.y)

    def normalized(self) -> "Point":
        length = self.norm()
        if length == 0.0:
            return Point(0.0, 0.0)
        return Point(self.x / length, self.y / length)

    def dot(self, other: "Point") -> float:
        return self.x * other.x + self.y * other.y

    def as_tuple(self) -> tuple[float, float]:
        return (self.x, self.y)


@dataclass(frozen=True, slots=True)
class BBox:
    """Boîte englobante en pixels, coins haut-gauche et bas-droit."""

    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return max(0.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(0.0, self.y2 - self.y1)

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def center(self) -> Point:
        return Point((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)

    @property
    def ground_anchor(self) -> Point:
        """Point de contact au sol : milieu du bord inférieur.

        C'est ce point — et non le centre de la boîte — qu'il faut projeter sur
        le terrain. L'homographie transporte le plan du sol ; les pieds y sont,
        la tête non.
        """
        return Point((self.x1 + self.x2) / 2.0, self.y2)

    def iou(self, other: "BBox") -> float:
        inter_x1 = max(self.x1, other.x1)
        inter_y1 = max(self.y1, other.y1)
        inter_x2 = min(self.x2, other.x2)
        inter_y2 = min(self.y2, other.y2)
        inter = max(0.0, inter_x2 - inter_x1) * max(0.0, inter_y2 - inter_y1)
        union = self.area + other.area - inter
        if union <= 0.0:
            return 0.0
        return inter / union

    def torso(self) -> "BBox":
        """Région du buste, où se lit la couleur de chasuble et le dossard.

        Le tiers supérieur contient le visage et les cheveux, le tiers inférieur
        les jambes et le short : ni l'un ni l'autre ne renseigne sur l'équipe.
        """
        top = self.y1 + 0.20 * self.height
        bottom = self.y1 + 0.55 * self.height
        inset = 0.15 * self.width
        return BBox(self.x1 + inset, top, self.x2 - inset, bottom)

    def scaled_from_center(self, factor: float) -> "BBox":
        cx, cy = self.center.x, self.center.y
        half_w = self.width * factor / 2.0
        half_h = self.height * factor / 2.0
        return BBox(cx - half_w, cy - half_h, cx + half_w, cy + half_h)


PLAYER = "player"
BALL = "ball"


@dataclass(frozen=True, slots=True)
class Detection:
    """Une détection brute, avant tout suivi."""

    bbox: BBox
    score: float
    label: str = PLAYER


@dataclass(frozen=True, slots=True)
class PlayerObservation:
    """Un joueur, sur une image, tel que la chaîne de vision l'a compris."""

    track_id: int
    position: Point
    """Position au sol, en mètres, dans le repère terrain."""
    bbox: BBox
    team: str | None = None
    bib: int | None = None
    is_goalkeeper: bool = False


@dataclass(frozen=True, slots=True)
class FrameObservation:
    """L'état du jeu sur une image : qui est où, et où est le ballon.

    C'est la frontière entre les deux moitiés du système. Tout ce qui précède
    (décodage, détection, suivi, couleurs, dossards) produit cette structure ;
    tout ce qui suit (possession, événements, statistiques) ne connaît qu'elle.
    Une session peut donc être ré-analysée en une seconde, sans GPU, à partir
    des observations mises en cache.
    """

    index: int
    time_s: float
    players: tuple[PlayerObservation, ...] = ()
    ball: Point | None = None
    ball_bbox: BBox | None = None

    def player_by_track(self, track_id: int) -> PlayerObservation | None:
        for player in self.players:
            if player.track_id == track_id:
                return player
        return None
