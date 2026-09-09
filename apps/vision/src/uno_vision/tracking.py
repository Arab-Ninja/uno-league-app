"""Suivi multi-objets : donner une identité stable aux joueurs d'une image à l'autre.

L'algorithme reprend l'idée de ByteTrack, dans une version compacte et sans
dépendance : on associe d'abord les détections sûres aux pistes existantes, puis
on offre une seconde chance aux détections douteuses sur les pistes restées
orphelines. C'est exactement ce qu'il faut en futsal, où un joueur à moitié
caché par un adversaire produit une détection faible qu'il serait dommage de
jeter — c'est ce qui crée les changements d'identité.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from .config import AnalysisConfig
from .scene import BBox, Detection, Point


@dataclass(slots=True)
class Track:
    track_id: int
    bbox: BBox
    score: float
    label: str
    hits: int = 1
    age: int = 0
    time_since_update: int = 0
    velocity: Point = field(default_factory=lambda: Point(0.0, 0.0))
    confirmed: bool = False

    def predicted_bbox(self) -> BBox:
        """Position attendue à l'image suivante, à vitesse constante."""
        return BBox(
            self.bbox.x1 + self.velocity.x,
            self.bbox.y1 + self.velocity.y,
            self.bbox.x2 + self.velocity.x,
            self.bbox.y2 + self.velocity.y,
        )

    def update(self, bbox: BBox, score: float, smoothing: float = 0.5) -> None:
        previous = self.bbox.center
        new_center = bbox.center
        measured = Point(new_center.x - previous.x, new_center.y - previous.y)
        self.velocity = Point(
            smoothing * measured.x + (1.0 - smoothing) * self.velocity.x,
            smoothing * measured.y + (1.0 - smoothing) * self.velocity.y,
        )
        self.bbox = bbox
        self.score = score
        self.hits += 1
        self.time_since_update = 0


def _match(
    tracks: Sequence[Track], detections: Sequence[Detection], iou_threshold: float,
    max_distance_px: float,
) -> tuple[list[tuple[int, int]], set[int], set[int]]:
    """Association gloutonne par recouvrement décroissant.

    Une association hongroise serait optimale ; sur dix joueurs par image le gain
    est nul et le coût en lisibilité réel.
    """
    pairs: list[tuple[float, int, int]] = []
    for t_index, track in enumerate(tracks):
        predicted = track.predicted_bbox()
        for d_index, detection in enumerate(detections):
            if detection.label != track.label:
                continue
            iou = predicted.iou(detection.bbox)
            distance = predicted.center.distance_to(detection.bbox.center)
            if iou < iou_threshold and distance > max_distance_px:
                continue
            # Une piste très proche mais sans recouvrement (objet rapide) reste
            # associable : le score combine les deux critères.
            score = iou + max(0.0, 1.0 - distance / max(1.0, max_distance_px)) * 0.5
            pairs.append((score, t_index, d_index))

    pairs.sort(reverse=True)
    used_tracks: set[int] = set()
    used_detections: set[int] = set()
    matches: list[tuple[int, int]] = []
    for _, t_index, d_index in pairs:
        if t_index in used_tracks or d_index in used_detections:
            continue
        used_tracks.add(t_index)
        used_detections.add(d_index)
        matches.append((t_index, d_index))

    unmatched_tracks = set(range(len(tracks))) - used_tracks
    unmatched_detections = set(range(len(detections))) - used_detections
    return matches, unmatched_tracks, unmatched_detections


class MultiObjectTracker:
    """Suit un ensemble d'objets d'une même classe au fil des images."""

    def __init__(self, config: AnalysisConfig | None = None, label: str = "player") -> None:
        self.config = config or AnalysisConfig()
        self.label = label
        self.tracks: list[Track] = []
        self._next_id = 1

    def update(self, detections: Sequence[Detection]) -> list[Track]:
        config = self.config
        for track in self.tracks:
            track.age += 1
            track.time_since_update += 1

        strong = [d for d in detections if d.score >= config.player_confidence]
        weak = [
            d
            for d in detections
            if config.ball_confidence <= d.score < config.player_confidence
        ]

        matches, unmatched_tracks, unmatched_strong = _match(
            self.tracks, strong, config.track_iou_threshold, config.track_max_distance_px
        )
        for t_index, d_index in matches:
            self.tracks[t_index].update(strong[d_index].bbox, strong[d_index].score)

        # Seconde passe : les pistes non appariées tentent leur chance sur les
        # détections faibles, qui sont le plus souvent des joueurs occultés.
        remaining = [self.tracks[i] for i in sorted(unmatched_tracks)]
        weak_matches, _, _ = _match(
            remaining, weak, config.track_iou_threshold, config.track_max_distance_px
        )
        rescued: set[int] = set()
        for r_index, d_index in weak_matches:
            track = remaining[r_index]
            track.update(weak[d_index].bbox, weak[d_index].score)
            rescued.add(id(track))

        for d_index in sorted(unmatched_strong):
            detection = strong[d_index]
            self.tracks.append(
                Track(
                    track_id=self._next_id,
                    bbox=detection.bbox,
                    score=detection.score,
                    label=self.label,
                )
            )
            self._next_id += 1

        self.tracks = [
            track
            for track in self.tracks
            if track.time_since_update <= config.track_max_age_frames
        ]
        for track in self.tracks:
            if track.hits >= config.track_min_hits:
                track.confirmed = True

        return [t for t in self.tracks if t.confirmed and t.time_since_update == 0]


@dataclass(frozen=True, slots=True)
class BallSample:
    time_s: float
    index: int
    position: Point
    interpolated: bool = False


def smooth_ball_trajectory(
    samples: Sequence[BallSample], config: AnalysisConfig | None = None
) -> list[BallSample]:
    """Nettoie la trajectoire du ballon : aberrations retirées, trous comblés.

    Deux corrections, dans cet ordre. D'abord on écarte les positions qui
    impliqueraient une vitesse impossible — ce sont des détections parasites, un
    ballon posé sur la touche ou une tête blonde. Ensuite on interpole les trous
    courts : le ballon reste invisible quelques images quand il passe devant un
    maillot de la même couleur, et couper la trajectoire à cet endroit ferait
    perdre le tir.
    """
    config = config or AnalysisConfig()
    ordered = sorted(samples, key=lambda s: s.time_s)
    if not ordered:
        return []

    accepted: list[BallSample] = [ordered[0]]
    for sample in ordered[1:]:
        previous = accepted[-1]
        elapsed = sample.time_s - previous.time_s
        if elapsed <= 0:
            continue
        speed = previous.position.distance_to(sample.position) / elapsed
        if speed > config.ball_max_speed_m_s:
            continue
        accepted.append(sample)

    filled: list[BallSample] = []
    for index, sample in enumerate(accepted):
        filled.append(sample)
        if index + 1 >= len(accepted):
            break
        following = accepted[index + 1]
        gap_frames = following.index - sample.index
        gap_seconds = following.time_s - sample.time_s
        if gap_frames <= 1 or gap_seconds > config.ball_max_gap_seconds:
            continue
        for step in range(1, gap_frames):
            ratio = step / gap_frames
            filled.append(
                BallSample(
                    time_s=sample.time_s + ratio * gap_seconds,
                    index=sample.index + step,
                    position=Point(
                        sample.position.x + ratio * (following.position.x - sample.position.x),
                        sample.position.y + ratio * (following.position.y - sample.position.y),
                    ),
                    interpolated=True,
                )
            )
    return filled
