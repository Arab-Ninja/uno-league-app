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

# Récompenses d'une séance de ligue en D1, en UNO (DEFAULT_REWARD_POLICY).
R_BUTEUR = 250
R_PASSEUR = 150
R_DEFENSEUR = 150
R_MEILLEURE_EQUIPE = 20      # à chacun des cinq joueurs de l'équipe vainqueur
R_PARTICIPATION = 10         # à chacun des quinze
ARBITRE_UNO = 300            # REFEREE_SESSION_FEE_UNO

# Le tarif de salle. Quatre-vingts euros de l'heure est le **haut** de la
# fourchette bruxelloise : c'est l'hypothèse la plus défavorable, choisie
# exprès. Une ligue qui ne tient qu'au meilleur prix ne tient pas.
SALLE_HEURE_HAUT = 80
SALLE_HEURE_COURANT = 60

# --- Ce qui s'en déduit, une séance de ligue à plateau complet -------------
RECETTE = LIGUE_JOUEURS * LIGUE_PRIX
SALLE = LIGUE_HEURES * SALLE_HEURE_HAUT
ARBITRE = ARBITRE_UNO // UNO_PAR_EURO
RECOMPENSES_UNO = (
    R_BUTEUR
    + R_PASSEUR
    + R_DEFENSEUR
    + R_MEILLEURE_EQUIPE * (LIGUE_JOUEURS // LIGUE_EQUIPES)
    + R_PARTICIPATION * LIGUE_JOUEURS
)
RECOMPENSES = RECOMPENSES_UNO // UNO_PAR_EURO
REDISTRIBUTION = ARBITRE + RECOMPENSES
MARGE = RECETTE - SALLE - REDISTRIBUTION

assert SALLE + REDISTRIBUTION + MARGE == RECETTE, "la décomposition doit boucler"

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
  .barre {{ display: flex; height: 16mm; border-radius: 1.5mm; overflow: hidden; gap: 2px; margin-top: 2mm; }}
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
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <path d="M18 20v16a14 14 0 0 0 28 0V20" fill="none" stroke="#F97316"
            stroke-width="7" stroke-linecap="round" />
    </svg>
    <span>UNO <em>LEAGUE</em></span>
  </div>
  <h1>Le futsal amateur,<br />sans club,<br /><b>sans licence,</b><br />sans engagement.</h1>
  <p class="sub">
    Une ligue ouverte à tous, organisée par une application qui gère les
    séances, les paiements, les équipes et le classement.
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
        Un joueur ouvre un créneau, les autres s'inscrivent. Rien n'est engagé
        tant que le plateau n'est pas complet : personne n'avance la salle.
      </p>
    </div>
    <div class="card">
      <h3><i>02</i> Réservation</h3>
      <p>
        Le plateau complet déclenche le paiement. Chacun dispose de vingt-quatre
        heures ; passé ce délai, sa place revient aux remplaçants inscrits.
      </p>
    </div>
    <div class="card">
      <h3><i>03</i> Séance</h3>
      <p>
        Les équipes sont composées, la feuille de match est tenue, et la
        clôture met à jour statistiques, récompenses et classement.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Le pari : la régularité naît de l'enjeu.</strong> Un classement,
      des divisions, une carte de joueur qui évolue — ce sont les mêmes
      ressorts que le sport en club, sans la licence ni l'engagement annuel. On
      revient parce que la semaine prochaine compte.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>3</span></div>
</section>

<!-- ───────────────────────── 4. Les modes de jeu ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Les formats</div>
  <h2>Toutes les séances<br />ne se ressemblent pas.</h2>

  <p class="lead">
    Une séance n'a ni le même prix, ni la même durée, ni les mêmes
    conséquences selon son mode. La compétition officielle est la plus longue
    et la plus chère ; à côté d'elle vivent des formats plus légers, pour
    jouer sans que le classement soit en jeu.
  </p>

  <div class="grid2" style="align-items:start;grid-template-columns:1.1fr .9fr">
    <div>
      <table class="modes">
        <thead>
          <tr>
            <th>Mode</th>
            <th class="c">Joueurs</th>
            <th class="c">Durée</th>
            <th class="c">Prix</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>UNO League</td>
            <td class="c">{LIGUE_JOUEURS}</td>
            <td class="c">{LIGUE_HEURES} h</td>
            <td class="c">{LIGUE_PRIX} €</td>
          </tr>
          <tr>
            <td>Match amical</td>
            <td class="c">{AMICAL_JOUEURS}</td>
            <td class="c">{AMICAL_HEURES} h</td>
            <td class="c">{AMICAL_PRIX} €</td>
          </tr>
          <tr>
            <td>Match de club</td>
            <td class="c">{CLUB_JOUEURS}</td>
            <td class="c">{CLUB_HEURES} h</td>
            <td class="c">{CLUB_PRIX} €</td>
          </tr>
          <tr>
            <td>Tournoi entre clubs</td>
            <td class="c">4 à 8 clubs</td>
            <td class="c">2 h</td>
            <td class="c">par club</td>
          </tr>
          <tr>
            <td class="bientot">Mini-jeux, entraînements</td>
            <td class="c bientot" colspan="3">à venir</td>
          </tr>
        </tbody>
      </table>

      <h3 style="margin-top:6mm">Qui joue avec qui</h3>
      <p>
        <strong>En UNO League, la répartition est faite par la ligue</strong> :
        les {LIGUE_JOUEURS} joueurs sont répartis en {LIGUE_EQUIPES} équipes de
        {LIGUE_JOUEURS // LIGUE_EQUIPES}, et personne ne choisit ses
        coéquipiers. C'est ce qui rend le classement lisible — et ce qui fait
        qu'on joue chaque semaine avec des gens qu'on n'aurait pas choisis.
      </p>
      <p>
        <strong>En match amical, le joueur choisira son camp</strong> : rejoindre
        une équipe précise ou se laisser placer. Le mode est ouvert, la
        possibilité de choisir est la prochaine fonctionnalité à livrer.
      </p>
      <p>
        <strong>En match de club</strong>, chaque club aligne son cinq : la
        composition appartient au fondateur, pas à la ligue.
      </p>
    </div>

    <div class="shots duo" style="grid-template-columns:1fr;margin-top:0;--shot-max:132mm">
      {capture("modes", "Les modes dans l'application", "L'écran est la source : nombre de joueurs, durée et prix y sont ceux que le serveur applique, et les modes non encore ouverts sont marqués comme tels.")}
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>L'arbitre n'intervient qu'en UNO League.</strong> Il ne joue pas,
      n'entre dans aucun classement, et perçoit {ARBITRE_UNO} UNO — soit
      {ARBITRE} € — pour les {LIGUE_HEURES} heures d'une séance dirigée. Les
      autres modes se jouent sans arbitre : ce sont des rencontres, pas des
      matchs de compétition.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>4</span></div>
</section>

<!-- ───────────────────────── 5. L'impact social ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Ce que la ligue rend possible</div>
  <h2>Une porte d'entrée vers le sport,<br />ouverte à la semaine.</h2>

  <div class="grid2" style="margin-bottom:6mm">
    <div>
      <h3>Aucune barrière à l'entrée</h3>
      <p>
        Pas de licence, pas de cotisation annuelle, pas de sélection. On paie
        la séance à laquelle on vient — {LIGUE_PRIX} € pour une séance de
        ligue, {AMICAL_PRIX} € pour un amical, salle et arbitrage compris.
        Celui qui ne peut venir qu'une fois par mois n'est pas pénalisé.
      </p>

      <h3 style="margin-top:5mm">Des groupes qui se mélangent</h3>
      <p>
        En compétition, les équipes sont composées par la ligue et non par
        affinité : on joue chaque semaine avec des gens qu'on n'aurait pas
        choisis. C'est précisément l'effet recherché, et c'est pour cela que le
        choix du camp est réservé aux modes non classés.
      </p>

      <h3 style="margin-top:5mm">Un cadre, pas un défouloir</h3>
      <p>
        Un arbitre indemnisé à chaque séance de ligue. Des règles écrites,
        consultables dans l'application. Les comportements se régulent parce
        que le classement et la carte en dépendent.
      </p>
    </div>
    <div>
      <div class="shots duo" style="grid-template-columns:1fr;margin-top:0;--shot-max:118mm">
        {capture("club", "Les clubs", "Un groupe d'amis fonde son club, l'alimente et défie les autres. Le lien social devient une mécanique de jeu.")}
      </div>
    </div>
  </div>

  <div class="grid3">
    <div class="card">
      <h3>Santé</h3>
      <p>Une à deux heures d'activité soutenue par séance, pour un public
      adulte largement sédentaire.</p>
    </div>
    <div class="card">
      <h3>Ancrage local</h3>
      <p>Les salles sont louées sur place. Chaque séance fait vivre une
      infrastructure de la commune.</p>
    </div>
    <div class="card">
      <h3>Mixité</h3>
      <p>Ouverte à tous les adultes, sans distinction d'origine, de niveau ni
      de parcours sportif.</p>
    </div>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>5</span></div>
</section>

<!-- ───────────────────────── 6. Les points UNO ───────────────────────── -->
<section class="page">
  <div class="eyebrow">La monnaie de la ligue</div>
  <h2>Les points UNO :<br />ce qui se gagne sur le terrain<br />se dépense dans la ligue.</h2>

  <p class="lead">
    Un joueur ne peut pas acheter de points UNO : ils ne s'obtiennent qu'en
    jouant. Et ils ne se retirent pas non plus — ils se dépensent à
    l'intérieur de la ligue. Cent points valent dix euros, et ce taux ne
    change pas.
  </p>

  <div class="flux">
    <div>
      <h3>Ce qui en rapporte</h3>
      <ul>
        <li>
          <b>Meilleur buteur d'une séance<em>Séance de ligue, barème de la division</em></b>
          <span>{R_BUTEUR} UNO</span>
        </li>
        <li>
          <b>Meilleur passeur, meilleur défenseur<em>Deux distinctions, chacune récompensée</em></b>
          <span>{R_PASSEUR} UNO</span>
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
          <b>Arbitrage d'une séance<em>Réservé aux comptes arbitre</em></b>
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

  <div class="grid3" style="margin-top:7mm">
    <div class="card">
      <h3>Tout est inscrit</h3>
      <p>
        Chaque mouvement porte sa date et sa raison. Un remboursement se lit
        aussi clairement qu'un paiement : rien ne disparaît sans explication.
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
      <h3>Un levier d'assiduité</h3>
      <p>
        {RECOMPENSES / RECETTE:.0%} de la recette d'une séance repart en
        récompenses utilisables dès la suivante. C'est une raison de revenir,
        pas une charge de trésorerie.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Pourquoi ce n'est ni une monnaie, ni un jeton spéculatif.</strong>
      Les points ne s'achètent pas, ne se revendent pas et ne se convertissent
      pas en argent : ils ne servent qu'à réserver une place sur un terrain
      réel ou à commander un objet. Une séance de ligue en redistribue
      {RECOMPENSES_UNO} sous forme de récompenses, {ARBITRE_UNO} de plus à
      l'arbitre — autant de raisons de revenir la semaine suivante.
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

  <div class="kpis">
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
      pratiqué à Bruxelles</strong> — c'est donc l'hypothèse la plus
      défavorable, retenue exprès. Au tarif courant de
      {SALLE_HEURE_COURANT} € de l'heure, la même séance dégage
      {MARGE_COURANTE} € au lieu de {MARGE} €. Un match amical, plus court et
      sans récompenses à verser, laisse {AMICAL_MARGE} € sur
      {AMICAL_RECETTE} € encaissés.
    </p>
  </div>

  <p style="margin-top:4mm;font-size:9pt;color:var(--ink-3)">
    {REDISTRIBUTION / RECETTE:.0%} de chaque euro encaissé revient aux joueurs et à
    l'arbitre, en points utilisables sur une séance suivante ou dans la
    boutique. Une séance incomplète n'est pas confirmée et n'engage aucune
    dépense de salle : le risque de perte sur un créneau vide est nul par
    construction. S'y ajoutent, sans recette de séance, les droits
    d'inscription aux tournois entre clubs et la marge de la boutique, qui
    fonctionne à la commande et n'immobilise aucun stock.
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
        composition d'équipes, feuilles de match, classement, divisions,
        clubs, tournois, boutique, arbitrage, notifications.<br /><br />
        Mise en ligne effective : serveur, base de données et site en
        production. Version Android publiée en test sur Google Play.<br /><br />
        <strong>478 tests automatisés</strong> couvrent les règles du jeu et,
        surtout, les mouvements d'argent.
      </p>
    </div>
    <div class="card">
      <h3>Ce qui reste</h3>
      <p>
        Sécuriser des créneaux de salle réguliers auprès d'un ou deux
        exploitants.<br /><br />
        Réunir le premier noyau de joueurs — l'objectif est un plateau complet,
        soit {LIGUE_JOUEURS} personnes, pour une première séance de ligue.<br /><br />
        Publier l'application en accès ouvert sur Google Play, puis sur
        l'App Store.
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
  <div class="eyebrow">Ce que nous recherchons</div>
  <h2>De quoi tenir les<br />premières séances.</h2>

  <p class="lead">
    Le modèle s'équilibre dès qu'une séance est complète. Le besoin ne porte
    donc pas sur l'exploitation, mais sur l'amorçage : garantir des créneaux
    avant d'avoir les joueurs, et faire connaître la ligue là où elle démarre.
  </p>

  <ol class="steps">
    <li>
      <span class="when">Mois 1</span>
      <h3>Réserver les créneaux</h3>
      <p>
        Bloquer un créneau hebdomadaire sur trois mois auprès d'une salle.
        C'est l'engagement financier que la ligue doit prendre <em>avant</em>
        d'encaisser la première inscription.
      </p>
    </li>
    <li>
      <span class="when">Mois 1 à 3</span>
      <h3>Constituer le premier noyau</h3>
      <p>
        Communication locale, présence sur les terrains existants, séances
        d'essai à tarif réduit. L'objectif est de passer de zéro à un plateau
        complet récurrent.
      </p>
    </li>
    <li>
      <span class="when">Mois 2</span>
      <h3>Publier sur les stores</h3>
      <p>
        Ouvrir l'application au public sur Google Play puis sur l'App Store.
        Frais de comptes développeur et de mise en conformité.
      </p>
    </li>
    <li>
      <span class="when">Mois 3 à 6</span>
      <h3>Ouvrir une seconde salle</h3>
      <p>
        Une fois le premier créneau rentable, dupliquer le format sur un autre
        jour ou une autre commune.
      </p>
    </li>
  </ol>

  <div class="grid2" style="margin-top:6mm">
    <div class="card">
      <h3>Un soutien financier</h3>
      <p>
        Il couvrirait la réservation ferme des salles sur les premiers mois,
        la communication de lancement et les frais de publication — c'est-à-dire
        exactement la période où la ligue engage des dépenses sans recette.
      </p>
    </div>
    <div class="card">
      <h3>Ou un soutien matériel</h3>
      <p>
        La mise à disposition de créneaux dans une infrastructure communale
        aurait le même effet, en supprimant le principal poste de coût. Les
        deux formes nous intéressent, séparément ou ensemble.
      </p>
    </div>
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
    <div><strong style="color:#fff">Application</strong> &nbsp; uno-league-app.onrender.com</div>
    <div><strong style="color:#fff">Contact</strong> &nbsp; [nom, fonction]</div>
    <div><strong style="color:#fff">Courriel</strong> &nbsp; [adresse]</div>
    <div><strong style="color:#fff">Téléphone</strong> &nbsp; [numéro]</div>
    <div><strong style="color:#fff">Structure</strong> &nbsp; [dénomination, n° d'entreprise]</div>
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
