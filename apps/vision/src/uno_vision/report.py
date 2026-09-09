"""Rapport d'analyse : le document que lit l'arbitre, et que consommera l'API.

Le schéma est versionné. Le jour où une règle change — une passe décisive
comptée autrement, une confiance calculée différemment —, `schemaVersion`
permettra de savoir avec quelle logique un rapport archivé a été produit, comme
`RANKING_FORMULA_VERSION` le fait déjà pour le classement.

Rien dans ce fichier ne décide de rien. Le rapport est une **proposition** :
tant que l'arbitre n'a pas validé, aucune statistique n'entre en base, et la
règle métier reste du ressort exclusif de l'API (`MATCH-005`).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from .aggregate import MatchSheet, consistency_warnings, sheet_totals
from .config import AnalysisConfig
from .events import AnalysisResult, MatchEvent
from .roster import Roster

SCHEMA_VERSION = 1


@dataclass(frozen=True, slots=True)
class VideoInfo:
    path: str = ""
    fps: float = 0.0
    frame_count: int = 0
    width: int = 0
    height: int = 0

    @property
    def duration_s(self) -> float:
        return self.frame_count / self.fps if self.fps > 0 else 0.0


def _event_id(index: int, event: MatchEvent) -> str:
    return f"{index:04d}-{event.kind}-{int(event.time_s * 1000):09d}"


def _event_to_dict(
    index: int,
    event: MatchEvent,
    roster: Roster,
    config: AnalysisConfig,
    clips: dict[str, str] | None,
) -> dict[str, Any]:
    entry = roster.by_bib(event.bib)
    identifier = _event_id(index, event)
    return {
        "id": identifier,
        "kind": event.kind,
        "timeMs": round(event.time_s * 1000),
        "team": event.team,
        "teamId": roster.team_id(event.team) if event.team else None,
        "scoringTeam": event.scoring_team,
        "scoringTeamId": (
            roster.team_id(event.scoring_team) if event.scoring_team else None
        ),
        "bib": event.bib,
        "playerId": entry.player_id if entry else None,
        "playerName": entry.display_name if entry else None,
        "trackId": event.track_id,
        "confidence": round(event.confidence, 3),
        "needsReview": event.bib is None
        or event.confidence < config.review_confidence_threshold,
        "detail": event.detail,
        "clip": (clips or {}).get(identifier),
    }


def build_report(
    result: AnalysisResult,
    sheet: MatchSheet,
    roster: Roster,
    config: AnalysisConfig,
    video: VideoInfo | None = None,
    clips: dict[str, str] | None = None,
) -> dict[str, Any]:
    video = video or VideoInfo()
    events = [
        _event_to_dict(index, event, roster, config, clips)
        for index, event in enumerate(result.events)
    ]

    warnings = list(result.warnings) + consistency_warnings(sheet)
    # Seules les détections réelles comptent : une position interpolée mesure la
    # qualité du lissage, pas celle de la détection.
    ball_frames = len(
        {sample.index for sample in result.ball_samples if not sample.interpolated}
    )

    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
        "video": {
            "path": video.path,
            "fps": round(video.fps, 3),
            "frameCount": video.frame_count,
            "durationS": round(video.duration_s, 2),
            "width": video.width,
            "height": video.height,
        },
        "match": {
            "proposalId": roster.proposal_id,
            "matchOrder": roster.match_order,
            "teamAId": roster.team_id("A"),
            "teamBId": roster.team_id("B"),
            "scoreA": sheet.score_a,
            "scoreB": sheet.score_b,
        },
        "events": events,
        "matchStats": [
            {
                "playerId": line.player_id,
                "bib": line.bib,
                "displayName": line.display_name,
                "team": line.team,
                "goals": line.goals,
                "assists": line.assists,
                "defenses": line.defenses,
                "saves": line.saves,
            }
            for line in sheet.lines
        ],
        "review": {
            "unassignedEvents": [
                event["id"]
                for event in events
                if event["playerId"] is None and event["kind"] != "own_goal"
            ],
            "lowConfidenceEvents": [
                event["id"] for event in events if event["needsReview"]
            ],
            "warnings": warnings,
        },
        "quality": {
            "framesAnalyzed": video.frame_count,
            "framesWithBall": ball_frames,
            "ballDetectionRate": (
                round(ball_frames / video.frame_count, 3)
                if video.frame_count
                else None
            ),
            "possessions": len(result.possessions),
            "shots": len(result.shots),
            "shotsOnTarget": sum(1 for shot in result.shots if shot.on_target),
            "totals": sheet_totals(sheet),
        },
        "config": config.to_dict(),
    }


def format_summary(report: dict[str, Any]) -> str:
    """Résumé lisible en console, pour vérifier une analyse d'un coup d'œil."""
    match = report["match"]
    lines = [
        f"Score : {match['scoreA']} - {match['scoreB']}",
        f"Événements proposés : {len(report['events'])}",
        "",
        f"{'Dossard':>8} {'Joueur':<22} {'Éq':>3} {'B':>3} {'PD':>3} {'Déf':>4} {'Arr':>4}",
    ]
    for row in sorted(
        report["matchStats"],
        key=lambda r: (r["team"], -(r["goals"] * 3 + r["assists"] * 2)),
    ):
        lines.append(
            f"{row['bib']:>8} {row['displayName'][:22]:<22} {row['team']:>3} "
            f"{row['goals']:>3} {row['assists']:>3} {row['defenses']:>4} "
            f"{row['saves']:>4}"
        )
    warnings = report["review"]["warnings"]
    if warnings:
        lines.append("")
        lines.append("À vérifier :")
        lines.extend(f"  - {warning}" for warning in warnings)
    return "\n".join(lines)
