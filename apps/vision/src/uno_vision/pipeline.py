"""Orchestration : des observations au rapport, sans toucher à la vidéo.

Ce module est la façade de la moitié « raisonnement » du système. Il ne sait ni
décoder une vidéo ni faire tourner un réseau de neurones : il prend des
observations — venues d'une analyse fraîche ou d'un cache JSONL — et rend un
rapport. C'est ce découpage qui permet de rejouer un match entier en une
seconde après avoir modifié une règle.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from .aggregate import MatchSheet, aggregate_events
from .calibration import Calibration
from .config import AnalysisConfig
from .events import AnalysisResult, detect_events
from .report import VideoInfo, build_report
from .roster import Roster
from .scene import FrameObservation


@dataclass(slots=True)
class Analysis:
    result: AnalysisResult
    sheet: MatchSheet
    report: dict[str, Any]


def analyse_observations(
    frames: Sequence[FrameObservation],
    calibration: Calibration,
    roster: Roster,
    config: AnalysisConfig | None = None,
    video: VideoInfo | None = None,
    clips: dict[str, str] | None = None,
) -> Analysis:
    config = config or AnalysisConfig()
    result = detect_events(frames, calibration, config, roster)
    sheet = aggregate_events(
        result.events, roster, review_threshold=config.review_confidence_threshold
    )
    video = video or VideoInfo(frame_count=len(frames))
    report = build_report(result, sheet, roster, config, video, clips)
    return Analysis(result=result, sheet=sheet, report=report)
