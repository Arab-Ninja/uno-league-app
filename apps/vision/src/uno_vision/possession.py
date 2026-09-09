"""Qui a le ballon, et quand.

Toute la lecture du jeu repose sur cette découpe. Un but est une possession
suivie d'un ballon au fond des filets, une passe décisive est la possession
d'avant, une interception est un changement de possession entre deux équipes.
Se tromper ici, c'est se tromper partout : le module est donc volontairement
conservateur — mieux vaut ne pas attribuer une possession que d'en attribuer une
fausse, car l'arbitre peut compléter, pas deviner.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .config import AnalysisConfig
from .scene import FrameObservation, Point
from .tracking import BallSample


@dataclass(frozen=True, slots=True)
class Possession:
    """Un joueur maîtrise le ballon, d'un instant à un autre."""

    track_id: int
    team: str | None
    bib: int | None
    start_s: float
    end_s: float
    start_index: int
    end_index: int
    start_position: Point
    end_position: Point
    frames: int

    @property
    def duration_s(self) -> float:
        return max(0.0, self.end_s - self.start_s)


@dataclass(frozen=True, slots=True)
class BallFlight:
    """Le ballon entre deux possessions : passe, tir, dégagement ou rebond."""

    origin: Possession | None
    destination: Possession | None
    release_s: float
    arrival_s: float
    release_position: Point
    arrival_position: Point
    samples: tuple[BallSample, ...]

    @property
    def duration_s(self) -> float:
        return max(0.0, self.arrival_s - self.release_s)

    def release_velocity(self, window_s: float) -> Point:
        """Vecteur vitesse au moment de la frappe, en mètres par seconde.

        Mesuré sur les premières fractions de seconde du vol : c'est la
        direction que le joueur a donnée au ballon, avant tout rebond.
        """
        if len(self.samples) < 2:
            return Point(0.0, 0.0)
        first = self.samples[0]
        last = self.samples[-1]
        for sample in self.samples:
            if sample.time_s - first.time_s >= window_s:
                last = sample
                break
        elapsed = last.time_s - first.time_s
        if elapsed <= 0:
            return Point(0.0, 0.0)
        delta = last.position - first.position
        return Point(delta.x / elapsed, delta.y / elapsed)


def ball_samples_from_frames(frames: Sequence[FrameObservation]) -> list[BallSample]:
    return [
        BallSample(time_s=frame.time_s, index=frame.index, position=frame.ball)
        for frame in frames
        if frame.ball is not None
    ]


def compute_possessions(
    frames: Sequence[FrameObservation], config: AnalysisConfig | None = None
) -> list[Possession]:
    """Découpe la séquence en possessions successives.

    Trois garde-fous, dans cet ordre :

    1. le porteur candidat est le joueur le plus proche du ballon, à condition
       d'être dans le rayon de possession — sinon le ballon est en l'air ;
    2. une possession n'existe qu'au-delà d'une durée minimale, sans quoi un
       ballon qui frôle un joueur lui serait attribué ;
    3. deux possessions du même joueur séparées par un court intervalle sont
       fusionnées, parce qu'un dribble n'est pas une perte de balle.
    """
    config = config or AnalysisConfig()
    ordered = sorted(frames, key=lambda f: f.time_s)

    runs: list[list[FrameObservation]] = []
    holders: list[int] = []
    current_holder: int | None = None

    for frame in ordered:
        holder = _nearest_holder(frame, config.possession_radius_m)
        if holder is not None and holder == current_holder and runs:
            runs[-1].append(frame)
            continue
        if holder is None:
            current_holder = None
            continue
        current_holder = holder
        runs.append([frame])
        holders.append(holder)

    spells: list[Possession] = []
    for run, holder in zip(runs, holders, strict=True):
        first, last = run[0], run[-1]
        if last.time_s - first.time_s < config.possession_min_seconds:
            continue
        # Le porteur est par construction présent sur la première image du run,
        # puisque c'est elle qui l'a désigné ; sur la dernière, une occultation
        # a pu le faire disparaître.
        entry = first.player_by_track(holder)
        if entry is None:
            continue
        exit_observation = last.player_by_track(holder) or entry
        spells.append(
            Possession(
                track_id=holder,
                team=entry.team,
                bib=entry.bib,
                start_s=first.time_s,
                end_s=last.time_s,
                start_index=first.index,
                end_index=last.index,
                start_position=entry.position,
                end_position=exit_observation.position,
                frames=len(run),
            )
        )

    return _merge_adjacent(spells, config.possession_merge_gap_seconds)


def _nearest_holder(frame: FrameObservation, radius_m: float) -> int | None:
    ball = frame.ball
    if ball is None or not frame.players:
        return None
    closest = min(frame.players, key=lambda player: player.position.distance_to(ball))
    if closest.position.distance_to(ball) > radius_m:
        return None
    return closest.track_id


def _merge_adjacent(spells: Sequence[Possession], max_gap_s: float) -> list[Possession]:
    merged: list[Possession] = []
    for spell in spells:
        if merged and merged[-1].track_id == spell.track_id:
            previous = merged[-1]
            if spell.start_s - previous.end_s <= max_gap_s:
                merged[-1] = Possession(
                    track_id=previous.track_id,
                    team=previous.team or spell.team,
                    bib=previous.bib if previous.bib is not None else spell.bib,
                    start_s=previous.start_s,
                    end_s=spell.end_s,
                    start_index=previous.start_index,
                    end_index=spell.end_index,
                    start_position=previous.start_position,
                    end_position=spell.end_position,
                    frames=previous.frames + spell.frames,
                )
                continue
        merged.append(spell)
    return merged


def compute_flights(
    possessions: Sequence[Possession], samples: Sequence[BallSample]
) -> list[BallFlight]:
    """Reconstitue les trajets du ballon entre les possessions.

    Le vol qui suit la dernière possession est conservé : c'est souvent le plus
    intéressant de tous, celui du tir qui finit au fond.
    """
    flights: list[BallFlight] = []
    for index, possession in enumerate(possessions):
        following = possessions[index + 1] if index + 1 < len(possessions) else None
        start = possession.end_s
        end = following.start_s if following else float("inf")
        span = tuple(s for s in samples if start <= s.time_s <= end)
        if len(span) < 2:
            continue
        flights.append(
            BallFlight(
                origin=possession,
                destination=following,
                release_s=span[0].time_s,
                arrival_s=span[-1].time_s,
                release_position=span[0].position,
                arrival_position=span[-1].position,
                samples=span,
            )
        )
    return flights
