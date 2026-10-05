"""Pose les boîtes d'impression du flyer : format exact et format fini.

Chromium arrondit la taille de page au pixel : 154 × 216 mm sortaient en
154,18 × 215,9 mm. Ce script fixe la page (MediaBox, BleedBox) à 154 × 216 mm
pile et déclare le format fini (TrimBox) à 148 × 210 mm, 3 mm à l'intérieur :
c'est ce que lit le contrôle automatique des imprimeurs en ligne.
"""
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

PT = 72 / 25.4
chemin = sys.argv[1]
lecteur = PdfReader(chemin)
ecrivain = PdfWriter()
for page in lecteur.pages:
    haut = float(page.mediabox.top)
    page.mediabox = RectangleObject([0, haut - 216 * PT, 154 * PT, haut])
    page.bleedbox = page.mediabox
    page.trimbox = RectangleObject([3 * PT, haut - 213 * PT, 151 * PT, haut - 3 * PT])
    ecrivain.add_page(page)
with open(chemin, "wb") as sortie:
    ecrivain.write(sortie)
