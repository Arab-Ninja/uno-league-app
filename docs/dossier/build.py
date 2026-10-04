"""Construit le dossier de présentation UNO League en HTML, prêt à imprimer.

Le HTML est écrit ici plutôt que rédigé à la main pour une seule raison : les
captures d'écran et la police sont intégrées en base64, ce qui rend le PDF
autonome — aucune dépendance à un fichier voisin, aucun lien qui casse en le
transmettant par courriel.

Les chiffres du modèle économique sont calculés, jamais recopiés : une valeur
écrite en dur finit par contredire celle d'à côté, et c'est exactement ce qu'un
lecteur de dossier cherche. Ils sont en outre repris des constantes réellement
programmées dans l'application (`packages/shared/src/constants.ts`) : le
dossier décrit la ligue telle qu'elle fonctionne, pas telle qu'on l'imagine.
"""

import base64
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from assets import ASSETS  # noqa: E402

OUT = pathlib.Path(__file__).parent

# L'écusson de la couverture est **lu** dans docs/branding, puis encapsulé
# comme les captures : le PDF ne doit dépendre d'aucun fichier voisin.
ECUSSON = base64.b64encode(
    (OUT.parent / "branding" / "rendu" / "crest-512.png").read_bytes()
).decode()

# Le code QR des deux stores, en vectoriel : il pointe vers le lien unique
# `unoleague.be/app`, qui envoie chaque téléphone vers sa boutique. Un seul code
# pour deux applications, et aucun identifiant de fiche à recopier ici.
QR_APP = (OUT.parent / "branding" / "rendu" / "qr-unoleague-app.svg").read_text(encoding="utf8")

# L'Immersive Arena, le terrain de nouvelle génération entouré d'écrans : une
# image d'illustration générée une fois, ramenée à 2000 px et versionnée à
# côté de l'écusson — elle ne se refabrique pas en une commande comme les
# captures.
ARENA = base64.b64encode(
    (OUT.parent / "branding" / "rendu" / "immersive-arena.jpg").read_bytes()
).decode()

# --- Le barème, tel qu'il est programmé ------------------------------------
UNO_PAR_EURO = 10

# UNO League : le mode classé.
LIGUE_JOUEURS = 15
LIGUE_HEURES = 2
LIGUE_PRIX = 20
LIGUE_EQUIPES = 3

# Match amical : l'autre mode réellement ouvert aujourd'hui.
AMICAL_JOUEURS = 10
AMICAL_HEURES = 1
AMICAL_PRIX = 10

# Match de club : même format qu'un amical, mais entre deux clubs constitués.
CLUB_JOUEURS = 10
CLUB_HEURES = 1
CLUB_PRIX = 10

# Football : sur un vrai terrain en gazon, de sept contre sept à onze contre
# onze. Le dossier le présente comme un mode **à venir**, sans prix ni effets :
# ses règles (XP, récompenses) ne sont pas arrêtées, et un dossier ne promet
# que ce qui fonctionne.
GRAND_MIN_PAR_EQUIPE = 7
GRAND_MAX_PAR_EQUIPE = 11

# Récompenses d'une séance de ligue, en UNO (DEFAULT_REWARD_POLICY).
#
# Les trois distinctions individuelles dépendent de la division : une séance
# de D1 rapporte davantage qu'une séance de D3. Les deux dernières lignes, en
# revanche, sont les mêmes partout.
R_BUTEUR = {"D1": 250, "D2": 200, "D3": 150}
R_PASSEUR = {"D1": 150, "D2": 100, "D3": 75}
R_DEFENSEUR = {"D1": 150, "D2": 100, "D3": 75}
R_MEILLEURE_EQUIPE = 20      # à chacun des cinq joueurs de l'équipe vainqueur
R_PARTICIPATION = 10         # à chacun des quinze
ARBITRE_UNO = 300            # REFEREE_SESSION_FEE_UNO

# Parrainage (REFERRAL_REWARDS) : versé au parrain seul, à la première séance
# UNO League payée du parrainé, puis un complément à la cinquième. Trente UNO,
# trois euros : moins que la marge d'une seule séance de D3. Quatre-vingts au
# total : moins que la marge de cinq séances, même en D1.
PARRAIN_1RE = 30
PARRAIN_PALIER = 50
PARRAIN_SEANCES = 5

# L'arbitre est payé sur facture de prestation, à l'heure, ou en points UNO :
# quinze euros de l'heure hors TVA. Le montant doit tomber juste sur les 300
# UNO, sans quoi le dossier annoncerait deux tarifs différents pour le même
# travail.
ARBITRE_EUR_HEURE = 15

# Le prix d'une place est le même dans tous les modes : dix euros de l'heure.
# Une séance de ligue coûte vingt euros parce qu'elle dure deux heures, pas
# parce qu'elle vaut plus — le dossier ne doit pas laisser croire l'inverse.
PRIX_HEURE = 10

# Le noyau visé. Trois divisions, une séance par division et par semaine :
# quarante-cinq places hebdomadaires. Cent joueurs, c'est l'effectif où chacun
# vient environ une semaine sur deux — le rythme qu'un adulte tient vraiment.
NOYAU_CIBLE = 100
DIVISIONS = 3

# Les joueurs inscrits sur l'application à la date du tirage. Un relevé, pas
# une constante : à remettre à jour avant chaque diffusion.
JOUEURS_INSCRITS = 21

# Les paliers d'expansion, en joueurs actifs : la ville suivante n'ouvre que
# lorsque la précédente tient debout.
PALIER_BELGIQUE = 500     # Anvers et Liège
PALIER_FRANCE = 2000      # Paris et Marseille

# Les tournois entre clubs. Contrairement au reste du barème, leurs montants ne
# sont pas des constantes du code : chaque format se règle dans
# l'administration. Ce sont ceux en vigueur — et ceux du jeu de démonstration
# (`apps/api/src/db/seed-squads.ts`). Le même droit d'engagement pour tous ;
# la dotation double à chaque tour de plus.
TOURNOI_ENGAGEMENT_UNO = 1000
TOURNOI_FORMATS = [  # (nom, clubs engagés, dotation en UNO)
    ("Demi-finales", 4, 2000),
    ("Quarts de finale", 8, 4000),
    ("Huitièmes de finale", 16, 8000),
]
TOURNOI_CLUBS_MIN = TOURNOI_FORMATS[0][1]
TOURNOI_CLUBS_MAX = TOURNOI_FORMATS[-1][1]
TOURNOI_DOTATION_MIN = TOURNOI_FORMATS[0][2]
TOURNOI_DOTATION_MAX = TOURNOI_FORMATS[-1][2]

# Où en sont les applications mobiles. Une seule phrase, imprimée à deux
# endroits (l'état du projet et la dernière page).
PUBLICATION_STORES = "disponibles sur l'App Store et Google Play"

# L'adresse à imprimer sur la page de contact, et le lien unique des deux
# stores — celui que porte le code QR.
SITE_PUBLIC = "unoleague.be"
LIEN_APP = "unoleague.be/app"

# Le mois du tirage, imprimé sur la couverture et sur la dernière page.
DATE_DOSSIER = "octobre 2026"

# Le nombre de tests automatisés, relevé à la dernière exécution complète de
# `pnpm test`. Écrit ici et nulle part ailleurs : un chiffre recopié dans deux
# paragraphes finit par en contredire un.
TESTS = 759

# Le tarif de salle. Quatre-vingts euros de l'heure est le **haut** de la
# fourchette bruxelloise : c'est l'hypothèse la plus défavorable, choisie
# exprès. Une ligue qui ne tient qu'au meilleur prix ne tient pas.
SALLE_HEURE_HAUT = 80
SALLE_HEURE_COURANT = 60

# --- Ce qui s'en déduit, une séance de ligue à plateau complet -------------
RECETTE = LIGUE_JOUEURS * LIGUE_PRIX
SALLE = LIGUE_HEURES * SALLE_HEURE_HAUT
ARBITRE = ARBITRE_UNO // UNO_PAR_EURO
# La décomposition est celle d'une séance de **D1** : c'est la plus coûteuse
# des trois, donc l'hypothèse à présenter à qui lit un plan financier.
RECOMPENSES_UNO = (
    R_BUTEUR["D1"]
    + R_PASSEUR["D1"]
    + R_DEFENSEUR["D1"]
    + R_MEILLEURE_EQUIPE * (LIGUE_JOUEURS // LIGUE_EQUIPES)
    + R_PARTICIPATION * LIGUE_JOUEURS
)
RECOMPENSES = RECOMPENSES_UNO // UNO_PAR_EURO
REDISTRIBUTION = ARBITRE + RECOMPENSES
MARGE = RECETTE - SALLE - REDISTRIBUTION

assert SALLE + REDISTRIBUTION + MARGE == RECETTE, "la décomposition doit boucler"
assert ARBITRE_EUR_HEURE * LIGUE_HEURES == ARBITRE, (
    "les deux façons de payer l'arbitre doivent donner le même montant"
)
assert all(
    prix == PRIX_HEURE * heures
    for prix, heures in ((LIGUE_PRIX, LIGUE_HEURES), (AMICAL_PRIX, AMICAL_HEURES), (CLUB_PRIX, CLUB_HEURES))
), "le dossier annonce le même tarif horaire pour tous les modes"

PLACES_SEMAINE = DIVISIONS * LIGUE_JOUEURS

# La même séance au tarif de salle courant : l'écart dit à lui seul combien le
# prix du terrain commande le modèle.
MARGE_COURANTE = RECETTE - LIGUE_HEURES * SALLE_HEURE_COURANT - REDISTRIBUTION

# Un amical : pas d'arbitre, pas de récompenses — le mode ne les verse pas.
AMICAL_RECETTE = AMICAL_JOUEURS * AMICAL_PRIX
AMICAL_SALLE = AMICAL_HEURES * SALLE_HEURE_HAUT
AMICAL_MARGE = AMICAL_RECETTE - AMICAL_SALLE

# Couleurs validées par `scripts/validate_palette.js` sur fond clair ET sombre.
# L'écart tritan le plus faible vaut 6,6 : l'encodage secondaire est donc
# obligatoire, d'où les étiquettes directes et les séparations de 2 px.
C_MARGE = "#EA580C"
C_SALLE = "#2563EB"
C_REDIS = "#059669"

# La langue en cours de fabrication : posée par la boucle du bas, lue par les
# petites fonctions de mise en forme. Le français reste la langue de référence.
LANGUE = "fr"
LANGUES = ("fr", "nl", "en")

# Les trois postes de la barre, dans l'ordre ; leurs libellés viennent du
# fichier de la langue (`LIBELLES_BARRE`).
SEGMENTS = [(SALLE, C_SALLE), (REDISTRIBUTION, C_REDIS), (MARGE, C_MARGE)]


def eur(n) -> str:
    """Un montant en euros, à la manière de chaque langue : 20 €, € 20, €20."""
    return {"fr": f"{n} €", "nl": f"€ {n}", "en": f"€{n}"}[LANGUE]


def barre() -> str:
    """Une seule barre empilée : la séance vaut 100 %, on montre où va l'euro."""
    parts = []
    for montant, couleur in SEGMENTS:
        part = montant / RECETTE
        parts.append(
            f'<div class="seg" style="flex:{montant};background:{couleur}">'
            f'<span class="seg-val">{eur(montant)}</span>'
            f'<span class="seg-pct">{part:.0%}</span></div>'
        )
    legende = "".join(
        f'<li><span class="puce" style="background:{c}"></span>'
        f"<strong>{eur(m)}</strong> {l}</li>"
        for l, (m, c) in zip(LIBELLES_BARRE, SEGMENTS)
    )
    return f'<div class="barre">{"".join(parts)}</div><ul class="legende">{legende}</ul>'


MOIS = {
    "janvier": ("januari", "January"), "février": ("februari", "February"), "mars": ("maart", "March"),
    "avril": ("april", "April"), "mai": ("mei", "May"), "juin": ("juni", "June"), "juillet": ("juli", "July"),
    "août": ("augustus", "August"), "septembre": ("september", "September"), "octobre": ("oktober", "October"),
    "novembre": ("november", "November"), "décembre": ("december", "December"),
}


def date_dossier() -> str:
    """`DATE_DOSSIER` (« octobre 2026 ») dans la langue en cours."""
    if LANGUE == "fr":
        return DATE_DOSSIER
    mois, annee = DATE_DOSSIER.split()
    return f"{MOIS[mois][0 if LANGUE == 'nl' else 1]} {annee}"


def milliers(n: int) -> str:
    """1000 → « 1 000 » (espace fine insécable), « 1.000 » en néerlandais, « 1,000 » en anglais."""
    sep = {"fr": "\u202f", "nl": ".", "en": ","}[LANGUE]
    return f"{n:,}".replace(",", sep)


# Les polices de l'application, embarquées : Barlow pour le texte, Barlow
# Condensed pour les titres. Chaque graisse en deux sous-ensembles, que le
# navigateur choisit caractère par caractère.
LATIN = (
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, "
    "U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, "
    "U+2212, U+2215, U+FEFF, U+FFFD"
)
LATIN_EXT = (
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1D00-1DBF, "
    "U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, "
    "U+2C60-2C7F, U+A720-A7FF"
)
FONTES = [  # (clé dans assets.py, famille, graisse, style)
    ("barlow-400", "Barlow", 400, "normal"),
    ("barlow-500", "Barlow", 500, "normal"),
    ("barlow-600", "Barlow", 600, "normal"),
    ("barlow-700", "Barlow", 700, "normal"),
    ("condensed-700", "Barlow Condensed", 700, "normal"),
    ("condensed-800", "Barlow Condensed", 800, "normal"),
    ("condensed-800-italic", "Barlow Condensed", 800, "italic"),
]


def polices() -> str:
    faces = []
    for cle, famille, graisse, style in FONTES:
        for suffixe, plage in (("", LATIN), ("-ext", LATIN_EXT)):
            faces.append(
                f'@font-face {{ font-family: "{famille}"; font-weight: {graisse}; '
                f"font-style: {style}; unicode-range: {plage}; "
                f'src: url(data:font/woff2;base64,{ASSETS["font-" + cle + suffixe]}) format("woff2"); }}'
            )
    return "\n  ".join(faces)


def capture(nom: str, titre: str, texte: str) -> str:
    """Une capture de l'app, dans la langue du dossier quand elle existe.

    `captures/nl/` et `captures/en/` sont emballées sous `nom-nl`, `nom-en`
    (pack.py). La boutique n'a pas de version traduite : c'est la vraie,
    prise sur un téléphone en français, et elle sert aux trois langues.
    """
    cle = f"{nom}-{LANGUE}" if f"{nom}-{LANGUE}" in ASSETS else nom
    return f"""<figure class="shot">
      <img src="data:image/png;base64,{ASSETS[cle]}" alt="{titre}" />
      <figcaption><strong>{titre}</strong>{texte}</figcaption>
    </figure>"""


ENTETE = f"""<!doctype html>
<html lang="__LANG__">
<head>
<meta charset="utf-8" />
<title>__TITRE__</title>
<style>
  {polices()}

  /*
   * La taille est donnée en millimètres et non par le mot-clé `A4`.
   *
   * Le premier tirage sortait en 210,2 × 297,3 mm : trois dixièmes de trop,
   * assez pour qu'une visionneuse mette le dossier à l'échelle et laisse une
   * marge blanche tout autour. Avec `preferCSSPageSize` côté Chromium, cette
   * déclaration fait foi et la page fait exactement A4.
   */
  @page {{ size: 210mm 297mm; margin: 0; }}

  :root {{
    --navy: #0F172A;
    --navy-2: #1E293B;
    --orange: #EA580C;
    --ink: #0F172A;
    --ink-2: #475569;
    --ink-3: #94A3B8;
    --rule: #E2E8F0;
    --wash: #F8FAFC;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}

  /*
   * La largeur du document est verrouillée.
   *
   * Sans cela, le halo de la couverture — positionné à `right: -40mm` — sort
   * de la page et élargit le document à 250 mm. Chromium réduit alors tout le
   * dossier pour le faire tenir, et chaque page s'imprime à 84 % de sa taille,
   * entourée de blanc. Le `overflow: hidden` des pages découpe ce qui dépasse
   * au lieu de le laisser compter.
   */
  html, body {{ width: 210mm; overflow-x: hidden; }}
  body {{
    font-family: "Barlow", system-ui, sans-serif;
    color: var(--ink);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}
  .page {{
    width: 210mm; height: 297mm; padding: 15mm 15mm 10mm;
    page-break-after: always; position: relative; overflow: hidden;
    display: flex; flex-direction: column;
  }}
  .page:last-child {{ page-break-after: auto; }}

  /* --- Couverture --- */
  .cover {{ background: var(--navy); color: #fff; justify-content: center; padding: 0 20mm; }}
  .cover .glow {{
    position: absolute; right: -40mm; top: -30mm; width: 140mm; height: 140mm;
    border-radius: 50%; background: var(--orange); opacity: .16; filter: blur(30mm);
  }}
  .cover .mark {{ display: flex; align-items: center; gap: 6mm; margin-bottom: 14mm; position: relative; }}
  .cover .mark img {{ width: 22mm; height: 22mm; }}
  .cover .mark span {{ font-family: "Barlow Condensed"; font-size: 32pt; font-weight: 800; font-style: italic; letter-spacing: .5pt; }}
  .cover .mark em {{ font-style: normal; color: var(--orange); }}
  .cover h1 {{
    font-family: "Barlow Condensed"; font-style: italic; text-transform: uppercase;
    font-size: 40pt; line-height: 1; font-weight: 800; letter-spacing: 0; position: relative;
    max-width: 108mm;
  }}
  .cover h1 b {{ color: var(--orange); font-weight: 800; }}
  .cover p.sub {{ font-size: 13pt; color: #CBD5E1; margin-top: 8mm; max-width: 104mm; line-height: 1.5; position: relative; }}
  /*
   * L'application elle-même, sur la couverture : un téléphone penché, l'écran
   * d'accueil de la refonte « Stade de nuit ». Posé à droite du texte, qui
   * est limité à 108 mm pour ne jamais passer dessous.
   */
  .cover .phone {{
    position: absolute; right: 13mm; top: 50%; width: 64mm;
    transform: translateY(-46%) rotate(6deg);
    background: #000; border: 1.4mm solid #1E293B; border-radius: 9mm; padding: 1.6mm;
    box-shadow: 0 10mm 24mm rgba(0,0,0,.55), 0 0 0 .4mm #334155;
  }}
  .cover .phone img {{ width: 100%; display: block; border-radius: 7mm; }}
  .cover .meta {{ position: absolute; left: 20mm; bottom: 18mm; font-size: 10pt; color: #94A3B8; }}
  .cover .meta strong {{ color: #fff; display: block; font-size: 12pt; margin-bottom: 1mm; }}
  /*
   * Le code QR des deux stores, en bas à droite de la couverture : sous le
   * téléphone, en face de la mention du dossier. Un QR ne se lit que sur fond
   * clair, d'où la vignette blanche.
   */
  .qr {{ background: #fff; border-radius: 2.5mm; padding: 2mm; flex: none; }}
  .qr svg {{ display: block; width: 100%; height: 100%; }}
  .cover .dl {{
    position: absolute; right: 20mm; bottom: 16mm; display: flex; align-items: center; gap: 4mm;
    text-align: right; font-size: 9.5pt; color: #94A3B8; line-height: 1.45;
  }}
  .cover .dl strong {{ display: block; color: #fff; font-size: 12pt; }}
  .cover .dl b {{ color: #FDBA74; font-weight: 600; }}
  .cover .dl .qr {{ width: 24mm; height: 24mm; }}

  /* --- Pages courantes --- */
  .eyebrow {{
    font-family: "Barlow Condensed";
    font-size: 10pt; font-weight: 700; letter-spacing: 1.6pt; text-transform: uppercase;
    color: var(--orange); margin-bottom: 3mm;
  }}
  h2 {{
    font-family: "Barlow Condensed"; font-style: italic; text-transform: uppercase;
    font-size: 27pt; font-weight: 800; letter-spacing: 0; line-height: 1.02; margin-bottom: 4.5mm;
  }}
  h3 {{ font-size: 12pt; font-weight: 700; margin-bottom: 1.5mm; }}
  /*
   * Barlow est plus large que la Roboto Condensed des versions précédentes :
   * à corps égal, chaque paragraphe prenait une ligne de plus et quatre pages
   * débordaient. Le corps descend donc d'un demi-point, l'interlignage d'un
   * cheveu.
   */
  p {{ font-size: 9.6pt; line-height: 1.5; color: var(--ink-2); }}
  p + p {{ margin-top: 3mm; }}
  .lead {{ font-size: 11.5pt; font-weight: 500; line-height: 1.45; color: var(--ink); margin-bottom: 5mm; }}
  strong {{ color: var(--ink); }}

  .grid2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; }}
  .grid3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }}

  .card {{ background: var(--wash); border: 1px solid var(--rule); border-radius: 3mm; padding: 5mm; }}
  .card h3 {{ display: flex; align-items: baseline; gap: 2.5mm; }}
  .card h3 i {{ font-family: "Barlow Condensed"; font-style: normal; color: var(--orange); font-size: 11pt; font-weight: 800; }}
  .card p {{ font-size: 8.8pt; line-height: 1.45; }}

  /* --- Chiffres vedettes : des nombres, pas un graphique --- */
  .kpis {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin: 6mm 0; }}
  .kpi {{ border-top: 1mm solid var(--orange); padding-top: 3mm; }}
  .kpi .n {{ font-family: "Barlow Condensed"; font-size: 34pt; font-weight: 800; line-height: 1; }}
  .kpi .u {{ font-size: 11pt; font-weight: 700; color: var(--ink-2); margin-left: 1mm; }}
  .kpi .l {{ font-size: 9pt; color: var(--ink-2); margin-top: 1.5mm; line-height: 1.4; }}

  /* --- La barre : marques fines, séparations de 2 px, étiquettes directes --- */
  /*
   * `flex: none` n'est pas décoratif. La page est une colonne flex : sans lui,
   * la barre — seul enfant à hauteur fixe — se fait écraser dès que la page se
   * remplit, et tombe à un filet de deux millimètres où les montants ne se
   * lisent plus. Elle était la variable d'ajustement silencieuse d'une page
   * trop pleine ; elle ne l'est plus, et c'est le contrôle de débordement qui
   * prévient.
   */
  .barre {{
    display: flex; height: 16mm; flex: none;
    border-radius: 1.5mm; overflow: hidden; gap: 2px; margin-top: 2mm;
  }}
  .seg {{ display: flex; flex-direction: column; align-items: center; justify-content: center; color: #fff; }}
  .seg-val {{ font-family: "Barlow Condensed"; font-size: 15pt; font-weight: 800; line-height: 1; }}
  .seg-pct {{ font-size: 8.5pt; opacity: .85; margin-top: .8mm; }}
  .legende {{ list-style: none; display: flex; gap: 7mm; margin-top: 3.5mm; flex-wrap: wrap; }}
  .legende li {{ font-size: 9.5pt; color: var(--ink-2); display: flex; align-items: center; gap: 2mm; }}
  .puce {{ width: 3mm; height: 3mm; border-radius: .8mm; display: inline-block; }}

  table {{ width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 3mm; }}
  th, td {{ text-align: left; padding: 2.4mm 2mm; border-bottom: 1px solid var(--rule); }}
  th {{ font-family: "Barlow Condensed"; font-size: 9pt; text-transform: uppercase; letter-spacing: .8pt; color: var(--ink-3); font-weight: 700; }}
  td.n {{ text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }}
  td.c {{ text-align: center; }}
  tr.total td {{ border-bottom: none; border-top: 1.5px solid var(--ink); font-weight: 800; color: var(--ink); }}
  table.modes td:first-child {{ font-weight: 700; color: var(--ink); }}
  table.modes td {{ font-size: 9.5pt; }}
  /*
   * La table des formats en a gagné un cinquième — le Football à onze — et la page
   * était pleine. Un demi-millimètre de moins par cellule suffit à les loger
   * tous les cinq sans toucher au corps du texte.
   */
  table.modes th, table.modes td {{ padding: 1.9mm 2mm; }}
  .bientot {{ color: var(--ink-3); font-style: italic; }}

  .shots {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; margin-top: 5mm; }}
  .shots.duo {{ grid-template-columns: repeat(2, 1fr); gap: 8mm; }}
  /*
   * Une capture de téléphone fait deux fois plus haut que large : posée en
   * pleine colonne, elle dépasse le bas de la page, et comme les pages ont
   * `overflow: hidden`, elle emporterait le texte qui la suit sans rien dire.
   * `--shot-max` plafonne la hauteur là où la place manque ; l'image est alors
   * rognée par le bas, ce qui est le bon sens de lecture d'un écran.
   */
  .shot img {{
    width: 100%; border-radius: 2.5mm; border: 1px solid var(--rule); display: block;
    max-height: var(--shot-max, none); object-fit: cover; object-position: top center;
  }}
  .shot figcaption {{ font-size: 8.5pt; color: var(--ink-2); margin-top: 2.5mm; line-height: 1.45; }}
  .shot figcaption strong {{ display: block; font-size: 9.5pt; color: var(--ink); margin-bottom: .6mm; }}

  .note {{
    background: #FFF7ED; border-left: 1mm solid var(--orange); padding: 4mm 5mm;
    border-radius: 0 2mm 2mm 0; margin-top: 5mm;
  }}
  .note p {{ font-size: 9.2pt; }}
  .note.bas {{ margin-top: auto; }}
  .note strong {{ color: #9A3412; }}

  .flux {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 2mm; }}
  .flux h3 {{
    font-family: "Barlow Condensed"; font-size: 12pt; text-transform: uppercase; letter-spacing: 1pt;
    padding-bottom: 2mm; margin-bottom: 3mm; border-bottom: 1mm solid var(--orange);
  }}
  .flux ul {{ list-style: none; }}
  .flux li {{
    display: flex; justify-content: space-between; gap: 3mm; align-items: baseline;
    padding: 2.3mm 0; border-bottom: 1px solid var(--rule); font-size: 9.2pt;
    color: var(--ink-2);
  }}
  .flux li b {{ color: var(--ink); font-weight: 700; }}
  .flux li span {{ white-space: nowrap; font-weight: 700; color: var(--orange); font-variant-numeric: tabular-nums; }}
  .flux li em {{ font-style: normal; display: block; color: var(--ink-3); font-size: 8.5pt; margin-top: .4mm; }}

  /* --- Page 3 : les deux portes d'entrée d'une proposition --- */
  .portes {{ display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }}
  .porte {{ border: 1px solid var(--rule); border-top: 1mm solid var(--orange); border-radius: 0 0 3mm 3mm; padding: 3.5mm 4.5mm; }}
  .porte h3 {{ font-size: 11pt; margin-bottom: .8mm; }}
  .porte .lst {{
    font-family: "Barlow Condensed"; font-size: 10.5pt; font-weight: 700; letter-spacing: .4pt;
    text-transform: uppercase; color: var(--orange); margin-bottom: 1.2mm;
  }}
  .porte p {{ font-size: 9pt; line-height: 1.4; }}

  /* --- Page 10 : l'Immersive Arena --- */
  .arena {{ position: relative; border-radius: 3mm; overflow: hidden; flex: none; }}
  .arena img {{ display: block; width: 100%; height: 104mm; object-fit: cover; object-position: center 40%; }}
  .arena figcaption {{
    position: absolute; left: 0; right: 0; bottom: 0; padding: 10mm 6mm 4.5mm;
    background: linear-gradient(transparent, rgba(15,23,42,.92)); color: #fff;
  }}
  .arena figcaption b {{ font-family: "Barlow Condensed"; font-style: italic; font-weight: 800; font-size: 17pt; text-transform: uppercase; display: block; line-height: 1.05; }}
  .arena figcaption span {{ font-size: 9pt; color: #CBD5E1; }}

  .steps {{ list-style: none; counter-reset: s; margin-top: 4mm; }}
  .steps li {{ counter-increment: s; padding: 3.5mm 0 3.5mm 12mm; border-bottom: 1px solid var(--rule); position: relative; }}
  .steps li::before {{
    content: counter(s); position: absolute; left: 0; top: 3.5mm;
    width: 7mm; height: 7mm; border-radius: 50%; background: var(--navy); color: #fff;
    font-size: 9pt; font-weight: 800; display: flex; align-items: center; justify-content: center;
  }}
  .steps h3 {{ font-size: 11.5pt; }}
  .steps.large li {{ padding: 5.5mm 0 5.5mm 12mm; }}
  .steps.large li::before {{ top: 5.5mm; }}
  .steps.large .when {{ top: 6mm; }}
  .steps p {{ font-size: 9.5pt; margin-top: .8mm; }}
  .steps .when {{ position: absolute; right: 0; top: 4mm; font-family: "Barlow Condensed"; font-size: 10pt; color: var(--orange); font-weight: 700; text-transform: uppercase; letter-spacing: .5pt; }}

  /* --- Dernière page : l'état des applications mobiles --- */
  .stores {{ position: relative; display: flex; gap: 4mm; margin-top: 9mm; flex-wrap: wrap; }}
  .store {{
    display: flex; align-items: center; gap: 3mm; padding: 3mm 5mm; border-radius: 3mm;
    border: .4mm solid rgba(255,255,255,.18); background: rgba(255,255,255,.06);
  }}
  .store b {{ font-family: "Barlow Condensed"; font-size: 14pt; font-weight: 800; color: #fff; letter-spacing: .3pt; }}
  .store span {{ font-size: 9pt; color: #86EFAC; font-weight: 600; }}
  .store i {{ width: 2.4mm; height: 2.4mm; border-radius: 50%; background: #22C55E; box-shadow: 0 0 0 1.2mm rgba(34,197,94,.25); }}
  .stores .qr {{ width: 27mm; height: 27mm; margin-left: 4mm; }}
  .stores .scan {{ font-size: 9pt; color: #94A3B8; line-height: 1.5; align-self: center; }}
  .stores .scan strong {{ display: block; color: #fff; font-size: 11pt; }}

  .foot {{ margin-top: auto; padding-top: 4mm; border-top: 1px solid var(--rule);
           display: flex; justify-content: space-between; font-size: 8pt; color: var(--ink-3); }}
</style>
</head>
"""

# --- Les trois langues -------------------------------------------------------
# Le texte de chaque version vit dans `pages_<langue>.py` : une seule f-string,
# exécutée ici, qui lit les mêmes constantes et les mêmes fonctions. Le barème
# n'existe donc qu'une fois, quelle que soit la langue imprimée.
for LANGUE in (sys.argv[1:] or LANGUES):
    exec((OUT / f"pages_{LANGUE}.py").read_text(encoding="utf8"))
    html = ENTETE.replace("__LANG__", LANGUE).replace("__TITRE__", TITRE) + "\n" + PAGES + "\n</html>"
    nom = "dossier.html" if LANGUE == "fr" else f"dossier-{LANGUE}.html"
    (OUT / nom).write_text(html, encoding="utf8")
    print(f"{nom} : {len(html) // 1024} Ko")
print(
    f"séance de ligue : recette {RECETTE} € · salle {SALLE} € · arbitre {ARBITRE} € · "
    f"récompenses {RECOMPENSES} € · marge {MARGE} € ({MARGE / RECETTE:.0%})"
)
print(f"au tarif courant ({SALLE_HEURE_COURANT} €/h) : marge {MARGE_COURANTE} €")
print(f"amical : recette {AMICAL_RECETTE} € · salle {AMICAL_SALLE} € · marge {AMICAL_MARGE} €")
