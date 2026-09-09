"""Des trajectoires aux quatre statistiques UNO League.

Le principe directeur est qu'un événement se déduit d'une **géométrie**, jamais
d'une apparence. Un but n'est pas « une image qui ressemble à un but » : c'est un
ballon dont la position au sol franchit la ligne entre les poteaux. Un arrêt
n'est pas un plongeon : c'est un tir cadré dont la trajectoire s'interrompt sur
le gardien. Cette approche a deux vertus — elle s'explique à un arbitre, et elle
ne demande aucune donnée d'entraînement propre à UNO League.

Elle a aussi une limite, qu'il faut assumer plutôt que masquer : l'homographie
suppose le ballon au sol. Un ballon aérien est projeté trop loin de la caméra,
et une frappe qui passe au-dessus de la barre peut se lire comme un but. C'est
la raison d'être du score de confiance et de la validation par l'arbitre : le
système propose, il ne comptabilise pas.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from .calibration import Calibration, Goal
from .config import AnalysisConfig
from .geometry import angle_between, distance_point_to_segment, ray_segment_intersection
from .possession import (
    BallFlight,
    Possession,
    ball_samples_from_frames,
    compute_flights,
    compute_possessions,
)
from .roster import Roster
from .scene import TEAMS, FrameObservation, Point, other_team
from .tracking import BallSample, smooth_ball_trajectory

GOAL = "goal"
OWN_GOAL = "own_goal"
ASSIST = "assist"
SAVE = "save"
DEFENSE = "defense"

EVENT_KINDS = (GOAL, OWN_GOAL, ASSIST, SAVE, DEFENSE)


@dataclass(frozen=True, slots=True)
class MatchEvent:
    """Un fait de jeu proposé à l'arbitre, avec de quoi le vérifier."""

    kind: str
    time_s: float
    team: str | None
    """Équipe du joueur crédité. `None` quand la vision n'a pas su trancher."""
    track_id: int | None
    bib: int | None
    confidence: float
    detail: str
    """Phrase lisible expliquant *pourquoi* l'événement a été proposé."""
    scoring_team: str | None = None
    """Équipe qui marque — renseigné pour les buts, y compris contre son camp."""

    @property
    def needs_review(self) -> bool:
        return self.bib is None


@dataclass(frozen=True, slots=True)
class Shot:
    """Une frappe vers le but, cadrée ou non, et ce qu'elle est devenue."""

    time_s: float
    team: str | None
    track_id: int | None
    bib: int | None
    origin: Point
    direction: Point
    speed_m_s: float
    goal_side: str
    on_target: bool
    outcome: str
    """`goal`, `saved`, `blocked`, `off_target` ou `unknown`."""


@dataclass(frozen=True, slots=True)
class GoalCrossing:
    """Le ballon a franchi une ligne de but."""

    time_s: float
    goal: Goal
    samples: tuple[BallSample, ...]

    @property
    def real_samples(self) -> int:
        return sum(1 for sample in self.samples if not sample.interpolated)


@dataclass(slots=True)
class AnalysisResult:
    events: list[MatchEvent] = field(default_factory=list)
    shots: list[Shot] = field(default_factory=list)
    possessions: list[Possession] = field(default_factory=list)
    flights: list[BallFlight] = field(default_factory=list)
    ball_samples: list[BallSample] = field(default_factory=list)
    crossings: list[GoalCrossing] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def detect_events(
    frames: Sequence[FrameObservation],
    calibration: Calibration,
    config: AnalysisConfig | None = None,
    roster: Roster | None = None,
) -> AnalysisResult:
    """Chaîne complète : observations → événements de match."""
    config = config or AnalysisConfig()
    ordered = sorted(frames, key=lambda f: f.time_s)
    by_index = {frame.index: frame for frame in ordered}

    samples = smooth_ball_trajectory(ball_samples_from_frames(ordered), config)
    possessions = compute_possessions(ordered, config)
    flights = compute_flights(possessions, samples)
    crossings = _detect_goal_crossings(samples, calibration, config)

    shots: list[Shot] = []
    events: list[MatchEvent] = []
    warnings: list[str] = []
    shot_flights: set[int] = set()

    for flight in flights:
        shot = _classify_shot(flight, calibration, config, crossings)
        if shot is None:
            continue
        shots.append(shot)
        shot_flights.add(id(flight))
        events.extend(
            _defensive_events(shot, flight, by_index, calibration, config, roster)
        )

    events.extend(_goal_events(crossings, possessions, samples, calibration, config))

    for flight in flights:
        if id(flight) in shot_flights:
            continue
        event = _interception_event(flight, calibration, config)
        if event is not None:
            events.append(event)

    if not samples:
        warnings.append(
            "Ballon jamais détecté : aucune statistique ne peut être déduite."
        )
    elif len(samples) < len(ordered) * 0.3:
        warnings.append(
            "Ballon détecté sur moins d'un tiers des images : les événements "
            "manqués sont probablement nombreux."
        )
    if not possessions:
        warnings.append(
            "Aucune possession identifiée : vérifiez la calibration du terrain."
        )

    events.sort(key=lambda event: (event.time_s, event.kind))
    return AnalysisResult(
        events=events,
        shots=shots,
        possessions=possessions,
        flights=flights,
        ball_samples=list(samples),
        crossings=crossings,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Buts
# ---------------------------------------------------------------------------


def _detect_goal_crossings(
    samples: Sequence[BallSample], calibration: Calibration, config: AnalysisConfig
) -> list[GoalCrossing]:
    goals = calibration.goals
    runs: list[tuple[str, list[BallSample]]] = []

    for sample in samples:
        side = next(
            (
                name
                for name, goal in goals.items()
                if goal.contains(
                    sample.position,
                    config.goal_crossing_margin_m,
                    config.goal_mouth_tolerance_m,
                )
            ),
            None,
        )
        if side is None:
            continue
        if runs and runs[-1][0] == side and sample.index - runs[-1][1][-1].index <= 2:
            runs[-1][1].append(sample)
        else:
            runs.append((side, [sample]))

    crossings: list[GoalCrossing] = []
    for side, run in runs:
        if len(run) < config.goal_min_samples:
            continue
        moment = run[0].time_s
        if crossings and moment - crossings[-1].time_s < config.goal_cooldown_seconds:
            continue
        crossings.append(GoalCrossing(moment, goals[side], tuple(run)))
    return crossings


def _team_defending(calibration: Calibration, side: str, time_s: float) -> str:
    for team in TEAMS:
        if calibration.side_defended_by(team, time_s) == side:
            return team
    raise ValueError(f"aucune équipe ne défend le côté {side!r}")


def _goal_events(
    crossings: Sequence[GoalCrossing],
    possessions: Sequence[Possession],
    samples: Sequence[BallSample],
    calibration: Calibration,
    config: AnalysisConfig,
) -> list[MatchEvent]:
    events: list[MatchEvent] = []

    for crossing in crossings:
        defending = _team_defending(calibration, crossing.goal.side, crossing.time_s)
        scoring = other_team(defending)

        confidence = 0.55
        if _restart_detected(samples, crossing.time_s, calibration, config):
            confidence += 0.20
        if crossing.real_samples >= 3:
            confidence += 0.10
        elif crossing.real_samples == 0:
            confidence -= 0.15

        last = _last_possession_before(
            possessions, crossing.time_s, config.goal_attribution_window_seconds
        )

        if last is None or last.team is None:
            events.append(
                MatchEvent(
                    kind=GOAL,
                    time_s=crossing.time_s,
                    team=scoring,
                    track_id=None,
                    bib=None,
                    confidence=_clamp(confidence - 0.10),
                    detail=(
                        f"Ballon dans le but {crossing.goal.side} sans porteur "
                        "identifié juste avant : buteur à désigner."
                    ),
                    scoring_team=scoring,
                )
            )
            continue

        if last.team == defending:
            events.append(
                MatchEvent(
                    kind=OWN_GOAL,
                    time_s=crossing.time_s,
                    team=defending,
                    track_id=last.track_id,
                    bib=last.bib,
                    confidence=_clamp(confidence - 0.10),
                    detail=(
                        "Dernier contact par un joueur de l'équipe qui défend ce "
                        "but : but contre son camp probable."
                    ),
                    scoring_team=scoring,
                )
            )
            continue

        if last.bib is not None:
            confidence += 0.10
        events.append(
            MatchEvent(
                kind=GOAL,
                time_s=crossing.time_s,
                team=scoring,
                track_id=last.track_id,
                bib=last.bib,
                confidence=_clamp(confidence),
                detail=(
                    f"Ballon franchissant la ligne du but {crossing.goal.side} "
                    f"{crossing.time_s - last.end_s:.1f} s après le dernier contact."
                ),
                scoring_team=scoring,
            )
        )

        assist = _find_assist(possessions, last, config)
        if assist is not None:
            events.append(
                MatchEvent(
                    kind=ASSIST,
                    time_s=assist.end_s,
                    team=assist.team,
                    track_id=assist.track_id,
                    bib=assist.bib,
                    confidence=_clamp(confidence * 0.85),
                    detail=(
                        "Dernière passe d'un coéquipier avant le but, "
                        f"{last.start_s - assist.end_s:.1f} s avant la frappe."
                    ),
                )
            )

    return events


def _last_possession_before(
    possessions: Sequence[Possession], moment: float, window_s: float
) -> Possession | None:
    candidates = [
        p for p in possessions if p.end_s <= moment and moment - p.end_s <= window_s
    ]
    return candidates[-1] if candidates else None


def _find_assist(
    possessions: Sequence[Possession], scorer: Possession, config: AnalysisConfig
) -> Possession | None:
    """Passe décisive : la possession du coéquipier juste avant le but.

    Trois conditions, qui reprennent l'usage plutôt qu'un règlement écrit : le
    passeur est un coéquipier, aucun adversaire n'a touché le ballon entre les
    deux, et le buteur n'a pas gardé le ballon assez longtemps pour que le but
    lui revienne entièrement.
    """
    if scorer.team is None:
        return None
    if scorer.duration_s > config.assist_max_hold_seconds:
        return None

    index = next(
        (i for i, p in enumerate(possessions) if p is scorer),
        None,
    )
    if index is None or index == 0:
        return None

    previous = possessions[index - 1]
    if previous.team != scorer.team:
        return None
    if previous.track_id == scorer.track_id:
        return None
    if scorer.start_s - previous.end_s > config.assist_max_gap_seconds:
        return None
    return previous


def _restart_detected(
    samples: Sequence[BallSample],
    goal_time_s: float,
    calibration: Calibration,
    config: AnalysisConfig,
) -> bool:
    """Le ballon est-il revenu au rond central après le but ?

    C'est la confirmation la plus fiable dont on dispose sans lire le tableau
    d'affichage : après un but, et seulement après un but, le jeu reprend du
    centre.
    """
    center = calibration.field.center
    window_end = goal_time_s + config.goal_restart_window_seconds
    return any(
        goal_time_s < sample.time_s <= window_end
        and sample.position.distance_to(center) <= config.goal_restart_radius_m
        for sample in samples
    )


# ---------------------------------------------------------------------------
# Tirs, arrêts et défenses
# ---------------------------------------------------------------------------


def _classify_shot(
    flight: BallFlight,
    calibration: Calibration,
    config: AnalysisConfig,
    crossings: Sequence[GoalCrossing],
) -> Shot | None:
    origin = flight.origin
    if origin is None or origin.team is None:
        return None

    velocity = flight.release_velocity(config.shot_release_window_seconds)
    speed = velocity.norm()
    if speed < config.shot_min_speed_m_s:
        return None

    goal = calibration.attacked_goal(origin.team, flight.release_s)
    if flight.release_position.distance_to(goal.center) > config.shot_max_distance_m:
        return None

    margin = config.shot_off_target_margin_m
    line = (
        Point(goal.line_x, goal.mouth_min_y - margin),
        Point(goal.line_x, goal.mouth_max_y + margin),
    )
    hit = ray_segment_intersection(
        flight.release_position, velocity.normalized(), line[0], line[1]
    )
    if hit is None:
        return None

    hit_point, _ = hit
    tolerance = config.shot_on_target_tolerance_m
    on_target = (
        goal.mouth_min_y - tolerance <= hit_point.y <= goal.mouth_max_y + tolerance
    )

    # Deux garde-fous contre le tir imaginaire. Une passe appuyée vers l'avant
    # pointe souvent vers la cage adverse ; ce qui la distingue d'une frappe,
    # c'est qu'elle finit dans les pieds d'un coéquipier. Et un tir « non
    # cadré » n'existe que si le ballon a réellement quitté le jeu derrière la
    # ligne : sinon, c'est un centre ou un dégagement.
    if flight.destination is not None and flight.destination.team == origin.team:
        return None
    if not on_target and not _crosses_goal_line(flight, goal):
        return None

    scored = any(
        crossing.goal.side == goal.side
        and flight.release_s <= crossing.time_s <= flight.arrival_s + 1.0
        for crossing in crossings
    )
    outcome = "goal" if scored else ("unknown" if on_target else "off_target")

    return Shot(
        time_s=flight.release_s,
        team=origin.team,
        track_id=origin.track_id,
        bib=origin.bib,
        origin=flight.release_position,
        direction=velocity.normalized(),
        speed_m_s=speed,
        goal_side=goal.side,
        on_target=on_target,
        outcome=outcome,
    )


def _crosses_goal_line(flight: BallFlight, goal: Goal) -> bool:
    """Le ballon a-t-il dépassé le plan de la ligne de but ?"""
    if goal.side == "left":
        return any(sample.position.x <= goal.line_x for sample in flight.samples)
    return any(sample.position.x >= goal.line_x for sample in flight.samples)


def _defensive_events(
    shot: Shot,
    flight: BallFlight,
    frames_by_index: dict[int, FrameObservation],
    calibration: Calibration,
    config: AnalysisConfig,
    roster: Roster | None,
) -> list[MatchEvent]:
    """Arrêt du gardien ou contre d'un défenseur, sur un tir cadré non concrétisé."""
    if shot.outcome == "goal" or not shot.on_target or shot.team is None:
        return []

    defending = other_team(shot.team)
    goal = calibration.goals[shot.goal_side]

    stopper, moment, how = _find_stopper(flight, frames_by_index, defending, config)
    if stopper is None:
        return []

    is_keeper = _is_goalkeeper(stopper, defending, moment, calibration, roster)
    if is_keeper:
        return [
            MatchEvent(
                kind=SAVE,
                time_s=moment,
                team=defending,
                track_id=stopper.track_id,
                bib=stopper.bib,
                confidence=_clamp(0.62 + (0.10 if stopper.bib is not None else 0.0)),
                detail=(
                    f"Tir cadré à {shot.speed_m_s:.0f} m/s arrêté par le gardien "
                    f"({how})."
                ),
            )
        ]

    # Contre d'un joueur de champ : il faut qu'il se soit trouvé sur la
    # trajectoire, entre le tireur et sa propre cage.
    corridor = distance_point_to_segment(stopper.position, shot.origin, goal.center)
    if corridor > config.defense_block_corridor_m:
        return []

    return [
        MatchEvent(
            kind=DEFENSE,
            time_s=moment,
            team=defending,
            track_id=stopper.track_id,
            bib=stopper.bib,
            confidence=_clamp(0.58 + (0.10 if stopper.bib is not None else 0.0)),
            detail=(
                f"Tir cadré contré à {corridor:.1f} m de l'axe de frappe ({how})."
            ),
        )
    ]


def _find_stopper(
    flight: BallFlight,
    frames_by_index: dict[int, FrameObservation],
    defending_team: str,
    config: AnalysisConfig,
):
    """Qui a interrompu le ballon : le receveur, ou celui qui l'a dévié.

    Deux cas se présentent en futsal, et il faut les traiter tous les deux. Le
    gardien qui bloque le ballon devient porteur — c'est le cas facile. Le
    gardien qui repousse le ballon du poing ne le devient jamais : seule la
    cassure de trajectoire près de lui témoigne de son intervention, et c'est
    pourtant le plus bel arrêt des deux.
    """
    destination = flight.destination
    if destination is not None and destination.team == defending_team:
        observation = _observation_at(
            frames_by_index, destination.start_index, destination.track_id
        )
        if observation is not None:
            return observation, destination.start_s, "ballon bloqué"

    deflection = _find_deflection(flight, frames_by_index, defending_team, config)
    if deflection is not None:
        observation, moment = deflection
        return observation, moment, "trajectoire déviée"

    return None, 0.0, ""


def _find_deflection(
    flight: BallFlight,
    frames_by_index: dict[int, FrameObservation],
    defending_team: str,
    config: AnalysisConfig,
):
    """Cherche une cassure nette de trajectoire au contact d'un défenseur."""
    samples = flight.samples
    for index in range(1, len(samples) - 1):
        before = samples[index].position - samples[index - 1].position
        after = samples[index + 1].position - samples[index].position
        if before.norm() < 1e-6 or after.norm() < 1e-6:
            continue
        if angle_between(before, after) < config.deflection_min_angle_deg:
            continue

        frame = frames_by_index.get(samples[index].index)
        if frame is None:
            continue
        candidates = [
            player
            for player in frame.players
            if player.team == defending_team
            and player.position.distance_to(samples[index].position)
            <= config.deflection_radius_m
        ]
        if not candidates:
            continue
        closest = min(
            candidates,
            key=lambda p: p.position.distance_to(samples[index].position),
        )
        return closest, samples[index].time_s
    return None


def _observation_at(
    frames_by_index: dict[int, FrameObservation], index: int, track_id: int
):
    frame = frames_by_index.get(index)
    if frame is None:
        return None
    return frame.player_by_track(track_id)


def _is_goalkeeper(
    observation,
    team: str,
    time_s: float,
    calibration: Calibration,
    roster: Roster | None,
) -> bool:
    """Gardien par la feuille de match, à défaut par la position occupée."""
    if roster is not None and observation.bib is not None:
        entry = roster.by_bib(observation.bib)
        if entry is not None:
            return entry.goalkeeper
    if observation.is_goalkeeper:
        return True
    return calibration.defended_goal(team, time_s).in_goal_area(observation.position)


def _interception_event(
    flight: BallFlight, calibration: Calibration, config: AnalysisConfig
) -> MatchEvent | None:
    """Récupération défensive : le ballon change de camp devant sa propre cage.

    La restriction au tiers défensif est essentielle. Sans elle, chaque perte de
    balle au milieu deviendrait une « défense réussie » et la statistique ne
    voudrait plus rien dire — elle mesurerait le nombre de passes ratées de
    l'adversaire, pas le mérite du défenseur.
    """
    origin, destination = flight.origin, flight.destination
    if origin is None or destination is None:
        return None
    if origin.team is None or destination.team is None:
        return None
    if origin.team == destination.team:
        return None

    defender_team = destination.team
    if not calibration.is_in_defensive_third(
        defender_team, destination.start_position, destination.start_s
    ):
        return None

    goal = calibration.defended_goal(defender_team, destination.start_s)
    progress = flight.release_position.distance_to(goal.center) - (
        flight.arrival_position.distance_to(goal.center)
    )
    if progress < config.interception_progress_m:
        return None

    confidence = 0.55
    if destination.bib is not None:
        confidence += 0.10
    if progress > 2 * config.interception_progress_m:
        confidence += 0.05

    return MatchEvent(
        kind=DEFENSE,
        time_s=destination.start_s,
        team=defender_team,
        track_id=destination.track_id,
        bib=destination.bib,
        confidence=_clamp(confidence),
        detail=(
            f"Ballon récupéré dans le tiers défensif après une progression "
            f"adverse de {progress:.1f} m vers le but."
        ),
    )


def _clamp(value: float) -> float:
    return max(0.05, min(0.98, value))
