/**
 * « Comment ça marche », dans le téléphone : 22 mesures à 130 bpm (40,6 s).
 *
 *   mesures  0-1   Accroche : envie de jouer au futsal ? (vraie vidéo)
 *            2-3   UNO League, l'app qui organise tes matchs de futsal
 *            4-5   ① Choisis ton match : le calendrier
 *            6-7   ② Réserve ta place : rejoindre, payer
 *            8-9   ③ Tu joues : la vraie vidéo du match
 *           10-18  ④ Après le match, tout est dans l'app : on fait défiler
 *                     la séance du 20 novembre (podium, score, feuille,
 *                     vidéo et moments-clés, équipe)
 *           19-21  Appel final : match amical ou UNO League
 *
 * Toutes les coupes et tous les gestes tombent sur les temps de la musique
 * (`son.py`, même tempo).
 */
(function () {
  const { A, set, hook, split, compteur, hasard, valeur, clamp01 } = M;
  const S = window.SEANCE;
  const J = (id) => S.joueurs[id];
  const TEMPS = 60 / 130;
  const MESURE = 4 * TEMPS;
  const m = (n) => n * MESURE;
  const DUREE = m(22);
  window.DUREE = DUREE;

  // --- Icônes (Lucide, comme dans l'application) ----------------------------
  const ICONES = {
    arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    mapPin: '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    circleCheck: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    goal: '<path d="M12 13V2l8 4-8 4"/><path d="M20.561 10.222a9 9 0 1 1-12.55-5.29"/><path d="M8.002 9.997a5 5 0 1 0 8.9 2.02"/>',
    handshake: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    circlePlay: '<circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/>',
    playFill: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>',
    smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    house: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    calendarDays: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  };
  const ic = (nom) => `<svg class="ic" viewBox="0 0 24 24">${ICONES[nom]}</svg>`;
  const ICONE_MOMENT = { kickoff: "circlePlay", goal: "goal", assist: "handshake", defense: "shield", save: "hand" };

  const stage = document.getElementById("stage");
  const q = (sel, racine = document) => racine.querySelector(sel);
  const qa = (sel, racine = document) => [...racine.querySelectorAll(sel)];
  const bleue = S.equipes.bleue;
  const noire = S.equipes.noire;

  // --- Composants de l'app -----------------------------------------------------

  function carteFut(id) {
    const j = J(id);
    const c = S.carte;
    const [but, pas, def, arr, mot, mat] = c.stats;
    return `
      <div class="fut">
        <div class="fut-haut">
          <div class="fut-fond">UNO</div>
          <div class="fut-infos">
            <div class="fut-note">${c.note}</div>
            <div class="fut-poste">${c.poste}</div>
            <div class="fut-drapeau"><img src="../../apps/web/public/flags/${c.pays.toLowerCase()}.svg" alt="" /></div>
            <div class="fut-club">${c.division}</div>
          </div>
          <div class="fut-photo"><span class="fut-initiales">${j.initiales}</span></div>
        </div>
        <div class="fut-bas">
          <div class="fut-bord"></div>
          <div class="fut-nom">${j.carte}</div>
          <div class="fut-stats">
            <div class="fut-trait-haut"></div>
            <div class="fut-col"><ul><li><span>${but}</span><span>BUT</span></li><li><span>${pas}</span><span>PAS</span></li><li><span>${def}</span><span>DÉF</span></li></ul></div><div class="fut-col droite"><ul><li><span>${arr}</span><span>ARR</span></li><li><span>${mot}</span><span>MOT</span></li><li><span>${mat}</span><span>MAT</span></li></ul></div>
            <div class="fut-trait-v"></div>
            <div class="fut-trait-bas"></div>
          </div>
        </div>
      </div>`;
  }

  const barreEtat = `<div class="barre-etat"><span>21:07</span><span class="droite"><span class="reseau"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8px"></i><i style="height:10px;opacity:.35"></i></span>5G<span class="batterie"><i></i></span></span></div>`;

  function billet(s, id) {
    const cases = Array.from({ length: s.places }, (_, i) => `<i class="${i < s.inscrits ? "plein" : ""}"></i>`).join("");
    return `
      <div class="billet ${s.ton === "league" ? "league" : ""}" id="${id}"><div class="bande"></div>
        <div class="corps">
          <div class="ligne1"><div><div class="mode">${s.mode}</div><div class="heure">${s.debut}<span> → ${s.fin}</span></div></div><span class="badge primaire">Proposition</span></div>
          <div class="lieu"><span>${ic("mapPin")}${s.salle}</span><span class="badge ${s.division ? "primaire" : "neutre"}">${s.division ?? "Toutes divisions"}</span></div>
          <div class="places"><div class="cases" style="grid-template-columns:repeat(${s.places},1fr)">${cases}</div><span class="compte">${s.inscrits}/${s.places}</span></div>
        </div>
        <div class="souche"><span class="prix"><b>${s.uno}</b> UNO</span><span class="action">Rejoindre la session</span></div>
        <div class="appui"></div>
      </div>`;
  }

  const ecranCalendrier = `
    <div class="ecr" id="ecr-cal">
      <div class="ecran-tete"><h1>Calendrier</h1><span class="bouton-plus">${ic("plus")}</span></div>
      <div class="cal-contenu">
        <div class="cal-periode"><span class="cal-fleche">${ic("chevronLeft")}</span><span class="cal-vue"><span class="on">Semaine</span><span>Mois</span></span><span class="cal-fleche">${ic("chevronRight")}</span></div>
        <div class="cal-mois">${S.calendrier.mois}</div>
        <div class="cal-semaine">${S.calendrier.jours
          .map(([nom, n, point]) => {
            const classes = ["jour", point ? "point" : "", n < S.calendrier.aujourdhui ? "passe" : "", n === S.calendrier.aujourdhui ? "auj" : ""].join(" ");
            return `<div class="${classes}"><small>${nom}</small><b>${n}</b><i></i></div>`;
          })
          .join("")}</div>
        <div class="cal-filtres"><span class="on">Toutes</span><span>Propositions</span><span>Réservations</span><span>Sessions</span></div>
        <h2 class="titre-section">Sessions du mois</h2>
        ${S.calendrier.seances
          .map((s, i) => `<div class="cal-jour-titre"><h3>${s.jour}</h3><hr /><small>${s.court}</small></div>${billet(s, `billet-${i}`)}`)
          .join("")}
      </div>
      <div class="onglets">
        <span>${ic("house")}Accueil</span><span class="on">${ic("calendarDays")}Calendrier</span><span>${ic("shield")}Club</span><span>${ic("trophy")}Compétitions</span><span>${ic("user")}Profil</span>
      </div>
    </div>`;

  const carteSeance = (badges) => `
    <div class="carte-app carte-seance">
      <div class="haut"><div><h2>${S.mode}</h2><p class="date">${S.date}</p></div><div class="badges">${badges}</div></div>
      <p class="descr">${S.description}</p>
      <div class="infos"><p>${ic("clock")}${S.heure}</p><p>${ic("mapPin")}${S.salle}</p><p>${ic("users")}<span class="badge neutre">${S.division}</span></p></div>
      <div class="prix-ligne"><span class="lib">Participation</span><span><b>${S.prixUno} UNO</b><small>(${S.prixEur})</small></span></div>
    </div>`;

  const ecranAvant = `
    <div class="ecr" id="ecr-avant">
      <div class="entete-app">${ic("arrowLeft")}<h1>Détail de la session</h1></div>
      <div class="contenu-app">
        ${carteSeance(`<span class="badge-pile"><span class="badge primaire" id="av-prop">Proposition</span><span class="badge attente" id="av-resa">Réservation</span></span>`)}
        <div class="carte-app" id="av-jauges">
          <div class="jauge-tete"><b>Inscriptions</b><span><span id="av-inscrits">${S.places - 1}</span> / ${S.places}</span></div>
          <div class="jauge"><i id="av-j1" style="width:${((S.places - 1) / S.places) * 100}%"></i><i class="vert" id="av-j1v" style="width:100%"></i></div>
          <div id="av-paiements">
            <div class="jauge-tete" style="margin-top:16px"><b>Paiements</b><span><span id="av-payes">${S.places - 1}</span> / ${S.places}</span></div>
            <div class="jauge"><i class="bleu" id="av-j2" style="width:${((S.places - 1) / S.places) * 100}%"></i><i class="vert" id="av-j2v" style="width:100%"></i></div>
          </div>
        </div>
        <div id="av-actions">
          <div class="bouton accent" id="av-rejoindre">Rejoindre la session<div class="appui"></div></div>
          <div id="av-payer-bloc"><div class="bouton accent" id="av-payer">Payer ${S.prixUno} UNO<div class="appui"></div></div><p class="indice">Débité de votre solde, immédiat.</p></div>
          <div class="paye" id="av-paye">${ic("circleCheck")}Votre participation est payée</div>
        </div>
      </div>
    </div>`;

  const ligneMoment = (mt, id) => `
    <div class="moment ${mt.type === "goal" ? "but" : ""}" ${id ? `id="${id}"` : ""}><div class="appui"></div>
      <span class="min">${mt.minute}'</span>${ic(ICONE_MOMENT[mt.type] ?? "circlePlay")}
      <span class="txt"><b>${mt.titre}</b><span>${mt.detail}</span></span>
    </div>`;

  const placesTerrain = (() => {
    const pos = { attaque: [[180, 40]], ailes: [[70, 126], [180, 126], [290, 126]], gardien: [[180, 212]] };
    const postes = { attaque: ["Attaque"], ailes: ["Aile 1", "Aile 2", "Aile 3"], gardien: ["Gardien"] };
    return Object.keys(pos)
      .flatMap((poste) =>
        S.terrain[poste].map((id, k) => {
          const [x, y] = pos[poste][k];
          return `<div class="place" style="left:${x}px;top:${y - 22}px"><span class="avatar md">${J(id).initiales}</span><span class="prenom">${J(id).nom.split(" ")[0]}</span><span class="poste">${postes[poste][k]}</span></div>`;
        }),
      )
      .join("");
  })();

  const ecranApres = `
    <div class="ecr" id="ecr-apres">
      <div class="entete-app">${ic("arrowLeft")}<h1>Détail de la session</h1></div>
      <div style="position:absolute;left:0;right:0;top:50px;bottom:0;overflow:hidden">
        <div id="apres-defile" class="contenu-app">
          ${carteSeance(`<span class="badge neutre">Terminée</span><span class="badge succes" id="ap-jouee">${ic("circleCheck")}Session jouée</span>`)}
          <section><h2 class="titre-section">Récompenses</h2><div class="carte-app"><p class="texte-xs">Ce mode ne rapporte aucun point UNO et n'a aucun effet sur les divisions : on y joue pour le plaisir. Les statistiques de la session restent affichées.</p></div></section>
          <section id="sec-podium"><h2 class="titre-section">Podium de la session</h2>
            <div class="carte-app podium-app">
              <div class="podium-tete">${ic("trophy")}Les joueurs distingués</div>
              <div class="podium-cartes">${S.podium.map((p) => `<div class="case"><div class="mini">${carteFut(p.joueur)}</div><p>${p.prix}</p><p>${p.valeur}</p></div>`).join("")}</div>
              <div class="podium-motm" id="ap-motm"><div class="mini" style="width:102.6px;height:163.4px">${carteFut(S.hommeDuMatch.joueur)}</div><p>${S.hommeDuMatch.prix}</p><p>${S.hommeDuMatch.valeur}</p></div>
            </div>
          </section>
          <section id="sec-resultats"><h2 class="titre-section">Résultats</h2><div class="carte-app"><div class="resultat"><span class="${bleue.score > noire.score ? "gagne" : ""}">${bleue.nom}</span><b>${bleue.score} — ${noire.score}</b><span class="${noire.score > bleue.score ? "gagne" : ""}">${noire.nom}</span></div></div></section>
          <section id="sec-feuille"><h2 class="titre-section">Feuille de match</h2>
            <div class="feuille">
              <div class="ligne tete"><div class="c-rang">#</div><div class="c-joueur">Joueur</div><div class="c-stat">B</div><div class="c-stat">P</div><div class="c-stat">D</div><div class="c-stat">A</div><div class="c-pts">Pts</div><div class="c-mvt"></div></div>
              ${S.feuille.map(([id, b, p, d, a, pts], i) => `<div class="ligne"><div class="surbrillance"></div><div class="c-rang">${i + 1}</div><div class="c-joueur"><span class="avatar sm">${J(id).initiales}</span><span>${J(id).nom}</span></div><div class="c-stat">${b}</div><div class="c-stat">${p}</div><div class="c-stat">${d}</div><div class="c-stat">${a}</div><div class="c-pts">${pts}</div><div class="c-mvt"></div></div>`).join("")}
            </div>
            <p class="note-xs">Statistiques de cette session uniquement.</p>
          </section>
          <section id="sec-videos"><h2 class="titre-section">Vidéos de la session</h2>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div class="puces"><span class="puce on">Angle 2</span><span class="puce">Angle 1</span></div>
              <div class="cadre-video" id="lecteur-app"><img id="v-app" alt="" /><div class="saut" id="v-saut"></div></div>
              <p class="legende-video">Angle 2</p>
              <div class="moments-tete"><p>Moments-clés</p><p>Touchez un moment pour le revoir</p></div>
              <div class="puces petites" id="filtres"><span class="puce on" id="f-tous">Tous</span><span class="puce" id="f-buts">Buts</span><span class="puce">Passes</span><span class="puce">Défenses</span><span class="puce">Arrêts</span></div>
              <div class="liste-moments" style="height:288px">
                <div id="liste-tous" style="position:absolute;inset:0">${S.moments.tous.map((mt) => ligneMoment(mt)).join("")}</div>
                <div id="liste-buts" style="position:absolute;inset:0">${S.moments.buts.map((mt, i) => ligneMoment(mt, `but-${i}`)).join("")}</div>
              </div>
            </div>
          </section>
          <section id="sec-terrain"><h2 class="titre-section">Sur le terrain (${S.feuille.length})</h2>
            <div class="equipes-onglets"><span class="on">${bleue.nom} <small>(5)</small></span><span>${noire.nom} <small>(5)</small></span></div>
            <div class="terrain-app"><div class="bandes"></div>
              <svg viewBox="0 0 360 280" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"><rect x="8" y="8" width="344" height="264" rx="8"/><path d="M8 140H352"/><circle cx="180" cy="140" r="32"/><path d="M116 8V40Q116 48 124 48H236Q244 48 244 40V8"/><path d="M116 272V240Q116 232 124 232H236Q244 232 244 240V272"/></svg>
              ${placesTerrain}
            </div>
            <p class="note-xs">Les équipes telles qu'elles ont joué, d'après la feuille de match.</p>
          </section>
          <div style="height:120px"></div>
        </div>
      </div>
    </div>`;

  // --- La scène ----------------------------------------------------------------

  stage.innerHTML = `
    <div id="fond"><div class="orbe" id="orbe-bleu"></div><div class="orbe" id="orbe-orange"></div></div>
    <div id="v-fond"><img alt="" /></div><div id="v-voile"></div>
    <div id="v-carte"><img alt="" /><div class="rec"><i></i>${S.salle} · 20 nov.</div></div>

    <div id="tel-cam"><div class="telephone"><div class="ecran"><div class="app">
      ${barreEtat}${ecranCalendrier}${ecranAvant}${ecranApres}
      <div class="voile-ecr" id="voile-cal"></div>
      <div id="onde"></div><div id="doigt"></div>
    </div><div class="reflet-ecran"></div></div><div class="ilot"></div></div></div>

    <div id="haut-voile"></div>

    <div id="accroche"><h1><div class="l">Envie de jouer</div><div class="l orange">au futsal ?</div></h1></div>
    <div id="trois"><span>Même sans équipe ?</span></div>
    <div id="marque"><img src="../branding/ecusson.svg" alt="" /><div class="mot">UNO <span>LEAGUE</span></div><p>L'app qui organise tes matchs de futsal.</p></div>

    <div class="legende" id="l1"><div class="etape">1</div><h2><span class="ligne">Choisis ton match</span></h2><p>Match amical ou UNO League,<br />dans le calendrier de l'app.</p></div>
    <div class="legende" id="l2"><div class="etape">2</div><h2><span class="ligne">Réserve ta place</span></h2><p>10 € le match, payés dans l'app.<br />Plus personne à relancer.</p></div>
    <div class="legende" id="l3"><div class="etape">3</div><h2><span class="ligne">Tu joues</span></h2><p>1 heure de futsal, 5 contre 5.</p></div>
    <div class="legende" id="l4"><div class="etape">4</div><h2><span class="ligne">Après le match,</span><span class="ligne orange">tout est dans l'app</span></h2></div>
    <div class="sous" id="s4a">Le récap du match arrive dans la séance.</div>
    <div class="sous" id="s4b">Le podium : l'homme du match<br />et les meilleurs joueurs.</div>
    <div class="sous" id="s4c">Le score, et les stats de chaque joueur.</div>
    <div class="sous" id="s4d">La vidéo du match : touche un but,<br />tu le revois.</div>
    <div class="sous" id="s4e">Et les équipes, poste par poste.</div>

    <div id="final"><div class="bloc">
      <img class="ecusson" src="../branding/ecusson.svg" alt="" />
      <div class="mot">UNO <span>LEAGUE</span></div>
      <div class="modes">
        <div class="mode-carte"><i></i><div><b>Match amical</b><span>Pour le plaisir, ouvert à tous les niveaux.</span></div></div>
        <div class="mode-carte league"><i></i><div><b>UNO League</b><span>La compétition : classement et divisions.</span></div></div>
      </div>
      <h2><span class="ligne">Réserve ta place</span><span class="ligne orange">dans l'app</span></h2>
      <div class="stores">
        <div class="store"><span class="pastille">${ic("playFill")}</span><span><small>Disponible sur</small><b>Google Play</b></span></div>
        <div class="store"><span class="pastille">${ic("smartphone")}</span><span><small>Disponible sur</small><b>App Store</b></span></div>
      </div>
      <div class="url">unoleague.be</div>
    </div></div>

    <div class="flash" id="flash-1"></div><div class="flash" id="flash-2"></div>
    <div id="grain"></div><div id="vignette"></div>`;

  // La chorégraphie mesure la mise en page : elle attend les polices.
  window.__ajuster = choregraphie;

  function choregraphie() {
    // --- Fond qui respire, grain -----------------------------------------------
    hook((t) => {
      q("#orbe-bleu").style.transform = `translate(${Math.sin(t * 0.33) * 120}px, ${Math.cos(t * 0.27) * 90}px)`;
      q("#orbe-orange").style.transform = `translate(${Math.cos(t * 0.29) * 110}px, ${Math.sin(t * 0.37) * 120}px)`;
    });
    {
      const toile = document.createElement("canvas");
      toile.width = toile.height = 256;
      const ctx = toile.getContext("2d");
      const image = ctx.createImageData(256, 256);
      const alea = hasard(42);
      for (let i = 0; i < image.data.length; i += 4) {
        const v = Math.floor(alea() * 255);
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      q("#grain").style.backgroundImage = `url(${toile.toDataURL()})`;
      hook((t) => {
        const n = Math.floor(t * 60);
        q("#grain").style.transform = `translate(${Math.floor(hasard(n * 9973 + 1)() * 64)}px, ${Math.floor(hasard(n * 7919 + 3)() * 64)}px)`;
      });
    }

    // --- Le téléphone : géométrie et caméra -------------------------------------
    const ZOOM = 1.53846; // pixels d'app → pixels de la vidéo
    const ECRAN = { x: 240, y: 606 }; // coin de l'écran, caméra au repos
    const ORIGINE = { x: 540, y: 1250 }; // centre de la caméra (transform-origin)
    const app = q(".app");
    const tel = q("#tel-cam");

    /** Position d'un élément en pixels d'app, mesurée avant toute transformation. */
    function enApp(el) {
      const a = app.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: (r.left - a.left) / ZOOM, y: (r.top - a.top) / ZOOM, l: r.width / ZOOM, h: r.height / ZOOM };
    }
    /** Le cadrage qui amène le point d'app (x, y) sur `cible`, à l'échelle s. */
    function cadre(x, y, s, cible) {
      const P = { x: ECRAN.x + x * ZOOM, y: ECRAN.y + y * ZOOM };
      return { s, x: cible.x - ORIGINE.x - s * (P.x - ORIGINE.x), y: cible.y - ORIGINE.y - s * (P.y - ORIGINE.y) };
    }
    function camera(instant, duree, c, courbe = "inOut3") {
      A(tel, instant, duree, { s: c.s, x: c.x, y: c.y }, courbe);
    }
    const CIBLE = { x: 540, y: 1200 };
    const REPOS = { s: 1, x: 0, y: 0 };

    // Mesures, au repos.
    const billetAmical = enApp(q("#billet-0"));
    const rejoindre = enApp(q("#av-rejoindre"));
    const payer = enApp(q("#av-payer"));
    const jauges = enApp(q("#av-jauges"));
    const defile = q("#apres-defile");
    const decalage = (sel) => q(sel).offsetTop;
    const DEFILE = {
      podium: decalage("#sec-podium") - 6,
      motm: decalage("#sec-podium") + 190,
      resultats: decalage("#sec-resultats") - 6,
      videos: decalage("#sec-videos") - 6,
      terrain: Math.min(decalage("#sec-terrain") - 6, defile.scrollHeight - 744),
    };
    const filtreButs = enApp(q("#f-buts"));
    const butCible = enApp(q("#but-1"));
    const lecteurApp = enApp(q("#lecteur-app"));
    const podiumCartes = enApp(q("#sec-podium .podium-cartes"));
    const motmCarte = enApp(q("#ap-motm"));
    const resultatsBloc = enApp(q("#sec-resultats"));
    const terrainBloc = enApp(q("#sec-terrain .terrain-app"));

    // --- La vraie vidéo du match ---------------------------------------------------
    const V = S.video;
    const imageA = (secondes) => {
      const n = Math.max(1, Math.min(V.images, Math.floor(secondes * V.cadence) + 1));
      return `${V.dossier}/f${String(n).padStart(4, "0")}.jpg`;
    };
    const BUTS = m(15) + TEMPS; // le doigt choisit le filtre « Buts »
    const SAUT = m(15) + 3 * TEMPS + 0.12; // le lecteur saute au but touché
    hook((t) => {
      const attentes = [];
      const pose = (img, secondes) => {
        const src = imageA(secondes);
        if (img.getAttribute("src") !== src) {
          img.setAttribute("src", src);
          attentes.push(img.decode().catch(() => undefined));
        }
      };
      const fond = q("#v-fond img");
      const carte = q("#v-carte img");
      if (t < m(2) + 1.2) {
        pose(fond, 13.6 + t);
        pose(carte, 13.6 + t);
      } else if (t >= m(8) - 0.6 && t < m(10) + 0.6) {
        const s = 0.2 + (t - (m(8) - 0.6));
        pose(fond, s);
        pose(carte, s);
      } else if (t >= m(19) - 0.4) {
        pose(fond, 8.2 + (t - m(19)));
      }
      if (t >= m(13) && t < m(19)) {
        pose(q("#v-app"), t < SAUT ? 4.2 + Math.max(0, t - m(13)) : 16.6 + (t - SAUT));
      }
      return attentes.length ? Promise.all(attentes) : undefined;
    });

    // --- Le doigt ------------------------------------------------------------------
    const doigt = q("#doigt");
    const onde = q("#onde");
    set([doigt, onde], 0, { opacity: 0 });
    function touche(x, y, instant) {
      A(doigt, instant - 0.3, 0.26, { x: [x + 26, x], y: [y + 40, y], opacity: [0, 1], s: [1.25, 1] }, "out3");
      A(doigt, instant, 0.08, { s: [1, 0.8] }, "out2");
      A(doigt, instant + 0.1, 0.12, { s: [0.8, 1] }, "out2");
      A(doigt, instant + 0.28, 0.22, { opacity: [1, 0] }, "in2");
      A(onde, instant, 0.02, { x: [x, x], y: [y, y] }, "linear");
      A(onde, instant + 0.02, 0.45, { opacity: [0.9, 0], s: [1, 2.6] }, "out3");
    }
    function glisse(x, y0, y1, instant, duree = 0.34) {
      A(doigt, instant - 0.18, 0.18, { x: [x, x], y: [y0, y0], opacity: [0, 1], s: [1.2, 1] }, "out2");
      A(doigt, instant, duree, { y: [y0, y1] }, "inOut2");
      A(doigt, instant + duree - 0.06, 0.18, { opacity: [1, 0] }, "in2");
    }

    // --- Légendes --------------------------------------------------------------------
    function legende(sel, debut, fin) {
      const el = q(sel);
      A(q(".etape", el), debut, 0.45, { opacity: [0, 1], s: [0.3, 1] }, "outBackStrong");
      qa("h2 .ligne", el).forEach((ligne, i) =>
        A(split(ligne, "mots"), debut + 0.06 + i * TEMPS, 0.5, { opacity: [0, 1], y: [60, 0], blur: [8, 0] }, "outExpo", 0.05),
      );
      const p = q("p", el);
      if (p) A(p, debut + TEMPS, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
      A(el, fin - 0.3, 0.3, { opacity: [1, 0], y: [0, -40] }, "in3");
    }
    function sous(sel, debut, fin) {
      A(sel, debut, 0.45, { opacity: [0, 1], y: [24, 0] }, "out4");
      A(sel, fin - 0.25, 0.25, { opacity: 0, y: -16 }, "in3");
    }
    // Les légendes restent lisibles quand le téléphone est grand.
    hook((t) => {
      const s = valeur(tel, "s", t);
      q("#haut-voile").style.opacity = String(clamp01((s - 1.0) / 0.2));
    });

    // =================================================================================
    // 0-1 — Accroche : la vraie vidéo, la question
    // =================================================================================
    A(["#v-fond", "#v-voile"].map((s) => q(s)), 0, 0.5, { opacity: [0, 1] }, "out2");
    A("#v-carte", 0.05, 0.75, { opacity: [0, 1], s: [0.86, 1], y: [80, 0], rz: [-3, -1.5] }, "out4");
    A("#v-carte", 0.8, m(2) - 1.1, { s: [1, 1.04] }, "linear");
    {
      const [l1, l2] = qa("#accroche .l");
      A(split(l1), TEMPS * 0.5, 0.55, { opacity: [0, 1], y: [130, 0], sk: [-14, 0], blur: [10, 0] }, "outExpo", 0.028);
      A(split(l2), TEMPS * 2, 0.55, { opacity: [0, 1], y: [130, 0], sk: [-14, 0], blur: [10, 0] }, "outExpo", 0.032);
    }
    A("#accroche", m(1) - 0.05, 0.5, { y: [0, -60], s: [1, 0.82] }, "out4");
    A(split(q("#trois span")), m(1) + 0.05, 0.5, { opacity: [0, 1], y: [70, 0], blur: [8, 0] }, "outExpo", 0.03);
    A([q("#accroche"), q("#trois")], m(2) - 0.28, 0.3, { opacity: [1, 0], blur: [0, 14] }, "in3");
    A("#v-carte", m(2) - 0.3, 0.35, { opacity: 0, s: 1.25 }, "in3");
    A([q("#v-fond"), q("#v-voile")], m(2) - 0.1, 0.8, { opacity: 0 }, "inOut2");

    // =================================================================================
    // 2-3 — La marque, le téléphone arrive
    // =================================================================================
    A("#flash-1", m(2) - 0.06, 0.08, { opacity: [0, 0.85] }, "out2");
    A("#flash-1", m(2) + 0.02, 0.45, { opacity: 0 }, "out3");
    A("#marque img", m(2), 0.6, { opacity: [0, 1], s: [0.3, 1], rz: [-25, 0] }, "outBackStrong");
    A("#marque .mot", m(2) + 0.12, 0.5, { opacity: [0, 1], y: [40, 0], "--ls": [0.3, 0.04] }, "out4");
    A("#marque p", m(2) + TEMPS * 2, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
    A("#marque", m(4) - 0.35, 0.35, { opacity: [1, 0], y: [0, -60] }, "in3");
    A(tel, m(2) + 0.1, 1.1, { y: [1500, 0], rx: [38, 0], s: [0.9, 1] }, "out4");

    // =================================================================================
    // 4-5 — ① Choisis ton match
    // =================================================================================
    legende("#l1", m(4), m(6));
    camera(m(4), 0.8, cadre(billetAmical.x + billetAmical.l / 2, billetAmical.y + billetAmical.h / 2, 1.28, CIBLE));
    touche(billetAmical.x + billetAmical.l * 0.62, billetAmical.y + billetAmical.h * 0.5, m(5));
    A("#billet-0 .appui", m(5), 0.1, { opacity: [0, 0.06] }, "out2");
    A("#billet-0 .appui", m(5) + 0.2, 0.3, { opacity: 0 }, "out2");
    A("#billet-0", m(5), 0.1, { s: [1, 0.985] }, "out2");
    A("#billet-0", m(5) + 0.1, 0.15, { s: [0.985, 1] }, "out2");
    // Passage à la séance, en glissant comme sur iOS.
    const PUSH = m(5) + TEMPS * 1.2;
    A("#ecr-avant", PUSH, 0.45, { x: [390, 0] }, "out4");
    A("#ecr-cal", PUSH, 0.45, { x: [0, -110] }, "out4");
    A("#voile-cal", PUSH, 0.45, { opacity: [0, 0.4] }, "out4");
    set("#voile-cal", m(6), { opacity: 0 });
    set("#ecr-cal", m(6), { opacity: 0 });

    // =================================================================================
    // 6-7 — ② Réserve ta place : rejoindre, payer
    // =================================================================================
    legende("#l2", m(6), m(8));
    camera(m(6) - 0.2, 0.8, cadre(195, (jauges.y + rejoindre.y + rejoindre.h + 30) / 2, 1.42, CIBLE));
    const REJ = m(6) + TEMPS * 2;
    touche(rejoindre.x + rejoindre.l * 0.5, rejoindre.y + rejoindre.h * 0.5, REJ);
    A("#av-rejoindre .appui", REJ, 0.08, { opacity: [0, 0.25] }, "out2");
    A("#av-rejoindre", REJ + 0.16, 0.2, { opacity: [1, 0] }, "out2");
    compteur(q("#av-inscrits"), REJ + 0.15, 0.01, S.places - 1, S.places);
    A("#av-j1v", REJ + 0.15, 0.35, { opacity: [0, 1] }, "out2");
    A("#av-prop", REJ + 0.2, 0.25, { opacity: [1, 0] }, "out2");
    A("#av-resa", REJ + 0.2, 0.35, { opacity: [0, 1], s: [0.6, 1] }, "outBack");
    A("#av-paiements", REJ + 0.25, 0.4, { opacity: [0, 1], y: [10, 0] }, "out3");
    A("#av-payer-bloc", REJ + 0.3, 0.35, { opacity: [0, 1], s: [0.92, 1] }, "outBack");
    const PAY = m(7) + TEMPS;
    touche(payer.x + payer.l * 0.5, payer.y + payer.h * 0.5, PAY);
    A("#av-payer .appui", PAY, 0.08, { opacity: [0, 0.25] }, "out2");
    A("#av-payer-bloc", PAY + 0.18, 0.2, { opacity: 0 }, "out2");
    A("#av-paye", PAY + 0.22, 0.45, { opacity: [0, 1], s: [0.7, 1] }, "outBackStrong");
    compteur(q("#av-payes"), PAY + 0.22, 0.01, S.places - 1, S.places);
    A("#av-j2v", PAY + 0.22, 0.35, { opacity: [0, 1] }, "out2");

    // =================================================================================
    // 8-9 — ③ Tu joues : la vraie vidéo
    // =================================================================================
    legende("#l3", m(8), m(10));
    camera(m(8) - 0.35, 0.55, { s: 0.82, x: 0, y: 1450 }, "in3");
    A([q("#v-fond"), q("#v-voile")], m(8) - 0.1, 0.5, { opacity: [0, 1] }, "out2");
    A("#v-carte", m(8) - 0.05, 0.7, { opacity: [0, 1], s: [0.8, 1], y: [-100, -180], rz: [2, 0] }, "out4");
    A("#v-carte", m(8) + 0.7, m(2) - 1, { s: [1, 1.05] }, "linear");
    A("#v-carte", m(10) - 0.3, 0.3, { opacity: 0, s: 1.15 }, "in3");
    A([q("#v-fond"), q("#v-voile")], m(10) - 0.2, 0.5, { opacity: 0 }, "inOut2");
    set("#ecr-apres", 0, { opacity: 0 });
    set("#ecr-apres", m(9), { opacity: 1 });

    // =================================================================================
    // 10-18 — ④ Après le match : on fait défiler la séance jouée
    // =================================================================================
    legende("#l4", m(10), m(19));
    camera(m(10) - 0.05, 0.85, REPOS, "out4");
    A(tel, m(10) - 0.05, 0.85, { rx: [24, 0] }, "out4");
    A("#ap-jouee", m(10) + 0.9, 0.35, { s: [1, 1.25] }, "out3");
    A("#ap-jouee", m(10) + 1.25, 0.35, { s: [1.25, 1] }, "out3");
    sous("#s4a", m(10) + 0.5, m(11));
    sous("#s4b", m(11), m(13));
    sous("#s4c", m(13), m(14));
    sous("#s4d", m(14), m(17));
    sous("#s4e", m(17), m(19));

    // Défilement : chaque geste du doigt sur un temps fort.
    const defiler = (instant, de, a, duree = 0.75) => {
      A(defile, instant, duree, { y: [-de, -a] }, "out4");
      glisse(300, 700, 700 - Math.min(380, (a - de) * 0.5 + 140), instant - 0.05);
    };
    defiler(m(11), 0, DEFILE.podium);
    camera(m(11) + 0.15, 0.8, cadre(podiumCartes.x + podiumCartes.l / 2, podiumCartes.y + podiumCartes.h / 2 - DEFILE.podium, 1.55, CIBLE));
    defiler(m(12) + TEMPS, DEFILE.podium, DEFILE.motm, 0.6);
    camera(m(12) + TEMPS + 0.05, 0.7, cadre(motmCarte.x + motmCarte.l / 2, motmCarte.y + motmCarte.h / 2 - DEFILE.motm, 1.6, CIBLE));
    defiler(m(13), DEFILE.motm, DEFILE.resultats);
    camera(m(13) + 0.1, 0.75, cadre(195, resultatsBloc.y + 150 - DEFILE.resultats, 1.4, { x: 540, y: 1180 }));
    A(q("#sec-feuille .ligne:not(.tete) .surbrillance"), m(13) + 0.9, 0.4, { opacity: [0, 1] }, "out2");
    defiler(m(14), DEFILE.resultats, DEFILE.videos);
    camera(m(14) + 0.1, 0.75, cadre(195, lecteurApp.y + 200 - DEFILE.videos, 1.42, { x: 540, y: 1200 }));

    // La vidéo : le filtre « Buts », puis un but touché, et le lecteur y saute.
    touche(filtreButs.x + filtreButs.l / 2, filtreButs.y + filtreButs.h / 2 - DEFILE.videos, BUTS);
    hook((t) => {
      const buts = t >= BUTS + 0.08;
      q("#f-tous").classList.toggle("on", !buts);
      q("#f-buts").classList.toggle("on", buts);
    });
    A("#liste-tous", BUTS + 0.1, 0.2, { opacity: [1, 0] }, "out2");
    A("#liste-buts", BUTS + 0.12, 0.3, { opacity: [0, 1], y: [8, 0] }, "out3");
    const TOUCHE_BUT = SAUT - 0.12;
    touche(butCible.x + butCible.l * 0.55, butCible.y + butCible.h / 2 - DEFILE.videos, TOUCHE_BUT);
    A("#but-1 .appui", TOUCHE_BUT, 0.1, { opacity: [0, 1] }, "out2");
    A("#but-1 .appui", TOUCHE_BUT + 0.8, 0.5, { opacity: 0 }, "out2");
    A("#v-saut", SAUT, 0.06, { opacity: [0, 0.85] }, "linear");
    A("#v-saut", SAUT + 0.06, 0.3, { opacity: 0 }, "out2");
    // Puis on s'approche du lecteur : le vrai match, en grand.
    camera(SAUT + 0.25, 0.9, cadre(lecteurApp.x + lecteurApp.l / 2, lecteurApp.y + lecteurApp.h / 2 - DEFILE.videos, 1.9, { x: 540, y: 1130 }));
    camera(m(17) - 0.15, 0.6, cadre(195, lecteurApp.y + 200 - DEFILE.videos, 1.2, { x: 540, y: 1200 }));

    defiler(m(17) + 0.3, DEFILE.videos, DEFILE.terrain);
    camera(m(17) + 0.4, 0.8, cadre(terrainBloc.x + terrainBloc.l / 2, terrainBloc.y + terrainBloc.h / 2 - DEFILE.terrain, 1.5, { x: 540, y: 1200 }));

    // =================================================================================
    // 19-21 — Appel final
    // =================================================================================
    A("#flash-2", m(19) - 0.06, 0.08, { opacity: [0, 0.8] }, "out2");
    A("#flash-2", m(19) + 0.02, 0.5, { opacity: 0 }, "out3");
    camera(m(19) - 0.3, 0.45, { s: 0.75, x: 0, y: 1500 }, "in3");
    A("#v-fond", m(19) - 0.2, 0.8, { opacity: [0, 0.45] }, "out2");
    A("#final .ecusson", m(19), 0.6, { opacity: [0, 1], s: [0.3, 1], rz: [-25, 0] }, "outBackStrong");
    A("#final .mot", m(19) + 0.12, 0.5, { opacity: [0, 1], y: [40, 0] }, "out4");
    A(qa("#final .mode-carte"), m(19) + TEMPS * 2, 0.55, { opacity: [0, 1], x: [-90, 0] }, "out4", TEMPS);
    qa("#final h2 .ligne").forEach((ligne, i) =>
      A(split(ligne, "mots"), m(20) + TEMPS * (1 + i), 0.55, { opacity: [0, 1], y: [70, 0], blur: [8, 0] }, "outExpo", 0.06),
    );
    A(qa("#final .store"), m(20) + TEMPS * 3, 0.55, { opacity: [0, 1], y: [40, 0] }, "out4", 0.12);
    A("#final .url", m(21), 0.5, { opacity: [0, 1] }, "out2");
  }
})();
