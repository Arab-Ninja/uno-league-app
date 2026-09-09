"""Mesure de la couleur d'une chasuble sur une image."""

from __future__ import annotations

from ..scene import BBox

Rgb = tuple[int, int, int]


def torso_color(image: object, bbox: BBox, min_saturation: int = 40) -> Rgb | None:
    """Couleur dominante du buste d'un joueur, en RVB.

    On prend la **médiane** et non la moyenne : un bras qui passe devant, une
    ligne blanche du sol ou un reflet de projecteur décalent une moyenne, pas
    une médiane. Les pixels trop peu saturés sont écartés d'abord — ce sont la
    peau, les cheveux et le parquet, qui ne disent rien de l'équipe. S'il n'en
    reste pas assez, c'est que la chasuble est blanche, grise ou noire : on
    reprend alors tous les pixels, la luminosité suffira à trancher.
    """
    import cv2
    import numpy as np

    height, width = image.shape[:2]  # type: ignore[attr-defined]
    x1 = max(0, int(bbox.x1))
    y1 = max(0, int(bbox.y1))
    x2 = min(width, int(bbox.x2))
    y2 = min(height, int(bbox.y2))
    if x2 - x1 < 3 or y2 - y1 < 3:
        return None

    crop = image[y1:y2, x1:x2]  # type: ignore[index]
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    mask = hsv[:, :, 1] >= min_saturation
    pixels = crop[mask] if mask.sum() >= 0.15 * mask.size else crop.reshape(-1, 3)
    if pixels.size == 0:
        return None

    blue, green, red = (int(v) for v in np.median(pixels, axis=0))
    return (red, green, blue)
