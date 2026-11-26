"""Le dossier « salles », en français.

Exécuté par `build.py` dans l'espace de noms du dossier principal : la
f-string ci-dessous lit le barème (`PRIX_HEURE`, `R_BUTEUR`…), l'écusson et le
code QR de `docs/dossier/build.py`, et trois valeurs propres à ce dossier :
`SALLE` (le nom du centre, depuis `salles.json`), `GENERIQUE` (vrai pour la
version sans nom) et `capture`, qui sait prendre la séance terminée dans
`captures/prod/` quand elle y a été posée.

Sept pages, dans l'ordre où un gestionnaire se pose les questions : ce que
l'on attend de lui, ce que voient ses clients avant le match, puis après,
pourquoi ils reviendront, ce que nous pouvons faire pour lui, et comment nous
joindre.
"""

TITRE = f"UNO League × {SALLE}"
CHEZ = "chez vous" if GENERIQUE else f"au {SALLE}" if SALLE.startswith("Centre") else f"chez {SALLE}"
HEURES_SEMAINE = DIVISIONS * LIGUE_HEURES
PIED = f"UNO League × {SALLE} — Proposition de partenariat"

NOTE_CAPTURES = (
    "Les captures viennent du jeu de démonstration de l'application : noms, visages et "
    "statistiques y sont fictifs"
    + ("" if GENERIQUE else f", et le nom « {SALLE} » y est affiché à titre d'aperçu")
    + "."
)
NOTE_SEANCE = (
    "Les captures de cette page viennent d'une vraie séance UNO League, publiée dans l'application."
    if prod_utilisees
    else NOTE_CAPTURES
)

PAGES = f"""<body>

<!-- ───────────────────────── 1. Couverture ───────────────────────── -->
<section class="page cover">
  <div class="glow"></div>
  <div class="mark">
    <img src="data:image/png;base64,{ECUSSON}" alt="" />
    <span>UNO <em>LEAGUE</em></span>
  </div>
  <div class="phone"><img src="data:image/jpeg;base64,{image("accueil")}" alt="L'application UNO League" /></div>
  <h1>Vos créneaux,<br />remplis et<br />payés d'avance.<br /><b>Par nos joueurs.</b></h1>
  <p class="sub">
    UNO League est une ligue de futsal amateur, organisée par une application
    qui gère les inscriptions, les équipes, les paiements et le classement.
    Nous aimerions jouer {CHEZ}.
  </p>
  {"" if GENERIQUE else f'<div class="salle">Proposition pour : {SALLE}</div>'}
  <div class="meta">
    <strong>Proposition de partenariat</strong>
    {DATE_SALLES.capitalize()} · Bruxelles
  </div>
  <div class="dl">
    <div>
      <strong>Disponible sur</strong>
      App Store et Google Play<br />
      <b>{LIEN_APP}</b>
    </div>
    <div class="qr">{QR_APP}</div>
  </div>
</section>

<!-- ───────────────────────── 2. La demande ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Ce que nous vous demandons</div>
  <h2>Votre salle, lieu de jeu<br />dans l'application UNO League.</h2>

  <p class="lead">
    Des adultes s'inscrivent à UNO League seuls ou entre amis, sont placés en
    équipes et jouent chaque semaine, avec un classement en trois divisions.
    Les séances se jouent dans les salles existantes : nous aimerions que la
    vôtre en fasse partie.
  </p>

  <ol class="demandes">
    <li>
      <h3>Votre accord</h3>
      <p>
        Pour présenter {"votre salle" if GENERIQUE else SALLE} dans la liste
        des lieux de l'application : nom, adresse, photos et lien vers votre
        page de réservation.
      </p>
    </li>
    <li>
      <h3>Vos vraies disponibilités</h3>
      <p>
        Les créneaux visibles en ligne sont-ils les seuls libres ? Un créneau
        fixe chaque semaine, sur la saison, est-il possible, et comment
        apprendre ceux qui se libèrent en cours d'année ?
      </p>
    </li>
    <li>
      <h3>Un rendez-vous</h3>
      <p>
        Trente minutes, chez vous ou en visio, pour vous montrer l'application
        et construire une collaboration à votre avantage.
      </p>
    </li>
  </ol>

  <div class="sous-titre">Ce que vous y gagnez</div>
  <div class="grid2">
    <div class="card">
      <h3><i>01</i> Des créneaux remplis</h3>
      <p>
        Une séance n'est confirmée que lorsqu'elle est complète, et chaque
        joueur a payé sa place à l'avance dans l'application. Plus d'équipe
        incomplète, plus de créneau abandonné faute de joueurs.
      </p>
    </div>
    <div class="card">
      <h3><i>02</i> Un seul interlocuteur</h3>
      <p>
        UNO League réserve et règle le terrain comme un client habituel, par
        votre plateforme ou directement auprès de vous. Vous ne gérez ni dix
        joueurs, ni dix paiements.
      </p>
    </div>
    <div class="card">
      <h3><i>03</i> De la régularité</h3>
      <p>
        Une ligue joue chaque semaine. Elle peut occuper des créneaux fixes, y
        compris en semaine et en heures creuses, là où une salle se remplit le
        moins bien.
      </p>
    </div>
    <div class="card">
      <h3><i>04</i> De la visibilité</h3>
      <p>
        Votre salle est présentée comme lieu de jeu à un public qui joue chaque
        semaine et cherche des créneaux, avec un lien direct vers votre
        réservation.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Rien ne change dans votre façon de travailler.</strong> Vous
      gardez vos tarifs, votre outil de réservation et vos priorités — clubs,
      écoles, occupations à la saison. Nous vous apportons des équipes
      complètes, sur les créneaux que vous voulez remplir.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>2</span></div>
</section>

<!-- ───────────────────────── 3. Avant le match ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Avant le match</div>
  <h2>Un créneau chez vous,<br />rempli et payé avant le coup d'envoi.</h2>

  <p class="lead">
    Tout part d'une proposition : un joueur choisit la salle, la date et
    l'heure. Les autres s'inscrivent ; quand le plateau est complet, chacun
    règle sa place. La séance n'a lieu que si elle est pleine et payée.
  </p>

  <div class="shots" style="--shot-max:86mm">
    {capture("proposer", "Proposer un créneau", "Le joueur choisit le mode de jeu, la salle, le jour et l'heure.")}
    {capture("proposition", "La proposition", "Les inscriptions se remplissent ; rien n'est engagé tant que le plateau n'est pas complet.")}
    {capture("reservation", "La réservation", "Plateau complet : chacun paie sa place par carte, Bancontact, Apple Pay ou en points.")}
    {capture("calendrier", "Le calendrier", "Chaque séance affiche sa salle, son heure et ses places restantes.")}
  </div>

  <div class="grid3" style="margin-top:6mm">
    <div class="card">
      <h3><i>01</i> Proposition</h3>
      <p>Aucun engagement pour la salle : la séance se remplit dans l'application.</p>
    </div>
    <div class="card">
      <h3><i>02</i> Réservation</h3>
      <p>Plateau complet et payé : UNO League réserve le créneau et le règle.</p>
    </div>
    <div class="card">
      <h3><i>03</i> Séance</h3>
      <p>Les joueurs arrivent en équipes déjà formées. Vous n'avez rien à organiser.</p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>C'est pourquoi les créneaux fixes nous intéressent.</strong> Une
      ligue qui sait qu'elle joue chez vous chaque mardi à 21 h remplit sa
      séance sans craindre que le terrain soit pris entre-temps. Pour vous,
      c'est un créneau occupé et payé toute la saison.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>3</span></div>
</section>

<!-- ───────────────────────── 4. Après le match ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Après le match</div>
  <h2>Chaque joueur repart avec ses stats,<br />sa vidéo et ses moments forts.</h2>

  <p class="lead">
    C'est ce qui distingue une séance UNO League d'une simple location : le
    match ne s'arrête pas au coup de sifflet. Résultats, statistiques de
    chacun, podium et récompenses sont publiés dans l'application, avec la
    vidéo de la séance et ses moments-clés.
  </p>

  <div class="shots trio" style="--shot-max:112mm">
    {capture("seance-podium", "Le podium de la séance", "Meilleur buteur, meilleur passeur, meilleur défenseur et homme du match, avec leur carte de joueur.")}
    {capture("seance-resultats", "Les résultats", "Chaque match de la séance, puis la feuille de chaque joueur : buts, passes, défenses, arrêts.")}
    {capture("seance-video", "La vidéo et les moments forts", "La vidéo de la séance, et chaque but ou arrêt retrouvé en un geste.")}
  </div>

  <div class="grid2" style="margin-top:6mm">
    <div class="card">
      <h3>Des récompenses</h3>
      <p>
        Chaque distinction rapporte des points UNO — {R_BUTEUR["D1"]} pour le
        meilleur buteur d'une séance de première division, {R_PARTICIPATION}
        à chaque participant — qui se dépensent dans la boutique de
        l'application.
      </p>
    </div>
    <div class="card">
      <h3>Rien à installer chez vous</h3>
      <p>
        La vidéo vient de la caméra de la salle quand elle en a une, ou d'une
        caméra que nous posons en hauteur le temps de la séance, si vous
        l'acceptez. Les statistiques sont relevées par notre équipe.
      </p>
    </div>
  </div>

  <p style="margin-top:auto;padding-top:3mm;font-size:8.5pt;color:var(--ink-3)">{NOTE_SEANCE}</p>

  <div class="foot" style="margin-top:2mm"><span>{PIED}</span><span>4</span></div>
</section>

<!-- ───────────────────────── 5. Pourquoi ils reviennent ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Pourquoi ils reviennent</div>
  <h2>Une raison de revenir chaque semaine,<br />donc de réserver chez vous.</h2>

  <p class="lead">
    Une location ponctuelle se fait une fois. Une ligue revient : un
    classement en trois divisions, une carte de joueur qui évolue à chaque
    séance, des points gagnés sur le terrain et dépensés dans la boutique.
  </p>

  <div class="kpis">
    <div class="kpi">
      <div class="n">{PRIX_HEURE}<span class="u">€</span></div>
      <div class="l">par joueur et par heure, dans tous les modes, payés à l'avance dans l'application</div>
    </div>
    <div class="kpi">
      <div class="n">{LIGUE_JOUEURS}<span class="u">joueurs</span></div>
      <div class="l">par séance de ligue : trois équipes de cinq, {LIGUE_HEURES} heures de terrain</div>
    </div>
    <div class="kpi">
      <div class="n">{HEURES_SEMAINE}<span class="u">h</span></div>
      <div class="l">de terrain par semaine visées quand les {DIVISIONS} divisions jouent chacune leur séance</div>
    </div>
  </div>

  <div class="shots trio" style="--shot-max:112mm">
    {capture("profil", "La carte de joueur", "Note, niveau, statistiques et classement : elle évolue à chaque séance jouée.")}
    {capture("classement", "Le classement", "Trois divisions : on monte, on descend selon les résultats de la séance.")}
    {capture("wallet", "Le portefeuille", "Récompenses, paiements, remboursements : chaque mouvement est inscrit.")}
  </div>

  <p style="margin-top:auto;padding-top:3mm;font-size:8.5pt;color:var(--ink-3)">{NOTE_CAPTURES}</p>

  <div class="foot" style="margin-top:2mm"><span>{PIED}</span><span>5</span></div>
</section>

<!-- ───────────────────────── 6. Nos services ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Ce que nous pouvons faire pour vous</div>
  <h2>Et de votre côté : un parcours<br />de réservation à la hauteur de votre salle.</h2>

  <p class="lead">
    Nous avons construit UNO League de bout en bout : application web et
    mobile, paiements, calendrier, notifications, trois langues. Nous pouvons
    mettre ce savoir-faire au service de votre salle.
  </p>

  <div class="offert">
    <b>Diagnostic<br />offert</b>
    <p>
      Nous parcourons votre réservation comme le ferait un client : trouver un
      créneau, réserver, payer, annuler, sur téléphone et sur ordinateur. Nous
      vous remettons nos constats et des pistes concrètes.
      <strong>Sans frais ni engagement</strong> : s'il y a un devis, il vient
      après, et seulement si vous le demandez.
    </p>
  </div>

  <div class="grid2">
    <div class="card">
      <h3><i>01</i> Votre site</h3>
      <p>
        Une refonte claire et rapide sur téléphone : vos salles, vos tarifs et
        vos disponibilités lisibles d'un coup d'œil, et le bon contact pour
        chaque demande.
      </p>
    </div>
    <div class="card">
      <h3><i>02</i> Votre réservation</h3>
      <p>
        Partir de votre outil actuel et l'améliorer, ou construire un parcours
        sur mesure : créneaux à la saison demandés en ligne, liste d'attente
        sur les désistements, rappels automatiques.
      </p>
    </div>
    <div class="card">
      <h3><i>03</i> Une application à votre nom</h3>
      <p>
        Réservation, paiement et notifications sur l'App Store et Google Play,
        comme UNO League : vos clients réservent en trois gestes.
      </p>
    </div>
    <div class="card">
      <h3><i>04</i> Stats et vidéos pour vos clients</h3>
      <p>
        À terme, nos caméras peuvent offrir à chacun de vos clients les
        statistiques et la vidéo de son match, comme dans une séance UNO
        League.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Nous ne vous demandons pas de changer d'outil.</strong> Tout part
      de ce que vous utilisez aujourd'hui, et de ce qui vous coûte du temps :
      les appels, les désistements, les créneaux qui restent vides.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>6</span></div>
</section>

<!-- ───────────────────────── 7. Contact ───────────────────────── -->
<section class="page cover" style="justify-content:flex-end;padding-bottom:16mm">
  <div class="glow"></div>
  <h2 style="color:#fff;font-size:30pt;position:relative">Parlons-en.</h2>
  <p class="sub" style="margin-top:4mm">
    Une première étape simple : votre accord pour présenter
    {"votre salle" if GENERIQUE else SALLE} dans l'application, et trente
    minutes, chez vous ou en visio, pour vous la montrer en vrai.
  </p>
  <div class="stores">
    <div class="store"><i></i><div><b>App Store</b><br /><span>Disponible</span></div></div>
    <div class="store"><i></i><div><b>Google Play</b><br /><span>Disponible</span></div></div>
    <div class="qr">{QR_APP}</div>
    <div class="scan"><strong>Scannez</strong>{LIEN_APP}<br />le bon store, selon le téléphone</div>
  </div>
  <div style="position:relative;margin-top:8mm;font-size:11pt;line-height:2;color:#CBD5E1">
    <div><strong style="color:#fff">Site web</strong> &nbsp; https://{SITE_PUBLIC}</div>
    <div><strong style="color:#fff">Contact</strong> &nbsp; Yassine Bakhtaoui, fondateur</div>
    <div><strong style="color:#fff">Courriel</strong> &nbsp; contact@unoleague.be</div>
    <div><strong style="color:#fff">Téléphone</strong> &nbsp; +32 489 16 81 80</div>
    <div><strong style="color:#fff">Structure</strong> &nbsp; VIP Drivers SRL &nbsp;·&nbsp; BE&nbsp;0744.534.881</div>
  </div>
  <div class="meta" style="position:static;margin-top:14mm">
    Proposition établie en {DATE_SALLES}. Les montants cités sont ceux que
    l'application applique aujourd'hui ; ils ne constituent pas un engagement
    de résultat.
  </div>
</section>

</body>"""
