"""Détection des joueurs et du ballon.

Deux modèles peuvent servir, et le choix se fait par un simple chemin de poids :

* un YOLO généraliste pré-entraîné sur COCO, qui connaît déjà `person` et
  `sports ball` — c'est le point de départ, sans aucune annotation à produire ;
* un modèle affiné sur des images de futsal amateur, qui distingue en plus le
  gardien et l'arbitre — c'est la suite, une fois quelques sessions annotées.

Le reste de la chaîne ne fait pas la différence : les deux produisent des
`Detection` étiquetées `player` ou `ball`.
"""

from __future__ import annotations

from typing import Protocol

from ..boxes import merge_tiled_detections, offset_detections, tile_grid
from ..scene import BALL, PLAYER, BBox, Detection

# Correspondance des classes vers le vocabulaire du projet. Les noms COCO et
# ceux d'un modèle affiné y coexistent : un modèle qui sort « goalkeeper » donne
# un joueur, l'information de poste étant portée par la feuille de match.
CLASS_ALIASES: dict[str, str] = {
    "person": PLAYER,
    "player": PLAYER,
    "goalkeeper": PLAYER,
    "sports ball": BALL,
    "ball": BALL,
}


class Detector(Protocol):
    def detect(self, image: object) -> list[Detection]: ...


class YoloDetector:
    """Détecteur Ultralytics."""

    def __init__(
        self,
        weights: str = "yolov8m.pt",
        device: str | None = None,
        image_size: int = 960,
        confidence: float = 0.10,
        half: bool = True,
    ) -> None:
        from ultralytics import YOLO  # import différé : PyTorch pèse plus d'un Go

        self.model = YOLO(weights)
        self.device = device
        self.image_size = image_size
        self.confidence = confidence
        self.half = half
        self.names: dict[int, str] = dict(self.model.names)

    def detect(self, image: object) -> list[Detection]:
        results = self.model.predict(
            source=image,
            imgsz=self.image_size,
            conf=self.confidence,
            device=self.device,
            half=self.half,
            verbose=False,
        )
        detections: list[Detection] = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                continue
            for box in boxes:
                class_id = int(box.cls.item())
                label = CLASS_ALIASES.get(self.names.get(class_id, ""), None)
                if label is None:
                    continue
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0].tolist())
                detections.append(
                    Detection(BBox(x1, y1, x2, y2), float(box.conf.item()), label)
                )
        return detections


class TiledBallSearch:
    """Recherche du ballon par découpage de l'image.

    Sur un plan large, le ballon occupe une dizaine de pixels : redimensionné en
    640×640, il disparaît purement et simplement. Le découper en tuiles lui rend
    une taille détectable, au prix d'autant d'inférences que de tuiles — d'où la
    fenêtre de recherche autour de la dernière position connue, qui ramène le
    coût à une seule tuile dans le cas courant.
    """

    def __init__(self, detector: Detector, tile_size: int = 640, overlap: float = 0.2) -> None:
        self.detector = detector
        self.tile_size = tile_size
        self.overlap = overlap

    def search(
        self, image: object, around: BBox | None = None
    ) -> list[Detection]:
        height, width = image.shape[:2]  # type: ignore[attr-defined]
        if around is not None:
            tiles = [self._window(around, width, height)]
        else:
            tiles = tile_grid(width, height, self.tile_size, self.overlap)

        found: list[Detection] = []
        for x, y, tile_width, tile_height in tiles:
            crop = image[y : y + tile_height, x : x + tile_width]  # type: ignore[index]
            detections = [d for d in self.detector.detect(crop) if d.label == BALL]
            found.extend(offset_detections(detections, x, y))
        return merge_tiled_detections(found)

    def _window(self, around: BBox, width: int, height: int) -> tuple[int, int, int, int]:
        center = around.center
        half = self.tile_size // 2
        x = int(max(0, min(width - self.tile_size, center.x - half)))
        y = int(max(0, min(height - self.tile_size, center.y - half)))
        return x, y, min(self.tile_size, width - x), min(self.tile_size, height - y)
