"""Lecture des numéros de dossards.

Un dossard de futsal amateur est lu de biais, à vingt mètres, sur un tissu qui
plisse. Une lecture isolée ne vaut rien ; ce module ne cherche donc pas à être
juste, mais à être *souvent un peu juste*, en produisant des candidats notés que
`numbers.BibResolver` fera voter sur la durée d'une piste.

Trois choix font l'essentiel de la qualité :

* la lecture ne porte que sur le buste, jamais sur la boîte entière ;
* le recadrage est agrandi avant lecture, l'OCR travaillant mal sous 32 pixels ;
* seuls les chiffres sont autorisés, ce qui interdit à l'OCR de proposer « B »
  pour un 8 ou « S » pour un 5.
"""

from __future__ import annotations

from typing import Protocol

from ..scene import BBox


class BibOcr(Protocol):
    def read(self, image: object, bbox: BBox) -> list[tuple[int, float]]: ...


class EasyOcrBibReader:
    """Lecteur de dossards fondé sur EasyOCR."""

    def __init__(
        self,
        use_gpu: bool = True,
        upscale: int = 4,
        min_confidence: float = 0.20,
        max_bib: int = 99,
    ) -> None:
        import easyocr  # import différé

        self.reader = easyocr.Reader(["en"], gpu=use_gpu, verbose=False)
        self.upscale = upscale
        self.min_confidence = min_confidence
        self.max_bib = max_bib

    def read(self, image: object, bbox: BBox) -> list[tuple[int, float]]:
        import cv2

        height, width = image.shape[:2]  # type: ignore[attr-defined]
        x1 = max(0, int(bbox.x1))
        y1 = max(0, int(bbox.y1))
        x2 = min(width, int(bbox.x2))
        y2 = min(height, int(bbox.y2))
        if x2 - x1 < 8 or y2 - y1 < 8:
            return []

        crop = image[y1:y2, x1:x2]  # type: ignore[index]
        enlarged = cv2.resize(
            crop, None, fx=self.upscale, fy=self.upscale, interpolation=cv2.INTER_CUBIC
        )
        grayscale = cv2.cvtColor(enlarged, cv2.COLOR_BGR2GRAY)
        contrasted = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(grayscale)

        candidates: list[tuple[int, float]] = []
        for _, text, confidence in self.reader.readtext(
            contrasted, allowlist="0123456789", detail=1, paragraph=False
        ):
            digits = "".join(character for character in text if character.isdigit())
            if not digits or confidence < self.min_confidence:
                continue
            value = int(digits)
            if 0 < value <= self.max_bib:
                candidates.append((value, float(confidence)))
        return candidates
