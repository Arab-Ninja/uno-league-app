"""Décline l'écusson fourni dans tous les formats dont l'application a besoin.

**La source est une image, pas un tracé.** L'écusson a été fourni en PNG de
148 × 184 px, fond blanc. `crest.png` en est la version détourée, et
`crest-silhouette.png` la découpe qui sert au badge de notification. Les deux
sont versionnées parce qu'elles ne se refabriquent pas sans le fichier
d'origine.

Ce que cela implique, et qu'il faut savoir avant de livrer aux stores : tout
ce qui dépasse 256 px est un agrandissement. L'aplat le supporte jusqu'à 512,
mais le 1024 réclamé par l'App Store est visiblement mou. Il faudra une
version vectorielle, ou un export d'au moins 1024 px.

Le détourage du fond n'a pas été fait en remplaçant le blanc : **le ballon est
blanc lui aussi**, et un remplacement global l'aurait percé. Le fond a été
rempli depuis les quatre coins, ce que le ballon, enclos dans l'écusson, ne
subit pas.
"""

import pathlib

from PIL import Image

NAVY = (15, 23, 42, 255)

RACINE = pathlib.Path(__file__).resolve().parent
DEPOT = RACINE.parent.parent
WEB = DEPOT / "apps/web/public"
RES = DEPOT / "apps/web/android/app/src/main/res"

SOURCE = Image.open(RACINE / "crest.png").convert("RGBA")
SILHOUETTE = Image.open(RACINE / "crest-silhouette.png").convert("RGBA")


def carre(im: Image.Image, cote: int, marge: float = 0.0) -> Image.Image:
    """L'écusson centré dans un carré transparent, avec une marge en part du côté."""
    utile = round(cote * (1 - 2 * marge))
    k = min(utile / im.width, utile / im.height)
    mis = im.resize((max(round(im.width * k), 1), max(round(im.height * k), 1)), Image.LANCZOS)
    fond = Image.new("RGBA", (cote, cote), (0, 0, 0, 0))
    fond.paste(mis, ((cote - mis.width) // 2, (cote - mis.height) // 2), mis)
    return fond


def sur_marine(im: Image.Image, rayon: float = 0.0) -> Image.Image:
    """Posé sur une tuile marine pleine, coins arrondis si on le demande."""
    tuile = Image.new("RGBA", im.size, NAVY)
    if rayon:
        from PIL import ImageDraw

        masque = Image.new("L", im.size, 0)
        ImageDraw.Draw(masque).rounded_rectangle(
            (0, 0, im.width - 1, im.height - 1), radius=round(im.width * rayon), fill=255
        )
        tuile.putalpha(masque)
    tuile.alpha_composite(im)
    return tuile


def ecrit(im: Image.Image, chemin: pathlib.Path) -> None:
    chemin.parent.mkdir(parents=True, exist_ok=True)
    im.save(chemin)
    print(f"{chemin.relative_to(DEPOT)!s:<62} {im.size[0]}×{im.size[1]}")


def main() -> None:
    # --- Le site et l'application web -------------------------------------
    # La tuile ordinaire garde une petite marge ; les systèmes lui arrondissent
    # les coins et mordent un peu.
    ecrit(sur_marine(carre(SOURCE, 192, 0.08), 0.22), WEB / "icon-192.png")
    ecrit(sur_marine(carre(SOURCE, 512, 0.08), 0.22), WEB / "icon-512.png")
    # La tuile « maskable » : les systèmes ont le droit d'y découper un cercle,
    # donc tout ce qui compte tient dans les 66 % du centre.
    ecrit(sur_marine(carre(SOURCE, 512, 0.20)), WEB / "icon-maskable-512.png")
    ecrit(carre(SOURCE, 256), WEB / "mark.png")
    # Le favori : un PNG, faute de tracé. Le SVG d'avant ne décrivait plus rien.
    ecrit(sur_marine(carre(SOURCE, 64, 0.06), 0.22), WEB / "favicon.png")
    # Le badge : Android n'en garde que l'alpha, qu'il reteint en blanc. La
    # découpe se fait donc sur la couleur — le marine évidé — sans quoi il ne
    # resterait qu'un écusson plein, muet.
    ecrit(carre(SILHOUETTE, 72), WEB / "badge-72.png")

    # --- Android ----------------------------------------------------------
    densites = {"ldpi": 36, "mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for densite, taille in densites.items():
        dossier = RES / f"mipmap-{densite}"
        if not dossier.exists():
            continue
        # Le premier plan est encastré de 16,7 % par `ic_launcher.xml` : il est
        # donc fourni sans marge.
        ecrit(carre(SOURCE, taille), dossier / "ic_launcher_foreground.png")
        ecrit(Image.new("RGBA", (taille, taille), NAVY), dossier / "ic_launcher_background.png")
        compose = sur_marine(carre(SOURCE, taille, 0.10))
        ecrit(compose, dossier / "ic_launcher.png")
        ecrit(compose, dossier / "ic_launcher_round.png")

    # --- Les tailles qu'on redemande la veille d'un dépôt -----------------
    ecrit(sur_marine(carre(SOURCE, 1024, 0.08), 0.22), RACINE / "rendu/icon-1024.png")
    ecrit(carre(SOURCE, 512), RACINE / "rendu/crest-512.png")


if __name__ == "__main__":
    main()
