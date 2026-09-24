"""Décline l'écusson dans tous les formats dont l'application a besoin.

**La source est désormais un tracé.** `ecusson.svg`, écrit par `dessine.py`,
est la référence ; `rend.mjs` le rend en `crest.png` de 2048 px de haut, et ce
script en tire le reste. Tout ce qui sort d'ici est donc une **réduction** —
l'icône 1024 de l'App Store comprise, qui était jusqu'ici un agrandissement
visiblement mou d'un PNG de 148 px.

La chaîne complète :

    python3 docs/branding/dessine.py   # le tracé
    node docs/branding/rend.mjs        # le PNG haute définition
    python3 docs/branding/genere.py    # toutes les déclinaisons

**Le badge de notification se découpe sur la couleur, pas sur l'alpha.**
Android n'en garde que la silhouette, qu'il reteint en blanc ; or tout
l'écusson est opaque, et l'on obtiendrait un bouclier plein, muet. Le marine et
le blanc sont donc évidés : l'entrelacs et le ballon se lisent en creux.
"""

import pathlib

from PIL import Image, ImageChops

NAVY = (15, 23, 42, 255)

RACINE = pathlib.Path(__file__).resolve().parent
DEPOT = RACINE.parent.parent
WEB = DEPOT / "apps/web/public"
RES = DEPOT / "apps/web/android/app/src/main/res"

def rogne(im: Image.Image) -> Image.Image:
    """L'image réduite à ce qui est dessiné : le rendu garde la marge du viewBox."""
    return im.crop(im.getbbox())


def silhouette(im: Image.Image) -> Image.Image:
    """Le badge : le marine et le blanc évidés, l'orange seul reste opaque.

    La table de correspondance suit la saturation plutôt qu'un seuil : l'orange
    est très saturé, le marine et le blanc ne le sont pas, et les pixels de
    bord — anticrénelés, à mi-chemin — gardent une opacité intermédiaire au
    lieu de dessiner un escalier.
    """
    rouge, vert, bleu, alpha = im.split()
    ecart = ImageChops.subtract(rouge, bleu)  # ~230 sur l'orange, ~0 ailleurs
    garde = ecart.point(lambda v: max(0, min(255, (v - 60) * 2)))
    blanc = Image.new("L", im.size, 255)
    return Image.merge("RGBA", (blanc, blanc, blanc, ImageChops.multiply(alpha, garde)))


SOURCE = rogne(Image.open(RACINE / "crest.png").convert("RGBA"))
SILHOUETTE = silhouette(SOURCE)


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
    # L'accueil affiche le tracé lui-même : on le recopie plutôt que de le
    # dupliquer à la main, sans quoi l'un finirait par montrer l'ancienne
    # version de l'autre.
    (WEB / "mark.svg").write_text((RACINE / "ecusson.svg").read_text("utf-8"), "utf-8")
    print(f"{(WEB / 'mark.svg').relative_to(DEPOT)!s:<62} vectoriel")
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

    # --- Les écrans de démarrage Android ----------------------------------
    # Le thème de lancement les pose en fond (`AppTheme.NoActionBarLaunch`) :
    # ils s'affichent à chaque ouverture, avant la première image de l'app.
    # L'écusson y prend 28 % du petit côté, quelle que soit l'orientation —
    # la même taille à l'œil en portrait et en paysage.
    for ecran in sorted(RES.glob("drawable*/splash.png")):
        largeur, hauteur = Image.open(ecran).size
        cote = round(min(largeur, hauteur) * 0.28)
        marque = carre(SOURCE, cote)
        fond = Image.new("RGBA", (largeur, hauteur), NAVY)
        fond.alpha_composite(marque, ((largeur - cote) // 2, (hauteur - cote) // 2))
        ecrit(fond.convert("RGB"), ecran)

    # --- Les tailles qu'on redemande la veille d'un dépôt -----------------
    # L'App Store veut un carré plein, sans transparence ni coins arrondis :
    # c'est lui qui découpe. Les coins arrondis d'avant auraient laissé quatre
    # triangles sombres sous son masque.
    ecrit(sur_marine(carre(SOURCE, 1024, 0.10)).convert("RGB"), RACINE / "rendu/icon-1024.png")
    # Google Play : 512 × 512, plein lui aussi, pour la fiche du store.
    ecrit(sur_marine(carre(SOURCE, 512, 0.10)).convert("RGB"), RACINE / "rendu/play-512.png")
    ecrit(carre(SOURCE, 512), RACINE / "rendu/crest-512.png")


if __name__ == "__main__":
    main()
