"""Emballe les captures et la police dans `assets.py`, en base64.

Le PDF doit voyager seul : envoyé par courriel à un organisme, il ne peut pas
dépendre d'un dossier d'images à côté ni d'une police installée sur la machine
qui l'ouvre. Tout est donc embarqué.
"""

import base64
import pathlib

RACINE = pathlib.Path(__file__).resolve().parent
DEPOT = RACINE.parents[1]
# Les captures produites par `captures.mjs`, non versionnées : elles se
# refabriquent en une commande et pèsent trois mégaoctets.
CAPTURES = RACINE / "captures"
# Les polices de l'application depuis la refonte « Stade de nuit » : Barlow
# pour le texte, Barlow Condensed pour les titres. Le dossier parle la même
# langue visuelle que l'app qu'il présente. Chaque graisse existe en deux
# sous-ensembles — latin, et latin étendu pour « œ » et ses voisins.
POLICES = DEPOT / "apps/web/public/fonts"
GRAISSES = {
    "barlow-400": "barlow-latin{ext}-400.woff2",
    "barlow-500": "barlow-latin{ext}-500.woff2",
    "barlow-600": "barlow-latin{ext}-600.woff2",
    "barlow-700": "barlow-latin{ext}-700.woff2",
    "condensed-700": "barlow-condensed-latin{ext}-700-normal.woff2",
    "condensed-800": "barlow-condensed-latin{ext}-800-normal.woff2",
    "condensed-800-italic": "barlow-condensed-latin{ext}-800-italic.woff2",
}

# Le nom sous lequel `build.py` appelle chaque capture, et le fichier derrière.
VISUELS = {
    "accueil": "accueil.png",
    "calendrier": "calendrier.png",
    "classement": "classement.png",
    "proposition": "proposition.png",
    "modes": "modes.png",
    "club": "club.png",
    # Le terrain (MODE-004) : ce que la table des formats ne peut pas montrer
    # — une équipe, des postes, et des places encore libres.
    #
    # Une seule des trois captures de terrain entre dans le dossier. Les deux
    # autres — Football et cinq type d'un club — existent dans `captures/`
    # et servent ailleurs : une page pleine largeur les rend lisibles, une
    # demi-colonne les réduit à de la décoration.
    "terrain-ligue": "terrain-ligue.png",
    "wallet": "wallet.png",
    "informations": "informations.png",
    # Depuis la refonte « Stade de nuit », la boutique et la carte viennent
    # elles aussi du jeu de démonstration : les deux captures prises sur un
    # vrai téléphone montraient l'ancienne interface.
    "boutique": "boutique.png",
    "profil": "profil.png",
    # Les tournois entre clubs et le marché des transferts, arrivés après la
    # première version du dossier.
    "tournoi": "tournoi.png",
    "transferts": "transferts.png",
}


def main() -> None:
    lignes = ["ASSETS = {"]

    for cle, modele in GRAISSES.items():
        for suffixe, ext in (("", ""), ("-ext", "-ext")):
            b64 = base64.b64encode((POLICES / modele.format(ext=ext)).read_bytes()).decode("ascii")
            lignes.append(f"    'font-{cle}{suffixe}': '{b64}',")
        print(f"police {cle:<22} ok")

    for nom, fichier in VISUELS.items():
        chemin = CAPTURES / fichier
        if not chemin.exists():
            raise SystemExit(f"capture manquante : {chemin}")
        b64 = base64.b64encode(chemin.read_bytes()).decode("ascii")
        lignes.append(f"    '{nom}': '{b64}',")
        print(f"{nom:<14} {len(b64) * 3 // 4096:>5} Ko")

    lignes.append("}")
    (RACINE / "assets.py").write_text("\n".join(lignes), encoding="utf8")
    print("→ assets.py", (RACINE / "assets.py").stat().st_size // 1024, "Ko")


if __name__ == "__main__":
    main()
