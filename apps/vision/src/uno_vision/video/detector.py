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
    def detect(self, image: object, image_size: int | None = None) -> list[Detection]: ...


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

    def detect(self, image: object, image_size: int | None = None) -> list[Detection]:
        results = self.model.predict(
            source=image,
            imgsz=image_size or self.image_size,
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
    """Recherche du ballon par découpage et agrandissement de l'image.

    Sur un plan large, le ballon occupe une dizaine de pixels : redimensionné en
    640×640 avec toute l'image, il disparaît purement et simplement.

    Le gain vient de l'agrandissement, pas du découpage : `detector` doit
    analyser à une résolution **supérieure** à `tile_size`, faute de quoi le
    ballon garde sa taille d'origine dans l'entrée du réseau et l'opération ne
    sert qu'à multiplier les inférences. Une tuile de 640 px analysée à 1280
    double la taille du ballon ; analysée à 640, elle ne change rien.

    Le coût est d'autant d'inférences que de tuiles — d'où la fenêtre de
    recherche autour de la dernière position connue, qui le ramène à une seule
    tuile dans le cas courant.
    """

    def __init__(
        self,
        detector: Detector,
        tile_size: int = 640,
        overlap: float = 0.2,
        inference_size: int = 1280,
    ) -> None:
        if inference_size <= tile_size:
            raise ValueError(
                f"analyser une tuile de {tile_size} px à {inference_size} px "
                "n'agrandit rien : le ballon garderait sa taille d'origine dans "
                "l'entrée du réseau, pour six fois plus d'inférences. Mesuré sur "
                "de vraies images : 39 % d'images avec ballon en plan large, "
                "40 % en tuiles non agrandies."
            )
        self.detector = detector
        self.tile_size = tile_size
        self.overlap = overlap
        self.inference_size = inference_size

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
            detections = [
                d
                for d in self.detector.detect(crop, self.inference_size)
                if d.label == BALL
            ]
            found.extend(offset_detections(detections, x, y))
        return merge_tiled_detections(found)

    def _window(self, around: BBox, width: int, height: int) -> tuple[int, int, int, int]:
        center = around.center
        half = self.tile_size // 2
        x = int(max(0, min(width - self.tile_size, center.x - half)))
        y = int(max(0, min(height - self.tile_size, center.y - half)))
        return x, y, min(self.tile_size, width - x), min(self.tile_size, height - y)
