"""Lecture des dossards : des lectures bruitées vers une identité stable.

Une lecture OCR isolée sur un dossard flou et de biais est peu fiable. Sur une
piste qui dure trois minutes, on en accumule des centaines : le vote pondéré est
solide même quand la majorité des lectures individuelles sont mauvaises.

Deux contraintes font l'essentiel du travail :

* seuls les numéros de la feuille de match existent — un « 8 » lu alors que
  personne ne porte le 8 est écarté sans discussion ;
* un joueur porte un seul numéro, et un numéro est porté par un seul joueur.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Collection
from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class BibAssignment:
    bib: int
    confidence: float
    """Part du vote total remportée par ce numéro, dans [0, 1]."""
    margin: float
    """Avance sur le deuxième numéro le mieux voté. Une faible avance signale
    une confusion — 6 contre 8, 1 contre 7 — qu'il vaut mieux faire trancher."""
    votes: float


@dataclass(slots=True)
class BibResolver:
    """Accumule les lectures et en tire une attribution par piste."""

    min_confidence: float = 0.35
    min_margin: float = 0.10
    min_votes: float = 2.0
    _votes: dict[int, dict[int, float]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(float))
    )

    def observe(self, track_id: int, bib: int, confidence: float) -> None:
        """Enregistre une lecture. Les lectures peu sûres pèsent peu, pas zéro."""
        if confidence <= 0.0:
            return
        self._votes[track_id][bib] += confidence

    def resolve(
        self, track_id: int, allowed_bibs: Collection[int] | None = None
    ) -> BibAssignment | None:
        """Numéro le mieux voté pour une piste, s'il se détache assez."""
        available = self._available(track_id, allowed_bibs)
        if not available:
            return None
        best = max(available, key=lambda bib: available[bib])
        return self._assess(track_id, best, available)

    def resolve_all(
        self, allowed_bibs: Collection[int] | None = None
    ) -> dict[int, BibAssignment]:
        """Attribution globale : un numéro par piste, une piste par numéro.

        Les couples (piste, numéro) sont servis du mieux voté au moins bien
        voté. L'exclusion mutuelle n'est pas qu'une précaution, elle **résout**
        des ambiguïtés : une piste qui hésitait entre le 4 et le 5 n'hésite plus
        une fois le 4 attribué à quelqu'un de mieux lu. C'est pourquoi la marge
        se recalcule après chaque attribution, sur les seuls numéros encore
        libres, plutôt qu'une fois pour toutes au départ.
        """
        candidates = sorted(
            (
                (score, track_id, bib)
                for track_id, votes in self._votes.items()
                for bib, score in votes.items()
                if allowed_bibs is None or bib in allowed_bibs
            ),
            reverse=True,
        )

        taken: set[int] = set()
        resolved: dict[int, BibAssignment] = {}
        for _, track_id, bib in candidates:
            if track_id in resolved or bib in taken:
                continue
            available = self._available(track_id, allowed_bibs, exclude=taken)
            assignment = self._assess(track_id, bib, available)
            if assignment is None:
                continue
            resolved[track_id] = assignment
            taken.add(bib)
        return resolved

    def _available(
        self,
        track_id: int,
        allowed_bibs: Collection[int] | None,
        exclude: Collection[int] = (),
    ) -> dict[int, float]:
        votes = self._votes.get(track_id, {})
        return {
            bib: score
            for bib, score in votes.items()
            if (allowed_bibs is None or bib in allowed_bibs) and bib not in exclude
        }

    def _assess(
        self, track_id: int, bib: int, available: dict[int, float]
    ) -> BibAssignment | None:
        score = available.get(bib, 0.0)
        total = sum(available.values())
        if total <= 0.0 or score <= 0.0:
            return None
        runner_up = max(
            (value for other, value in available.items() if other != bib), default=0.0
        )
        confidence = score / total
        margin = (score - runner_up) / total
        if (
            score < self.min_votes
            or confidence < self.min_confidence
            or margin < self.min_margin
        ):
            return None
        return BibAssignment(bib, confidence, margin, score)

    def tracks(self) -> list[int]:
        return list(self._votes)
