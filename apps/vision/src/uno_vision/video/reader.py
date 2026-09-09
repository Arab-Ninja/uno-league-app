"""Lecture d'une vidéo image par image."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class VideoMeta:
    fps: float
    frame_count: int
    width: int
    height: int


class VideoStream:
    """Itérateur d'images, avec un pas configurable.

    Le pas est un compromis assumé : à 25 images par seconde on suit un ballon
    frappé à 25 m/s (un mètre entre deux images) ; une image sur deux le fait
    sauter de deux mètres, ce qui reste exploitable pour la possession mais
    dégrade la direction des tirs. On ne descend donc pas en dessous de 12 ou 15
    images par seconde effectives.
    """

    def __init__(self, path: str | Path, stride: int = 1) -> None:
        import cv2  # import différé : OpenCV n'est requis que pour la vidéo

        self.path = str(path)
        if not Path(self.path).exists():
            raise FileNotFoundError(f"vidéo introuvable : {self.path}")
        self.stride = max(1, stride)
        self._capture = cv2.VideoCapture(self.path)
        if not self._capture.isOpened():
            raise RuntimeError(f"impossible d'ouvrir la vidéo : {self.path}")
        self.meta = VideoMeta(
            fps=float(self._capture.get(cv2.CAP_PROP_FPS)) or 25.0,
            frame_count=int(self._capture.get(cv2.CAP_PROP_FRAME_COUNT)),
            width=int(self._capture.get(cv2.CAP_PROP_FRAME_WIDTH)),
            height=int(self._capture.get(cv2.CAP_PROP_FRAME_HEIGHT)),
        )

    def __iter__(self) -> Iterator[tuple[int, float, object]]:
        """Produit `(index, instant en secondes, image BGR)`."""
        index = 0
        while True:
            ok, image = self._capture.read()
            if not ok:
                break
            if index % self.stride == 0:
                yield index, index / self.meta.fps, image
            index += 1

    def close(self) -> None:
        self._capture.release()

    def __enter__(self) -> "VideoStream":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()
