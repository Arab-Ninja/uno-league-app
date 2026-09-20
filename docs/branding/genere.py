"""Engendre toute la famille de la marque à partir d'une seule géométrie.

**Pourquoi un script plutôt que huit fichiers tenus à la main.** L'écusson, sa
version monochrome, la tuile d'application, la tuile rognable, le badge des
notifications, le favori du site et le composant React sont le même dessin à
cinq échelles et trois habillages. Écrits séparément, ils divergent au premier
ajustement — et l'on s'en aperçoit le jour où l'icône du téléphone ne
ressemble plus au favori de l'onglet.

Le pentagone du ballon est **calculé**, jamais recopié : dessiné à la main il
penche toujours un peu, et c'est la première chose que l'œil voit. La flamme,
elle, est tracée : une courbe qui doit avoir l'air vivante ne se calcule pas.
"""

import math
import pathlib
import shutil
import subprocess

NAVY = "#0F172A"
ORANGE = "#F97316"

RACINE = pathlib.Path(__file__).resolve().parent
DEPOT = RACINE.parent.parent

# L'écusson : la forme que porte toute ligue de football.
ECUSSON = "M32 5 56 12.5V32c0 13.6-10.2 22.4-24 27C18.2 54.4 8 45.6 8 32V12.5Z"

# La flamme, décrite une fois dans la boîte de 64, puis posée à l'échelle.
# Un corps bombé, une pointe haute, un décroché à gauche et une langue à
# droite. **D'un seul tenant** : trois langues séparées font une couronne ou
# un trident, jamais un feu — c'est l'essai qui a coûté un tour de dessin.
FLAMME = ("M32 45 C21 41 18.5 31 25 22.5 C25.8 27 28 28 29.2 26 "
          "C30.8 20 27.5 15.5 30 9 C35 15 40.5 18.5 41 26.5 "
          "C42.5 23.5 43 21.5 43.2 19 C46.5 26 46 38 32 45 Z")
# Boîte utile du tracé ci-dessus, mesurée une fois pour toutes.
FLAMME_BOITE = (18.5, 46.5, 9.0, 45.0)  # x0, x1, y0, y1

# Le ballon et sa flamme, réglés au pixel près (voir README, « Les réglages »).
BALLON_Y = 38.0      # le ballon repose en bas : le feu monte au-dessus
BALLON_R = 10.5      # assez large pour se lire sous la flamme
FLAMME_H = 29.0      # la flamme domine sans écraser le ballon
ASSISE = 0.72        # d'où part la flamme, en part du rayon sous le centre
PENTAGONE = 0.54     # part du rayon occupée par le pentagone central
COUTURE = 0.26       # épaisseur des coutures, en part du rayon


def _ballon() -> tuple[str, str, float]:
    """Le pentagone, les cinq coutures, et leur épaisseur."""
    rp = BALLON_R * PENTAGONE
    sommets = [
        (32 + rp * math.cos(math.radians(a)), BALLON_Y + rp * math.sin(math.radians(a)))
        for a in (-90, -18, 54, 126, 198)
    ]
    penta = "M" + " ".join(f"{x:.2f} {y:.2f}" for x, y in sommets) + "Z"
    traits = []
    for x, y in sommets:
        ux, uy = (x - 32) / rp, (y - BALLON_Y) / rp
        bx, by = 32 + ux * BALLON_R, BALLON_Y + uy * BALLON_R
        traits.append(f'<path d="M{x:.2f} {y:.2f} {bx:.2f} {by:.2f}"/>')
    return penta, "".join(traits), BALLON_R * COUTURE


PENTA, TRAITS, EP = _ballon()


def _flamme() -> str:
    """La flamme, mise à l'échelle, centrée sur le ballon et posée dessus."""
    x0, x1, y0, y1 = FLAMME_BOITE
    k = FLAMME_H / (y1 - y0)
    bas = BALLON_Y + BALLON_R * ASSISE
    tx = 32 - (x0 + x1) / 2 * k
    ty = bas - y1 * k
    return (f'<g transform="translate({tx:.2f} {ty:.2f}) scale({k:.4f})">'
            f'<path d="{FLAMME}"/></g>')


FEU = _flamme()


def marque() -> str:
    """L'écusson plein, le ballon embrasé en creux.

    Le ballon et sa flamme sont des formes **marine posées** plutôt
    qu'évidées : évidées, la marque prendrait la couleur de ce qu'elle a
    derrière et se dissoudrait sur un fond sombre. Remplies, elle est autonome
    — sur le marine de l'application comme sur le blanc d'un document.
    """
    return (
        f'<path d="{ECUSSON}" fill="{ORANGE}"/>'
        f'<g fill="{NAVY}">{FEU}</g>'
        f'<circle cx="32" cy="{BALLON_Y}" r="{BALLON_R}" fill="{NAVY}"/>'
        f'<path d="{PENTA}" fill="{ORANGE}"/>'
        f'<g stroke="{ORANGE}" stroke-width="{EP:.2f}" stroke-linecap="round">'
        f"{TRAITS}</g>"
    )


def une_encre(ident: str, encre: str) -> str:
    """La même silhouette dans une seule encre : le feu y est **évidé**.

    C'est le cas du maillot brodé, du badge de notification et du texte
    monochrome. Posés pleins, la flamme et le ballon disparaîtraient : deux
    formes de la même couleur, l'une sur l'autre, ne font qu'une tache. Le
    pentagone et les coutures, eux, reviennent en plein dans le creux — sans
    eux le ballon ne serait qu'un rond.
    """
    return (
        f'<mask id="{ident}">'
        '<rect width="64" height="64" fill="#fff"/>'
        f'<g fill="#000">{FEU}</g>'
        f'<circle cx="32" cy="{BALLON_Y}" r="{BALLON_R}" fill="#000"/>'
        f'<path d="{PENTA}" fill="#fff"/>'
        f'<g stroke="#fff" stroke-width="{EP:.2f}" stroke-linecap="round">{TRAITS}</g>'
        "</mask>"
        f'<path d="{ECUSSON}" fill="{encre}" mask="url(#{ident})"/>'
    )


def svg(corps: str, vb="0 0 64 64", titre="UNO League") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" '
        f'aria-label="{titre}">\n  <title>{titre}</title>\n  {corps}\n</svg>\n'
    )


MARQUE = marque()

FICHIERS: dict[str, str] = {
    # L'écusson en couleurs : la référence dont tout le reste découle.
    "mark.svg": svg(MARQUE),
    # Une seule encre, prise sur la couleur du texte autour.
    "mark-mono.svg": svg(une_encre("uno-ballon", "currentColor")),
    # La tuile d'application. Les systèmes en arrondissent les coins ; celle-ci
    # les porte déjà, pour ceux qui ne le font pas.
    "icon.svg": svg(
        f'<rect width="512" height="512" rx="112" fill="{NAVY}"/>'
        f'<g transform="translate(96 96) scale(5)">{MARQUE}</g>',
        vb="0 0 512 512",
    ),
    # La tuile que les systèmes ont le droit de rogner — jusqu'à un cercle.
    # Tout ce qui compte tient donc dans les 66 % du centre.
    "icon-maskable.svg": svg(
        f'<rect width="512" height="512" fill="{NAVY}"/>'
        f'<g transform="translate(134 134) scale(3.85)">{MARQUE}</g>',
        vb="0 0 512 512",
    ),
    # Le badge des notifications : Android n'en garde que la silhouette, qu'il
    # reteint en blanc. Pas de couleur, pas de dégradé — seulement une forme
    # qui se reconnaît à seize pixels.
    "badge.svg": svg(une_encre("uno-badge", "#fff")),
    # Le fond plein d'une icône adaptative Android.
    "fond.svg": svg(f'<rect width="64" height="64" fill="{NAVY}"/>'),
}

# Le favori du site est l'écusson lui-même : un second fichier finirait par
# vieillir à part.
HORS_DOSSIER = {
    DEPOT / "apps/web/public/favicon.svg": FICHIERS["mark.svg"],
}

# --- La transcription React -----------------------------------------------
#
# Le composant est écrit *inline* dans l'application : la marque apparaît dès
# le premier écran, et une image chargée après coup y fait un trou le temps
# qu'elle arrive. Il est engendré d'ici pour rester la transcription de
# `mark.svg`, et non une seconde version qui en diverge.

ATTRIBUTS = {
    "stroke-width": "strokeWidth",
    "stroke-linecap": "strokeLinecap",
    "stroke-linejoin": "strokeLinejoin",
    "fill-rule": "fillRule",
    "clip-rule": "clipRule",
}


def en_jsx(corps: str) -> str:
    for avant, apres in ATTRIBUTS.items():
        corps = corps.replace(f"{avant}=", f"{apres}=")
    return corps


TSX = '''import {{ cn }} from "@/lib/cn.js";

/**
 * L'écusson UNO League : un ballon logé dans l'écusson d'une ligue.
 *
 * **Inline plutôt qu'une balise `img`**, pour deux raisons : la marque
 * apparaît dès le premier écran, et une image chargée après coup y fait un
 * trou le temps qu'elle arrive ; et la version monochrome hérite de la
 * couleur du texte, ce qu'un `img` ne sait pas faire.
 *
 * Fichier engendré par `docs/branding/genere.py` — ne pas le retoucher à la
 * main : le prochain passage du script effacerait la retouche.
 */
export function UnoMark({{
  className,
  mono = false,
}}: {{
  className?: string;
  /**
   * Une seule encre, prise sur la couleur du texte. Le ballon est alors
   * évidé plutôt que posé : deux formes de la même couleur, l'une sur
   * l'autre, ne feraient qu'une tache.
   */
  mono?: boolean;
}}) {{
  if (mono) {{
    return (
      <svg
        viewBox="0 0 64 64"
        className={{cn("block", className)}}
        role="img"
        aria-label="UNO League"
      >
        {mono}
      </svg>
    );
  }}

  return (
    <svg
      viewBox="0 0 64 64"
      className={{cn("block", className)}}
      role="img"
      aria-label="UNO League"
    >
      {couleurs}
    </svg>
  );
}}
'''

# --- La couverture du dossier ---------------------------------------------
#
# `docs/dossier/build.py` lit `mark.svg` au moment de fabriquer le HTML : rien
# à recopier ici. C'est la raison pour laquelle le fichier de référence est un
# SVG et non un fragment enfoui dans un script.


def main() -> None:
    for nom, contenu in FICHIERS.items():
        (RACINE / nom).write_text(contenu, encoding="utf-8")
        print(f"{nom:<22} {len(contenu):>5} o")

    for chemin, contenu in HORS_DOSSIER.items():
        chemin.write_text(contenu, encoding="utf-8")
        print(f"{chemin.relative_to(DEPOT)!s:<40} {len(contenu):>5} o")

    tsx = DEPOT / "apps/web/src/components/brand/uno-mark.tsx"
    tsx.write_text(
        TSX.format(
            mono=en_jsx(une_encre("uno-ballon", "currentColor")),
            couleurs=en_jsx(MARQUE),
        ),
        encoding="utf-8",
    )
    # Prettier passe derrière : sans lui, `pnpm format` reformaterait le
    # fichier engendré, et le prochain `genere.py` défairait ce formatage —
    # un aller-retour sans fin dans l'historique.
    if shutil.which("npx"):
        subprocess.run(
            ["npx", "--no-install", "prettier", "--write", str(tsx)],
            cwd=DEPOT, check=False, stdout=subprocess.DEVNULL,
        )
    print(f"{tsx.relative_to(DEPOT)!s:<40} {len(tsx.read_text()):>5} o")


if __name__ == "__main__":
    main()
