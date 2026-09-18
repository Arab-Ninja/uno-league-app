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
POLICE = DEPOT / "apps/web/public/fonts/roboto-condensed-latin.woff2"

# Le nom sous lequel `build.py` appelle chaque capture, et le fichier derrière.
VISUELS = {
    "accueil": "accueil.png",
    "calendrier": "calendrier.png",
    "classement": "classement.png",
    "proposition": "proposition.png",
    "modes": "modes.png",
    "club": "club.png",
    "wallet": "wallet.png",
    "informations": "informations.png",
    # Captures prises par le porteur du projet sur son propre téléphone : un
    # catalogue réellement rempli, et sa propre carte de joueur.
    "boutique": "boutique-reelle.png",
    "profil": "profil-reel.png",
}


def main() -> None:
    lignes = ["ASSETS = {"]

    b64 = base64.b64encode(POLICE.read_bytes()).decode("ascii")
    lignes.append(f"    'font': '{b64}',")
    print(f"police  {len(b64) * 3 // 4096:>5} Ko")

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
