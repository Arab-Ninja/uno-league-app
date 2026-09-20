"""Engendre toute la famille de la marque à partir d'une seule géométrie.

**Pourquoi un script plutôt que six fichiers tenus à la main.** L'écusson, sa
version monochrome, la tuile d'application, la tuile rognable et le badge des
notifications sont le même dessin à cinq échelles et trois habillages. Écrits
séparément, ils divergent au premier ajustement — et l'on s'en aperçoit le
jour où l'icône du téléphone ne ressemble plus au favori de l'onglet.

Le pentagone du ballon est **calculé**, jamais recopié : dessiné à la main il
penche toujours un peu, et c'est la première chose que l'œil voit.
"""

import io
import math
import pathlib

NAVY = "#0F172A"
ORANGE = "#F97316"
BLANC = "#fff"

RACINE = pathlib.Path(__file__).parent

# L'écusson : la forme que porte toute ligue de football.
ECUSSON = "M32 5 56 12.5V32c0 13.6-10.2 22.4-24 27C18.2 54.4 8 45.6 8 32V12.5Z"


def pentagone(cx: float, cy: float, r: float) -> tuple[str, list[tuple[float, float]]]:
    """Le pentagone central du ballon, pointe en haut, et ses sommets."""
    rp = r * 0.54
    sommets = [
        (cx + rp * math.cos(math.radians(a)), cy + rp * math.sin(math.radians(a)))
        for a in (-90, -18, 54, 126, 198)
    ]
    return "M" + " ".join(f"{x:.2f} {y:.2f}" for x, y in sommets) + "Z", sommets


def coutures(cx: float, cy: float, r: float, sommets) -> list[str]:
    """Les cinq coutures, du pentagone vers le bord du ballon."""
    rp = r * 0.54
    traits = []
    for x, y in sommets:
        ux, uy = (x - cx) / rp, (y - cy) / rp
        traits.append(f"M{x:.2f} {y:.2f} {cx + ux * r:.2f} {cy + uy * r:.2f}")
    return traits


def ballon(cx=32.0, cy=30.0, r=13.0, centre=ORANGE, trait=NAVY) -> str:
    d, sommets = pentagone(cx, cy, r)
    lignes = "".join(f'<path d="{t}"/>' for t in coutures(cx, cy, r, sommets))
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{BLANC}"/>'
        f'<path d="{d}" fill="{centre}"/>'
        f'<g stroke="{trait}" stroke-width="{r * 0.155:.2f}" stroke-linecap="round">'
        f"{lignes}</g>"
    )


def svg(corps: str, vb="0 0 64 64", titre="UNO League") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" '
        f'aria-label="{titre}">\n  <title>{titre}</title>\n  {corps}\n</svg>\n'
    )


def ecusson(fill=NAVY, stroke=ORANGE, largeur=3.5) -> str:
    return (
        f'<path d="{ECUSSON}" fill="{fill}" stroke="{stroke}" '
        f'stroke-width="{largeur}" stroke-linejoin="round"/>'
    )


FICHIERS: dict[str, str] = {}

# --- L'écusson, en couleurs ------------------------------------------------
FICHIERS["mark.svg"] = svg(ecusson() + ballon())

# --- Une seule encre -------------------------------------------------------
#
# Le ballon est **évidé** dans l'écusson, puis ses coutures y sont remises.
# Posé par-dessus, il disparaîtrait : deux formes de la même couleur, l'une
# sur l'autre, ne font qu'une tache.
_d, _s = pentagone(32, 30, 13)
_traits = "".join(f'<path d="{t}"/>' for t in coutures(32, 30, 13, _s))
FICHIERS["mark-mono.svg"] = svg(
    '<mask id="uno-ballon">'
    '<rect width="64" height="64" fill="#fff"/>'
    '<circle cx="32" cy="30" r="13" fill="#000"/>'
    f'<path d="{_d}" fill="#fff"/>'
    f'<g stroke="#fff" stroke-width="2.02" stroke-linecap="round">{_traits}</g>'
    "</mask>"
    f'<path d="{ECUSSON}" fill="currentColor" mask="url(#uno-ballon)"/>'
)

# --- Les tuiles d'application ---------------------------------------------
#
# `icon` garde une marge que les systèmes arrondissent ; `icon-maskable` en
# garde davantage, parce qu'ils ont le droit d'y découper un cercle : tout ce
# qui compte doit tenir dans les 66 % du centre.
_marque = ecusson() + ballon()
FICHIERS["icon.svg"] = svg(
    f'<rect width="512" height="512" rx="112" fill="{NAVY}"/>'
    f'<g transform="translate(96 96) scale(5)">{_marque}</g>',
    vb="0 0 512 512",
)
FICHIERS["icon-maskable.svg"] = svg(
    f'<rect width="512" height="512" fill="{NAVY}"/>'
    f'<g transform="translate(134 134) scale(3.85)">{_marque}</g>',
    vb="0 0 512 512",
)

# --- Le badge des notifications -------------------------------------------
#
# Android n'en garde que la silhouette, reteinte en blanc. Pas de couleur, pas
# de dégradé : seulement une forme qui se reconnaît à seize pixels.
FICHIERS["badge.svg"] = svg(
    '<mask id="uno-badge">'
    '<rect width="64" height="64" fill="#fff"/>'
    '<circle cx="32" cy="30" r="13" fill="#000"/>'
    f'<path d="{_d}" fill="#fff"/>'
    f'<g stroke="#fff" stroke-width="2.02" stroke-linecap="round">{_traits}</g>'
    "</mask>"
    f'<path d="{ECUSSON}" fill="#fff" mask="url(#uno-badge)"/>'
)

# --- Le fond d'une icône adaptative Android -------------------------------
FICHIERS["fond.svg"] = svg(f'<rect width="64" height="64" fill="{NAVY}"/>')


def main() -> None:
    for nom, contenu in FICHIERS.items():
        (RACINE / nom).write_text(contenu, encoding="utf-8")
        print(f"{nom:<22} {len(contenu):>5} o")


if __name__ == "__main__":
    main()
