"""Dessine les cartons du film en 1920 x 1080 : divisions, question finale, carton de fin.

    python3 docs/publicite/cartons.py <dossier de sortie>

Les polices sont celles de l'application (apps/web/public/fonts), l'écusson
celui de docs/branding : la pub parle la même langue visuelle que l'app.
"""

import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

REPO = pathlib.Path(__file__).resolve().parents[2]
FONTS = REPO / "apps/web/public/fonts"
CREST = REPO / "docs/branding/crest.png"

W, H = 1920, 1080
BLANC = (245, 245, 240)
GRIS = (170, 176, 190)
ORANGE = (249, 115, 22)  # #F97316, l'accent de la marque
NUIT = (0, 0, 0)  # noir pur : les cartons se fondent dans les bandes cinéma


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


CONDENSE = "barlow-condensed-latin-800-normal.woff2"
GRAS = "barlow-latin-700.woff2"
NORMAL = "barlow-latin-400.woff2"


def spaced(draw, xy, text, fnt, fill, tracking=0):
    """Texte centré sur xy, avec un interlettrage en pixels."""
    widths = [draw.textlength(c, font=fnt) for c in text]
    x = xy[0] - (sum(widths) + tracking * (len(text) - 1)) / 2
    for c, w in zip(text, widths):
        draw.text((x, xy[1]), c, font=fnt, fill=fill, anchor="lm")
        x += w + tracking


def division(out, name, big, small, color=BLANC):
    im = Image.new("RGB", (W, H), NUIT)
    d = ImageDraw.Draw(im)
    d.text((W / 2, H / 2 - 50), big, font=font(CONDENSE, 480), fill=color, anchor="mm")
    spaced(d, (W / 2, H / 2 + 240), small, font(GRAS, 52), BLANC, tracking=20)
    im.save(out / f"{name}.png")


def question(out):
    im = Image.new("RGB", (W, H), NUIT)
    d = ImageDraw.Draw(im)
    # Espace insécable avant le point d'interrogation, comme en typographie française.
    d.text((W / 2, H / 2), "ALORS, TU RESTES ?", font=font(CONDENSE, 170), fill=BLANC, anchor="mm")
    im.save(out / "question.png")


def fin(out):
    im = Image.new("RGB", (W, H), NUIT)
    d = ImageDraw.Draw(im)
    crest = Image.open(CREST).convert("RGBA")
    ch = 380
    crest = crest.resize((round(crest.width * ch / crest.height), ch), Image.LANCZOS)
    im.paste(crest, ((W - crest.width) // 2, 150), crest)
    f_nom = font(CONDENSE, 170)
    uno, league = "UNO ", "LEAGUE"
    wu, wl = d.textlength(uno, font=f_nom), d.textlength(league, font=f_nom)
    x0 = (W - wu - wl) / 2
    d.text((x0, 655), uno, font=f_nom, fill=BLANC, anchor="lm")
    d.text((x0 + wu, 655), league, font=f_nom, fill=ORANGE, anchor="lm")
    spaced(d, (W / 2, 800), "JOUE. GRIMPE. GAGNE.", font(GRAS, 56), BLANC, tracking=16)
    spaced(d, (W / 2, 905), "FUTSAL 5 CONTRE 5  ·  BRUXELLES  ·  UNOLEAGUE.BE", font(NORMAL, 32), GRIS, tracking=6)
    im.save(out / "fin.png")


def main():
    out = pathlib.Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    division(out, "d3", "D3", "DIVISION 3")
    division(out, "d2", "D2", "DIVISION 2")
    division(out, "d1", "D1", "DIVISION 1", color=ORANGE)
    question(out)
    fin(out)
    planche = Image.new("RGB", (W, H))
    for i, n in enumerate(["d3", "d1", "question", "fin"]):
        planche.paste(Image.open(out / f"{n}.png").resize((W // 2, H // 2)), ((i % 2) * W // 2, (i // 2) * H // 2))
    planche.save(out / "_planche.jpg", quality=85)


if __name__ == "__main__":
    main()
