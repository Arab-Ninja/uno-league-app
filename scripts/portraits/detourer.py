"""Retire le damier de transparence aplati dans les portraits fournis.

Les fichiers reçus sont des exports où le damier gris/blanc — celui que les
visionneuses dessinent *derrière* une image transparente — a été aplati dans
les pixels. Posés tels quels sur une carte, ils afficheraient un carrelage.

Reconnaître le damier au ton seul ne suffit pas : un maillot blanc touche le
bord de l'image et a exactement la couleur des cases claires, si bien qu'un
simple remplissage lui mange l'épaule. On exige donc en plus que la case
voisine, quinze pixels plus loin, porte l'*autre* ton — ce qu'un aplat de
maillot ne fait jamais.
"""

import sys
from collections import deque

from PIL import Image, ImageFilter

CASE = 15
TOL = 20          # tolérance sur le ton attendu
TOL_HALO = 44     # plus large au contact du fond trouvé : mange la frange
EPAISSEUR_FRANGE = 2  # et pas un pixel de plus : voir le second passage


def detourer(source: str, cible: str, taille: int = 512) -> None:
    im = Image.open(source).convert("RGB")
    w, h = im.size
    px = im.load()

    ton_a = px[0, 0]
    ton_b = px[CASE, 0]
    if ton_a == ton_b:                      # coin à cheval sur deux cases
        ton_b = px[0, CASE]

    def attendu(x: int, y: int):
        return ton_a if ((x // CASE) + (y // CASE)) % 2 == 0 else ton_b

    def ecart(p, q):
        return max(abs(p[0] - q[0]), abs(p[1] - q[1]), abs(p[2] - q[2]))

    def damier(x: int, y: int) -> bool:
        """Vrai si le pixel porte le ton attendu *et* qu'au moins deux cases
        voisines portent l'autre.

        Une seule voisine ne suffit pas : le bord d'un maillot blanc collé au
        damier en a justement une, et le fond se mettait alors à ronger
        l'épaule. Le vrai damier, lui, en a presque toujours trois ou quatre —
        deux est le seuil qui sépare les deux cas sans rogner la frontière du
        sujet, où une ou deux voisines tombent dans le visage.
        """
        if ecart(px[x, y], attendu(x, y)) > TOL:
            return False
        autre = ton_b if attendu(x, y) == ton_a else ton_a
        vues = 0
        for dx, dy in ((CASE, 0), (-CASE, 0), (0, CASE), (0, -CASE)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and ecart(px[nx, ny], autre) <= TOL:
                vues += 1
                if vues == 2:
                    return True
        return False

    fond = bytearray(w * h)
    file = deque()

    for x in range(w):
        for y in (0, h - 1):
            if damier(x, y):
                fond[y * w + x] = 1
                file.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not fond[y * w + x] and damier(x, y):
                fond[y * w + x] = 1
                file.append((x, y))

    # Propagation stricte : seul du vrai damier étend le fond.
    while file:
        x, y = file.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not fond[ny * w + nx] and damier(nx, ny):
                fond[ny * w + nx] = 1
                file.append((nx, ny))

    # Second passage, tolérant mais *borné*. La frange anticrénelée mélange le
    # sujet et le damier : elle ne ressemble exactement à aucun des deux tons,
    # et une tolérance large est nécessaire pour l'attraper. Laisser ce
    # passage se propager librement serait cependant fatal — il remonterait le
    # long d'un maillot blanc jusqu'à découper une épaule. Deux pixels
    # suffisent à la frange, et rien de plus n'est accordé.
    for _ in range(EPAISSEUR_FRANGE):
        ajout = [
            (x, y)
            for y in range(h)
            for x in range(w)
            if not fond[y * w + x]
            and ecart(px[x, y], attendu(x, y)) <= TOL_HALO
            and any(
                0 <= x + dx < w and 0 <= y + dy < h and fond[(y + dy) * w + x + dx]
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
            )
        ]
        for x, y in ajout:
            fond[y * w + x] = 1

    alpha = Image.frombytes("L", (w, h), bytes(0 if f else 255 for f in fond))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.7))

    sortie = im.convert("RGBA")
    sortie.putalpha(alpha)
    sortie = sortie.resize((taille, taille), Image.LANCZOS)
    sortie.save(cible, optimize=True)

    opaques = sum(1 for v in alpha.tobytes() if v > 200)
    print(f"{source} → {cible} : sujet {opaques * 100 // (w * h)} % de la surface")


if __name__ == "__main__":
    detourer(sys.argv[1], sys.argv[2])
