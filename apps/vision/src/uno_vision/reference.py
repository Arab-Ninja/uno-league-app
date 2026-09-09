"""Repère d'évaluation : mesurer la détection au lieu de l'estimer.

Beaucoup de centres incrustent un tableau d'affichage dans leur vidéo. Il est
tentant d'y lire les buts — c'est facile, c'est exact, et c'est une **impasse** :
tous les centres ne l'affichent pas, le format change de l'un à l'autre, et un
système qui en dépendrait cesserait de fonctionner du jour au lendemain sans
prévenir. Les statistiques ne doivent donc jamais en venir.

En revanche, là où il existe, il donne gratuitement ce qui coûte le plus cher en
vision par ordinateur : une vérité terrain. Savoir qu'un but a été marqué à
20 min 04 permet de mesurer si la détection géométrique l'a vu, plutôt que
d'estimer qu'elle le verrait probablement. Cinq vidéos de centre ont ainsi
fourni 130 buts horodatés, sans annotation manuelle.

C'est tout le rôle de ce module : un repère pour évaluer, jamais une source pour
compter.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True, slots=True)
class ReferenceGoal:
    """Un but attesté par une source extérieure à l'analyse."""

    time_s: float
    side: str
    """Côté du tableau (« A » ou « B »), qui ne correspond pas nécessairement
    aux équipes de la feuille de match : les centres nomment comme ils veulent."""
    score_after: int | None = None
    uncertain: bool = False
    """Vrai quand le repère lui-même a dû interpoler — deux buts trop rapprochés
    pour être distingués, par exemple. À exclure des mesures de précision."""


@dataclass(slots=True)
class ReferenceTimeline:
    """Suite des buts d'une vidéo, telle que le repère la donne."""

    goals: tuple[ReferenceGoal, ...] = ()
    video: str = ""
    source: str = "scoreboard"
    final_score: tuple[int, int] | None = None

    def sides(self) -> dict[str, int]:
        counts = {"A": 0, "B": 0}
        for goal in self.goals:
            counts[goal.side] = counts.get(goal.side, 0) + 1
        return counts

    @property
    def is_consistent(self) -> bool:
        """Le nombre de buts comptés doit reconstituer le score final lu.

        C'est l'autocontrôle du repère : deux mesures indépendantes — la suite
        des changements et l'affichage final — doivent coïncider. Si elles
        divergent, le repère est faux et ne doit servir à rien.
        """
        if self.final_score is None:
            return True
        counts = self.sides()
        return (counts["A"], counts["B"]) == self.final_score

    def to_dict(self) -> dict[str, Any]:
        return {
            "video": self.video,
            "source": self.source,
            "finalScore": list(self.final_score) if self.final_score else None,
            "consistent": self.is_consistent,
            "goals": [
                {
                    "timeMs": round(goal.time_s * 1000),
                    "side": goal.side,
                    "scoreAfter": goal.score_after,
                    "uncertain": goal.uncertain,
                }
                for goal in self.goals
            ],
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "ReferenceTimeline":
        score = payload.get("finalScore")
        return cls(
            goals=tuple(
                ReferenceGoal(
                    time_s=float(item["timeMs"]) / 1000.0,
                    side=str(item["side"]),
                    score_after=item.get("scoreAfter"),
                    uncertain=bool(item.get("uncertain", False)),
                )
                for item in payload.get("goals", [])
            ),
            video=payload.get("video", ""),
            source=payload.get("source", "scoreboard"),
            final_score=(int(score[0]), int(score[1])) if score else None,
        )

    @classmethod
    def load(cls, path: str | Path) -> "ReferenceTimeline":
        return cls.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))

    def save(self, path: str | Path) -> None:
        Path(path).write_text(
            json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )


@dataclass(slots=True)
class GoalComparison:
    """Ce que la détection a vu, manqué et inventé, face au repère."""

    matched: list[tuple[float, float]] = field(default_factory=list)
    """Couples (instant détecté, instant de référence)."""
    missed: list[ReferenceGoal] = field(default_factory=list)
    spurious: list[float] = field(default_factory=list)

    @property
    def recall(self) -> float:
        total = len(self.matched) + len(self.missed)
        return len(self.matched) / total if total else 0.0

    @property
    def precision(self) -> float:
        total = len(self.matched) + len(self.spurious)
        return len(self.matched) / total if total else 0.0

    @property
    def mean_delay_s(self) -> float:
        """Décalage moyen entre détection et repère, signé.

        Un décalage systématique n'est pas une erreur de détection : le tableau
        est mis à jour à la main par un employé du centre, avec quelques
        secondes de retard sur le but.
        """
        if not self.matched:
            return 0.0
        return sum(found - truth for found, truth in self.matched) / len(self.matched)

    def summary(self) -> str:
        return (
            f"{len(self.matched)} buts retrouvés, {len(self.missed)} manqués, "
            f"{len(self.spurious)} imaginés — rappel {100 * self.recall:.0f} %, "
            f"précision {100 * self.precision:.0f} %, "
            f"décalage moyen {self.mean_delay_s:+.1f} s"
        )


def compare_goals(
    detected_times_s: Sequence[float],
    reference: ReferenceTimeline,
    tolerance_s: float = 20.0,
) -> GoalComparison:
    """Confronte les buts détectés au repère.

    La tolérance est large à dessein. Le tableau d'un centre est actionné par un
    employé qui n'est pas chronométreur : il valide le but quelques secondes
    après, parfois pendant la remise en jeu. Serrer la fenêtre ne mesurerait
    plus la détection mais les réflexes de la personne au bord du terrain.

    L'appariement est glouton par écart croissant, ce qui garantit qu'un but
    détecté ne peut pas être compté deux fois — sans quoi le rappel dépasserait
    joyeusement 100 % sur les séries de buts rapprochés.
    """
    candidates = sorted(
        (
            (abs(found - goal.time_s), index, position, found, goal)
            for position, found in enumerate(detected_times_s)
            for index, goal in enumerate(reference.goals)
            if abs(found - goal.time_s) <= tolerance_s
        ),
        key=lambda item: item[0],
    )

    used_goals: set[int] = set()
    used_detections: set[int] = set()
    comparison = GoalComparison()
    for _, index, position, found, goal in candidates:
        if index in used_goals or position in used_detections:
            continue
        used_goals.add(index)
        used_detections.add(position)
        comparison.matched.append((found, goal.time_s))

    comparison.missed = [
        goal for index, goal in enumerate(reference.goals) if index not in used_goals
    ]
    comparison.spurious = [
        found
        for position, found in enumerate(detected_times_s)
        if position not in used_detections
    ]
    comparison.matched.sort(key=lambda pair: pair[1])
    return comparison
