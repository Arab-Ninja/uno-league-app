"""De la vidéo aux observations : la seule fonction qui a besoin d'un GPU.

L'analyse se fait en deux temps, et ce n'est pas un détail d'implémentation.

Le premier temps parcourt la vidéo : il détecte, suit, et **accumule** des
indices d'identité — couleurs de buste, lectures de dossards — sans jamais
conclure. Le second temps, une fois la vidéo terminée, tranche : chaque piste
reçoit son équipe et son numéro au vu de tout ce qui a été observé.

Décider image par image donnerait un joueur qui change d'équipe au gré des
occultations, et une feuille de match illisible. Un joueur ne change pas de
chasuble en cours de match ; le système ne doit pas non plus.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from ..boxes import best_detection
from ..calibration import Calibration
from ..config import AnalysisConfig
from ..numbers import BibResolver
from ..report import VideoInfo
from ..roster import Roster
from ..scene import BALL, PLAYER, BBox, FrameObservation, PlayerObservation
from ..teams import TeamPalette, TeamVotes, cluster_two_colors
from ..tracking import MultiObjectTracker
from .color import torso_color
from .detector import TiledBallSearch, YoloDetector
from .ocr import EasyOcrBibReader
from .reader import VideoStream

MAX_COLOR_SAMPLES_PER_TRACK = 120


@dataclass(slots=True)
class _RawFrame:
    index: int
    time_s: float
    players: list[tuple[int, BBox]] = field(default_factory=list)
    ball: BBox | None = None


def analyse_video(
    video_path: str | Path,
    calibration: Calibration,
    roster: Roster,
    config: AnalysisConfig | None = None,
    *,
    weights: str = "yolov8m.pt",
    device: str | None = None,
    stride: int = 1,
    read_bibs: bool = True,
    ocr_every: int = 5,
    tile_ball_search: bool = True,
    progress: Callable[[int, int], None] | None = None,
) -> tuple[list[FrameObservation], VideoInfo]:
    """Analyse une vidéo et renvoie les observations image par image."""
    config = config or AnalysisConfig()
    detector = YoloDetector(
        weights=weights,
        device=device,
        confidence=min(config.ball_confidence, config.player_confidence),
    )
    ball_search = TiledBallSearch(detector) if tile_ball_search else None
    ocr = EasyOcrBibReader(use_gpu=device != "cpu") if read_bibs else None

    tracker = MultiObjectTracker(config, label=PLAYER)
    bib_resolver = BibResolver()
    colors_by_track: dict[int, list[tuple[int, int, int]]] = {}
    raw_frames: list[_RawFrame] = []
    last_ball_box: BBox | None = None

    with VideoStream(video_path, stride=stride) as stream:
        meta = stream.meta
        for index, time_s, image in stream:
            detections = detector.detect(image)
            players = [d for d in detections if d.label == PLAYER]
            tracks = tracker.update(players)

            ball = best_detection(detections, BALL, config.ball_confidence)
            ball_box = ball.bbox if ball else None
            if ball_box is None and ball_search is not None:
                found = ball_search.search(image, around=last_ball_box)
                if found:
                    ball_box = max(found, key=lambda d: d.score).bbox
            last_ball_box = ball_box or last_ball_box

            raw = _RawFrame(index=index, time_s=time_s, ball=ball_box)
            for track in tracks:
                raw.players.append((track.track_id, track.bbox))
                torso = track.bbox.torso()
                color = torso_color(image, torso)
                if color is not None:
                    samples = colors_by_track.setdefault(track.track_id, [])
                    if len(samples) < MAX_COLOR_SAMPLES_PER_TRACK:
                        samples.append(color)
                if ocr is not None and index % ocr_every == 0:
                    for bib, confidence in ocr.read(image, torso):
                        bib_resolver.observe(track.track_id, bib, confidence)
            raw_frames.append(raw)

            if progress is not None and index % 100 == 0:
                progress(index, meta.frame_count)

    palette = _resolve_palette(roster, colors_by_track)
    votes = TeamVotes(palette)
    for track_id, colors in colors_by_track.items():
        for color in colors:
            votes.observe(track_id, color)

    teams_by_track = {
        track_id: team for track_id, (team, _) in votes.resolve_all().items()
    }
    allowed = set(roster.bibs_of_team("A")) | set(roster.bibs_of_team("B"))
    bibs_by_track = {
        track_id: assignment.bib
        for track_id, assignment in bib_resolver.resolve_all(allowed or None).items()
    }

    observations = _build_observations(
        raw_frames, calibration, roster, teams_by_track, bibs_by_track
    )
    video = VideoInfo(
        path=str(video_path),
        fps=meta.fps / max(1, stride),
        frame_count=len(raw_frames),
        width=meta.width,
        height=meta.height,
    )
    return observations, video


def _resolve_palette(
    roster: Roster, colors_by_track: dict[int, list[tuple[int, int, int]]]
) -> TeamPalette:
    """Palette du match : celle saisie à la calibration, ou celle déduite."""
    color_a = roster.teams["A"].bib_color
    color_b = roster.teams["B"].bib_color
    if color_a and color_b:
        return TeamPalette(color_a, color_b)

    samples = [color for colors in colors_by_track.values() for color in colors]
    if len(samples) < 2:
        raise RuntimeError(
            "impossible de déduire les couleurs des chasubles : aucun joueur "
            "détecté. Saisissez-les dans la feuille de match."
        )
    return cluster_two_colors(samples[:2000])


def _build_observations(
    raw_frames: Sequence[_RawFrame],
    calibration: Calibration,
    roster: Roster,
    teams_by_track: dict[int, str | None],
    bibs_by_track: dict[int, int],
) -> list[FrameObservation]:
    """Projette les boîtes sur le terrain et attache les identités résolues.

    Quand le dossard est lu, il l'emporte sur la couleur : un numéro identifie
    un joueur, une couleur ne fait que suggérer une équipe.
    """
    observations: list[FrameObservation] = []
    for raw in raw_frames:
        players: list[PlayerObservation] = []
        for track_id, bbox in raw.players:
            bib = bibs_by_track.get(track_id)
            entry = roster.by_bib(bib)
            team = entry.team if entry else teams_by_track.get(track_id)
            try:
                position = calibration.to_field(bbox.ground_anchor)
            except Exception:
                continue
            players.append(
                PlayerObservation(
                    track_id=track_id,
                    position=position,
                    bbox=bbox,
                    team=team,
                    bib=bib,
                    is_goalkeeper=bool(entry and entry.goalkeeper),
                )
            )

        ball_point = None
        if raw.ball is not None:
            try:
                ball_point = calibration.to_field(raw.ball.ground_anchor)
            except Exception:
                ball_point = None

        observations.append(
            FrameObservation(
                index=raw.index,
                time_s=raw.time_s,
                players=tuple(players),
                ball=ball_point,
                ball_bbox=raw.ball,
            )
        )
    return observations
