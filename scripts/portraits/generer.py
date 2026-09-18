"""Fabrique `apps/api/src/db/seed-portraits.ts` à partir des portraits fournis.

Détourage (voir `detourer.py`), redimensionnement en 448×448, encodage WebP
avec canal alpha, puis écriture d'un module TypeScript qui porte les octets en
base64.

    python3 scripts/portraits/generer.py portrait-1.webp portrait-2.webp ...

L'ordre des fichiers fixe l'ordre des portraits, et donc quel compte de
démonstration reçoit lequel. Ajouter un visage revient à relancer la commande
avec un fichier de plus. Demande Pillow (`pip install Pillow`) ; rien de tout
cela n'est nécessaire pour faire tourner l'application.
"""

import base64
import io
import pathlib
import sys
import tempfile

from PIL import Image

from detourer import detourer

TAILLE = 448
QUALITE = 86

RACINE = pathlib.Path(__file__).resolve().parents[2]
CIBLE = RACINE / "apps/api/src/db/seed-portraits.ts"

ENTETE = '''/*
 * Portraits du jeu de démonstration (CARD-002).
 *
 * **Pourquoi des visages, et pourquoi ceux-là.** Le jeu de démonstration sert
 * à montrer l'application — à un joueur qui l'essaie, à un partenaire à qui on
 * la présente. La carte d'un joueur est ce qu'on regarde en premier, et le
 * portrait en occupe la moitié : une silhouette dessinée, si honnête soit-elle
 * quant à son statut de marque-place, donnait une démonstration qu'on n'a pas
 * envie de montrer. Ces visages sont des portraits de joueurs de football
 * déjà détourés, fournis pour cet usage. Ils tournent en boucle sur
 * l'effectif : en ajouter un se fait en relançant le générateur avec un
 * fichier de plus, sans toucher au reste.
 *
 * **Ils ne servent qu'à la démonstration.** Aucun compte réel n'en reçoit : un
 * joueur téléverse sa propre photo, et le détourage se fait alors sur son
 * appareil. Ces images n'ont donc jamais à voyager en dehors d'un jeu d'essai.
 *
 * **Pourquoi en base64 plutôt qu'en fichiers.** Le module est importé par
 * `seed-data.ts`, lui-même atteint depuis le routeur d'administration : il
 * entre donc dans le paquet esbuild de l'API. Un `readFileSync` s'y
 * compilerait sans broncher et échouerait au premier appel en production,
 * faute du fichier à côté du bundle. Les octets voyagent donc dans le module.
 *
 * Fabriqué par `scripts/portraits/generer.py` : détourage du damier de
 * transparence aplati dans les fichiers reçus, réduction en {taille}×{taille},
 * encodage WebP avec canal alpha. Ne pas éditer à la main.
 */

/** Les portraits, en WebP avec fond transparent, encodés en base64. */
const PORTRAITS_BASE64: readonly string[] = [
'''

PIED = '''];

/** Le type MIME des portraits ci-dessus, tel que `storeImage` l'attend. */
export const DEMO_PORTRAIT_MIME = "image/webp";

/** Le nombre de portraits disponibles, pour boucler dessus sans le coder en dur. */
export const DEMO_PORTRAIT_COUNT = PORTRAITS_BASE64.length;

/**
 * Le portrait numéro `index`, la liste étant parcourue en boucle.
 *
 * Un nouveau `Buffer` à chaque appel : `storeImage` reçoit des octets qu'il
 * peut transmettre à un client S3, et partager le même tampon entre deux
 * dépôts est le genre de détail qui ne se voit qu'une fois en production.
 */
export function demoPortrait(index: number): Buffer {
  const position = ((index % DEMO_PORTRAIT_COUNT) + DEMO_PORTRAIT_COUNT) % DEMO_PORTRAIT_COUNT;
  return Buffer.from(PORTRAITS_BASE64[position]!, "base64");
}
'''


def encoder(source: pathlib.Path, travail: pathlib.Path) -> str:
    # L'étape intermédiaire va dans un dossier temporaire : le dépôt ne doit
    # rien garder d'une exécution du générateur, sinon les PNG détourés
    # finissent versionnés à côté du script sans que personne ne le remarque.
    coupe = travail / f"{source.stem}-detoure.png"
    detourer(str(source), str(coupe), taille=TAILLE)

    im = Image.open(coupe).convert("RGBA")
    tampon = io.BytesIO()
    im.save(tampon, "WEBP", quality=QUALITE, method=6)
    return base64.b64encode(tampon.getvalue()).decode("ascii")


def main(sources: list[str]) -> None:
    morceaux = []

    with tempfile.TemporaryDirectory(prefix="portraits-") as dossier:
        travail = pathlib.Path(dossier)
        for chemin in sources:
            b64 = encoder(pathlib.Path(chemin), travail)
            # Des lignes de 96 caractères : un fichier source reste lisible
            # dans un éditeur, et un diff ne se réduit pas à une seule ligne
            # illisible.
            lignes = "\n".join(
                f'    "{b64[i:i + 96]}" +' for i in range(0, len(b64), 96)
            ).rstrip(" +")
            morceaux.append(
                f"  // {pathlib.Path(chemin).name} — {len(b64) * 3 // 4096} Ko\n{lignes},"
            )
            print(f"{chemin} : {len(b64) * 3 // 4096} Ko")

    CIBLE.write_text(
        ENTETE.replace("{taille}", str(TAILLE)) + "\n".join(morceaux) + "\n" + PIED,
        encoding="utf8",
    )
    print(f"→ {CIBLE} ({CIBLE.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main(sys.argv[1:])
