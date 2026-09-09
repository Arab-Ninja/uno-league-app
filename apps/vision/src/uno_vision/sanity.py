"""Contrôles de vraisemblance : détecter une calibration fausse avant les stats.

Une calibration erronée ne se voit pas. Elle ne fait pas planter l'analyse : elle
produit des chiffres d'allure normale, tous faux dans la même proportion. Un
terrain déclaré 30 m alors qu'il en fait 25 rend chaque distance 20 % trop
grande, donc chaque possession, chaque tir et chaque interception discutables —
sans qu'aucune ligne de journal ne le signale.

Le seul garde-fou fiable est extérieur au système : **on sait à quelle vitesse
un être humain court**. Un joueur de foot à cinq pointe entre 6 et 9 m/s, jamais
20. Si les vitesses mesurées sortent de cette plage, ce ne sont pas les joueurs
qui sont anormaux, c'est l'échelle.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .scene import FrameObservation, Point

HUMAN_SPRINT_MAX_M_S = 11.0
"""Au-delà, aucun joueur amateur ne court : l'échelle est trop grande."""
HUMAN_SPRINT_MIN_M_S = 3.5
"""En deçà, personne n'a sprinté de tout le match : l'échelle est trop petite."""


@dataclass(frozen=True, slots=True)
class SpeedProfile:
    """Distribution des vitesses observées, en mètres par seconde."""

    median: float
    p95: float
    peak: float
    samples: int

    @property
    def is_plausible(self) -> bool:
        return HUMAN_SPRINT_MIN_M_S <= self.p95 <= HUMAN_SPRINT_MAX_M_S


def measure_speeds(
    frames: Sequence[FrameObservation], max_gap_s: float = 0.2
) -> SpeedProfile:
    """Vitesses des joueurs, mesurées entre images consécutives.

    Les écarts de temps trop longs sont ignorés : une piste perdue puis
    retrouvée dix secondes plus loin produirait une vitesse absurde qui n'a rien
    à voir avec l'échelle du terrain.
    """
    ordered = sorted(frames, key=lambda frame: frame.time_s)
    speeds: list[float] = []
    previous: dict[int, tuple[float, Point]] = {}

    for frame in ordered:
        for player in frame.players:
            last = previous.get(player.track_id)
            if last is not None:
                elapsed = frame.time_s - last[0]
                if 0 < elapsed <= max_gap_s:
                    speeds.append(player.position.distance_to(last[1]) / elapsed)
            previous[player.track_id] = (frame.time_s, player.position)

    if not speeds:
        return SpeedProfile(0.0, 0.0, 0.0, 0)

    speeds.sort()
    return SpeedProfile(
        median=speeds[len(speeds) // 2],
        p95=speeds[min(len(speeds) - 1, int(0.95 * len(speeds)))],
        peak=speeds[-1],
        samples=len(speeds),
    )


def calibration_warnings(frames: Sequence[FrameObservation]) -> list[str]:
    """Avertissements à afficher avant de croire une seule statistique."""
    profile = measure_speeds(frames)
    if profile.samples < 50:
        return [
            "Trop peu de déplacements observés pour vérifier l'échelle du terrain."
        ]
    if profile.is_plausible:
        return []

    if profile.p95 > HUMAN_SPRINT_MAX_M_S:
        facteur = profile.p95 / 8.0
        return [
            f"Les joueurs semblent courir à {profile.p95:.0f} m/s, ce qui est "
            f"impossible. Le terrain déclaré est probablement {facteur:.1f} fois "
            "trop grand, ou les repères de calibration sont mal placés."
        ]
    facteur = 8.0 / max(0.1, profile.p95)
    return [
        f"Aucun joueur ne dépasse {profile.p95:.1f} m/s de toute la session, ce "
        f"qui est anormalement lent. Le terrain déclaré est probablement "
        f"{facteur:.1f} fois trop petit."
    ]
