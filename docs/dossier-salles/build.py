"""Construit le dossier « salles » : la proposition faite aux salles omnisports.

Un dossier court, écrit pour le gestionnaire d'une salle et non pour un
organisme d'aide : ce que nous lui demandons, ce que voient ses clients avant
et après le match, et ce que nous pouvons faire pour lui. Il se décline par
salle — le nom du centre apparaît dans les captures (`captures.mjs`) et dans
le texte — à partir de `salles.json`.

**Il ne recopie rien du dossier principal.** La feuille de style, les polices,
l'écusson, le code QR et le barème (prix de l'heure, récompenses, divisions)
viennent de `docs/dossier/build.py`, exécuté jusqu'au repère
`# --- Les trois langues`. Un tarif changé là change ici au tirage suivant ;
une copie l'aurait contredit en silence.

    python3 docs/dossier-salles/build.py            # toutes les salles capturées
    python3 docs/dossier-salles/build.py mounier    # une seule

Les captures sont lues directement dans `captures/` et ramenées en JPEG : le
dossier part en pièce jointe, et douze captures PNG en pleine résolution le
feraient peser plus de cinq mégaoctets.
"""

import base64
import importlib.util
import io
import json
import pathlib
import sys
import types

from PIL import Image

ICI = pathlib.Path(__file__).resolve().parent
DOSSIER = ICI.parent / "dossier"
CAPTURES = ICI / "captures"
SALLES = json.loads((ICI / "salles.json").read_text(encoding="utf8"))

# Le mois du tirage, imprimé sur la couverture.
DATE_SALLES = "novembre 2026"

# Les captures de la séance terminée qui peuvent venir de la production
# (README) : posées à la main dans `captures/prod/`, elles remplacent celles du
# jeu de démonstration pour toutes les salles. La vidéo n'a pas de doublure :
# le jeu de démonstration n'en contient pas.
PROD = ("seance-podium", "seance-resultats", "seance-video")

# Largeur d'une capture dans le PDF : celle d'un téléphone à deux pixels par
# point. Au-delà, le fichier grossit sans que l'œil y gagne rien.
LARGEUR_MAX = 824


def socle() -> dict:
    """Exécute `docs/dossier/build.py` jusqu'au repère, et rend son espace de noms.

    Le dossier principal importe `assets` (ses captures et ses polices en
    base64, fabriquées par son `pack.py`). On lui en fournit un ici, réduit aux
    polices, lues directement dans `apps/web/public/fonts` : le dossier
    « salles » ne doit pas dépendre d'un tirage préalable de l'autre.
    """
    spec = importlib.util.spec_from_file_location("pack_dossier", DOSSIER / "pack.py")
    pack = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(pack)
    polices = {}
    for cle, modele in pack.GRAISSES.items():
        for suffixe, ext in (("", ""), ("-ext", "-ext")):
            octets = (pack.POLICES / modele.format(ext=ext)).read_bytes()
            polices[f"font-{cle}{suffixe}"] = base64.b64encode(octets).decode("ascii")
    module = types.ModuleType("assets")
    module.ASSETS = polices
    sys.modules["assets"] = module

    source = (DOSSIER / "build.py").read_text(encoding="utf8")
    repere = "# --- Les trois langues"
    if source.count(repere) != 1:
        raise SystemExit(f"repère « {repere} » introuvable ou répété dans docs/dossier/build.py")
    espace = {"__file__": str(DOSSIER / "build.py"), "__name__": "socle_dossier"}
    exec(compile(source.split(repere)[0], str(DOSSIER / "build.py"), "exec"), espace)
    return espace


def jpeg(chemin: pathlib.Path) -> str:
    image = Image.open(chemin).convert("RGB")
    if image.width > LARGEUR_MAX:
        image = image.resize((LARGEUR_MAX, round(image.height * LARGEUR_MAX / image.width)), Image.LANCZOS)
    tampon = io.BytesIO()
    image.save(tampon, "JPEG", quality=84, optimize=True)
    return base64.b64encode(tampon.getvalue()).decode("ascii")


def capture_de(slug: str, nom: str) -> tuple[pathlib.Path | None, bool]:
    """Le fichier à montrer, et s'il vient de la production."""
    if nom in PROD:
        for ext in ("png", "jpg", "jpeg"):
            chemin = CAPTURES / "prod" / f"{nom}.{ext}"
            if chemin.exists():
                return chemin, True
    chemin = CAPTURES / slug / f"{nom}.png"
    return (chemin if chemin.exists() else None), False


# Ce que le dossier « salles » ajoute à la feuille de style du dossier
# principal : la place réservée d'une capture à fournir, et les trois demandes.
STYLE = """
  .a-fournir {
    border: .5mm dashed var(--orange); border-radius: 2.5mm; background: #FFF7ED;
    aspect-ratio: 412 / 892; max-height: var(--shot-max, none); display: flex;
    align-items: center; justify-content: center; text-align: center; padding: 4mm;
    font-size: 9pt; color: #9A3412; font-weight: 600; line-height: 1.4;
  }
  .demandes { list-style: none; counter-reset: d; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-bottom: 6mm; }
  .demandes li {
    counter-increment: d; border-top: 1mm solid var(--orange); padding-top: 3mm;
  }
  .demandes li::before {
    content: "0" counter(d); font-family: "Barlow Condensed"; font-weight: 800;
    font-size: 20pt; color: var(--orange); line-height: 1; display: block; margin-bottom: 1.5mm;
  }
  .demandes h3 { font-size: 11pt; }
  .demandes p { font-size: 8.9pt; line-height: 1.42; }
  .sous-titre {
    font-family: "Barlow Condensed"; font-size: 12pt; font-weight: 800; text-transform: uppercase;
    letter-spacing: .8pt; margin: 1mm 0 3mm; color: var(--ink);
  }
  .shots.trio { grid-template-columns: repeat(3, 1fr); gap: 6mm; }
  .offert {
    background: var(--navy); color: #fff; border-radius: 3mm; padding: 5mm 6mm; margin-bottom: 5mm;
    display: grid; grid-template-columns: auto 1fr; gap: 5mm; align-items: center;
  }
  .offert b {
    font-family: "Barlow Condensed"; font-style: italic; font-weight: 800; font-size: 22pt;
    text-transform: uppercase; color: var(--orange); line-height: .95;
  }
  .offert p { color: #CBD5E1; font-size: 9.4pt; }
  .offert p strong { color: #fff; }
  /* Limité comme le titre : un nom de centre long passerait sous le téléphone. */
  .cover .salle {
    position: relative; display: inline-block; margin-top: 7mm; padding: 2mm 4mm; border-radius: 2mm;
    max-width: 100mm; line-height: 1.3;
    border: .4mm solid rgba(234,88,12,.6); background: rgba(234,88,12,.12);
    font-family: "Barlow Condensed"; font-size: 13pt; font-weight: 700; letter-spacing: .4pt; color: #FDBA74;
  }
"""


def main() -> None:
    espace = socle()
    espace["DATE_SALLES"] = DATE_SALLES
    entete = espace["ENTETE"].replace("</style>", STYLE + "</style>")

    demandees = sys.argv[1:] or [s for s in SALLES if (CAPTURES / s).is_dir()]
    if not demandees:
        raise SystemExit("aucune capture : lancer d'abord captures.mjs (README)")

    for slug in demandees:
        if slug not in SALLES:
            raise SystemExit(f"salle inconnue : {slug} (salles.json)")
        manquantes = []
        prod_utilisees = []

        def capture(nom: str, titre: str, texte: str) -> str:
            chemin, de_prod = capture_de(slug, nom)
            if chemin is None:
                manquantes.append(nom)
                lieu = f"captures/prod/{nom}.png" if nom in PROD else f"captures/{slug}/{nom}.png"
                return (f'<figure class="shot"><div class="a-fournir">Capture à fournir<br />{lieu}</div>'
                        f"<figcaption><strong>{titre}</strong>{texte}</figcaption></figure>")
            if de_prod:
                prod_utilisees.append(nom)
            return (f'<figure class="shot"><img src="data:image/jpeg;base64,{jpeg(chemin)}" alt="{titre}" />'
                    f"<figcaption><strong>{titre}</strong>{texte}</figcaption></figure>")

        espace["SALLE"] = SALLES[slug]["nom"]
        espace["GENERIQUE"] = slug == "generique"
        espace["capture"] = capture
        espace["image"] = lambda nom: jpeg(capture_de(slug, nom)[0])
        espace["prod_utilisees"] = prod_utilisees
        exec((ICI / "pages_fr.py").read_text(encoding="utf8"), espace)

        html = (entete.replace("__LANG__", "fr").replace("__TITRE__", espace["TITRE"])
                + "\n" + espace["PAGES"] + "\n</html>")
        (ICI / f"dossier-salles-{slug}.html").write_text(html, encoding="utf8")
        print(f"dossier-salles-{slug}.html : {len(html) // 1024} Ko"
              f" · séance de production : {', '.join(prod_utilisees) or 'aucune'}")
        if manquantes:
            print(f"  ATTENTION, captures à fournir : {', '.join(manquantes)} — le PDF sortira en BROUILLON")


if __name__ == "__main__":
    main()
