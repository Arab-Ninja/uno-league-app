"""Seuils de l'analyse, rassemblés en un seul endroit.

Chaque constante ici encode une décision arbitrable — à partir de quelle
distance un joueur « a » le ballon, à partir de quelle vitesse une frappe est un
tir. Les régler ailleurs, au fil du code, rendrait le système impossible à
étalonner sur une nouvelle salle. Le fichier JSON passé en ligne de commande
n'écrase que les valeurs qu'il mentionne.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class AnalysisConfig:
    # -- Détection et suivi -------------------------------------------------
    player_confidence: float = 0.35
    ball_confidence: float = 0.15
    """Le ballon est petit, flou et souvent partiellement caché : exiger la même
    confiance que pour un joueur reviendrait à ne jamais le voir."""
    track_max_age_frames: int = 30
    track_min_hits: int = 3
    track_iou_threshold: float = 0.25
    track_max_distance_px: float = 120.0

    # -- Possession ---------------------------------------------------------
    possession_radius_m: float = 1.6
    possession_min_seconds: float = 0.20
    possession_merge_gap_seconds: float = 0.40
    """Un dribble fait sortir le ballon du rayon : deux prises rapprochées du
    même joueur restent une seule possession."""

    # -- Ballon -------------------------------------------------------------
    ball_max_gap_seconds: float = 0.60
    """Au-delà, on cesse d'interpoler la trajectoire : le ballon est perdu."""
    ball_max_speed_m_s: float = 35.0
    """Filtre les fausses détections : un ballon de futsal ne va pas plus vite."""
    ball_max_jump_px: float = 140.0
    """Déplacement plausible du ballon entre deux images, en pixels.

    Sert à choisir entre plusieurs candidats : sur de vraies images, le décor
    de la salle est souvent mieux noté que le ballon, et seule la continuité de
    trajectoire permet de trancher."""

    # -- Tirs ---------------------------------------------------------------
    shot_min_speed_m_s: float = 5.0
    shot_on_target_tolerance_m: float = 0.6
    """Marge autour des poteaux pour juger un tir cadré, l'homographie n'étant
    pas exacte au centimètre."""
    shot_off_target_margin_m: float = 3.0
    """Au-delà des poteaux, un ballon qui franchit la ligne de but reste un tir
    manqué ; encore plus loin, c'est un dégagement ou une passe."""
    shot_max_distance_m: float = 30.0
    shot_release_window_seconds: float = 0.40
    """Durée sur laquelle se mesure la direction de la frappe. Trop courte, le
    bruit de détection domine ; trop longue, un rebond fausse la direction."""

    # -- Buts ---------------------------------------------------------------
    goal_crossing_margin_m: float = 0.10
    goal_mouth_tolerance_m: float = 0.30
    goal_restart_window_seconds: float = 45.0
    goal_restart_radius_m: float = 3.0
    """Un but est confirmé par la remise en jeu au centre qui suit."""
    goal_min_samples: int = 2
    """Nombre de positions consécutives du ballon derrière la ligne. Une seule
    pourrait être une erreur d'homographie sur un ballon en hauteur."""
    goal_cooldown_seconds: float = 10.0
    """Deux franchissements rapprochés sont le même but, ballon repris au fond."""
    goal_attribution_window_seconds: float = 8.0
    """Ancienneté maximale de la dernière possession pour désigner un buteur."""

    # -- Passes décisives ---------------------------------------------------
    assist_max_gap_seconds: float = 6.0
    assist_max_hold_seconds: float = 4.0
    """Au-delà, le buteur a construit son but seul : plus de passe décisive."""

    # -- Arrêts et défenses -------------------------------------------------
    deflection_min_angle_deg: float = 45.0
    deflection_radius_m: float = 2.0
    """Un ballon dont la trajectoire casse près d'un défenseur a été touché."""
    goalkeeper_zone_margin_m: float = 1.5
    defense_block_corridor_m: float = 2.5
    interception_progress_m: float = 2.0
    """Une interception ne compte que si le ballon progressait vers le but."""

    # -- Restitution --------------------------------------------------------
    review_confidence_threshold: float = 0.75
    """En dessous, l'événement est marqué comme à vérifier par l'arbitre."""
    clip_seconds_before: float = 5.0
    clip_seconds_after: float = 3.0

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "AnalysisConfig":
        known = {f.name for f in fields(cls)}
        unknown = set(payload) - known
        if unknown:
            raise ValueError(
                "réglages inconnus : " + ", ".join(sorted(unknown))
            )
        return cls(**payload)

    @classmethod
    def load(cls, path: str | Path | None) -> "AnalysisConfig":
        if path is None:
            return cls()
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
