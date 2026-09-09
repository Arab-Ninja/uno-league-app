"""Orchestration : des observations au rapport, sans toucher à la vidéo.

Ce module est la façade de la moitié « raisonnement » du système. Il ne sait ni
décoder une vidéo ni faire tourner un réseau de neurones : il prend des
observations — venues d'une analyse fraîche ou d'un cache JSONL — et rend un
rapport. C'est ce découpage qui permet de rejouer un match entier en une
seconde après avoir modifié une règle.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from .aggregate import MatchSheet, aggregate_events
from .calibration import Calibration
from .config import AnalysisConfig
from .events import AnalysisResult, detect_events
from .report import VideoInfo, build_report
from .roster import Roster
from .sanity import calibration_warnings
from .scene import FrameObservation
from .session import MatchWindow, SessionPlan


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
    # Une échelle fausse ne fait rien planter : elle produit des chiffres
    # d'allure normale, tous faux. Le contrôle passe donc avant le rapport.
    result.warnings.extend(calibration_warnings(frames))
    sheet = aggregate_events(
        result.events, roster, review_threshold=config.review_confidence_threshold
    )
    video = video or VideoInfo(frame_count=len(frames))
    report = build_report(result, sheet, roster, config, video, clips)
    return Analysis(result=result, sheet=sheet, report=report)


@dataclass(slots=True)
class SessionAnalysis:
    """Une session : autant de rapports que de matchs, plus un sommaire."""

    matches: list[tuple[MatchWindow, Analysis]] = field(default_factory=list)
    report: dict[str, Any] = field(default_factory=dict)

    def analysis_of(self, match_order: int) -> Analysis | None:
        for window, analysis in self.matches:
            if window.match_order == match_order:
                return analysis
        return None


def analyse_session(
    frames: Sequence[FrameObservation],
    calibration: Calibration,
    plan: SessionPlan,
    config: AnalysisConfig | None = None,
    video: VideoInfo | None = None,
) -> SessionAnalysis:
    """Analyse chaque match de la session séparément.

    L'isolement n'est pas une commodité de présentation. En UNO League les
    équipes sont retirées au sort à chaque match : le même joueur défend pour
    l'équipe A à 10 h et attaque pour l'équipe B à 10 h 20. Analyser la session
    d'un bloc mêlerait ces compositions et attribuerait des buts à des équipes
    qui n'existaient plus. Chaque match reçoit donc sa feuille, ses possessions
    et son rapport, et aucune action ne peut enjamber une frontière.
    """
    config = config or AnalysisConfig()
    session = SessionAnalysis()

    for window in plan.windows:
        window_frames = plan.frames_of(frames, window)
        window_video = VideoInfo(
            path=video.path if video else "",
            fps=video.fps if video else 0.0,
            frame_count=len(window_frames),
            width=video.width if video else 0,
            height=video.height if video else 0,
        )
        analysis = analyse_observations(
            window_frames, calibration, window.roster, config, video=window_video
        )
        session.matches.append((window, analysis))

    session.report = {
        "schemaVersion": SESSION_SCHEMA_VERSION,
        "proposalId": plan.proposal_id,
        "video": plan.video or (video.path if video else ""),
        "matches": [
            {
                "matchOrder": window.match_order,
                "startMs": round(window.start_s * 1000),
                "endMs": round(window.end_s * 1000),
                **analysis.report,
            }
            for window, analysis in session.matches
        ],
    }
    return session


SESSION_SCHEMA_VERSION = 1
