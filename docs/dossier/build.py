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

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from assets import ASSETS  # noqa: E402

OUT = pathlib.Path(__file__).parent

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

# Grand Foot : football à onze en plein air, sur un terrain prêté. Le seul
# mode gratuit, et le seul dont l'effectif se choisit à la création — de sept
# contre sept à onze contre onze.
GRAND_MIN_PAR_EQUIPE = 7
GRAND_MAX_PAR_EQUIPE = 11
GRAND_HEURES = 1
GRAND_PRIX = 0

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

# L'arbitre qui préfère facturer plutôt qu'être payé en points : quinze euros
# de l'heure hors TVA, en contrat indépendant. Le montant doit tomber juste sur
# les 300 UNO, sans quoi le dossier annoncerait deux tarifs différents pour le
# même travail.
ARBITRE_EUR_HEURE = 15

# Le noyau visé. Trois divisions, une séance par division et par semaine :
# quarante-cinq places hebdomadaires. Cent joueurs, c'est l'effectif où chacun
# vient environ une semaine sur deux — le rythme qu'un adulte tient vraiment.
NOYAU_CIBLE = 100
DIVISIONS = 3

# L'adresse à imprimer sur la page de contact.
SITE_PUBLIC = "unoleague.be"

# Le nombre de tests automatisés, relevé à la dernière exécution complète de
# `pnpm test`. Écrit ici et nulle part ailleurs : un chiffre recopié dans deux
# paragraphes finit par en contredire un.
TESTS = 602

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

SEGMENTS = [
    ("Location de salle", SALLE, C_SALLE),
    ("Revient aux joueurs et à l'arbitre", REDISTRIBUTION, C_REDIS),
    ("Marge de la ligue", MARGE, C_MARGE),
]


def barre() -> str:
    """Une seule barre empilée : la séance vaut 100 %, on montre où va l'euro."""
    parts = []
    for libelle, montant, couleur in SEGMENTS:
        part = montant / RECETTE
        parts.append(
            f'<div class="seg" style="flex:{montant};background:{couleur}">'
            f'<span class="seg-val">{montant} €</span>'
            f'<span class="seg-pct">{part:.0%}</span></div>'
        )
    legende = "".join(
        f'<li><span class="puce" style="background:{c}"></span>'
        f"<strong>{m} €</strong> {l}</li>"
        for l, m, c in SEGMENTS
    )
    return f'<div class="barre">{"".join(parts)}</div><ul class="legende">{legende}</ul>'


def capture(nom: str, titre: str, texte: str) -> str:
    return f"""<figure class="shot">
      <img src="data:image/png;base64,{ASSETS[nom]}" alt="{titre}" />
      <figcaption><strong>{titre}</strong>{texte}</figcaption>
    </figure>"""


HTML = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>UNO League — Dossier de présentation</title>
<style>
  @font-face {{
    font-family: "Roboto Condensed";
    src: url(data:font/woff2;base64,{ASSETS["font"]}) format("woff2");
    font-weight: 100 900;
  }}

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
    font-family: "Roboto Condensed", system-ui, sans-serif;
    color: var(--ink);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}
  .page {{
    width: 210mm; height: 297mm; padding: 16mm 15mm 12mm;
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
  .cover .mark svg {{ width: 22mm; height: 22mm; }}
  .cover .mark span {{ font-size: 30pt; font-weight: 800; letter-spacing: -.5pt; }}
  .cover .mark em {{ font-style: normal; color: var(--orange); }}
  .cover h1 {{ font-size: 40pt; line-height: 1.05; font-weight: 800; letter-spacing: -1pt; position: relative; }}
  .cover h1 b {{ color: var(--orange); font-weight: 800; }}
  .cover p.sub {{ font-size: 14pt; color: #CBD5E1; margin-top: 8mm; max-width: 130mm; line-height: 1.5; position: relative; }}
  .cover .meta {{ position: absolute; left: 20mm; bottom: 18mm; font-size: 10pt; color: #94A3B8; }}
  .cover .meta strong {{ color: #fff; display: block; font-size: 12pt; margin-bottom: 1mm; }}

  /* --- Pages courantes --- */
  .eyebrow {{
    font-size: 9pt; font-weight: 700; letter-spacing: 1.4pt; text-transform: uppercase;
    color: var(--orange); margin-bottom: 3mm;
  }}
  h2 {{ font-size: 26pt; font-weight: 800; letter-spacing: -.5pt; line-height: 1.12; margin-bottom: 5mm; }}
  h3 {{ font-size: 13pt; font-weight: 700; margin-bottom: 1.5mm; }}
  p {{ font-size: 10.5pt; line-height: 1.6; color: var(--ink-2); }}
  p + p {{ margin-top: 3mm; }}
  .lead {{ font-size: 13pt; line-height: 1.55; color: var(--ink); margin-bottom: 6mm; }}
  strong {{ color: var(--ink); }}

  .grid2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; }}
  .grid3 {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; }}

  .card {{ background: var(--wash); border: 1px solid var(--rule); border-radius: 3mm; padding: 5mm; }}
  .card h3 {{ display: flex; align-items: baseline; gap: 2.5mm; }}
  .card h3 i {{ font-style: normal; color: var(--orange); font-size: 10pt; font-weight: 800; }}
  .card p {{ font-size: 9.5pt; line-height: 1.5; }}

  /* --- Chiffres vedettes : des nombres, pas un graphique --- */
  .kpis {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 5mm; margin: 6mm 0; }}
  .kpi {{ border-top: 1mm solid var(--orange); padding-top: 3mm; }}
  .kpi .n {{ font-size: 30pt; font-weight: 800; line-height: 1; letter-spacing: -1pt; }}
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
  .seg-val {{ font-size: 13pt; font-weight: 800; line-height: 1; }}
  .seg-pct {{ font-size: 8.5pt; opacity: .85; margin-top: .8mm; }}
  .legende {{ list-style: none; display: flex; gap: 7mm; margin-top: 3.5mm; flex-wrap: wrap; }}
  .legende li {{ font-size: 9.5pt; color: var(--ink-2); display: flex; align-items: center; gap: 2mm; }}
  .puce {{ width: 3mm; height: 3mm; border-radius: .8mm; display: inline-block; }}

  table {{ width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 3mm; }}
  th, td {{ text-align: left; padding: 2.4mm 2mm; border-bottom: 1px solid var(--rule); }}
  th {{ font-size: 8.5pt; text-transform: uppercase; letter-spacing: .8pt; color: var(--ink-3); font-weight: 700; }}
  td.n {{ text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }}
  td.c {{ text-align: center; }}
  tr.total td {{ border-bottom: none; border-top: 1.5px solid var(--ink); font-weight: 800; color: var(--ink); }}
  table.modes td:first-child {{ font-weight: 700; color: var(--ink); }}
  table.modes td {{ font-size: 9.5pt; }}
  /*
   * La table des formats en a gagné un cinquième — le Grand Foot — et la page
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
  .note p {{ font-size: 9.5pt; }}
  .note.bas {{ margin-top: auto; }}
  .note strong {{ color: #9A3412; }}

  .flux {{ display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-top: 2mm; }}
  .flux h3 {{
    font-size: 11pt; text-transform: uppercase; letter-spacing: 1pt;
    padding-bottom: 2mm; margin-bottom: 3mm; border-bottom: 1mm solid var(--orange);
  }}
  .flux ul {{ list-style: none; }}
  .flux li {{
    display: flex; justify-content: space-between; gap: 3mm; align-items: baseline;
    padding: 2.6mm 0; border-bottom: 1px solid var(--rule); font-size: 9.5pt;
    color: var(--ink-2);
  }}
  .flux li b {{ color: var(--ink); font-weight: 700; }}
  .flux li span {{ white-space: nowrap; font-weight: 700; color: var(--orange); font-variant-numeric: tabular-nums; }}
  .flux li em {{ font-style: normal; display: block; color: var(--ink-3); font-size: 8.5pt; margin-top: .4mm; }}

  .steps {{ list-style: none; counter-reset: s; margin-top: 4mm; }}
  .steps li {{ counter-increment: s; padding: 3.5mm 0 3.5mm 12mm; border-bottom: 1px solid var(--rule); position: relative; }}
  .steps li::before {{
    content: counter(s); position: absolute; left: 0; top: 3.5mm;
    width: 7mm; height: 7mm; border-radius: 50%; background: var(--navy); color: #fff;
    font-size: 9pt; font-weight: 800; display: flex; align-items: center; justify-content: center;
  }}
  .steps h3 {{ font-size: 11.5pt; }}
  .steps p {{ font-size: 9.5pt; margin-top: .8mm; }}
  .steps .when {{ position: absolute; right: 0; top: 4mm; font-size: 9pt; color: var(--orange); font-weight: 700; }}

  .foot {{ margin-top: auto; padding-top: 5mm; border-top: 1px solid var(--rule);
           display: flex; justify-content: space-between; font-size: 8pt; color: var(--ink-3); }}
</style>
</head>
<body>

<!-- ───────────────────────── 1. Couverture ───────────────────────── -->
<section class="page cover">
  <div class="glow"></div>
  <div class="mark">
    <!-- L'écusson de la ligue (docs/branding/mark.svg). -->
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 5 56 12.5V32c0 13.6-10.2 22.4-24 27C18.2 54.4 8 45.6 8 32V12.5Z" fill="#0F172A" stroke="#F97316" stroke-width="3.5" stroke-linejoin="round"/><circle cx="32.0" cy="30.0" r="13.0" fill="#fff"/><path d="M32.00 22.98 38.68 27.83 36.13 35.68 27.87 35.68 25.32 27.83Z" fill="#F97316"/><g stroke="#0F172A" stroke-width="2.02" stroke-linecap="round"><path d="M32.00 22.98 32.00 17.00"/><path d="M38.68 27.83 44.36 25.98"/><path d="M36.13 35.68 39.64 40.52"/><path d="M27.87 35.68 24.36 40.52"/><path d="M25.32 27.83 19.64 25.98"/></g></svg>
    <span>UNO <em>LEAGUE</em></span>
  </div>
  <h1>Le futsal amateur,<br />sans licence,<br />sans engagement.<br /><b>Avec récompenses.</b></h1>
  <p class="sub">
    Une ligue ouverte à tous, organisée par une application qui gère les
    séances, les paiements, les équipes et le classement — et qui récompense
    ceux qui jouent.
  </p>
  <div class="meta">
    <strong>Dossier de présentation</strong>
    Septembre 2026 · Belgique
  </div>
</section>

<!-- ───────────────────────── 2. Le problème ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Le constat</div>
  <h2>Jouer au foot entre adultes<br />est devenu compliqué.</h2>

  <p class="lead">
    Le club demande une licence, un entraînement fixe et un engagement d'un an.
    Beaucoup d'adultes ne peuvent plus s'y tenir — horaires de travail, enfants,
    santé. Ils ne jouent donc plus, ou jouent mal : un groupe de discussion, une
    salle réservée à la dernière minute, et des séances qui tombent.
  </p>

  <div class="grid2">
    <div class="card">
      <h3><i>01</i> Personne ne veut gérer l'argent</h3>
      <p>
        Un organisateur avance la salle et relance ensuite quinze personnes une
        par une. C'est la tâche que tout le monde refuse, et celle qui fait
        mourir les groupes.
      </p>
    </div>
    <div class="card">
      <h3><i>02</i> Une séance tombe pour un absent</h3>
      <p>
        À deux jours du créneau, il manque un joueur : la salle est perdue, les
        autres restent chez eux. Aucune liste d'attente, aucun remplaçant
        organisé.
      </p>
    </div>
    <div class="card">
      <h3><i>03</i> Rien ne se construit</h3>
      <p>
        On joue, on oublie. Pas de classement, pas de progression, pas de
        raison de revenir la semaine suivante — donc l'assiduité s'effrite.
      </p>
    </div>
    <div class="card">
      <h3><i>04</i> Les nouveaux restent dehors</h3>
      <p>
        Un groupe fermé ne s'ouvre pas. Celui qui vient d'arriver dans la
        commune, ou qui reprend le sport, n'a aucune porte d'entrée.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Le sport amateur adulte ne manque pas de joueurs, il manque
      d'organisation.</strong> UNO League ne crée pas un club de plus : elle
      fournit l'organisation qui manquait, et ouvre le jeu à ceux qu'aucune
      structure ne va chercher.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>2</span></div>
</section>

<!-- ───────────────────────── 3. La solution ───────────────────────── -->
<section class="page">
  <div class="eyebrow">La proposition</div>
  <h2>N'importe quel joueur<br />ouvre une proposition.</h2>

  <p class="lead">
    Une salle, une date, une heure : la proposition est ouverte, et les autres
    s'y inscrivent. Dès que le plateau est complet, elle devient une
    réservation et chacun règle sa place depuis l'application — carte,
    Bancontact, ou points accumulés. Plus personne n'avance d'argent, plus
    personne ne relance.
  </p>

  <div class="shots">
    {capture("proposition", "Une proposition ouverte", "Mode, salle, créneau, prix, inscriptions, récompenses en jeu et participants déjà inscrits.")}
    {capture("calendrier", "Le calendrier", "Chaque créneau porte son mode, sa division, son prix et le nombre de places restantes.")}
    {capture("accueil", "Ce qui vous concerne", "Les prochaines séances, leur état de remplissage et ce qui reste à payer.")}
    {capture("classement", "Le classement", "Trois divisions. On monte, on descend, selon les résultats de la séance.")}
  </div>

  <div class="grid3" style="margin-top:7mm">
    <div class="card">
      <h3><i>01</i> Proposition</h3>
      <p>
        Un joueur ouvre un créneau, les autres s'inscrivent. Rien n'est
        engagé tant que le plateau n'est pas complet.
      </p>
    </div>
    <div class="card">
      <h3><i>02</i> Réservation</h3>
      <p>
        Le plateau complet déclenche le paiement <strong>et forme les
        équipes</strong> ; chacun a vingt-quatre heures. Passé ce délai la
        place s'ouvre aux remplaçants, mais elle n'est perdue que si l'un
        d'eux la règle.
      </p>
    </div>
    <div class="card">
      <h3><i>03</i> Séance</h3>
      <p>
        Chacun prend sa place sur le terrain, la feuille de match est tenue,
        et la clôture met à jour statistiques, récompenses et classement.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Le pari : la régularité naît de l'enjeu.</strong> Un classement,
      des divisions, une carte de joueur qui évolue, des points gagnés à chaque
      séance — ce sont les ressorts du sport en club, sans la licence ni
      l'engagement annuel. On revient parce que la semaine prochaine compte, et
      parce qu'elle rapporte.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>3</span></div>
</section>

<!-- ───────────────────────── 4. Les modes de jeu ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Les formats</div>
  <h2>Chaque mode a ses règles,<br />sa durée et ses récompenses.</h2>

  <p class="lead">
    Une séance n'a ni le même prix, ni la même durée, ni les mêmes
    conséquences selon son mode. La compétition officielle est la plus longue,
    la plus chère — et la seule qui rapporte des points et fasse bouger le
    classement. À côté d'elle, des formats plus légers.
  </p>

  <div class="grid2" style="align-items:start;grid-template-columns:1.15fr .85fr">
    <div>
      <table class="modes">
        <thead>
          <tr>
            <th>Mode</th>
            <th class="c">Joueurs</th>
            <th class="c">Durée</th>
            <th class="c">Prix</th>
            <th class="c">Rapporte</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>UNO League</td>
            <td class="c">{LIGUE_JOUEURS}</td>
            <td class="c">{LIGUE_HEURES} h</td>
            <td class="c">{LIGUE_PRIX} €</td>
            <td class="c"><strong>Points, statistiques, division</strong></td>
          </tr>
          <tr>
            <td>Match amical</td>
            <td class="c">{AMICAL_JOUEURS}</td>
            <td class="c">{AMICAL_HEURES} h</td>
            <td class="c">{AMICAL_PRIX} €</td>
            <td class="c">Expérience</td>
          </tr>
          <tr>
            <td>Match de club</td>
            <td class="c">{CLUB_JOUEURS}</td>
            <td class="c">{CLUB_HEURES} h</td>
            <td class="c">{CLUB_PRIX} €</td>
            <td class="c">Statistiques, la mise</td>
          </tr>
          <tr>
            <td>Tournoi entre clubs</td>
            <td class="c">4 à 8 clubs</td>
            <td class="c">2 h</td>
            <td class="c">par club</td>
            <td class="c">La dotation</td>
          </tr>
          <tr>
            <td>Grand Foot</td>
            <td class="c">{GRAND_MIN_PAR_EQUIPE * 2} à {GRAND_MAX_PAR_EQUIPE * 2}</td>
            <td class="c">{GRAND_HEURES} h</td>
            <td class="c"><strong>Gratuit</strong></td>
            <td class="c">Expérience</td>
          </tr>
        </tbody>
      </table>

      <h3 style="margin-top:5mm">Le talent paie</h3>
      <p>
        La feuille désigne le meilleur buteur, le meilleur passeur et le
        meilleur défenseur. L'équipe victorieuse aussi, et <strong>tout le
        monde touche une part pour être venu</strong>.
      </p>

      <h3 style="margin-top:4mm">Une carte qui raconte une saison</h3>
      <p>
        Buts, passes, arrêts, interceptions, homme du match : chaque action
        saisie remonte dans la carte du joueur. La note générale monte — et
        descend. L'expérience s'accumule dans <strong>tous</strong> les modes.
      </p>

      <h3 style="margin-top:4mm">Qui joue avec qui, et à quel poste</h3>
      <p>
        <strong>En UNO League, la ligue répartit</strong> : {LIGUE_JOUEURS}
        joueurs en {LIGUE_EQUIPES} équipes de {LIGUE_JOUEURS // LIGUE_EQUIPES},
        tirées dès que le plateau est complet — on joue avec des gens qu'on
        n'aurait pas choisis, et c'est ce qui rend le classement lisible.
        <strong>Ailleurs, le camp se choisit.</strong> Dans tous les cas,
        chacun prend sa place sur le terrain avant le coup d'envoi : « qui va
        dans les buts ? » se règle la veille, plus dans le vestiaire.
      </p>
    </div>

    <div class="shots duo" style="grid-template-columns:1fr;margin-top:0;--shot-max:118mm">
      {capture("terrain-ligue", "Le terrain d'une séance", "Les trois équipes sont tirées au sort ; chacun choisit son poste dans la sienne. Une place libre se voit, un inscrit sans poste aussi.")}
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Le Grand Foot ne coûte rien à personne.</strong> Terrain prêté
      à la ligue, en plein air : pas de salle à louer, donc pas de place à
      payer. L'effectif se choisit à l'ouverture, de {GRAND_MIN_PAR_EQUIPE} à
      {GRAND_MAX_PAR_EQUIPE} par équipe. Un mode pour jouer, et pour faire
      venir.
    </p>
    <p style="margin-top:2mm">
      <strong>L'arbitre intervient en UNO League et dans les tournois.</strong>
      Il ne joue pas, n'entre dans aucun classement, et son travail est payé —
      en points UNO, ou sur facture hors TVA s'il préfère. Les défis et les
      amicaux se jouent sans arbitre.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>4</span></div>
</section>

<!-- ───────────────────────── 5. L'impact social ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Ce que la ligue rend possible</div>
  <h2>On ne vend pas une application.<br />On ouvre un vestiaire.</h2>

  <p class="lead">
    Il y a, dans chaque commune, des adultes qui aimaient le foot et qui ont
    arrêté. Pas par manque d'envie — par manque de porte d'entrée. UNO League
    est cette porte : on s'inscrit seul, on repart avec des coéquipiers et une
    raison de revenir vendredi.
  </p>

  <div class="grid2" style="margin-bottom:6mm">
    <div>
      <h3>Personne n'est de trop</h3>
      <p>
        Pas de licence, pas de cotisation annuelle, pas de sélection, pas de
        niveau minimum. On paie la séance à laquelle on vient. Celui qui ne
        peut venir qu'une fois par mois n'est pas pénalisé, et celui qui
        débute joue dès la première semaine — les divisions existent pour
        qu'il rencontre son niveau, pas pour l'écarter.
      </p>

      <h3 style="margin-top:4mm">Des équipes qu'on n'aurait pas formées</h3>
      <p>
        En compétition, c'est la ligue qui répartit. On joue chaque semaine
        avec des gens d'un autre quartier, d'un autre métier, d'un autre âge.
        C'est l'effet recherché : un club se referme sur les siens, une ligue
        ouverte les mélange. Le vestiaire fait le reste.
      </p>

      <h3 style="margin-top:4mm">Jouer en sécurité</h3>
      <p>
        Un arbitre en compétition, des règles écrites et consultables, une
        feuille de match tenue. Les comportements se régulent parce que le
        classement et la carte en dépendent — et parce qu'un adulte qui vient
        se défouler après le travail veut rentrer entier.
      </p>
    </div>
    <div>
      <div class="shots duo" style="grid-template-columns:1fr;margin-top:0;--shot-max:106mm">
        {capture("club", "Les clubs", "Un groupe d'amis fonde son club, l'alimente, défie les autres. Le lien social devient une mécanique de jeu — et une raison de rester.")}
      </div>
    </div>
  </div>

  <div class="grid3">
    <div class="card">
      <h3>Une raison de bouger</h3>
      <p>Une à deux heures d'effort réel par séance, pour un public adulte
      que le sport a cessé d'atteindre.</p>
    </div>
    <div class="card">
      <h3>Une commune qui vit</h3>
      <p>Les salles sont louées sur place. Chaque séance fait tourner une
      infrastructure locale et son exploitant.</p>
    </div>
    <div class="card">
      <h3>Rendre à d'autres</h3>
      <p>Les points gagnés sur le terrain peuvent être reversés à une
      association partenaire, depuis la boutique.</p>
    </div>
  </div>

  <div class="note" style="margin-top:6mm">
    <p>
      <strong>Ce qu'on essaie de fabriquer, au fond, c'est une habitude.</strong>
      Le classement, les récompenses et la carte ne sont pas des gadgets : ce
      sont les raisons qui font qu'on y retourne la semaine suivante, puis
      celle d'après. Un adulte qui rejoue au foot toutes les semaines pendant
      un an, c'est le seul résultat qui compte.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>5</span></div>
</section>

<!-- ───────────────────────── 6. Les points UNO ───────────────────────── -->
<section class="page">
  <div class="eyebrow">La monnaie de la ligue</div>
  <h2>Les points UNO :<br />ce qui se gagne sur le terrain<br />se dépense dans l'app.</h2>

  <p class="lead">
    Un joueur ne peut pas acheter de points UNO : ils ne s'obtiennent qu'en
    jouant, et le talent paie plus que la présence. Ils ne se retirent pas non
    plus — ils se dépensent dans l'application. Cent points valent dix euros.
  </p>

  <div class="flux">
    <div>
      <h3>Ce qui en rapporte</h3>
      <ul>
        <li>
          <b>Meilleur buteur d'une séance<em>En D1. La D2 rapporte {R_BUTEUR["D2"]} UNO, la D3 {R_BUTEUR["D3"]}</em></b>
          <span>{R_BUTEUR["D1"]} UNO</span>
        </li>
        <li>
          <b>Meilleur passeur, meilleur défenseur<em>En D1, chacune. {R_PASSEUR["D2"]} UNO en D2, {R_PASSEUR["D3"]} en D3</em></b>
          <span>{R_PASSEUR["D1"]} UNO</span>
        </li>
        <li>
          <b>Équipe victorieuse<em>À chacun de ses {LIGUE_JOUEURS // LIGUE_EQUIPES} joueurs</em></b>
          <span>{R_MEILLEURE_EQUIPE} UNO</span>
        </li>
        <li>
          <b>Participation<em>À tout joueur présent, quel que soit le résultat</em></b>
          <span>{R_PARTICIPATION} UNO</span>
        </li>
        <li>
          <b>Passage de niveau<em>L'expérience s'acquiert dans tous les modes</em></b>
          <span>10 UNO et +</span>
        </li>
        <li>
          <b>Arbitrage d'une séance<em>Réservé aux comptes arbitre, ou {ARBITRE_EUR_HEURE} €/h HTVA sur facture</em></b>
          <span>{ARBITRE_UNO} UNO</span>
        </li>
        <li>
          <b>Gains de club<em>Mise d'un défi remporté, prime de transfert</em></b>
          <span>variable</span>
        </li>
      </ul>
    </div>
    <div>
      <h3>Ce qu'on en fait</h3>
      <ul>
        <li>
          <b>Payer sa place en séance de ligue<em>L'usage principal : les points remplacent l'euro</em></b>
          <span>{LIGUE_PRIX * UNO_PAR_EURO} UNO</span>
        </li>
        <li>
          <b>Payer sa place en amical ou en match de club<em>Format court, une heure</em></b>
          <span>{AMICAL_PRIX * UNO_PAR_EURO} UNO</span>
        </li>
        <li>
          <b>Commander dans la boutique<em>Équipement, multimédia, objets du quotidien</em></b>
          <span>au prix affiché</span>
        </li>
        <li>
          <b>Reverser à une association partenaire<em>Le don est proposé dans la boutique</em></b>
          <span>au choix</span>
        </li>
        <li>
          <b>Alimenter la caisse de son club<em>Mise d'un défi, droit d'entrée d'un tournoi</em></b>
          <span>au choix</span>
        </li>
        <li>
          <b>Envoyer des points à un autre joueur<em>Chaque mouvement reste inscrit au registre</em></b>
          <span>au choix</span>
        </li>
      </ul>
    </div>
  </div>

  <div class="grid3" style="margin-top:5mm">
    <div class="card">
      <h3>Tout est inscrit</h3>
      <p>
        Chaque mouvement porte sa date et sa raison. Un remboursement se lit
        aussi clairement qu'un paiement.
      </p>
    </div>
    <div class="card">
      <h3>Aucune sortie en argent</h3>
      <p>
        Les points ne se reconvertissent pas en euros. Ce qu'une séance
        redistribue reste dans la ligue et y sera dépensé.
      </p>
    </div>
    <div class="card">
      <h3>Le talent paie</h3>
      <p>
        {RECOMPENSES / RECETTE:.0%} de la recette d'une séance repart en
        récompenses, et davantage à qui a marqué, passé ou défendu. C'est une
        raison de revenir, pas une charge de trésorerie.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Pourquoi ce n'est ni une monnaie, ni un jeton spéculatif.</strong>
      Les points ne s'achètent pas, ne se revendent pas et ne se convertissent
      pas en argent : ils ne servent qu'à réserver une place sur un terrain
      réel, à commander un objet, ou à être reversés à une association
      partenaire. Une séance de <strong>D1</strong> en
      redistribue {RECOMPENSES_UNO} sous forme de récompenses — moins en D2 et
      en D3, où les distinctions valent moins —, et {ARBITRE_UNO} de plus à
      l'arbitre. Autant de raisons de revenir la semaine suivante.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>6</span></div>
</section>

<!-- ───────────────────────── 7. Le modèle économique ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Le modèle économique</div>
  <h2>Une séance qui s'autofinance,<br />dès la première.</h2>

  <p class="lead">
    Le modèle ne repose ni sur la publicité, ni sur un abonnement, ni sur un
    volume à atteindre : chaque séance couvre ses propres coûts. Voici une
    séance de ligue, au tarif de salle le plus élevé de Bruxelles.
  </p>

  <div class="kpis" style="margin:4mm 0 3mm">
    <div class="kpi">
      <div><span class="n">{LIGUE_PRIX}</span><span class="u">€</span></div>
      <div class="l">par joueur et par séance de ligue — salle et arbitrage compris</div>
    </div>
    <div class="kpi">
      <div><span class="n">{LIGUE_JOUEURS}</span><span class="u">joueurs</span></div>
      <div class="l">plateau complet d'une séance de ligue, sur {LIGUE_HEURES} heures</div>
    </div>
    <div class="kpi">
      <div><span class="n">{MARGE}</span><span class="u">€</span></div>
      <div class="l">marge par séance dans l'hypothèse la plus chère, soit {MARGE / RECETTE:.0%} de la recette</div>
    </div>
  </div>

  <h3 style="margin-top:2mm">Où va chaque euro d'une séance de ligue à {RECETTE} €</h3>
  {barre()}

  <table>
    <thead>
      <tr><th>Poste</th><th style="text-align:right">Montant</th><th style="text-align:right">Part</th></tr>
    </thead>
    <tbody>
      <tr><td>Recette — {LIGUE_JOUEURS} joueurs × {LIGUE_PRIX} €</td><td class="n">{RECETTE} €</td><td class="n">100 %</td></tr>
      <tr><td>Location de salle — {LIGUE_HEURES} h × {SALLE_HEURE_HAUT} €</td><td class="n">− {SALLE} €</td><td class="n">{SALLE / RECETTE:.0%}</td></tr>
      <tr><td>Indemnité d'arbitrage — {ARBITRE_UNO} UNO</td><td class="n">− {ARBITRE} €</td><td class="n">{ARBITRE / RECETTE:.0%}</td></tr>
      <tr><td>Récompenses reversées aux joueurs — {RECOMPENSES_UNO} UNO</td><td class="n">− {RECOMPENSES} €</td><td class="n">{RECOMPENSES / RECETTE:.0%}</td></tr>
      <tr class="total"><td>Marge de la ligue</td><td class="n">{MARGE} €</td><td class="n">{MARGE / RECETTE:.0%}</td></tr>
    </tbody>
  </table>

  <div class="note">
    <p>
      <strong>{SALLE_HEURE_HAUT} € de l'heure est le tarif le plus élevé
      pratiqué à Bruxelles</strong> : l'hypothèse la plus défavorable, retenue
      exprès. Au tarif courant de {SALLE_HEURE_COURANT} €, la même séance
      dégage {MARGE_COURANTE} € au lieu de {MARGE} €. Un amical, plus court et
      sans récompenses, laisse {AMICAL_MARGE} € sur {AMICAL_RECETTE} €.
    </p>
  </div>

  <h3 style="margin-top:4mm">Là où le modèle va</h3>
  <p style="font-size:10pt">
    La location de salle absorbe {SALLE / RECETTE:.0%} de la recette : c'est le
    poste qui commande tout le reste, et c'est aussi celui qui peut
    disparaître. <strong>L'objectif à terme est de disposer de nos propres
    terrains.</strong> Un coût subi à chaque séance devient alors un
    investissement amorti, et la marge cesse d'être un reste. Le chemin y mène
    par étapes : le volume négocie le tarif horaire, le tarif permet un créneau
    permanent, le créneau permanent justifie une salle.
  </p>

  <p style="margin-top:3mm;font-size:9pt;color:var(--ink-3)">
    Une séance incomplète n'est pas confirmée et n'engage aucune dépense de
    salle : le risque de perte sur un créneau vide est nul par construction.
    S'ajoutent, hors séance, les droits d'inscription aux tournois entre clubs
    et la marge de la boutique, qui fonctionne à la commande. L'indemnité
    d'arbitrage se règle en points ou, au choix de l'arbitre, sur facture
    d'indépendant à {ARBITRE_EUR_HEURE} € de l'heure hors TVA — le même montant.
  </p>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>7</span></div>
</section>

<!-- ───────────────────────── 8. État d'avancement ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Où en est le projet</div>
  <h2>L'outil est terminé.<br />La ligue reste à lancer.</h2>

  <p class="lead">
    L'application n'est pas une maquette ni un projet à financer : elle est
    écrite, déployée, et fonctionne. Ce qui reste devant nous est l'ouverture
    aux premiers joueurs.
  </p>

  <div class="grid2" style="margin-bottom:5mm">
    <div class="card">
      <h3>Ce qui est fait</h3>
      <p>
        Application complète — inscriptions, paiements par carte et Bancontact,
        composition d'équipes sur le terrain, feuilles de match, classement,
        divisions, clubs, tournois, boutique, arbitrage, notifications sur le
        téléphone.<br /><br />
        Mise en ligne effective : serveur, base de données et site en
        production. Version Android soumise à Google Play, en examen pour une
        publication ouverte.<br /><br />
        <strong>{TESTS} tests automatisés</strong> couvrent les règles du jeu
        et, surtout, les mouvements d'argent.
      </p>
    </div>
    <div class="card">
      <h3>Ce qui reste</h3>
      <p>
        Réunir un noyau d'environ <strong>{NOYAU_CIBLE} joueurs</strong>. C'est
        le nombre qui permet d'ouvrir les trois divisions : une séance de D1,
        une de D2, une de D3 par semaine, soit {PLACES_SEMAINE} places — sachant
        que personne ne joue toutes les semaines.<br /><br />
        Publier l'application en accès ouvert sur Google Play, puis sur
        l'App Store.<br /><br />
        Tenir les premières séances, le temps que le bouche-à-oreille prenne le
        relais de la communication de lancement.
      </p>
    </div>
  </div>

  <div class="shots" style="grid-template-columns:repeat(4,1fr);--shot-max:72mm">
    {capture("profil", "Une vraie carte de joueur", "Celle du porteur du projet, sur son téléphone : aucune statistique, aucun point. La ligue n'a pas encore commencé.")}
    {capture("boutique", "La boutique, réellement remplie", "Le catalogue est tenu par l'administration et se règle en points.")}
    {capture("wallet", "Le portefeuille", "Chaque mouvement est inscrit et justifié : paiement, remboursement, récompense.")}
    {capture("informations", "Les règles", "Le format, les divisions et le barème, écrits et consultables dans l'application.")}
  </div>

  <div class="note bas">
    <p>
      <strong>Précision de méthode :</strong> à la date de ce dossier, la ligue
      ne compte aucun joueur actif et aucune séance jouée. Les montants
      présentés sont des projections fondées sur les tarifs réellement
      pratiqués et sur la grille effectivement programmée dans l'application —
      non sur une activité constatée.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>8</span></div>
</section>

<!-- ───────────────────────── 9. Le besoin ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Ce que nous proposons</div>
  <h2>Un format neuf,<br />et de la place pour grandir.</h2>

  <p class="lead">
    Le futsal amateur n'a jamais eu son infrastructure. UNO League la
    construit : une ligue qui s'organise, se paie et se classe toute seule,
    reproductible d'une commune à l'autre sans rien changer au logiciel. Ce
    qui est écrit dans ce dossier est ce qui fonctionne aujourd'hui — et ne
    représente qu'une partie de ce qui est prévu.
  </p>

  <ol class="steps">
    <li>
      <span class="when">Mois 1 à 3</span>
      <h3>Le premier noyau</h3>
      <p>
        {NOYAU_CIBLE} joueurs : c'est à partir de là que les trois divisions
        tiennent debout et que la ligue vit de ses propres recettes.
      </p>
    </li>
    <li>
      <span class="when">Mois 3 à 6</span>
      <h3>Les trois divisions, chaque semaine</h3>
      <p>
        Une séance par division, {PLACES_SEMAINE} places hebdomadaires, et les
        premiers tournois entre clubs.
      </p>
    </li>
    <li>
      <span class="when">Ensuite</span>
      <h3>La deuxième commune, puis la troisième</h3>
      <p>
        Le modèle ne se duplique pas, il s'étend : le même serveur, la même
        application, des salles en plus. Le coût d'une commune supplémentaire
        est celui de ses créneaux, pas celui d'un nouveau produit.
      </p>
    </li>
    <li>
      <span class="when">À terme</span>
      <h3>Nos propres terrains</h3>
      <p>
        La location de salle absorbe {SALLE / RECETTE:.0%} de la recette. Une
        infrastructure à nous transforme ce coût en investissement, et change
        l'échelle de tout le reste.
      </p>
    </li>
  </ol>

  <div class="grid3" style="margin-top:5mm">
    <div class="card">
      <h3>Un soutien financier</h3>
      <p>
        Il porte sur l'amorçage — communication, frais de publication,
        premières séances —, la seule période où la ligue dépense avant
        d'encaisser.
      </p>
    </div>
    <div class="card">
      <h3>Un soutien matériel</h3>
      <p>
        Une infrastructure sportive mise à disposition supprime le principal
        poste de coût et rapproche d'un coup l'objectif de terrains propres.
      </p>
    </div>
    <div class="card">
      <h3>Un appui institutionnel</h3>
      <p>
        Une reconnaissance, une mise en relation avec les communes, les salles
        et les fédérations. Ce qui ne coûte rien et ouvre les portes.
      </p>
    </div>
  </div>

  <div class="note" style="margin-top:5mm">
    <p>
      <strong>Nous a-t-on rejoints tôt ou tard, c'est la seule question.</strong>
      L'outil est écrit, déployé et testé ; ce qui manque, c'est le coup
      d'envoi. Les trois formes de soutien nous intéressent, séparément ou
      ensemble — et chacune fait entrer dans un projet qui a bien plus devant
      lui que derrière.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>9</span></div>
</section>

<!-- ───────────────────────── 10. Contact ───────────────────────── -->
<section class="page cover" style="justify-content:flex-end">
  <div class="glow"></div>
  <h2 style="color:#fff;font-size:30pt;position:relative">Parlons-en.</h2>
  <p class="sub" style="margin-top:4mm">
    L'application est visible en ligne, immédiatement, sans installation.
    Nous pouvons la présenter en séance, ou vous ouvrir un accès de
    démonstration.
  </p>
  <div style="position:relative;margin-top:10mm;font-size:11pt;line-height:2;color:#CBD5E1">
    <div><strong style="color:#fff">Application</strong> &nbsp; {SITE_PUBLIC}</div>
    <div><strong style="color:#fff">Contact</strong> &nbsp; Yassine Bakhtaoui, fondateur</div>
    <div><strong style="color:#fff">Courriel</strong> &nbsp; contact@unoleague.be</div>
    <div><strong style="color:#fff">Téléphone</strong> &nbsp; +32 489 16 81 80</div>
    <div><strong style="color:#fff">Structure</strong> &nbsp; VIP Drivers SRL &nbsp;·&nbsp; BE&nbsp;0744.534.881</div>
    <div><strong style="color:#fff">Siège</strong> &nbsp; Assesteenweg 116A, 1740 Ternat</div>
  </div>
  <div class="meta" style="position:static;margin-top:14mm">
    Dossier établi en septembre 2026. Les projections chiffrées reposent sur le
    tarif de salle le plus élevé observé à Bruxelles et sur la grille programmée
    dans l'application ; elles ne constituent pas un engagement de résultat.
  </div>
</section>

</body>
</html>"""

(OUT / "dossier.html").write_text(HTML, encoding="utf8")
print(f"HTML écrit : {len(HTML) // 1024} Ko")
print(
    f"séance de ligue : recette {RECETTE} € · salle {SALLE} € · arbitre {ARBITRE} € · "
    f"récompenses {RECOMPENSES} € · marge {MARGE} € ({MARGE / RECETTE:.0%})"
)
print(f"au tarif courant ({SALLE_HEURE_COURANT} €/h) : marge {MARGE_COURANTE} €")
print(f"amical : recette {AMICAL_RECETTE} € · salle {AMICAL_SALLE} € · marge {AMICAL_MARGE} €")
