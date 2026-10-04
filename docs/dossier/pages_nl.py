"""Het presentatiedossier, in het Nederlands — vertaling van `pages_fr.py`.

Zelfde structuur, pagina per pagina, en dezelfde constanten: alleen de tekst
verandert. De termen volgen de Nederlandse versie van de app (`nl.ts`):
voorstel, reservatie, sessie, clubmatch, uitdaging, kas, stichter, winkel.
"""

TITRE = "UNO League — Presentatiedossier"
LIBELLES_BARRE = ["Zaalhuur", "Gaat naar de spelers en de scheidsrechter", "Marge van de liga"]
PIED = "UNO League — Presentatiedossier"

PAGES = f"""<body>

<!-- ───────────────────────── 1. Cover ───────────────────────── -->
<section class="page cover">
  <div class="glow"></div>
  <div class="mark">
    <img src="data:image/png;base64,{ECUSSON}" alt="" />
    <span>UNO <em>LEAGUE</em></span>
  </div>
  <div class="phone"><img src="data:image/png;base64,{ASSETS["accueil-nl"]}" alt="De UNO League-app" /></div>
  <h1>Amateurfutsal,<br />zonder licentie,<br />zonder verbintenis.<br /><b>Met beloningen.</b></h1>
  <p class="sub">
    Een liga die openstaat voor iedereen, georganiseerd door een app die de
    sessies, de betalingen, de ploegen en het klassement regelt — en die
    wie speelt ook beloont.
  </p>
  <div class="meta">
    <strong>Presentatiedossier</strong>
    {date_dossier().capitalize()} · België
  </div>
  <div class="dl">
    <div>
      <strong>Beschikbaar in</strong>
      App Store en Google Play<br />
      <b>{LIEN_APP}</b>
    </div>
    <div class="qr">{QR_APP}</div>
  </div>
</section>

<!-- ───────────────────────── 2. Het probleem ───────────────────────── -->
<section class="page">
  <div class="eyebrow">De vaststelling</div>
  <h2>Voetballen als volwassene<br />is ingewikkeld geworden.</h2>

  <p class="lead">
    Een club vraagt een licentie, een vaste training en een engagement voor
    een heel seizoen. Veel volwassenen kunnen dat niet meer volhouden —
    werkuren, kinderen, gezondheid. Ze spelen dus niet meer, of slecht
    georganiseerd: een groepschat, een zaal die op het laatste moment wordt
    geboekt, en sessies die niet doorgaan.
  </p>

  <div class="grid2">
    <div class="card">
      <h3><i>01</i> Niemand wil de organisatie op zich nemen</h3>
      <p>
        Een zaal vinden, een uur vastleggen, vijftien mensen samenbrengen, de
        huur voorschieten en daarna iedereen achterna zitten: de taak die
        niemand wil, en die groepen doet uiteenvallen.
      </p>
    </div>
    <div class="card">
      <h3><i>02</i> Eén afwezige en de sessie valt weg</h3>
      <p>
        Twee dagen voor het uur ontbreekt er een speler: de zaal is verloren,
        de anderen blijven thuis. Geen wachtlijst, geen georganiseerde
        vervanger.
      </p>
    </div>
    <div class="card">
      <h3><i>03</i> Er wordt niets opgebouwd</h3>
      <p>
        Je speelt, je vergeet. Geen klassement, geen vooruitgang, geen reden
        om volgende week terug te komen — dus brokkelt de regelmaat af.
      </p>
    </div>
    <div class="card">
      <h3><i>04</i> Nieuwkomers blijven buiten</h3>
      <p>
        Een gesloten groep gaat niet open. Wie net in de gemeente woont, of
        opnieuw wil sporten, vindt nergens een ingang.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Het volwassen amateursport mist geen spelers, het mist
      organisatie.</strong> UNO League richt geen extra club op: ze levert de
      organisatie die ontbrak, en opent het spel voor wie door geen enkele
      structuur wordt bereikt.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>2</span></div>
</section>

<!-- ───────────────────────── 3. De oplossing ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Het voorstel</div>
  <h2>Elke speler<br />kan een voorstel openen.</h2>

  <p class="lead">
    Een zaal, een datum, een uur: het voorstel staat open, de anderen
    schrijven zich in — of worden met één tik uitgenodigd, via een eenvoudige
    link als de sessie privé is. Zodra het veld vol is, wordt het een
    reservatie en betaalt iedereen zijn plaats in de app — kaart, Bancontact,
    Apple Pay of verzamelde punten. Niemand schiet nog geld voor, niemand moet
    nog iemand achterna zitten.
  </p>

  <div class="portes">
    <div class="porte">
      <h3>Alleen of met vrienden</h3>
      <div class="lst">Vriendschappelijke match · UNO League · Voetbal</div>
      <p>Iedereen opent of vervoegt een sessie voor zichzelf, en speelt met wie hij wil.</p>
    </div>
    <div class="porte">
      <h3>Met je club</h3>
      <div class="lst">Uitdagingen · Toernooien · Voetbal</div>
      <p>De club doet een voorstel, daagt een andere club uit of schrijft zich in voor een toernooi; de spelers schrijven zich in.</p>
    </div>
  </div>

  <div class="shots" style="--shot-max:67mm">
    {capture("proposition", "Een open voorstel", "Modus, zaal, uur, prijs, inschrijvingen, beloningen en spelers die al ingeschreven zijn.")}
    {capture("calendrier", "De kalender", "Elk uur toont zijn modus, divisie, prijs en het aantal vrije plaatsen.")}
    {capture("accueil", "Wat u aanbelangt", "De volgende sessies, hoe vol ze zitten en wat er nog te betalen valt.")}
    {capture("classement", "Het klassement", "Drie divisies. Je stijgt of daalt volgens de resultaten van de sessie.")}
  </div>

  <div class="grid3" style="margin-top:6mm">
    <div class="card">
      <h3><i>01</i> Voorstel</h3>
      <p>
        Een speler of een club opent een uur, de anderen schrijven zich in.
        Er is niets vastgelegd zolang het veld niet vol is.
      </p>
    </div>
    <div class="card">
      <h3><i>02</i> Reservatie</h3>
      <p>
        Een vol veld start de betaling <strong>en vervolledigt de
        ploegen</strong>; iedereen heeft vierentwintig uur. Daarna gaat de
        plaats open voor vervangers, maar ze is pas verloren als een van hen
        betaalt.
      </p>
    </div>
    <div class="card">
      <h3><i>03</i> Sessie</h3>
      <p>
        Iedereen neemt zijn plaats op het veld in, het wedstrijdblad wordt
        bijgehouden en de afsluiting werkt statistieken, beloningen en
        klassement bij.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>De inzet: regelmaat ontstaat uit wat er op het spel staat.</strong>
      Een klassement, divisies, een spelerskaart die evolueert, punten die je
      elke sessie verdient — de drijfveren van clubsport, zonder licentie en
      zonder jaarlijks engagement. Je komt terug omdat volgende week telt, en
      omdat ze iets oplevert.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>3</span></div>
</section>

<!-- ───────────────────────── 4. De spelmodi ───────────────────────── -->
<section class="page">
  <div class="eyebrow">De formules</div>
  <h2>Elke modus heeft zijn regels,<br />zijn duur en zijn beloningen.</h2>

  <p class="lead">
    Een plaats kost overal {eur(PRIX_HEURE)} per uur. De modi verschillen in
    duur, aantal spelers en wat de sessie oplevert; alleen de UNO League, de
    officiële competitie, doet het klassement bewegen.
  </p>

  <div class="grid2" style="align-items:start;grid-template-columns:1.15fr .85fr">
    <div>
      <table class="modes">
        <thead>
          <tr>
            <th>Modus</th>
            <th class="c">Spelers</th>
            <th class="c">Duur</th>
            <th class="c">Plaats</th>
            <th class="c">Levert op</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>UNO League</td>
            <td class="c">{LIGUE_JOUEURS}</td>
            <td class="c">{LIGUE_HEURES} u</td>
            <td class="c">{eur(PRIX_HEURE)}/u</td>
            <td class="c"><strong>Punten, stats, divisie</strong></td>
          </tr>
          <tr>
            <td>Vriendschappelijke match</td>
            <td class="c">{AMICAL_JOUEURS}</td>
            <td class="c">{AMICAL_HEURES} u</td>
            <td class="c">{eur(PRIX_HEURE)}/u</td>
            <td class="c">Ervaring</td>
          </tr>
          <tr>
            <td>Clubmatch</td>
            <td class="c">{CLUB_JOUEURS}</td>
            <td class="c">{CLUB_HEURES} u</td>
            <td class="c">{eur(PRIX_HEURE)}/u</td>
            <td class="c">Stats, de inzet</td>
          </tr>
          <tr>
            <td>Toernooi tussen clubs</td>
            <td class="c">{TOURNOI_CLUBS_MIN} tot {TOURNOI_CLUBS_MAX} clubs</td>
            <td class="c">2 u</td>
            <td class="c">{milliers(TOURNOI_ENGAGEMENT_UNO)} UNO/club</td>
            <td class="c">Prijzenpot {milliers(TOURNOI_DOTATION_MIN)}–{milliers(TOURNOI_DOTATION_MAX)} UNO</td>
          </tr>
          <tr>
            <td>Voetbal</td>
            <td class="c">{GRAND_MIN_PAR_EQUIPE * 2} tot {GRAND_MAX_PAR_EQUIPE * 2}</td>
            <td class="c bientot" colspan="3">Binnenkort — op gras</td>
          </tr>
        </tbody>
      </table>

      <h3 style="margin-top:3mm">Talent loont</h3>
      <p>
        Het wedstrijdblad duidt de topschutter, de beste aangever (assists) en
        de beste verdediger aan, ook de winnende ploeg — en <strong>iedereen
        krijgt een deel voor zijn komst</strong>.
      </p>

      <h3 style="margin-top:3mm">Een kaart die een seizoen vertelt</h3>
      <p>
        Goals, assists, reddingen, onderscheppingen, man van de match: elke
        actie komt op de spelerskaart. De algemene score stijgt — en daalt.
        Ervaring bouw je op in de liga, vriendschappelijk en met je club.
      </p>

      <h3 style="margin-top:3mm">Wie met wie speelt, en op welke positie</h3>
      <p>
        <strong>Je speelt met wie je wilt.</strong> Bij de inschrijving kiest
        iedereen zijn ploeg en zijn positie: ‘wie staat in doel?’ is de dag
        ervoor geregeld, niet in de kleedkamer. Wie niet kiest, wordt door het
        systeem geloot — in de UNO League ({LIGUE_EQUIPES} ploegen van
        {LIGUE_JOUEURS // LIGUE_EQUIPES}), vriendschappelijk en bij Voetbal.
      </p>
    </div>

    <div class="shots duo" style="grid-template-columns:1fr;margin-top:0;--shot-max:118mm">
      {capture("terrain-ligue", "Het veld van een sessie", "Iedereen kiest zijn ploeg en zijn positie; wie niet kiest, wordt geloot. Een vrije plaats is zichtbaar, een ingeschreven speler zonder positie ook.")}
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Ook onder vrienden.</strong> Een sessie kan privé blijven, voor
      genodigden. De <strong>gepersonaliseerde match</strong> is een gratis
      planner van de liga: een groep die elders speelt, organiseert er zijn
      match en bewaart zijn statistieken. Volgende formule: Voetbal, op gras.
    </p>
    <p style="margin-top:2mm">
      <strong>De scheidsrechter leidt de UNO League en de toernooien.</strong>
      Hij speelt niet mee, staat in geen klassement en wordt betaald op
      factuur voor prestaties, per uur, of in UNO-punten. Uitdagingen en
      vriendschappelijke matchen zijn zonder scheidsrechter.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>4</span></div>
</section>

<!-- ───────────────────────── 5. Maatschappelijke impact ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Wat de liga mogelijk maakt</div>
  <h2>We verkopen geen app.<br />We bouwen een gemeenschap.</h2>

  <p class="lead">
    In elke gemeente zijn er volwassenen die graag voetbalden en ermee gestopt
    zijn. Niet uit gebrek aan zin — uit gebrek aan een ingang. UNO League is
    die ingang: je schrijft je alleen in, je vertrekt met ploegmaats en een
    reden om vrijdag terug te komen.
  </p>

  <div class="grid2" style="margin-bottom:6mm">
    <div>
      <h3>Niemand is te veel</h3>
      <p>
        Geen licentie, geen jaarlijks lidgeld, geen selectie, geen minimumniveau.
        Je betaalt de sessie waarop je komt. Wie maar één keer per maand kan,
        wordt niet benadeeld, en een beginner speelt vanaf de eerste week mee —
        de divisies bestaan om hem zijn niveau te laten vinden, niet om hem
        uit te sluiten.
      </p>

      <h3 style="margin-top:4mm">Ontmoetingen die anders nooit waren gebeurd</h3>
      <p>
        Je komt met je vrienden, en speelt elke week tegen mensen uit een
        andere wijk, met een ander beroep, van een andere leeftijd. Wie zich
        alleen inschrijft, komt in een ploeg terecht en vertrekt met
        ploegmaats. Een gesloten groep sluit zich op; een open liga brengt
        mensen samen. De kleedkamer doet de rest.
      </p>

      <h3 style="margin-top:4mm">Veilig spelen</h3>
      <p>
        Een scheidsrechter in de competitie, geschreven en raadpleegbare
        regels, een bijgehouden wedstrijdblad. Het gedrag regelt zich omdat
        klassement en kaart ervan afhangen — en omdat een volwassene die zich
        na het werk komt uitleven, heelhuids naar huis wil.
      </p>
    </div>
    <div>
      <div class="shots duo" style="margin-top:0;gap:5mm;--shot-max:92mm">
        {capture("club", "De clubs", "Een vriendengroep richt een club op, vult de kas, daagt anderen uit en rekruteert op de transfermarkt.")}
        {capture("tournoi", "De toernooien", f"Inschrijving van {milliers(TOURNOI_ENGAGEMENT_UNO)} UNO per club; de prijzenpot gaat van {milliers(TOURNOI_DOTATION_MIN)} UNO bij halve finales tot {milliers(TOURNOI_DOTATION_MAX)} bij achtste finales.")}
      </div>
    </div>
  </div>

  <div class="grid3">
    <div class="card">
      <h3>Een reden om te bewegen</h3>
      <p>Een tot twee uur echte inspanning per sessie, voor een volwassen
      publiek dat de sport niet meer bereikte.</p>
    </div>
    <div class="card">
      <h3>Een levendige gemeente</h3>
      <p>De zalen worden ter plaatse gehuurd. Elke sessie doet een lokale
      infrastructuur en haar uitbater draaien.</p>
    </div>
    <div class="card">
      <h3>Iets teruggeven</h3>
      <p>De punten die op het veld verdiend worden, kunnen via de winkel aan
      een goed doel geschonken worden.</p>
    </div>
  </div>

  <div class="note" style="margin-top:6mm">
    <p>
      <strong>Wat we eigenlijk proberen te maken, is een gewoonte.</strong>
      Het klassement, de beloningen en de kaart zijn geen gadgets: het zijn
      de redenen waarom je de week erna terugkomt, en de week daarna. Een
      volwassene die een jaar lang elke week opnieuw voetbalt — dat is het
      enige resultaat dat telt.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>5</span></div>
</section>

<!-- ───────────────────────── 6. De UNO-punten ───────────────────────── -->
<section class="page">
  <div class="eyebrow">De munt van de liga</div>
  <h2>UNO-punten:<br />wat je op het veld verdient,<br />besteed je in de app.</h2>

  <p class="lead">
    Een speler kan geen UNO-punten kopen: je krijgt ze door te spelen of door
    nieuwe spelers uit te nodigen, en talent loont meer dan aanwezigheid. Je kunt ze ook niet laten uitbetalen
    — ze worden in de app besteed. Honderd punten zijn tien euro waard.
  </p>

  <div class="flux">
    <div>
      <h3>Wat ze oplevert</h3>
      <ul>
        <li>
          <b>Topschutter van een sessie<em>In D1. D2 levert {R_BUTEUR["D2"]} UNO op, D3 {R_BUTEUR["D3"]}</em></b>
          <span>{R_BUTEUR["D1"]} UNO</span>
        </li>
        <li>
          <b>Beste aangever, beste verdediger<em>In D1, elk. {R_PASSEUR["D2"]} UNO in D2, {R_PASSEUR["D3"]} in D3</em></b>
          <span>{R_PASSEUR["D1"]} UNO</span>
        </li>
        <li>
          <b>Winnende ploeg<em>Voor elk van haar {LIGUE_JOUEURS // LIGUE_EQUIPES} spelers</em></b>
          <span>{R_MEILLEURE_EQUIPE} UNO</span>
        </li>
        <li>
          <b>Deelname<em>Voor elke aanwezige speler, ongeacht de uitslag</em></b>
          <span>{R_PARTICIPATION} UNO</span>
        </li>
        <li>
          <b>Nieuw niveau<em>In de liga, vriendschappelijk en in je club</em></b>
          <span>10 UNO en +</span>
        </li>
        <li>
          <b>Een sessie leiden<em>Scheidsrechters, of {eur(ARBITRE_EUR_HEURE)}/u excl. btw op factuur</em></b>
          <span>{ARBITRE_UNO} UNO</span>
        </li>
        <li>
          <b>Een nieuwe speler uitnodigen<em>Na diens 1ste betaalde sessie; +{PARRAIN_PALIER} UNO na de {PARRAIN_SEANCES}de</em></b>
          <span>{PARRAIN_1RE} UNO</span>
        </li>
        <li>
          <b>Clubwinsten<em>Uitdagingen, toernooien ({milliers(TOURNOI_DOTATION_MIN)} tot {milliers(TOURNOI_DOTATION_MAX)} UNO), transfers</em></b>
          <span>variabel</span>
        </li>
      </ul>
    </div>
    <div>
      <h3>Wat je ermee doet</h3>
      <ul>
        <li>
          <b>Je plaats in een ligasessie betalen<em>Het hoofdgebruik: de punten vervangen de euro</em></b>
          <span>{LIGUE_PRIX * UNO_PAR_EURO} UNO</span>
        </li>
        <li>
          <b>Je plaats in een vriendschappelijke match of clubmatch<em>Korte formule, één uur</em></b>
          <span>{AMICAL_PRIX * UNO_PAR_EURO} UNO</span>
        </li>
        <li>
          <b>Bestellen in de winkel<em>Uitrusting, multimedia, dagelijkse spullen</em></b>
          <span>aan de vermelde prijs</span>
        </li>
        <li>
          <b>Schenken aan een goed doel<em>De gift wordt in de winkel aangeboden</em></b>
          <span>naar keuze</span>
        </li>
        <li>
          <b>De kas van je club aanvullen<em>Inzet van een uitdaging, inschrijving voor een toernooi ({milliers(TOURNOI_ENGAGEMENT_UNO)} UNO)</em></b>
          <span>naar keuze</span>
        </li>
        <li>
          <b>Punten naar een andere speler sturen<em>Elke beweging blijft in het register staan</em></b>
          <span>naar keuze</span>
        </li>
      </ul>
    </div>
  </div>

  <div class="grid3" style="margin-top:5mm">
    <div class="card">
      <h3>Alles wordt geregistreerd</h3>
      <p>
        Elke beweging heeft een datum en een reden. Een terugbetaling is even
        duidelijk te lezen als een betaling.
      </p>
    </div>
    <div class="card">
      <h3>Geen uitbetaling in geld</h3>
      <p>
        De punten worden niet terug omgezet in euro. Wat een sessie verdeelt,
        blijft in de liga en wordt er besteed.
      </p>
    </div>
    <div class="card">
      <h3>Talent loont</h3>
      <p>
        {RECOMPENSES / RECETTE:.0%} van de opbrengst van een sessie gaat terug
        als beloning, en meer naar wie scoorde, een assist gaf of verdedigde.
        Een reden om terug te komen, geen kost voor de kas.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Waarom het geen munt is, en ook geen speculatieve token.</strong>
      De punten worden niet gekocht of verkocht en niet omgezet in geld: ze
      dienen alleen om een plaats op een echt veld te reserveren, iets te
      bestellen of aan een goed doel te schenken. Een sessie in
      <strong>D1</strong> verdeelt er {RECOMPENSES_UNO} als beloning — minder
      in D2 en D3, waar de onderscheidingen minder waard zijn — en
      {ARBITRE_UNO} extra voor de scheidsrechter.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>6</span></div>
</section>

<!-- ───────────────────────── 7. Het businessmodel ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Het businessmodel</div>
  <h2>Een sessie die zichzelf<br />bedruipt, vanaf de eerste.</h2>

  <p class="lead">
    Het model steunt niet op reclame, niet op een abonnement en niet op een
    volume dat eerst gehaald moet worden: elke sessie dekt haar eigen kosten.
    Hier een ligasessie, aan het hoogste zaaltarief in Brussel.
  </p>

  <div class="kpis" style="margin:3mm 0 2mm">
    <div class="kpi">
      <div><span class="u" style="margin:0 1mm 0 0">€</span><span class="n">{LIGUE_PRIX}</span></div>
      <div class="l">per speler en per ligasessie — zaal en scheidsrechter inbegrepen</div>
    </div>
    <div class="kpi">
      <div><span class="n">{LIGUE_JOUEURS}</span><span class="u">spelers</span></div>
      <div class="l">een volledig veld voor een ligasessie, over {LIGUE_HEURES} uur</div>
    </div>
    <div class="kpi">
      <div><span class="u" style="margin:0 1mm 0 0">€</span><span class="n">{MARGE}</span></div>
      <div class="l">marge per sessie in de duurste hypothese, of {MARGE / RECETTE:.0%} van de opbrengst</div>
    </div>
  </div>

  <h3 style="margin-top:2mm">Waar elke euro van een ligasessie van {eur(RECETTE)} naartoe gaat</h3>
  {barre()}

  <table>
    <thead>
      <tr><th>Post</th><th style="text-align:right">Bedrag</th><th style="text-align:right">Aandeel</th></tr>
    </thead>
    <tbody>
      <tr><td>Opbrengst — {LIGUE_JOUEURS} spelers × {eur(LIGUE_PRIX)}</td><td class="n">{eur(RECETTE)}</td><td class="n">100%</td></tr>
      <tr><td>Zaalhuur — {LIGUE_HEURES} u × {eur(SALLE_HEURE_HAUT)}</td><td class="n">− {eur(SALLE)}</td><td class="n">{SALLE / RECETTE:.0%}</td></tr>
      <tr><td>Vergoeding scheidsrechter — {ARBITRE_UNO} UNO</td><td class="n">− {eur(ARBITRE)}</td><td class="n">{ARBITRE / RECETTE:.0%}</td></tr>
      <tr><td>Beloningen voor de spelers — {RECOMPENSES_UNO} UNO</td><td class="n">− {eur(RECOMPENSES)}</td><td class="n">{RECOMPENSES / RECETTE:.0%}</td></tr>
      <tr class="total"><td>Marge van de liga</td><td class="n">{eur(MARGE)}</td><td class="n">{MARGE / RECETTE:.0%}</td></tr>
    </tbody>
  </table>

  <div class="note">
    <p>
      <strong>{eur(SALLE_HEURE_HAUT)} per uur is het hoogste tarief in
      Brussel</strong>: de minst gunstige hypothese, bewust gekozen. Aan het
      gangbare tarief van {eur(SALLE_HEURE_COURANT)} levert dezelfde sessie
      {eur(MARGE_COURANTE)} op in plaats van {eur(MARGE)}. Een vriendschappelijke
      match, korter en zonder beloningen, laat {eur(AMICAL_MARGE)} over op
      {eur(AMICAL_RECETTE)}.
    </p>
  </div>

  <h3 style="margin-top:3mm">Waar het model naartoe gaat</h3>
  <p style="font-size:10pt">
    De zaalhuur slorpt {SALLE / RECETTE:.0%} van de opbrengst op: het is de
    post die al de rest bepaalt, en ook de post die kan verdwijnen.
    <strong>Op termijn willen we eigen velden</strong> — tot en met de arena
    van de nieuwe generatie die verderop wordt voorgesteld. Een kost die elke
    sessie terugkomt, wordt dan een afgeschreven investering, en de marge is
    niet langer een restpost. De weg erheen loopt in stappen: volume
    onderhandelt het uurtarief, het tarief maakt een vast uur mogelijk, en
    een vast uur rechtvaardigt een eigen zaal.
  </p>

  <p style="margin-top:3mm;font-size:9pt;color:var(--ink-3)">
    Een onvolledige sessie wordt niet bevestigd en kost geen zaalhuur: het
    risico op verlies bij een leeg uur is per definitie nul. Daarbij komen,
    buiten de sessies, de inschrijvingen voor de clubtoernooien en de marge
    van de winkel, die op bestelling werkt. De scheidsrechter wordt betaald
    via een factuur voor prestaties, aan {eur(ARBITRE_EUR_HEURE)} per uur
    excl. btw, of in UNO-punten — hetzelfde bedrag.
  </p>

  <div class="foot"><span>{PIED}</span><span>7</span></div>
</section>

<!-- ───────────────────────── 8. Stand van zaken ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Waar het project staat</div>
  <h2>Het platform is klaar.<br />De gemeenschap groeit.</h2>

  <p class="lead">
    De app is geen maquette en geen project dat nog gefinancierd moet worden:
    ze is gebouwd, online en werkt. Er zijn al {JOUEURS_INSCRITS} spelers
    ingeschreven; de volgende stap is de gemeenschap laten groeien tot de
    eerste sessies.
  </p>

  <div class="grid2" style="margin-bottom:4mm">
    <div class="card">
      <h3>Wat klaar is</h3>
      <p>
        Een volledige app, in haar nieuwe interface — inschrijvingen en
        uitnodigingen, privésessies, betalingen met kaart, Bancontact en
        Apple Pay, ploegen en posities op het veld, wedstrijdbladen,
        klassement, divisies, clubs, uitdagingen, toernooien, transfermarkt,
        winkel, scheidsrechters, moderatie, meldingen en e-mails, in het
        Frans, Nederlands en Engels.<br /><br />
        Echt online: server, databank en website in productie op
        {SITE_PUBLIC}. iPhone- en Android-apps <strong>beschikbaar in de App
        Store en Google Play</strong>.<br /><br />
        <strong>{TESTS} geautomatiseerde tests</strong> bewaken de spelregels
        en vooral de geldstromen.
      </p>
    </div>
    <div class="card">
      <h3>De volgende stappen</h3>
      <p>
        Van {JOUEURS_INSCRITS} naar een kern van ongeveer
        <strong>{NOYAU_CIBLE} spelers</strong>. Dat is het aantal waarmee de
        drie divisies kunnen starten: één sessie D1, één D2 en één D3 per
        week, of {PLACES_SEMAINE} plaatsen — wetende dat niemand elke week
        speelt.<br /><br />
        De liga bekendmaken: een reeks korte video's stelt elke spelmodus al
        voor, voor de sociale media.<br /><br />
        De aftrap geven: we overwegen elke speler zijn <strong>eerste
        UNO League-sessie</strong> aan te bieden, tot de mond-tot-mondreclame
        het overneemt.
      </p>
    </div>
  </div>

  <div class="shots" style="grid-template-columns:repeat(4,1fr);--shot-max:77mm">
    {capture("profil", "De spelerskaart", "Score, statistieken, niveau en punten: ze evolueert na elke gespeelde sessie.")}
    {capture("boutique", "De winkel", "De producten die echt te koop zijn, betaald met UNO-punten.")}
    {capture("wallet", "De portefeuille", "Elke beweging wordt geregistreerd en verantwoord: betaling, terugbetaling, beloning.")}
    {capture("informations", "De regels", "Het formaat, de divisies en de tarieven, geschreven en raadpleegbaar in de app.")}
  </div>

  <p style="margin-top:3mm;font-size:8.5pt;color:var(--ink-3)">
    De schermafbeeldingen van sessies en profielen komen uit een
    demonstratieset: namen, gezichten en statistieken zijn fictief. De winkel
    is de echte, in het Frans.
  </p>

  <div class="foot"><span>{PIED}</span><span>8</span></div>
</section>

<!-- ───────────────────────── 9. De groei ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Waar we naartoe gaan</div>
  <h2>Eén stad, dan een land.<br />Het formaat is klaar om te reizen.</h2>

  <p class="lead">
    Amateurfutsal heeft nooit zijn eigen infrastructuur gehad. UNO League
    bouwt ze: een liga die zichzelf organiseert, betaalt en rangschikt, en
    die zich van stad tot stad vestigt zonder iets aan de software te
    veranderen. Het project is zoals het nu is schaalbaar — en geschikt voor
    franchising.
  </p>

  <ol class="steps large">
    <li>
      <span class="when">{NOYAU_CIBLE} actieve spelers</span>
      <h3>Brussel, de eerste kern</h3>
      <p>
        De drie divisies staan overeind: één sessie per divisie per week,
        {PLACES_SEMAINE} plaatsen per week, en de eerste toernooien tussen
        clubs.
      </p>
    </li>
    <li>
      <span class="when">{milliers(PALIER_BELGIQUE)} actieve spelers</span>
      <h3>Antwerpen en Luik</h3>
      <p>
        Elke stad opent haar eigen divisies. Dezelfde server, dezelfde app:
        een stad extra kost wat haar uren kosten, niet wat een nieuw product
        kost.
      </p>
    </li>
    <li>
      <span class="when">{milliers(PALIER_FRANCE)} actieve spelers</span>
      <h3>Frankrijk: Parijs, Marseille</h3>
      <p>
        Daarna de andere grote steden. Een stad kan in franchise aan een
        lokale partner worden toevertrouwd: het formaat, de app, de regels
        en het merk zijn klaar.
      </p>
    </li>
    <li>
      <span class="when">Daarna</span>
      <h3>Een nationale beker, dan een ‘Euro’</h3>
      <p>
        De beste clubs van elke stad strijden om een nationale beker; de
        beste spelers van elk land, om een Europese competitie.
      </p>
    </li>
  </ol>

  <div class="grid3" style="margin-top:auto">
    <div class="card">
      <h3>Schaalbaar</h3>
      <p>Een stad extra vraagt geen ontwikkeling en geen nieuw team: zalen,
      een scheidsrechter, en de gemeenschap die zich inschrijft.</p>
    </div>
    <div class="card">
      <h3>Franchisebaar</h3>
      <p>Het model wordt sleutel-op-de-deur toevertrouwd: een lokale partner
      beheert zijn uren, de liga levert het platform, de regels en het merk.</p>
    </div>
    <div class="card">
      <h3>Gestuurd door de spelers</h3>
      <p>Elke stap gaat pas open bij een drempel van actieve spelers, nooit
      eerder: de groei volgt de vraag in plaats van erop te gokken.</p>
    </div>
  </div>

  <div class="foot"><span>{PIED}</span><span>9</span></div>
</section>

<!-- ───────────────────────── 10. Wat we zoeken ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Het doel op termijn</div>
  <h2>Eigen velden,<br />en de arena van morgen.</h2>

  <p class="lead">
    De zaalhuur slorpt {SALLE / RECETTE:.0%} van de opbrengst op: eigen
    velden maken van die kost een investering. En het doel gaat verder — het
    veld van de nieuwe generatie bouwen.
  </p>

  <figure class="arena">
    <img src="data:image/jpeg;base64,{ARENA}" alt="De Immersive Arena" />
    <figcaption>
      <b>De Immersive Arena</b>
      <span>Een veld omringd door reuzenschermen: elke match wordt gespeeld voor een vol stadion.</span>
    </figcaption>
  </figure>

  <h3 style="margin-top:6mm">Wat we zoeken</h3>
  <div class="grid3" style="margin-top:2mm">
    <div class="card">
      <h3>Financiële steun</h3>
      <p>
        Voor de opstart — communicatie, publicatiekosten, eerste sessies —,
        de enige periode waarin de liga uitgeeft voor ze ontvangt.
      </p>
    </div>
    <div class="card">
      <h3>Materiële steun</h3>
      <p>
        Een sportinfrastructuur die ter beschikking wordt gesteld, schrapt de
        grootste kostenpost en brengt eigen velden in één klap dichterbij.
      </p>
    </div>
    <div class="card">
      <h3>Institutionele steun</h3>
      <p>
        Erkenning, contacten met gemeenten, zalen en federaties. Het kost
        niets en het opent deuren.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>De enige vraag is: stapt u vroeg of laat in?</strong> Het
      platform is gebouwd, online en getest; wat ontbreekt, is de aftrap. De
      drie vormen van steun interesseren ons, apart of samen — en elk ervan
      maakt u deel van een project dat veel meer voor zich heeft dan achter
      zich.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>10</span></div>
</section>

<!-- ───────────────────────── 11. Contact ───────────────────────── -->
<section class="page cover" style="justify-content:flex-end;padding-bottom:16mm">
  <div class="glow"></div>
  <h2 style="color:#fff;font-size:30pt;position:relative">Laten we praten.</h2>
  <p class="sub" style="margin-top:4mm">
    De app is gratis te downloaden in de App Store en Google Play, en werkt
    ook in een browser. We stellen ze graag voor tijdens een afspraak, of
    geven u een demotoegang.
  </p>
  <div class="stores">
    <div class="store"><i></i><div><b>App Store</b><br /><span>Beschikbaar</span></div></div>
    <div class="store"><i></i><div><b>Google Play</b><br /><span>Beschikbaar</span></div></div>
    <div class="qr">{QR_APP}</div>
    <div class="scan"><strong>Scan</strong>{LIEN_APP}<br />de juiste store, volgens de telefoon</div>
  </div>
  <div style="position:relative;margin-top:8mm;font-size:11pt;line-height:2;color:#CBD5E1">
    <div><strong style="color:#fff">Website</strong> &nbsp; https://{SITE_PUBLIC}</div>
    <div><strong style="color:#fff">Mobiel</strong> &nbsp; iPhone en Android, beschikbaar in de App Store en Google Play — {LIEN_APP}</div>
    <div><strong style="color:#fff">Contact</strong> &nbsp; Yassine Bakhtaoui, oprichter</div>
    <div><strong style="color:#fff">E-mail</strong> &nbsp; contact@unoleague.be</div>
    <div><strong style="color:#fff">Telefoon</strong> &nbsp; +32 489 16 81 80</div>
    <div><strong style="color:#fff">Structuur</strong> &nbsp; VIP Drivers SRL &nbsp;·&nbsp; BE&nbsp;0744.534.881</div>
    <div><strong style="color:#fff">Zetel</strong> &nbsp; Assesteenweg 116A, 1740 Ternat</div>
  </div>
  <div class="meta" style="position:static;margin-top:14mm">
    Dossier opgesteld in {date_dossier()}. De cijfermatige projecties steunen op
    het hoogste zaaltarief in Brussel en op de tarieven die in de app zijn
    geprogrammeerd; ze vormen geen resultaatsverbintenis.
  </div>
</section>

</body>"""
