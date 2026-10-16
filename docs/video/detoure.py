#!/usr/bin/env python3
"""Détoure le portrait de la carte joueur pour la publicité « La saison ».

    node docs/video/rendu.mjs --fond-or      # carte/fond-or.png
    python3 docs/video/detoure.py            # img/portrait.png

Le seul portrait du dépôt est dans `docs/flyer/img/etape-carte.jpg`, une
capture de la carte or. Le fond derrière lui n'est pas quelconque : c'est la
partie haute d'une carte or, dégradé et filigrane « UNO » compris.
`carte/fond-or.html` la redessine vide, à la même échelle, et Chromium la rend
à moins d'un niveau près de la capture. L'écart entre les deux donne
l'opacité du portrait, et on en retire la teinte or mêlée aux bords : la
carte peut passer en bronze ou en argent sans garder de liseré doré.

Le visage est celui d'un compte de démonstration : fictif.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ICI = Path(__file__).resolve().parent
SOURCE = ICI.parent / "flyer" / "img" / "etape-carte.jpg"
FOND = ICI / "carte" / "fond-or.png"
SORTIE = ICI / "img" / "portrait.png"

im = np.asarray(Image.open(SOURCE).convert("RGB")).astype(float)

# La carte de 270 × 430 est capturée à l'échelle 3, bord gauche en x = 60,
# sommet en y = 60 ; sa partie haute occupe 54 % de la hauteur. Le rendu du
# fond place la carte 3 pixels plus bas.
X0, Y0, ECHELLE, DECALAGE = 60.0, 60.0, 3.0, 3
LARGEUR, HAUT = 270 * ECHELLE, 0.54 * 430 * ECHELLE

# Le cadre de la photo : à droite, en bas de la partie haute, 68 % × 78 %.
px1, py1 = int(round(X0 + LARGEUR)), int(round(Y0 + HAUT))
px0, py0 = int(round(px1 - 0.68 * LARGEUR)), int(round(py1 - 0.78 * HAUT))
C = im[py0:py1, px0:px1]
fond = np.asarray(Image.open(FOND).convert("RGB")).astype(float)
B = fond[py0 + DECALAGE : py1 + DECALAGE, px0:px1]

# La carte estompe la photo : transparente au bord gauche, pleine à 26 % de
# sa largeur ; pleine jusqu'à 72 % de sa hauteur, transparente en bas.
h, w = C.shape[:2]
xr = (np.arange(w) + 0.5) / w
yr = (np.arange(h) + 0.5) / h
fondu = np.clip(xr / 0.26, 0, 1)[None, :] * np.clip((1 - yr) / 0.28, 0, 1)[:, None]

# L'écart au fond, ramené à ce qu'il était avant le fondu.
D = np.linalg.norm(C - B, axis=2)
Dn = D / np.maximum(fondu, 0.08)

# Le joueur : tout ce qui s'écarte nettement du fond, trous bouchés (les reflets
# sur la peau sont proches de l'or, ils restent pleins), plus grande pièce seule.
plein = (Dn > 30) & (fondu > 0.05)
plein = ndimage.binary_closing(plein, iterations=3)
etiquettes, n = ndimage.label(plein)
tailles = ndimage.sum(plein, etiquettes, range(1, n + 1))
plein = etiquettes == (1 + int(np.argmax(tailles)))
plein = ndimage.binary_fill_holes(plein)

# Bords : opacité tirée de l'écart, sur une bande de quelques pixels ; dedans, plein.
interieur = ndimage.binary_erosion(plein, iterations=3)
detour = np.where(interieur, 1.0, np.clip((Dn - 12) / 70, 0, 1) * ndimage.binary_dilation(plein, iterations=2))
detour = ndimage.gaussian_filter(detour, 0.7)

# Le portrait garde le fondu de la carte : posé dans une carte bronze ou
# argent, il s'y fond exactement comme l'application le fait.
alpha = detour * fondu

# On retire la part de fond mêlée à chaque pixel.
a = np.maximum(alpha, 0.04)[..., None]
F = np.clip(B + (C - B) / a, 0, 255)

rgba = np.dstack([F, alpha * 255]).astype(np.uint8)
SORTIE.parent.mkdir(exist_ok=True)
Image.fromarray(rgba, "RGBA").save(SORTIE, optimize=True)
print(SORTIE, rgba.shape[1], "×", rgba.shape[0])
