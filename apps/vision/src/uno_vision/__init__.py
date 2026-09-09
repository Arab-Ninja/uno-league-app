"""Analyse vidéo des sessions UNO League.

Le paquet est coupé en deux moitiés qui ne partagent aucune dépendance :

* le **raisonnement** — `geometry`, `calibration`, `possession`, `events`,
  `aggregate`, `report` — en Python pur, testé et exécutable partout ;
* la **perception** — `uno_vision.video` — qui décode, détecte et lit les
  dossards, et qui seule réclame OpenCV, Ultralytics et un GPU.

Elles communiquent par `FrameObservation` : qui est où, et où est le ballon.
"""

from .aggregate import MatchSheet, StatLine, aggregate_events
from .calibration import Calibration, FieldDimensions
from .config import AnalysisConfig
from .events import AnalysisResult, MatchEvent, detect_events
from .pipeline import Analysis, analyse_observations
from .roster import Roster, RosterEntry
from .scene import BBox, FrameObservation, PlayerObservation, Point

__all__ = [
    "AnalysisConfig",
    "AnalysisResult",
    "Analysis",
    "BBox",
    "Calibration",
    "FieldDimensions",
    "FrameObservation",
    "MatchEvent",
    "MatchSheet",
    "PlayerObservation",
    "Point",
    "Roster",
    "RosterEntry",
    "StatLine",
    "aggregate_events",
    "analyse_observations",
    "detect_events",
]
