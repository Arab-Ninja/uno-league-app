"""The presentation dossier, in English — a translation of `pages_fr.py`.

Same structure, page by page, and the same constants: only the wording
changes. Terms follow the app's English locale (`en.ts`): proposal,
reservation, session, club match, challenge, treasury, founder, shop.
"""

TITRE = "UNO League — Presentation dossier"
LIBELLES_BARRE = ["Venue hire", "Goes back to the players and the referee", "League margin"]
PIED = "UNO League — Presentation dossier"

PAGES = f"""<body>

<!-- ───────────────────────── 1. Cover ───────────────────────── -->
<section class="page cover">
  <div class="glow"></div>
  <div class="mark">
    <img src="data:image/png;base64,{ECUSSON}" alt="" />
    <span>UNO <em>LEAGUE</em></span>
  </div>
  <div class="phone"><img src="data:image/png;base64,{ASSETS["accueil-en"]}" alt="The UNO League app" /></div>
  <h1>Amateur futsal,<br />no licence,<br />no commitment.<br /><b>With rewards.</b></h1>
  <p class="sub">
    A league open to everyone, run by an app that handles the sessions,
    the payments, the teams and the rankings — and rewards the people who
    play.
  </p>
  <div class="meta">
    <strong>Presentation dossier</strong>
    {date_dossier()} · Belgium
  </div>
  <div class="dl">
    <div>
      <strong>Available on</strong>
      the App Store and Google Play<br />
      <b>{LIEN_APP}</b>
    </div>
    <div class="qr">{QR_APP}</div>
  </div>
</section>

<!-- ───────────────────────── 2. The problem ───────────────────────── -->
<section class="page">
  <div class="eyebrow">The problem</div>
  <h2>Playing football as an adult<br />has become complicated.</h2>

  <p class="lead">
    A club asks for a licence, fixed training times and a full-season
    commitment. Many adults can no longer keep up — working hours, children,
    health. So they stop playing, or play badly organised games: a group
    chat, a hall booked at the last minute, and sessions that fall through.
  </p>

  <div class="grid2">
    <div class="card">
      <h3><i>01</i> Nobody wants to do the organising</h3>
      <p>
        Finding a hall, fixing a time slot, getting fifteen people together,
        paying the hire up front and then chasing everyone: the job nobody
        wants, and the one that kills groups.
      </p>
    </div>
    <div class="card">
      <h3><i>02</i> One no-show and the session is off</h3>
      <p>
        Two days before kick-off, a player drops out: the hall is lost and the
        others stay home. No waiting list, no organised substitute.
      </p>
    </div>
    <div class="card">
      <h3><i>03</i> Nothing builds up</h3>
      <p>
        You play, you forget. No ranking, no progress, no reason to come back
        next week — so attendance crumbles.
      </p>
    </div>
    <div class="card">
      <h3><i>04</i> Newcomers stay outside</h3>
      <p>
        A closed group doesn't open up. Someone who has just moved to town, or
        who is getting back into sport, has no way in.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Adult amateur sport is not short of players, it is short of
      organisation.</strong> UNO League doesn't create one more club: it
      provides the organisation that was missing, and opens the game to people
      no structure ever reaches.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>2</span></div>
</section>

<!-- ───────────────────────── 3. The solution ───────────────────────── -->
<section class="page">
  <div class="eyebrow">The proposal</div>
  <h2>Any player<br />can open a proposal.</h2>

  <p class="lead">
    A hall, a date, a time: the proposal is open and the others sign up — or
    are invited in one tap, through a simple link if the session is private.
    As soon as the line-up is full, it becomes a reservation and everyone pays
    for their place in the app — card, Bancontact, Apple Pay, or points they
    have earned. Nobody pays up front any more, nobody chases anyone.
  </p>

  <div class="portes">
    <div class="porte">
      <h3>On your own or with friends</h3>
      <div class="lst">Friendly match · UNO League · Football</div>
      <p>Everyone opens or joins a session for themselves, and plays with whoever they like.</p>
    </div>
    <div class="porte">
      <h3>With your club</h3>
      <div class="lst">Challenges · Tournaments · Football</div>
      <p>The club makes a proposal, challenges another club or enters a tournament; its players sign up.</p>
    </div>
  </div>

  <div class="shots" style="--shot-max:72mm">
    {capture("proposition", "An open proposal", "Mode, venue, time slot, price, sign-ups, rewards at stake and players already in.")}
    {capture("calendrier", "The calendar", "Each slot shows its mode, division, price and the number of places left.")}
    {capture("accueil", "What matters to you", "Upcoming sessions, how full they are and what is left to pay.")}
    {capture("classement", "The rankings", "Three divisions. You move up or down with each session's results.")}
  </div>

  <div class="grid3" style="margin-top:6mm">
    <div class="card">
      <h3><i>01</i> Proposal</h3>
      <p>
        A player or a club opens a slot, the others sign up. Nothing is
        committed until the line-up is full.
      </p>
    </div>
    <div class="card">
      <h3><i>02</i> Reservation</h3>
      <p>
        A full line-up triggers payment <strong>and completes the
        teams</strong>; everyone has twenty-four hours. After that the place
        opens to substitutes, but it is only lost if one of them pays for it.
      </p>
    </div>
    <div class="card">
      <h3><i>03</i> Session</h3>
      <p>
        Everyone takes their position on the pitch, the match sheet is kept,
        and closing the session updates stats, rewards and rankings.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>The bet: regularity comes from having something at stake.</strong>
      Rankings, divisions, a player card that evolves, points earned every
      session — the drivers of club sport, without the licence or the yearly
      commitment. You come back because next week counts, and because it
      pays.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>3</span></div>
</section>

<!-- ───────────────────────── 4. Game modes ───────────────────────── -->
<section class="page">
  <div class="eyebrow">The formats</div>
  <h2>Each mode has its own rules,<br />length and rewards.</h2>

  <p class="lead">
    A place costs the same everywhere: {eur(PRIX_HEURE)} per hour. What changes
    from one mode to the next is the length, the number of players and what
    the session earns you. UNO League, the official competition, is the only
    one that moves the rankings.
  </p>

  <div class="grid2" style="align-items:start;grid-template-columns:1.15fr .85fr">
    <div>
      <table class="modes">
        <thead>
          <tr>
            <th>Mode</th>
            <th class="c">Players</th>
            <th class="c">Length</th>
            <th class="c">Place</th>
            <th class="c">Earns</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>UNO League</td>
            <td class="c">{LIGUE_JOUEURS}</td>
            <td class="c">{LIGUE_HEURES} h</td>
            <td class="c">{eur(PRIX_HEURE)}/h</td>
            <td class="c"><strong>Points, stats, division</strong></td>
          </tr>
          <tr>
            <td>Friendly match</td>
            <td class="c">{AMICAL_JOUEURS}</td>
            <td class="c">{AMICAL_HEURES} h</td>
            <td class="c">{eur(PRIX_HEURE)}/h</td>
            <td class="c">Experience</td>
          </tr>
          <tr>
            <td>Club match</td>
            <td class="c">{CLUB_JOUEURS}</td>
            <td class="c">{CLUB_HEURES} h</td>
            <td class="c">{eur(PRIX_HEURE)}/h</td>
            <td class="c">Stats, the stake</td>
          </tr>
          <tr>
            <td>Club tournament</td>
            <td class="c">{TOURNOI_CLUBS_MIN} to {TOURNOI_CLUBS_MAX} clubs</td>
            <td class="c">2 h</td>
            <td class="c">{milliers(TOURNOI_ENGAGEMENT_UNO)} UNO per club</td>
            <td class="c">Prize of {milliers(TOURNOI_DOTATION_MIN)} to {milliers(TOURNOI_DOTATION_MAX)} UNO</td>
          </tr>
          <tr>
            <td>Football</td>
            <td class="c">{GRAND_MIN_PAR_EQUIPE * 2} to {GRAND_MAX_PAR_EQUIPE * 2}</td>
            <td class="c bientot" colspan="3">Coming soon — on grass</td>
          </tr>
        </tbody>
      </table>

      <h3 style="margin-top:3mm">Talent pays</h3>
      <p>
        The match sheet names the top scorer, the top assist provider and the
        best defender. The winning team too, and <strong>everyone gets a share
        for turning up</strong>.
      </p>

      <h3 style="margin-top:3mm">A card that tells a season</h3>
      <p>
        Goals, assists, saves, interceptions, man of the match: every action
        recorded feeds into the player card. The overall rating goes up — and
        down. Experience builds up in the league, in friendlies and with your
        club.
      </p>

      <h3 style="margin-top:3mm">Who plays with whom, and where</h3>
      <p>
        <strong>You play with whoever you want.</strong> When signing up,
        everyone picks their team and their position on the pitch: “who goes in
        goal?” is settled the day before, not in the dressing room. Anyone who
        doesn't choose is placed by the system, at random. The same rule applies
        in UNO League ({LIGUE_EQUIPES} teams of
        {LIGUE_JOUEURS // LIGUE_EQUIPES}), in friendly matches and in Football.
      </p>
    </div>

    <div class="shots duo" style="grid-template-columns:1fr;margin-top:0;--shot-max:118mm">
      {capture("terrain-ligue", "A session's pitch", "Everyone picks their team and position; anyone who doesn't is placed at random. A free place shows, and so does a player without a position.")}
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Among friends too.</strong> A session can stay private, for
      invited players only. The <strong>custom match</strong> is a free
      planner offered by the league: a group that plays elsewhere organises its
      match there and keeps its stats. Next format: Football, on grass.
    </p>
    <p style="margin-top:2mm">
      <strong>The referee officiates UNO League sessions and tournaments.</strong>
      They don't play, don't appear in any ranking, and are paid either on a
      service invoice, by the hour, or in UNO points. Challenges and
      friendlies are played without a referee.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>4</span></div>
</section>

<!-- ───────────────────────── 5. Social impact ───────────────────────── -->
<section class="page">
  <div class="eyebrow">What the league makes possible</div>
  <h2>We're not selling an app.<br />We're building a community.</h2>

  <p class="lead">
    In every town there are adults who loved football and gave it up. Not
    for lack of desire — for lack of a way in. UNO League is that way in: you
    sign up on your own, and you leave with teammates and a reason to come
    back on Friday.
  </p>

  <div class="grid2" style="margin-bottom:6mm">
    <div>
      <h3>Nobody is one too many</h3>
      <p>
        No licence, no annual fee, no selection, no minimum level. You pay for
        the session you come to. Someone who can only come once a month isn't
        penalised, and a beginner plays from the very first week — divisions
        exist so they meet their level, not to keep them out.
      </p>

      <h3 style="margin-top:4mm">Encounters that would never have happened</h3>
      <p>
        You come with your friends, and every week you play against people from
        another neighbourhood, another job, another age group. Anyone who signs
        up alone is placed in a team and leaves with teammates. A closed group
        turns in on itself; an open league brings people together. The dressing
        room does the rest.
      </p>

      <h3 style="margin-top:4mm">Playing safely</h3>
      <p>
        A referee in competition, written rules anyone can read, a match sheet
        that is kept. Behaviour regulates itself because the rankings and the
        card depend on it — and because an adult letting off steam after work
        wants to get home in one piece.
      </p>
    </div>
    <div>
      <div class="shots duo" style="margin-top:0;gap:5mm;--shot-max:92mm">
        {capture("club", "Clubs", "A group of friends founds its club, funds it, challenges others and recruits on the transfer market.")}
        {capture("tournoi", "Tournaments", f"Entry of {milliers(TOURNOI_ENGAGEMENT_UNO)} UNO per club; the prize goes from {milliers(TOURNOI_DOTATION_MIN)} UNO for semi-finals to {milliers(TOURNOI_DOTATION_MAX)} for a round of sixteen.")}
      </div>
    </div>
  </div>

  <div class="grid3">
    <div class="card">
      <h3>A reason to move</h3>
      <p>One to two hours of real exercise per session, for an adult audience
      that sport had stopped reaching.</p>
    </div>
    <div class="card">
      <h3>A town that comes alive</h3>
      <p>Halls are hired locally. Every session keeps a local facility and
      its operator busy.</p>
    </div>
    <div class="card">
      <h3>Giving back</h3>
      <p>Points earned on the pitch can be donated to a charity, straight
      from the shop.</p>
    </div>
  </div>

  <div class="note" style="margin-top:6mm">
    <p>
      <strong>What we are really trying to build is a habit.</strong> The
      rankings, the rewards and the card are not gimmicks: they are the reasons
      you come back the following week, and the week after. An adult who plays
      football again every week for a year — that is the only result that
      counts.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>5</span></div>
</section>

<!-- ───────────────────────── 6. UNO points ───────────────────────── -->
<section class="page">
  <div class="eyebrow">The league's currency</div>
  <h2>UNO points:<br />what you earn on the pitch,<br />you spend in the app.</h2>

  <p class="lead">
    A player cannot buy UNO points: the only way to get them is to play, and
    talent pays more than attendance. They cannot be cashed out either — they
    are spent in the app. A hundred points are worth ten euros.
  </p>

  <div class="flux">
    <div>
      <h3>What earns them</h3>
      <ul>
        <li>
          <b>Top scorer of a session<em>In D1. D2 earns {R_BUTEUR["D2"]} UNO, D3 {R_BUTEUR["D3"]}</em></b>
          <span>{R_BUTEUR["D1"]} UNO</span>
        </li>
        <li>
          <b>Top assist provider, best defender<em>In D1, each. {R_PASSEUR["D2"]} UNO in D2, {R_PASSEUR["D3"]} in D3</em></b>
          <span>{R_PASSEUR["D1"]} UNO</span>
        </li>
        <li>
          <b>Winning team<em>For each of its {LIGUE_JOUEURS // LIGUE_EQUIPES} players</em></b>
          <span>{R_MEILLEURE_EQUIPE} UNO</span>
        </li>
        <li>
          <b>Participation<em>For every player present, whatever the result</em></b>
          <span>{R_PARTICIPATION} UNO</span>
        </li>
        <li>
          <b>Level up<em>Experience is earned in the league, in friendlies and with your club</em></b>
          <span>10 UNO and up</span>
        </li>
        <li>
          <b>Refereeing a session<em>For referee accounts, or {eur(ARBITRE_EUR_HEURE)}/h excl. VAT on invoice</em></b>
          <span>{ARBITRE_UNO} UNO</span>
        </li>
        <li>
          <b>Club winnings<em>Challenge won, tournament prize ({milliers(TOURNOI_DOTATION_MIN)} to {milliers(TOURNOI_DOTATION_MAX)} UNO), transfer fee</em></b>
          <span>variable</span>
        </li>
      </ul>
    </div>
    <div>
      <h3>What you do with them</h3>
      <ul>
        <li>
          <b>Pay for your place in a league session<em>The main use: points replace the euro</em></b>
          <span>{LIGUE_PRIX * UNO_PAR_EURO} UNO</span>
        </li>
        <li>
          <b>Pay for a friendly or club match<em>Short format, one hour</em></b>
          <span>{AMICAL_PRIX * UNO_PAR_EURO} UNO</span>
        </li>
        <li>
          <b>Order from the shop<em>Equipment, electronics, everyday items</em></b>
          <span>at the listed price</span>
        </li>
        <li>
          <b>Donate to a charity<em>Donations are offered in the shop</em></b>
          <span>as you choose</span>
        </li>
        <li>
          <b>Top up your club's treasury<em>A challenge stake, a tournament entry ({milliers(TOURNOI_ENGAGEMENT_UNO)} UNO)</em></b>
          <span>as you choose</span>
        </li>
        <li>
          <b>Send points to another player<em>Every movement stays in the ledger</em></b>
          <span>as you choose</span>
        </li>
      </ul>
    </div>
  </div>

  <div class="grid3" style="margin-top:5mm">
    <div class="card">
      <h3>Everything is recorded</h3>
      <p>
        Every movement has a date and a reason. A refund reads as clearly as a
        payment.
      </p>
    </div>
    <div class="card">
      <h3>No cash-out</h3>
      <p>
        Points are never converted back into euros. What a session hands out
        stays in the league and is spent there.
      </p>
    </div>
    <div class="card">
      <h3>Talent pays</h3>
      <p>
        {RECOMPENSES / RECETTE:.0%} of a session's revenue goes back as rewards,
        and more to whoever scored, assisted or defended. A reason to come
        back, not a drain on the treasury.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>Why this is neither a currency nor a speculative token.</strong>
      Points are not bought or sold, and are not converted into money: they
      only serve to book a place on a real pitch, order an item, or be donated
      to a charity. A <strong>D1</strong> session hands out {RECOMPENSES_UNO}
      as rewards — less in D2 and D3, where the awards are worth less — plus
      {ARBITRE_UNO} for the referee.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>6</span></div>
</section>

<!-- ───────────────────────── 7. Business model ───────────────────────── -->
<section class="page">
  <div class="eyebrow">The business model</div>
  <h2>A session that pays<br />for itself, from day one.</h2>

  <p class="lead">
    The model doesn't rely on advertising, on a subscription or on a volume
    to reach first: every session covers its own costs. Here is a league
    session, at the highest hall rate in Brussels.
  </p>

  <div class="kpis" style="margin:3mm 0 2mm">
    <div class="kpi">
      <div><span class="u" style="margin:0 1mm 0 0">€</span><span class="n">{LIGUE_PRIX}</span></div>
      <div class="l">per player and per league session — hall and referee included</div>
    </div>
    <div class="kpi">
      <div><span class="n">{LIGUE_JOUEURS}</span><span class="u">players</span></div>
      <div class="l">a full line-up for a league session, over {LIGUE_HEURES} hours</div>
    </div>
    <div class="kpi">
      <div><span class="u" style="margin:0 1mm 0 0">€</span><span class="n">{MARGE}</span></div>
      <div class="l">margin per session in the most expensive scenario, or {MARGE / RECETTE:.0%} of revenue</div>
    </div>
  </div>

  <h3 style="margin-top:2mm">Where every euro of a {eur(RECETTE)} league session goes</h3>
  {barre()}

  <table>
    <thead>
      <tr><th>Item</th><th style="text-align:right">Amount</th><th style="text-align:right">Share</th></tr>
    </thead>
    <tbody>
      <tr><td>Revenue — {LIGUE_JOUEURS} players × {eur(LIGUE_PRIX)}</td><td class="n">{eur(RECETTE)}</td><td class="n">100%</td></tr>
      <tr><td>Hall hire — {LIGUE_HEURES} h × {eur(SALLE_HEURE_HAUT)}</td><td class="n">− {eur(SALLE)}</td><td class="n">{SALLE / RECETTE:.0%}</td></tr>
      <tr><td>Referee fee — {ARBITRE_UNO} UNO</td><td class="n">− {eur(ARBITRE)}</td><td class="n">{ARBITRE / RECETTE:.0%}</td></tr>
      <tr><td>Rewards paid back to players — {RECOMPENSES_UNO} UNO</td><td class="n">− {eur(RECOMPENSES)}</td><td class="n">{RECOMPENSES / RECETTE:.0%}</td></tr>
      <tr class="total"><td>League margin</td><td class="n">{eur(MARGE)}</td><td class="n">{MARGE / RECETTE:.0%}</td></tr>
    </tbody>
  </table>

  <div class="note">
    <p>
      <strong>{eur(SALLE_HEURE_HAUT)} an hour is the highest rate charged in
      Brussels</strong>: the least favourable scenario, chosen on purpose. At
      the usual rate of {eur(SALLE_HEURE_COURANT)}, the same session makes
      {eur(MARGE_COURANTE)} instead of {eur(MARGE)}. A friendly, shorter and
      without rewards, leaves {eur(AMICAL_MARGE)} out of {eur(AMICAL_RECETTE)}.
    </p>
  </div>

  <h3 style="margin-top:3mm">Where the model is heading</h3>
  <p style="font-size:10pt">
    Hall hire takes {SALLE / RECETTE:.0%} of revenue: it is the item that
    drives everything else, and also the one that can disappear. <strong>In
    the long run, the goal is to have our own pitches</strong> — all the way to
    the next-generation arena presented further on. A cost paid at every
    session then becomes a depreciated investment, and the margin stops being
    a leftover. The path there goes step by step: volume negotiates the
    hourly rate, the rate makes a permanent slot possible, and a permanent
    slot justifies a hall of our own.
  </p>

  <p style="margin-top:3mm;font-size:9pt;color:var(--ink-3)">
    An incomplete session is not confirmed and costs nothing in hall hire:
    the risk of losing money on an empty slot is zero by design. On top of
    the sessions come club tournament entries and the shop margin, which runs
    on orders. The referee is paid on a service invoice, at
    {eur(ARBITRE_EUR_HEURE)} an hour excl. VAT, or in UNO points — the same
    amount.
  </p>

  <div class="foot"><span>{PIED}</span><span>7</span></div>
</section>

<!-- ───────────────────────── 8. Progress ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Where the project stands</div>
  <h2>The platform is built.<br />The community is growing.</h2>

  <p class="lead">
    The app is not a mock-up or a project waiting for funding: it is built,
    live and working. {JOUEURS_INSCRITS} players have already signed up; the
    next step is to grow the community up to the first sessions.
  </p>

  <div class="grid2" style="margin-bottom:4mm">
    <div class="card">
      <h3>What is done</h3>
      <p>
        A complete app, in its new interface — sign-ups and invitations,
        private sessions, payments by card, Bancontact and Apple Pay, teams
        and positions on the pitch, match sheets, rankings, divisions, clubs,
        challenges, tournaments, transfer market, shop, refereeing,
        moderation, notifications and emails, in French, Dutch and
        English.<br /><br />
        Actually live: server, database and website in production at
        {SITE_PUBLIC}. iPhone and Android apps <strong>available on the App
        Store and Google Play</strong>.<br /><br />
        <strong>{TESTS} automated tests</strong> cover the game rules and,
        above all, the money flows.
      </p>
    </div>
    <div class="card">
      <h3>Next steps</h3>
      <p>
        Going from {JOUEURS_INSCRITS} to a core of about
        <strong>{NOYAU_CIBLE} players</strong>. That is the number that lets
        us open all three divisions: one D1, one D2 and one D3 session a week,
        or {PLACES_SEMAINE} places — bearing in mind nobody plays every
        week.<br /><br />
        Getting the word out: a series of short videos already presents every
        game mode, for social media.<br /><br />
        Kicking things off: we are considering offering every player their
        <strong>first UNO League session</strong> for free, until word of
        mouth takes over.
      </p>
    </div>
  </div>

  <div class="shots" style="grid-template-columns:repeat(4,1fr);--shot-max:84mm">
    {capture("profil", "The player card", "Rating, stats, level and points: it evolves after every session played.")}
    {capture("boutique", "The shop", "The products actually on sale, paid for in UNO points.")}
    {capture("wallet", "The wallet", "Every movement is recorded and explained: payment, refund, reward.")}
    {capture("informations", "The rules", "The format, the divisions and the rates, written down and available in the app.")}
  </div>

  <p style="margin-top:3mm;font-size:8.5pt;color:var(--ink-3)">
    Screenshots of sessions and profiles come from a demo data set: names,
    faces and stats are fictional. The shop is the real one, in French.
  </p>

  <div class="foot"><span>{PIED}</span><span>8</span></div>
</section>

<!-- ───────────────────────── 9. Growth ───────────────────────── -->
<section class="page">
  <div class="eyebrow">Where we are going</div>
  <h2>One city, then a country.<br />The format is ready to travel.</h2>

  <p class="lead">
    Amateur futsal has never had its own infrastructure. UNO League is
    building it: a league that organises, pays and ranks itself, and that
    settles from one city to the next without changing a line of software.
    The project is scalable as it stands — and franchisable.
  </p>

  <ol class="steps large">
    <li>
      <span class="when">{NOYAU_CIBLE} active players</span>
      <h3>Brussels, the first core</h3>
      <p>
        All three divisions stand on their own: one session per division per
        week, {PLACES_SEMAINE} places a week, and the first club tournaments.
      </p>
    </li>
    <li>
      <span class="when">{milliers(PALIER_BELGIQUE)} active players</span>
      <h3>Antwerp and Liège</h3>
      <p>
        Each city opens its own divisions. Same server, same app: one more
        city costs what its time slots cost, not what a new product would.
      </p>
    </li>
    <li>
      <span class="when">{milliers(PALIER_FRANCE)} active players</span>
      <h3>France: Paris, Marseille</h3>
      <p>
        Then the other big cities. A city can be entrusted to a local partner
        as a franchise: the format, the app, the rules and the brand are
        ready.
      </p>
    </li>
    <li>
      <span class="when">Then</span>
      <h3>A national cup, then a “Euro”</h3>
      <p>
        The best clubs of each city compete for a national cup; the best
        players of each country, for a European competition.
      </p>
    </li>
  </ol>

  <div class="grid3" style="margin-top:auto">
    <div class="card">
      <h3>Scalable</h3>
      <p>One more city needs no new development and no new team: halls, a
      referee, and the community that signs up.</p>
    </div>
    <div class="card">
      <h3>Franchisable</h3>
      <p>The model is handed over turnkey: a local partner manages its time
      slots, the league provides the platform, the rules and the brand.</p>
    </div>
    <div class="card">
      <h3>Driven by players</h3>
      <p>Each step only opens at a threshold of active players, never before:
      growth follows demand instead of betting on it.</p>
    </div>
  </div>

  <div class="foot"><span>{PIED}</span><span>9</span></div>
</section>

<!-- ───────────────────────── 10. What we are looking for ───────────────────────── -->
<section class="page">
  <div class="eyebrow">The long-term goal</div>
  <h2>Our own pitches,<br />and tomorrow's arena.</h2>

  <p class="lead">
    Hall hire takes {SALLE / RECETTE:.0%} of revenue: pitches of our own turn
    that cost into an investment. And the goal goes further — building the
    next-generation pitch.
  </p>

  <figure class="arena">
    <img src="data:image/jpeg;base64,{ARENA}" alt="The Immersive Arena" />
    <figcaption>
      <b>The Immersive Arena</b>
      <span>A pitch surrounded by giant screens: every match is played in front of a packed stadium.</span>
    </figcaption>
  </figure>

  <h3 style="margin-top:6mm">What we are looking for</h3>
  <div class="grid3" style="margin-top:2mm">
    <div class="card">
      <h3>Financial support</h3>
      <p>
        For the launch phase — communication, publishing costs, first
        sessions —, the only period when the league spends before it earns.
      </p>
    </div>
    <div class="card">
      <h3>Material support</h3>
      <p>
        A sports facility made available removes the biggest cost item and
        brings the goal of our own pitches much closer in one go.
      </p>
    </div>
    <div class="card">
      <h3>Institutional backing</h3>
      <p>
        Recognition, introductions to municipalities, halls and federations.
        It costs nothing and opens doors.
      </p>
    </div>
  </div>

  <div class="note bas">
    <p>
      <strong>The only question is whether you join early or late.</strong>
      The platform is built, live and tested; what is missing is the
      kick-off. All three forms of support interest us, separately or
      together — and each one brings you into a project with far more ahead of
      it than behind.
    </p>
  </div>

  <div class="foot"><span>{PIED}</span><span>10</span></div>
</section>

<!-- ───────────────────────── 11. Contact ───────────────────────── -->
<section class="page cover" style="justify-content:flex-end;padding-bottom:16mm">
  <div class="glow"></div>
  <h2 style="color:#fff;font-size:30pt;position:relative">Let's talk.</h2>
  <p class="sub" style="margin-top:4mm">
    The app is a free download on the App Store and Google Play, and also
    runs in a browser. We would be glad to present it in a meeting, or to
    give you a demo account.
  </p>
  <div class="stores">
    <div class="store"><i></i><div><b>App Store</b><br /><span>Available</span></div></div>
    <div class="store"><i></i><div><b>Google Play</b><br /><span>Available</span></div></div>
    <div class="qr">{QR_APP}</div>
    <div class="scan"><strong>Scan</strong>{LIEN_APP}<br />the right store for your phone</div>
  </div>
  <div style="position:relative;margin-top:8mm;font-size:11pt;line-height:2;color:#CBD5E1">
    <div><strong style="color:#fff">Website</strong> &nbsp; https://{SITE_PUBLIC}</div>
    <div><strong style="color:#fff">Mobile</strong> &nbsp; iPhone and Android, available on the App Store and Google Play — {LIEN_APP}</div>
    <div><strong style="color:#fff">Contact</strong> &nbsp; Yassine Bakhtaoui, founder</div>
    <div><strong style="color:#fff">Email</strong> &nbsp; contact@unoleague.be</div>
    <div><strong style="color:#fff">Phone</strong> &nbsp; +32 489 16 81 80</div>
    <div><strong style="color:#fff">Company</strong> &nbsp; VIP Drivers SRL &nbsp;·&nbsp; BE&nbsp;0744.534.881</div>
    <div><strong style="color:#fff">Registered office</strong> &nbsp; Assesteenweg 116A, 1740 Ternat</div>
  </div>
  <div class="meta" style="position:static;margin-top:14mm">
    Dossier prepared in {date_dossier()}. The financial projections are based
    on the highest hall rate observed in Brussels and on the rates programmed
    into the app; they do not constitute a guarantee of results.
  </div>
</section>

</body>"""
