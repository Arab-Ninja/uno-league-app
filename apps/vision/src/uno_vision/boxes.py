"""Opérations sur les boîtes : suppression des doublons, fusion des tuiles.

Le ballon de futsal fait une quinzaine de pixels sur un plan large en 1080p.
Un détecteur qui reçoit l'image entière redimensionnée en 640×640 ne le voit
tout simplement plus. La parade est de découper l'image en tuiles qui se
recouvrent et de détecter dans chacune : le ballon y retrouve une taille
normale. Il faut alors recoller les résultats, ce que fait ce module.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence

from .scene import BBox, Detection


def non_max_suppression(
    detections: Sequence[Detection], iou_threshold: float = 0.45
) -> list[Detection]:
    """Ne garde, parmi des boîtes qui se recouvrent, que la mieux notée."""
    kept: list[Detection] = []
    for detection in sorted(detections, key=lambda d: d.score, reverse=True):
        if any(
            detection.label == other.label
            and detection.bbox.iou(other.bbox) > iou_threshold
            for other in kept
        ):
            continue
        kept.append(detection)
    return kept


def tile_grid(
    width: int, height: int, tile_size: int, overlap: float = 0.2
) -> list[tuple[int, int, int, int]]:
    """Découpe une image en tuiles qui se recouvrent.

    Le recouvrement garantit qu'un objet à cheval sur deux tuiles est vu entier
    par au moins une d'elles — sans lui, un ballon sur une couture serait coupé
    en deux et manqué par les deux tuiles.
    """
    if tile_size <= 0:
        raise ValueError("taille de tuile invalide")
    if not (0.0 <= overlap < 1.0):
        raise ValueError("le recouvrement est une fraction dans [0, 1[")

    step = max(1, int(tile_size * (1.0 - overlap)))
    tiles: list[tuple[int, int, int, int]] = []
    ys = list(range(0, max(1, height - tile_size + 1), step))
    xs = list(range(0, max(1, width - tile_size + 1), step))
    if ys[-1] + tile_size < height:
        ys.append(max(0, height - tile_size))
    if xs[-1] + tile_size < width:
        xs.append(max(0, width - tile_size))
    for y in ys:
        for x in xs:
            tiles.append((x, y, min(tile_size, width - x), min(tile_size, height - y)))
    return tiles


def offset_detections(
    detections: Iterable[Detection], offset_x: float, offset_y: float
) -> list[Detection]:
    """Replace des détections faites dans une tuile dans le repère de l'image."""
    return [
        Detection(
            BBox(
                d.bbox.x1 + offset_x,
                d.bbox.y1 + offset_y,
                d.bbox.x2 + offset_x,
                d.bbox.y2 + offset_y,
            ),
            d.score,
            d.label,
        )
        for d in detections
    ]


def merge_tiled_detections(
    detections: Sequence[Detection], iou_threshold: float = 0.4
) -> list[Detection]:
    """Fusionne les détections de toutes les tuiles en une liste propre."""
    return non_max_suppression(detections, iou_threshold)


def best_detection(
    detections: Sequence[Detection], label: str, min_score: float
) -> Detection | None:
    """Meilleure détection d'une classe donnée, au-dessus d'un seuil.

    Un match de futsal n'a qu'un ballon : quand plusieurs candidats sortent, le
    plus sûr est le bon, et les autres sont des reflets ou des têtes.
    """
    candidates = [d for d in detections if d.label == label and d.score >= min_score]
    if not candidates:
        return None
    return max(candidates, key=lambda d: d.score)
