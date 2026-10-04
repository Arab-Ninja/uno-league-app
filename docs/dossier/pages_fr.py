"""Le dossier de présentation, en français — la version de référence.

Exécuté par `build.py` dans son propre espace de noms : la f-string ci-dessous
lit directement le barème (`LIGUE_PRIX`, `MARGE`…) et les fonctions de mise en
forme (`milliers`, `eur`, `capture`, `barre`). Les versions néerlandaise et
anglaise (`pages_nl.py`, `pages_en.py`) suivent ce fichier page par page.
"""

TITRE = "UNO League — Dossier de présentation"
LIBELLES_BARRE = ["Location de salle", "Revient aux joueurs et à l'arbitre", "Marge de la ligue"]

PAGES = f"""<body>

<!-- ───────────────────────── 1. Couverture ───────────────────────── -->
<section class="page cover">
  <div class="glow"></div>
  <div class="mark">
    <img src="data:image/png;base64,{ECUSSON}" alt="" />
    <span>UNO <em>LEAGUE</em></span>
  </div>
  <div class="phone"><img src="data:image/png;base64,{ASSETS["accueil"]}" alt="L'application UNO League" /></div>
  <h1>Le futsal amateur,<br />sans licence,<br />sans engagement.<br /><b>Avec récompenses.</b></h1>
  <p class="sub">
    Une ligue ouverte à tous, organisée par une application qui gère les
    séances, les paiements, les équipes et le classement — et qui récompense
    ceux qui jouent.
  </p>
  <div class="meta">
    <strong>Dossier de présentation</strong>
    {DATE_DOSSIER.capitalize()} · Belgique
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
      <h3><i>01</i> Personne ne veut gérer l'organisation</h3>
      <p>
        Trouver une salle, fixer un créneau, réunir quinze personnes, avancer
        la location puis relancer chacun : c'est la tâche que tout le monde
        refuse, et celle qui fait mourir les groupes.
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
    Une salle, une date, une heure : la proposition est ouverte, les autres
    s'y inscrivent — ou y sont invités en un geste, par un simple lien si la
    séance est privée. Dès que le plateau est
    complet, elle devient une réservation et chacun règle sa place depuis
    l'application — carte, Bancontact, Apple Pay, ou points accumulés. Plus
    personne n'avance d'argent, plus personne ne relance.
  </p>

  <div class="portes">
    <div class="porte">
      <h3>Seul ou entre amis</h3>
      <div class="lst">Match amical · UNO League · Football</div>
      <p>Chacun propose ou rejoint une séance pour lui-même, et y vient avec qui il veut.</p>
    </div>
    <div class="porte">
      <h3>Avec son club</h3>
      <div class="lst">Défis · Tournois · Football</div>
      <p>Le club propose, défie un autre club ou s'engage en tournoi ; ses joueurs s'y inscrivent.</p>
    </div>
  </div>

  <div class="shots" style="--shot-max:72mm">
    {capture("proposition", "Une proposition ouverte", "Mode, salle, créneau, prix, inscriptions, récompenses en jeu et participants déjà inscrits.")}
    {capture("calendrier", "Le calendrier", "Chaque créneau porte son mode, sa division, son prix et le nombre de places restantes.")}
    {capture("accueil", "Ce qui vous concerne", "Les prochaines séances, leur état de remplissage et ce qui reste à payer.")}
    {capture("classement", "Le classement", "Trois divisions. On monte, on descend, selon les résultats de la séance.")}
  </div>

  <div class="grid3" style="margin-top:6mm">
    <div class="card">
      <h3><i>01</i> Proposition</h3>
      <p>
        Un joueur ou un club ouvre un créneau, les autres s'inscrivent. Rien
        n'est engagé tant que le plateau n'est pas complet.
      </p>
    </div>
    <div class="card">
      <h3><i>02</i> Réservation</h3>
      <p>
        Le plateau complet déclenche le paiement <strong>et complète les
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
    La place coûte partout le même prix : {PRIX_HEURE} € de l'heure. Ce qui
    change d'un mode à l'autre, c'est la durée, le nombre de joueurs et ce
    que la séance rapporte. La UNO League, la compétition officielle, est la
    seule qui fasse bouger le classement.
  </p>

  <div class="grid2" style="align-items:start;grid-template-columns:1.15fr .85fr">
    <div>
      <table class="modes">
        <thead>
          <tr>
            <th>Mode</th>
            <th class="c">Joueurs</th>
            <th class="c">Durée</th>
            <th class="c">Place</th>
            <th class="c">Rapporte</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>UNO League</td>
            <td class="c">{LIGUE_JOUEURS}</td>
            <td class="c">{LIGUE_HEURES} h</td>
            <td class="c">{PRIX_HEURE} €/h</td>
            <td class="c"><strong>Points, statistiques, division</strong></td>
          </tr>
          <tr>
            <td>Match amical</td>
            <td class="c">{AMICAL_JOUEURS}</td>
            <td class="c">{AMICAL_HEURES} h</td>
            <td class="c">{PRIX_HEURE} €/h</td>
            <td class="c">Expérience</td>
          </tr>
          <tr>
            <td>Match de club</td>
            <td class="c">{CLUB_JOUEURS}</td>
            <td class="c">{CLUB_HEURES} h</td>
            <td class="c">{PRIX_HEURE} €/h</td>
            <td class="c">Statistiques, la mise</td>
          </tr>
          <tr>
            <td>Tournoi entre clubs</td>
            <td class="c">{TOURNOI_CLUBS_MIN} à {TOURNOI_CLUBS_MAX} clubs</td>
            <td class="c">2 h</td>
            <td class="c">{milliers(TOURNOI_ENGAGEMENT_UNO)} UNO par club</td>
            <td class="c">Dotation de {milliers(TOURNOI_DOTATION_MIN)} à {milliers(TOURNOI_DOTATION_MAX)} UNO</td>
          </tr>
          <tr>
            <td>Football</td>
            <td class="c">{GRAND_MIN_PAR_EQUIPE * 2} à {GRAND_MAX_PAR_EQUIPE * 2}</td>
            <td class="c bientot" colspan="3">À venir — sur gazon</td>
          </tr>
        </tbody>
      </table>

      <h3 style="margin-top:3mm">Le talent paie</h3>
      <p>
        La feuille désigne le meilleur buteur, le meilleur passeur décisif et
        le meilleur défenseur. L'équipe victorieuse aussi, et <strong>tout le
        monde touche une part pour être venu</strong>.
      </p>

      <h3 style="margin-top:3mm">Une carte qui raconte une saison</h3>
      <p>
        Buts, passes, arrêts, interceptions, homme du match : chaque action
        saisie remonte dans la carte du joueur. La note générale monte — et
        descend. L'expérience s'accumule en ligue, en amical et en club.
      </p>

      <h3 style="margin-top:3mm">Qui joue avec qui, et à quel poste</h3>
      <p>
        <strong>On joue avec qui on veut.</strong> Dès l'inscription, chacun
        choisit son équipe et prend sa place sur le terrain : « qui va dans
        les buts ? » se règle la veille, plus dans le vestiaire. Celui qui ne
        choisit pas est placé par le système, au sort. La règle est la même
        en UNO League ({LIGUE_EQUIPES} équipes de
        {LIGUE_JOUEURS // LIGUE_EQUIPES}), en match amical et au Football.
      </p>
    </div>

    <div class="shots duo" style="grid-template-columns:1fr;margin-top:0;--shot-max:118mm">
      {capture("terrain-ligue", "Le terrain d'une séance", "Chacun choisit son équipe et son poste ; qui ne choisit pas est placé au sort. Une place libre se voit, un inscrit sans poste aussi.")}
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Entre amis aussi.</strong> Une séance peut rester privée,
      réservée aux invités. Le <strong>match personnalisé</strong> est un
      planificateur gratuit offert par la ligue : le groupe qui joue ailleurs
      y organise son match et y garde ses statistiques. Prochain format : le
      Football, sur gazon.
    </p>
    <p style="margin-top:2mm">
      <strong>L'arbitre intervient en UNO League et dans les tournois.</strong>
      Il ne joue pas, n'entre dans aucun classement, et il est payé sur
      facture de prestation, à l'heure, ou en points UNO. Les défis et les
      amicaux se jouent sans arbitre.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>4</span></div>
</section>

<!-- ───────────────────────── 5. L'impact social ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Ce que la ligue rend possible</div>
  <h2>On ne vend pas une application.<br />On crée une communauté.</h2>

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

      <h3 style="margin-top:4mm">Des rencontres qu'on n'aurait pas faites</h3>
      <p>
        On vient avec ses amis, et l'on joue chaque semaine contre des gens
        d'un autre quartier, d'un autre métier, d'un autre âge. Celui qui
        s'inscrit seul est placé dans une équipe et repart avec des
        coéquipiers. Un groupe fermé se referme sur les siens ; une ligue
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
      <div class="shots duo" style="margin-top:0;gap:5mm;--shot-max:92mm">
        {capture("club", "Les clubs", "Un groupe d'amis fonde son club, l'alimente, défie les autres et recrute sur le marché des transferts.")}
        {capture("tournoi", "Les tournois", f"Engagement de {milliers(TOURNOI_ENGAGEMENT_UNO)} UNO par club ; la dotation va de {milliers(TOURNOI_DOTATION_MIN)} UNO en demi-finales à {milliers(TOURNOI_DOTATION_MAX)} en huitièmes.")}
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
      association caritative, depuis la boutique.</p>
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
    Un joueur ne peut pas acheter de points UNO : ils s'obtiennent en jouant
    ou en parrainant de nouveaux joueurs, et le talent paie plus que la présence. Ils ne se retirent pas non
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
          <b>Meilleur passeur décisif, meilleur défenseur<em>En D1, chacune. {R_PASSEUR["D2"]} UNO en D2, {R_PASSEUR["D3"]} en D3</em></b>
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
          <b>Passage de niveau<em>L'expérience s'acquiert en ligue, en amical et en club</em></b>
          <span>10 UNO et +</span>
        </li>
        <li>
          <b>Arbitrage d'une séance<em>Comptes arbitre, ou {ARBITRE_EUR_HEURE} €/h HTVA sur facture</em></b>
          <span>{ARBITRE_UNO} UNO</span>
        </li>
        <li>
          <b>Parrainage d'un nouveau joueur<em>1<sup>re</sup> séance payée du parrainé ; +{PARRAIN_PALIER} UNO à la {PARRAIN_SEANCES}<sup>e</sup></em></b>
          <span>{PARRAIN_1RE} UNO</span>
        </li>
        <li>
          <b>Gains de club<em>Défis, tournois ({milliers(TOURNOI_DOTATION_MIN)} à {milliers(TOURNOI_DOTATION_MAX)} UNO), transferts</em></b>
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
          <b>Reverser à une association caritative<em>Le don est proposé dans la boutique</em></b>
          <span>au choix</span>
        </li>
        <li>
          <b>Alimenter la caisse de son club<em>Mise d'un défi, engagement d'un tournoi ({milliers(TOURNOI_ENGAGEMENT_UNO)} UNO)</em></b>
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
      Les points ne s'achètent ni ne se revendent, et ne se convertissent pas
      en argent : ils ne servent qu'à réserver une place sur un terrain réel, à
      commander un objet, ou à être reversés à une association caritative. Une séance de <strong>D1</strong> en
      redistribue {RECOMPENSES_UNO} sous forme de récompenses — moins en D2 et
      en D3, où les distinctions valent moins —, et {ARBITRE_UNO} de plus à
      l'arbitre.
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

  <div class="kpis" style="margin:3mm 0 2mm">
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

  <h3 style="margin-top:3mm">Là où le modèle va</h3>
  <p style="font-size:10pt">
    La location de salle absorbe {SALLE / RECETTE:.0%} de la recette : c'est le
    poste qui commande tout le reste, et c'est aussi celui qui peut
    disparaître. <strong>L'objectif à terme est de disposer de nos propres
    terrains</strong> — jusqu'à l'arène de nouvelle génération présentée plus
    loin. Un coût subi à chaque séance devient alors un
    investissement amorti, et la marge cesse d'être un reste. Le chemin y mène
    par étapes : le volume négocie le tarif horaire, le tarif permet un créneau
    permanent, le créneau permanent justifie une salle.
  </p>

  <p style="margin-top:3mm;font-size:9pt;color:var(--ink-3)">
    Une séance incomplète n'est pas confirmée et n'engage aucune dépense de
    salle : le risque de perte sur un créneau vide est nul par construction.
    S'ajoutent, hors séance, les droits d'inscription aux tournois entre clubs
    et la marge de la boutique, qui fonctionne à la commande. L'arbitre est
    payé sur facture de prestation, à {ARBITRE_EUR_HEURE} € de l'heure hors
    TVA, ou en points UNO — le même montant.
  </p>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>7</span></div>
</section>

<!-- ───────────────────────── 8. État d'avancement ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Où en est le projet</div>
  <h2>L'outil est terminé.<br />La communauté se construit.</h2>

  <p class="lead">
    L'application n'est pas une maquette ni un projet à financer : elle est
    écrite, déployée, et fonctionne. {JOUEURS_INSCRITS} joueurs y sont déjà
    inscrits ; l'étape suivante est de faire grandir la communauté jusqu'aux
    premières séances.
  </p>

  <div class="grid2" style="margin-bottom:4mm">
    <div class="card">
      <h3>Ce qui est fait</h3>
      <p>
        Application complète, dans sa nouvelle interface — inscriptions et
        invitations, séances privées, paiements par carte, Bancontact et
        Apple Pay, équipes et postes sur le terrain, feuilles de match,
        classement, divisions, clubs, défis, tournois, marché des transferts,
        boutique, arbitrage, modération, notifications et courriels, en
        français, néerlandais et anglais.<br /><br />
        Mise en ligne effective : serveur, base de données et site en
        production sur {SITE_PUBLIC}. Applications iPhone et Android
        <strong>{PUBLICATION_STORES}</strong>.<br /><br />
        <strong>{TESTS} tests automatisés</strong> couvrent les règles du jeu
        et, surtout, les mouvements d'argent.
      </p>
    </div>
    <div class="card">
      <h3>La suite</h3>
      <p>
        Passer de {JOUEURS_INSCRITS} à un noyau d'environ
        <strong>{NOYAU_CIBLE} joueurs</strong>. C'est le nombre qui permet
        d'ouvrir les trois divisions : une séance de D1, une de D2, une de D3
        par semaine, soit {PLACES_SEMAINE} places — sachant que personne ne
        joue toutes les semaines.<br /><br />
        Faire connaître la ligue : une série de courtes vidéos présente déjà
        chaque mode de jeu, pour les réseaux sociaux.<br /><br />
        Donner le coup d'envoi : nous envisageons d'offrir à chaque joueur sa
        <strong>première séance UNO League</strong>, le temps que le
        bouche-à-oreille prenne le relais.
      </p>
    </div>
  </div>

  <div class="shots" style="grid-template-columns:repeat(4,1fr);--shot-max:84mm">
    {capture("profil", "La carte de joueur", "Note, statistiques, niveau et points : elle évolue à chaque séance jouée.")}
    {capture("boutique", "La boutique", "Les produits réellement en vente, réglés en points UNO.")}
    {capture("wallet", "Le portefeuille", "Chaque mouvement est inscrit et justifié : paiement, remboursement, récompense.")}
    {capture("informations", "Les règles", "Le format, les divisions et le barème, écrits et consultables dans l'application.")}
  </div>

  <p style="margin-top:3mm;font-size:8.5pt;color:var(--ink-3)">
    Les captures de séances et de profils proviennent d'un jeu de
    démonstration : noms, visages et statistiques y sont fictifs.
  </p>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>8</span></div>
</section>

<!-- ───────────────────────── 9. La croissance ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Où nous allons</div>
  <h2>Une ville, puis un pays.<br />Le format est prêt à voyager.</h2>

  <p class="lead">
    Le futsal amateur n'a jamais eu son infrastructure. UNO League la
    construit : une ligue qui s'organise, se paie et se classe toute seule,
    et qui s'installe d'une ville à l'autre sans rien changer au logiciel.
    Le projet est scalable en l'état — et franchisable.
  </p>

  <ol class="steps large">
    <li>
      <span class="when">{NOYAU_CIBLE} joueurs actifs</span>
      <h3>Bruxelles, le premier noyau</h3>
      <p>
        Les trois divisions tiennent debout : une séance par division et par
        semaine, {PLACES_SEMAINE} places hebdomadaires, et les premiers
        tournois entre clubs.
      </p>
    </li>
    <li>
      <span class="when">{milliers(PALIER_BELGIQUE)} joueurs actifs</span>
      <h3>Anvers et Liège</h3>
      <p>
        Chaque ville ouvre ses propres divisions. Même serveur, même
        application : le coût d'une ville de plus est celui de ses créneaux,
        pas celui d'un nouveau produit.
      </p>
    </li>
    <li>
      <span class="when">{milliers(PALIER_FRANCE)} joueurs actifs</span>
      <h3>La France : Paris, Marseille</h3>
      <p>
        Puis les autres grandes villes. Une ville peut être confiée à un
        partenaire local, en franchise : le format, l'application, les règles
        et la marque sont prêts.
      </p>
    </li>
    <li>
      <span class="when">Ensuite</span>
      <h3>Une coupe nationale, puis un « Euro »</h3>
      <p>
        Les meilleurs clubs de chaque ville se disputent une coupe nationale ;
        les meilleurs joueurs de chaque pays, une compétition européenne.
      </p>
    </li>
  </ol>

  <div class="grid3" style="margin-top:auto">
    <div class="card">
      <h3>Scalable</h3>
      <p>Une ville de plus ne demande ni développement ni équipe nouvelle :
      des salles, un arbitre, et la communauté qui s'y inscrit.</p>
    </div>
    <div class="card">
      <h3>Franchisable</h3>
      <p>Le modèle se confie clé en main : un partenaire local gère ses
      créneaux, la ligue fournit l'outil, les règles et la marque.</p>
    </div>
    <div class="card">
      <h3>Piloté par les joueurs</h3>
      <p>Chaque étape s'ouvre à un palier de joueurs actifs, jamais avant :
      la croissance suit la demande au lieu de la parier.</p>
    </div>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>9</span></div>
</section>

<!-- ───────────────────────── 10. Le besoin ───────────────────────── -->
<section class="page">
  <div class="eyebrow">L'objectif à terme</div>
  <h2>Nos propres terrains,<br />et l'arène de demain.</h2>

  <p class="lead">
    La location de salle absorbe {SALLE / RECETTE:.0%} de la recette : des
    terrains à nous transforment ce coût en investissement. Et l'objectif va
    plus loin — créer le terrain de nouvelle génération.
  </p>

  <figure class="arena">
    <img src="data:image/jpeg;base64,{ARENA}" alt="L'Immersive Arena" />
    <figcaption>
      <b>L'Immersive Arena</b>
      <span>Un terrain entouré d'écrans géants : chaque match se joue devant un stade plein.</span>
    </figcaption>
  </figure>

  <h3 style="margin-top:6mm">Ce que nous recherchons</h3>
  <div class="grid3" style="margin-top:2mm">
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

  <div class="note bas">
    <p>
      <strong>Nous a-t-on rejoints tôt ou tard, c'est la seule question.</strong>
      L'outil est écrit, déployé et testé ; ce qui manque, c'est le coup
      d'envoi. Les trois formes de soutien nous intéressent, séparément ou
      ensemble — et chacune fait entrer dans un projet qui a bien plus devant
      lui que derrière.
    </p>
  </div>

  <div class="foot"><span>UNO League — Dossier de présentation</span><span>10</span></div>
</section>

<!-- ───────────────────────── 11. Contact ───────────────────────── -->
<section class="page cover" style="justify-content:flex-end;padding-bottom:16mm">
  <div class="glow"></div>
  <h2 style="color:#fff;font-size:30pt;position:relative">Parlons-en.</h2>
  <p class="sub" style="margin-top:4mm">
    L'application se télécharge gratuitement sur l'App Store et Google Play,
    et s'ouvre aussi dans un navigateur. Nous pouvons la présenter en séance,
    ou vous ouvrir un accès de démonstration.
  </p>
  <div class="stores">
    <div class="store"><i></i><div><b>App Store</b><br /><span>Disponible</span></div></div>
    <div class="store"><i></i><div><b>Google Play</b><br /><span>Disponible</span></div></div>
    <div class="qr">{QR_APP}</div>
    <div class="scan"><strong>Scannez</strong>{LIEN_APP}<br />le bon store, selon le téléphone</div>
  </div>
  <div style="position:relative;margin-top:8mm;font-size:11pt;line-height:2;color:#CBD5E1">
    <div><strong style="color:#fff">Site web</strong> &nbsp; https://{SITE_PUBLIC}</div>
    <div><strong style="color:#fff">Mobile</strong> &nbsp; iPhone et Android, {PUBLICATION_STORES} — {LIEN_APP}</div>
    <div><strong style="color:#fff">Contact</strong> &nbsp; Yassine Bakhtaoui, fondateur</div>
    <div><strong style="color:#fff">Courriel</strong> &nbsp; contact@unoleague.be</div>
    <div><strong style="color:#fff">Téléphone</strong> &nbsp; +32 489 16 81 80</div>
    <div><strong style="color:#fff">Structure</strong> &nbsp; VIP Drivers SRL &nbsp;·&nbsp; BE&nbsp;0744.534.881</div>
    <div><strong style="color:#fff">Siège</strong> &nbsp; Assesteenweg 116A, 1740 Ternat</div>
  </div>
  <div class="meta" style="position:static;margin-top:14mm">
    Dossier établi en {DATE_DOSSIER}. Les projections chiffrées reposent sur le
    tarif de salle le plus élevé observé à Bruxelles et sur la grille programmée
    dans l'application ; elles ne constituent pas un engagement de résultat.
  </div>
</section>

</body>"""
