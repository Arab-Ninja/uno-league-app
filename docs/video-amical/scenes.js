/**
 * Les huit scènes de la vidéo et leur chorégraphie (33 s).
 *
 *   0,0   Accroche : vendredi, 20 h, match amical
 *   2,6   Le téléphone : la séance, « Session jouée »
 *   6,9   Le score
 *   9,9   Le podium
 *  14,9   La feuille de match
 *  19,4   La vidéo et les moments-clés
 *  25,3   Sur le terrain
 *  28,9   Appel final : réserve ta session
 *
 * Les coupes tombent sur la grille d'un tempo à 120 (une noire = 0,5 s),
 * celle de la bande-son (`son.py`).
 */
(function () {
  const { A, set, hook, scene, split, compteur, hasard, valeur, clamp01 } = M;
  const S = window.SEANCE;
  const J = (id) => S.joueurs[id];
  const DUREE = 33;
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
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    playFill: '<polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    smartphone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  };
  const ic = (nom) => `<svg class="ic" viewBox="0 0 24 24">${ICONES[nom]}</svg>`;
  const ICONE_MOMENT = { kickoff: "circlePlay", goal: "goal", assist: "handshake", defense: "shield", save: "hand" };

  // --- Outils -----------------------------------------------------------------
  const stage = document.getElementById("stage");
  const q = (sel, racine = document) => racine.querySelector(sel);
  const qa = (sel, racine = document) => [...racine.querySelectorAll(sel)];

  function nouvelleScene(id, a, b, contenu) {
    const section = document.createElement("section");
    section.className = "scene";
    section.id = id;
    section.innerHTML = `<div class="tout">${contenu}</div>`;
    stage.append(section);
    scene(section, a, b);
    return section;
  }

  /** Réduit un titre jusqu'à ce qu'il tienne dans `max` pixels de large. */
  function ajuste(el, max) {
    const affichage = el.style.display;
    el.style.display = "inline-block";
    let taille = parseFloat(getComputedStyle(el).fontSize);
    while (el.getBoundingClientRect().width > max && taille > 20) {
      taille -= 2;
      el.style.fontSize = `${taille}px`;
    }
    el.style.display = affichage;
  }

  /** Le nom d'équipe sans « Equipe » : « Bleue », « Noire ». */
  const couleurEquipe = (nom) => nom.replace(/^[ÉE]quipe\s+/i, "");
  const totalButs = S.equipes.bleue.score + S.equipes.noire.score;

  /** Carte FUT d'un joueur, initiales à la place de la photo. */
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
            <div class="fut-col"><ul>
              <li><span>${but}</span><span>BUT</span></li>
              <li><span>${pas}</span><span>PAS</span></li>
              <li><span>${def}</span><span>DÉF</span></li>
            </ul></div><div class="fut-col droite"><ul>
              <li><span>${arr}</span><span>ARR</span></li>
              <li><span>${mot}</span><span>MOT</span></li>
              <li><span>${mat}</span><span>MAT</span></li>
            </ul></div>
            <div class="fut-trait-v"></div>
            <div class="fut-trait-bas"></div>
          </div>
        </div>
        <div class="fut-brillance"></div>
      </div>`;
  }

  /** L'animation de révélation de la carte, celle de l'application. */
  function revele(carte, t0) {
    A(q(".fut-fond", carte), t0 + 0.15, 0.6, { opacity: [0, 0.09], x: [8, 0] }, "out4");
    A(q(".fut-photo", carte), t0 + 0.55, 0.45, { opacity: [0, 1], x: [10, 0] }, "out2");
    qa(".fut-infos > div", carte).forEach((d, i) =>
      A(d, t0 + 0.2 + i * 0.1, 0.4, { opacity: [0, 1], y: [20, 0] }, "out4"),
    );
    A(q(".fut-nom", carte), t0 + 0.6, 0.4, { opacity: [0, 1], y: [-5, 0] }, "out2");
    A(q(".fut-trait-haut", carte), t0 + 0.5, 0.4, { sy: [0, 1] }, "out4");
    A(q(".fut-trait-v", carte), t0 + 0.5, 0.4, { sy: [0, 1] }, "out4");
    A(q(".fut-trait-bas", carte), t0 + 0.5, 0.4, { sx: [0, 1] }, "out4");
    const delais = [0.5, 0.6, 0.7, 0.65, 0.75, 0.85];
    qa(".fut-col li", carte).forEach((li, i) =>
      A(li, t0 + delais[i], 0.4, { opacity: [0, 1], x: [20, 0] }, "out4"),
    );
    A(q(".fut-brillance", carte), t0 + 1.05, 0.85, { x: [0, 600] }, "inOut2");
  }

  /** Des lettres qui montent en place, en biais. */
  function titreMonte(el, t0, pas = 0.03) {
    const lettres = split(el);
    A(lettres, t0, 0.6, { opacity: [0, 1], y: [90, 0], sk: [-12, 0] }, "outExpo", pas);
    return lettres;
  }

  // --- Fond commun -------------------------------------------------------------
  stage.insertAdjacentHTML(
    "beforeend",
    `<div class="abs" id="fond"><div class="orbe" id="orbe-bleu"></div><div class="orbe" id="orbe-orange"></div></div>`,
  );
  hook((t) => {
    q("#orbe-bleu").style.transform = `translate(${Math.sin(t * 0.33) * 120}px, ${Math.cos(t * 0.27) * 90}px)`;
    q("#orbe-orange").style.transform = `translate(${Math.cos(t * 0.29) * 110}px, ${Math.sin(t * 0.37) * 120}px)`;
  });

  // =============================================================================
  // S1 — Accroche
  // =============================================================================
  const lampes = () => {
    let h = "";
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 4; c++) h += `<i style="left:${40 + c * 64 + (r % 2) * 24}px;top:${36 + r * 56}px"></i>`;
    return h;
  };
  const s1 = nouvelleScene(
    "s1",
    0,
    3.45,
    `
    <div class="abs" id="sol"></div>
    <div class="abs faisceau" id="f-g"></div>
    <div class="abs faisceau" id="f-d"></div>
    <div class="abs rampe" id="r-g"><div class="halo"></div>${lampes()}</div>
    <div class="abs rampe" id="r-d"><div class="halo"></div>${lampes()}</div>
    <div class="abs" id="poussiere" style="inset:0"></div>
    <div class="abs s1-bloc">
      <img class="s1-ecusson" src="../branding/ecusson.svg" alt="" />
      <div class="kicker s1-date">${S.dateAccroche} · ${S.heureAccroche}</div>
      <div class="titre-italique s1-mot s1-match">Match</div>
      <div class="titre-italique s1-mot s1-amical">Amical</div>
      <div class="s1-salle">${ic("mapPin")}<span>${S.salle}</span></div>
      <div class="s1-chiffres">
        <span><b id="c-joueurs">${S.feuille.length}</b>joueurs</span><i></i>
        <span><b id="c-heure">${S.dureeHeures}</b>heure</span><i></i>
        <span><b id="c-buts">${totalButs}</b>buts</span>
      </div>
    </div>`,
  );

  // Les projecteurs s'allument en grésillant.
  function allume(cibles, t0) {
    const pas = [[0, 0], [0.04, 0.85], [0.075, 0.12], [0.11, 1], [0.15, 0.45], [0.21, 1]];
    for (let i = 1; i < pas.length; i++)
      A(cibles, t0 + pas[i - 1][0], pas[i][0] - pas[i - 1][0], { opacity: [pas[i - 1][1], pas[i][1]] }, "linear");
  }
  allume([q("#f-g"), q("#r-g")], 0.0);
  allume([q("#f-d"), q("#r-d")], 0.14);
  A("#sol", 0.1, 0.8, { opacity: [0, 1] }, "out2");
  A("#f-g", 0, 3.45, { rz: [-29, -22] }, "inOut2");
  A("#f-d", 0, 3.45, { rz: [29, 22] }, "inOut2");
  A([q("#f-g"), q("#f-d")], 2.7, 0.75, { opacity: 0.25 }, "inOut2");
  A([q("#r-g"), q("#r-d")], 2.8, 0.65, { opacity: 0.4 }, "inOut2");

  // Poussière dans la lumière.
  {
    const alea = hasard(7);
    const conteneur = q("#poussiere");
    const grains = [];
    for (let i = 0; i < 70; i++) {
      const d = document.createElement("div");
      d.className = "grain-poussiere";
      const taille = 2 + alea() * 5;
      d.style.width = d.style.height = `${taille}px`;
      d.style.opacity = String(0.12 + alea() * 0.45);
      d.style.filter = taille > 5 ? "blur(1.5px)" : "none";
      conteneur.append(d);
      const gauche = alea() < 0.5;
      grains.push({ d, x: gauche ? 40 + alea() * 420 : 620 + alea() * 420, y: alea() * 1700, v: 18 + alea() * 40, p: alea() * 6.28 });
    }
    A(conteneur, 0.15, 0.6, { opacity: [0, 1] }, "out2");
    hook((t) => {
      if (t > 3.5) return;
      for (const g of grains) {
        const y = (g.y + t * g.v) % 1800;
        g.d.style.transform = `translate(${g.x + Math.sin(t * 0.9 + g.p) * 22}px, ${y}px)`;
      }
    });
  }

  A(".s1-ecusson", 0.16, 0.7, { opacity: [0, 1], s: [0.45, 1], y: [40, 0] }, "outBackSoft");
  A(".s1-date", 0.28, 0.75, { opacity: [0, 1], y: [24, 0], "--ls": [0.7, 0.22] }, "out4");
  {
    const match = split(q(".s1-match"));
    A(match, 0.38, 0.62, { opacity: [0, 1], y: [170, 0], sk: [-16, 0], blur: [16, 0] }, "outExpo", 0.045);
    const amical = split(q(".s1-amical"));
    A(amical, 0.6, 0.58, { opacity: [0, 1], x: [-80, 0], blur: [18, 0] }, "outExpo", 0.04);
  }
  // Une secousse à chaque mot qui tombe.
  A(".s1-bloc", 0.42, 0.3, { y: [10, 0] }, "outExpo");
  A(".s1-bloc", 0.64, 0.3, { y: [8, 0] }, "outExpo");
  A(".s1-salle", 1.05, 0.6, { opacity: [0, 1], y: [26, 0] }, "out4");
  A(qa(".s1-chiffres > *"), 1.35, 0.55, { opacity: [0, 1], y: [34, 0] }, "out4", 0.08);
  compteur(q("#c-joueurs"), 1.35, 0.7, 0, S.feuille.length);
  compteur(q("#c-heure"), 1.55, 0.3, 0, S.dureeHeures);
  compteur(q("#c-buts"), 1.7, 0.8, 0, totalButs);
  // Sortie : tout monte et s'efface pour laisser venir le téléphone.
  A(qa(".s1-bloc > *"), 2.4, 0.45, { opacity: 0, y: -110, blur: 12 }, "in3", 0.03);

  // =============================================================================
  // S2 — Le téléphone
  // =============================================================================
  const podiumMini = S.podium
    .map((p) => `<div class="mini-carte">${carteFut(p.joueur)}</div>`)
    .join("");
  const ecranSeance = `
    <div class="barre-etat"><span>21:07</span><span class="droite"><span class="reseau"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8px"></i><i style="height:10px;opacity:.35"></i></span>5G<span class="batterie"><i></i></span></span></div>
    <div class="entete-app">${ic("arrowLeft")}<h1>Détail de la session</h1></div>
    <div class="contenu-app" id="s2-contenu">
      <div class="carte-app carte-seance">
        <div class="haut">
          <div><h2>${S.mode}</h2><p class="date">${S.date}</p></div>
          <div class="badges"><span class="badge neutre">Terminée</span><span class="badge succes" id="s2-badge-app">${ic("circleCheck")}Session jouée</span></div>
        </div>
        <p class="descr">${S.description}</p>
        <div class="infos">
          <p>${ic("clock")}${S.heure}</p>
          <p>${ic("mapPin")}${S.salle}</p>
          <p>${ic("users")}<span class="badge neutre">${S.division}</span></p>
        </div>
        <div class="prix-ligne"><span class="lib">Participation</span><span><b>${S.prixUno} UNO</b><small>(${S.prixEur})</small></span></div>
      </div>
      <section><h2 class="titre-section">Récompenses</h2><div class="carte-app"><p class="texte-xs">Ce mode ne rapporte aucun point UNO et n'a aucun effet sur les divisions : on y joue pour le plaisir. Les statistiques de la session restent affichées.</p></div></section>
      <section><h2 class="titre-section">Podium de la session</h2><div class="carte-app podium-app">
        <div class="podium-tete">${ic("trophy")}Les joueurs distingués</div>
        <div class="podium-rang">${podiumMini}</div>
      </div></section>
    </div>`;

  const s2 = nouvelleScene(
    "s2",
    2.55,
    7.3,
    `
    <div class="abs s2-lueur"></div>
    <div class="abs s2-texte">
      <div class="kicker">Après le coup de sifflet</div>
      <div class="titre-italique s2-h"><span class="l1">Tout est</span><span class="l2">dans l'app.</span></div>
    </div>
    <div class="abs s2-pivot" id="s2-pivot"><div class="abs" id="s2-flotte" style="inset:0">
      <div class="telephone"><div class="ecran"><div class="app">${ecranSeance}</div><div class="reflet-ecran"></div></div><div class="ilot"></div></div>
    </div></div>
    <div class="abs s2-badge" id="s2-badge" data-base="translate(-50%, -50%)"><span class="badge succes">${ic("circleCheck")}Session jouée</span></div>`,
  );

  A("#s2-pivot", 2.68, 1.05, { y: [1500, 0], rx: [44, 9], ry: [-22, -10], rz: [-8, -2] }, "out4");
  A("#s2-pivot", 3.7, 2.85, { rx: [9, 5], ry: [-10, 9], rz: [-2, 1.5] }, "inOut2");
  A("#s2-pivot", 6.55, 0.62, { s: [1, 3.8], y: [0, -560], rx: [5, 0], blur: [0, 20] }, "inExpo");
  A("#s2-pivot", 6.86, 0.16, { opacity: [1, 0] }, "linear");
  A(".s2-lueur", 2.7, 1.2, { opacity: [0, 1], s: [0.6, 1] }, "out3");
  hook((t) => {
    q("#s2-flotte").style.transform = `translateY(${Math.sin(t * 1.7) * 9}px)`;
  });

  A(q(".entete-app", s2), 3.0, 0.5, { opacity: [0, 1], y: [-12, 0] }, "out3");
  A(qa("#s2-contenu > *"), 3.12, 0.6, { opacity: [0, 1], y: [26, 0] }, "out4", 0.12);
  A(qa(".carte-seance .infos p", s2), 3.42, 0.45, { opacity: [0, 1], x: [-14, 0] }, "out3", 0.08);
  A("#s2-badge-app", 3.85, 0.5, { opacity: [0, 1], s: [0.5, 1] }, "outBackStrong");
  A("#s2-contenu", 5.3, 1.35, { y: [0, -250] }, "inOut3");

  // Le badge « Session jouée » sort de l'écran.
  A("#s2-badge", 4.3, 0.8, { opacity: [0, 1], x: [705, 735], y: [812, 600], s: [1.64, 3.6], rz: [0, -4] }, "outBack");
  A("#s2-badge", 5.55, 0.5, { opacity: 0, y: 540, blur: 10 }, "in3");

  A(q(".s2-texte .kicker"), 2.95, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
  {
    const l1 = split(q(".s2-h .l1"));
    const l2 = split(q(".s2-h .l2"));
    A(l1, 3.05, 0.6, { opacity: [0, 1], y: [120, 0], sk: [-14, 0] }, "outExpo", 0.035);
    A(l2, 3.25, 0.6, { opacity: [0, 1], y: [120, 0], sk: [-14, 0] }, "outExpo", 0.035);
  }
  A(".s2-texte", 6.4, 0.45, { opacity: [1, 0], y: [0, -90], blur: [0, 12] }, "in3");

  // =============================================================================
  // S3 — Le score
  // =============================================================================
  const bleue = S.equipes.bleue;
  const noire = S.equipes.noire;
  const s3 = nouvelleScene(
    "s3",
    6.9,
    10.35,
    `
    <div class="abs s3-panneau" id="s3-bleu"></div>
    <div class="abs s3-panneau" id="s3-noir"></div>
    <div class="abs" id="s3-filet"></div>
    <div class="abs kicker" id="s3-k">Résultats · ${S.mode}</div>
    <div class="abs s3-equipe" id="s3-a"><small>Équipe</small><span>${couleurEquipe(bleue.nom)}</span></div>
    <div class="abs s3-score" id="s3-sa">${bleue.score}</div>
    <div class="abs s3-score" id="s3-sb">${noire.score}</div>
    <div class="abs s3-equipe" id="s3-b"><small>Équipe</small><span>${couleurEquipe(noire.nom)}</span></div>
    <div class="abs" id="s3-victoire">Victoire</div>
    <div class="abs" id="s3-pied"><b>${totalButs}</b> buts en <b>${S.dureeHeures}</b> heure de jeu</div>`,
  );
  A("#s3-bleu", 6.95, 0.6, { x: [-1250, 0] }, "outExpo");
  A("#s3-noir", 7.0, 0.6, { x: [1250, 0] }, "outExpo");
  A("#s3-filet", 7.3, 0.5, { opacity: [0, 1] }, "out2");
  A("#s3-k", 7.2, 0.5, { opacity: [0, 0.9], x: [-40, 0] }, "out4");
  A("#s3-a", 7.28, 0.55, { opacity: [0, 1], x: [-90, 0] }, "outExpo");
  A("#s3-sa", 7.35, 0.6, { opacity: [0, 1], s: [1.4, 1], y: [-40, 0] }, "outExpo");
  compteur(q("#s3-sa"), 7.35, 0.85, 0, bleue.score, "out2");
  A("#s3-b", 7.55, 0.55, { opacity: [0, 1], x: [90, 0] }, "outExpo");
  A("#s3-sb", 7.6, 0.6, { opacity: [0, 1], s: [1.4, 1], y: [40, 0] }, "outExpo");
  compteur(q("#s3-sb"), 7.6, 1.0, 0, noire.score, "out2");
  A("#s3-victoire", 8.65, 0.45, { opacity: [0, 1], s: [2.6, 1], rz: [-18, -5] }, "outBackStrong");
  A("#s3-sb", 8.65, 0.6, { bright: [1.7, 1] }, "out3");
  A("#s3-pied", 8.95, 0.5, { opacity: [0, 1], y: [24, 0] }, "out4");
  A("#s3-bleu", 9.85, 0.45, { x: -1300 }, "inExpo");
  A("#s3-noir", 9.85, 0.45, { x: 1300 }, "inExpo");
  A([q("#s3-k"), q("#s3-a"), q("#s3-sa"), q("#s3-b"), q("#s3-sb"), q("#s3-victoire"), q("#s3-pied"), q("#s3-filet")], 9.75, 0.4, { opacity: 0, blur: 14 }, "in3");

  // =============================================================================
  // S4 — Le podium
  // =============================================================================
  const gauches = [90, 390, 690];
  const prixHtml = S.podium
    .map((p, i) => {
      const [petit, ...reste] = p.prix.split(" ");
      return `
        <div class="abs prix" id="s4-p${i}" style="left:${gauches[i]}px;top:470px">
          <div class="cadre-carte">${carteFut(p.joueur)}</div>
          <div class="lib"><small>${petit}</small><b>${reste.join(" ")}</b></div>
          <div class="val">${p.valeur}</div>
        </div>`;
    })
    .join("");
  const motm = S.hommeDuMatch;
  const distinctions = S.podium.filter((p) => p.joueur === motm.joueur).length + 1;
  const s4 = nouvelleScene(
    "s4",
    9.9,
    15.35,
    `
    <div class="abs" id="s4-fond"></div>
    <div class="abs" id="s4-cone"></div>
    <div class="abs" id="s4-rayons"></div>
    <div class="abs s4-texte"><div class="kicker">${ic("trophy")}Les joueurs distingués</div><div class="titre-app" id="s4-h">Podium de la session</div></div>
    ${prixHtml}
    <div class="abs prix" id="s4-motm">
      <div class="cadre-carte">${carteFut(motm.joueur)}</div>
      <div class="lib"><b>${motm.prix}</b></div>
      <div class="val"><b>${motm.valeur}</b><small>pts</small></div>
    </div>
    ${distinctions >= 2 ? `<div class="abs" id="s4-legende"><b>${J(motm.joueur).nom}</b> · ${distinctions} distinctions sur ${S.podium.length + 1}</div>` : ""}`,
  );
  A("#s4-fond", 9.95, 0.6, { opacity: [0, 1] }, "out2");
  A("#s4-cone", 10.0, 0.8, { opacity: [0, 1] }, "out2");
  A(q(".s4-texte .kicker"), 10.0, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
  titreMonte(q("#s4-h"), 10.05, 0.022);
  S.podium.forEach((p, i) => {
    const t0 = 10.35 + i * 0.16;
    const el = q(`#s4-p${i}`);
    A(el, t0, 0.85, { opacity: [0, 1], y: [440, 0], rx: [-62, 0], ry: [[-34, 0, 34][i], 0], s: [0.7, 1] }, "out4");
    revele(q(".fut", el), t0 + 0.22);
    A(q(".lib", el), t0 + 0.55, 0.45, { opacity: [0, 1], y: [16, 0] }, "out4");
    A(q(".val", el), t0 + 0.65, 0.5, { opacity: [0, 1], s: [0.5, 1] }, "outBack");
    compteur(q(".val", el), t0 + 0.65, 0.6, 0, p.valeur);
    // Deuxième temps : les trois cartes se rangent en haut.
    A(el, 12.3 + i * 0.04, 0.65, { s: 0.5, x: [0, [120, 0, -120][i]], y: -95 }, "inOut3");
    A([q(".lib", el), q(".val", el)], 12.22, 0.25, { opacity: 0 }, "out2");
  });
  A("#s4-rayons", 12.45, 0.9, { opacity: [0, 1] }, "out2");
  A("#s4-rayons", 9.9, 5.5, { rz: [0, 48] }, "linear");
  A("#s4-motm", 12.5, 0.95, { opacity: [0, 1], y: [760, 0], rx: [76, 0], s: [0.8, 1] }, "out4");
  revele(q("#s4-motm .fut"), 12.88);
  A(q("#s4-motm .lib"), 13.35, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
  A(q("#s4-motm .val"), 13.5, 0.55, { opacity: [0, 1], s: [0.5, 1] }, "outBack");
  compteur(q("#s4-motm .val b"), 13.5, 0.8, 0, motm.valeur);
  if (q("#s4-legende")) A("#s4-legende", 13.95, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
  A(q("#s4 > .tout"), 14.62, 0.42, { s: [1, 1.14], blur: [0, 16], opacity: [1, 0] }, "in3");

  // =============================================================================
  // S5 — La feuille de match
  // =============================================================================
  const lignes = S.feuille
    .map(([id, b, p, d, a, pts], i) => {
      const j = J(id);
      return `
        <div class="ligne"><div class="surbrillance"></div>
          <div class="c-rang">${i + 1}</div>
          <div class="c-joueur"><span class="avatar sm">${j.initiales}</span><span>${j.nom}</span></div>
          <div class="c-stat">${b}</div><div class="c-stat">${p}</div><div class="c-stat">${d}</div><div class="c-stat">${a}</div>
          <div class="c-pts">${pts}</div><div class="c-mvt"></div>
        </div>`;
    })
    .join("");
  const s5 = nouvelleScene(
    "s5",
    14.9,
    19.85,
    `
    <div class="abs s5-texte"><div class="kicker">Chaque joueur a sa ligne</div><div class="titre-app" id="s5-h">Feuille de match</div></div>
    <div class="abs" id="s5-pivot"><div class="ui"><div class="feuille">
      <div class="ligne tete"><div class="c-rang">#</div><div class="c-joueur">Joueur</div><div class="c-stat">B</div><div class="c-stat">P</div><div class="c-stat">D</div><div class="c-stat">A</div><div class="c-pts">Pts</div><div class="c-mvt"></div></div>
      ${lignes}
    </div></div></div>
    <div class="abs" id="s5-legende"><span><b>B</b>buts</span><span><b>P</b>passes</span><span><b>D</b>défenses</span><span><b>A</b>arrêts</span></div>`,
  );
  A(q(".s5-texte .kicker", s5), 15.0, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
  titreMonte(q("#s5-h"), 15.05, 0.03);
  A("#s5-pivot", 15.12, 0.95, { opacity: [0, 1], y: [260, 0], rx: [34, 0] }, "out4");
  A("#s5-pivot", 16.1, 3.2, { rx: [0, 5], ry: [0, -5] }, "inOut2");
  A(q(".ligne.tete", s5), 15.3, 0.4, { opacity: [0, 1] }, "out2");
  const lignesEl = qa(".feuille .ligne:not(.tete)", s5);
  lignesEl.forEach((ligne, i) => {
    const t0 = 15.38 + i * 0.075;
    A(ligne, t0, 0.65, { opacity: [0, 1], x: [160, 0] }, "outExpo");
    qa(".c-stat", ligne).forEach((cellule, k) => compteur(cellule, t0 + 0.05, 0.55, 0, S.feuille[i][k + 1]));
    A(q(".c-pts", ligne), t0 + 0.25, 0.45, { opacity: [0, 1], s: [1.7, 1] }, "outBack");
  });
  A(q(".surbrillance", lignesEl[0]), 16.55, 0.45, { opacity: [0, 1] }, "out2");
  A(q(".c-pts", lignesEl[0]), 16.55, 0.5, { s: [1, 1.25] }, "outBack");
  A("#s5-legende", 16.4, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
  A(lignesEl, 19.05, 0.34, { opacity: 0, x: -170 }, "in3", 0.022);
  A([q(".s5-texte", s5), q(".ligne.tete", s5), q("#s5-legende")], 19.1, 0.32, { opacity: 0, y: -40 }, "in3");
  A(q(".feuille", s5), 19.3, 0.25, { opacity: [1, 0] }, "in2");

  // =============================================================================
  // S6 — La vidéo et les moments-clés
  // =============================================================================
  const momentsHtml = S.moments
    .map(
      (m, i) => `
        <div class="moment ${m.type === "goal" ? "but" : ""}" id="m-${i}"><div class="appui"></div>
          <span class="min">${m.minute}'</span>${ic(ICONE_MOMENT[m.type] ?? "circlePlay")}
          <span class="txt"><b>${m.titre}</b><span>${m.detail}</span></span>
        </div>`,
    )
    .join("");
  const s6 = nouvelleScene(
    "s6",
    19.4,
    25.75,
    `
    <div class="abs s6-texte"><div class="kicker">Chaque but en un tap</div><div class="titre-app" id="s6-h">Vidéos de la session</div></div>
    <div class="abs" id="s6-ui"><div class="ui">
      <div class="puces" id="s6-angles"><span class="puce on">Angle 2</span><span class="puce">Angle 1</span><span class="cadenas-ext">${ic("lock")}Réservées aux joueurs de la séance</span></div>
      <div class="cadre-video" id="s6-video">
        <div class="camera"><div class="salle"></div><div class="plan" id="plan"></div></div>
        <div class="vignette-video"></div>
        <div class="commandes"><span id="v-icone">${ic("play")}</span><span id="v-temps">14:05</span><div class="piste"><div class="lu" id="v-lu"></div><div class="tete-lecture" id="v-tete"></div></div><span>1:02:18</span>${ic("maximize")}</div>
        <div class="saut" id="v-saut"></div>
      </div>
      <div class="moments-tete"><p>Moments-clés</p><p>Touchez un moment pour le revoir</p></div>
      <div class="puces petites"><span class="puce on">Tous</span><span class="puce">Buts</span><span class="puce">Passes</span><span class="puce">Défenses</span><span class="puce">Arrêts</span></div>
      <div class="liste-moments" id="s6-liste">${momentsHtml}</div>
      <div class="tape" id="tape"></div><div class="onde" id="onde"></div>
      <div class="etiquette-action" id="s6-but" data-base="translate(-50%, -50%)" style="left:300px;top:206px"><b>But !</b><span>${S.moments[1].detail.split(" · ").slice(0, 2).join(" · ")}</span></div>
      <div class="etiquette-action defense" id="s6-def" data-base="translate(-50%, -50%)" style="left:70px;top:206px"><b>Défense</b><span>${S.moments[3].titre.replace(/^Défense de /, "")} · ${S.moments[3].detail}</span></div>
    </div></div>`,
  );
  A(q(".s6-texte .kicker", s6), 19.48, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
  titreMonte(q("#s6-h"), 19.52, 0.022);
  const blocs6 = qa("#s6-ui > .ui > :not(.tape):not(.onde):not(.etiquette-action)");
  A(blocs6, 19.7, 0.7, { opacity: [0, 1], y: [80, 0] }, "out4", 0.07);
  A(qa(".moment", s6), 20.25, 0.5, { opacity: [0, 1], x: [40, 0] }, "out4", 0.07);

  // Le doigt touche « But de … », puis « Défense de … ».
  function touche(cible, t0) {
    const ui = q("#s6-ui > .ui");
    const base = ui.getBoundingClientRect();
    const r = cible.getBoundingClientRect();
    const zoom = 2.3;
    return { x: (r.left - base.left) / zoom + r.width / zoom * 0.62, y: (r.top - base.top) / zoom + r.height / zoom / 2, t0 };
  }
  const tapes = [];
  window.__mesures = () => {
    tapes.length = 0;
    tapes.push(touche(q("#m-1"), 21.05), touche(q("#m-3"), 23.75));
  };
  hook((t) => {
    if (t < 20.8 || t > 25.6 || tapes.length === 0) return;
    const tape = q("#tape");
    const onde = q("#onde");
    let visible = false;
    for (const { x, y, t0 } of tapes) {
      const dt = t - t0;
      if (dt < -0.02 || dt > 0.75) continue;
      visible = true;
      const entree = clamp01(dt / 0.15);
      const appui = dt > 0.2 ? clamp01((dt - 0.2) / 0.08) * (1 - clamp01((dt - 0.32) / 0.1)) : 0;
      const sortie = clamp01((dt - 0.45) / 0.25);
      tape.style.left = `${x + (1 - entree) * 30}px`;
      tape.style.top = `${y + (1 - entree) * 40}px`;
      tape.style.opacity = String(entree * (1 - sortie));
      tape.style.transform = `scale(${1.3 - 0.3 * entree - 0.22 * appui})`;
      const o = clamp01((dt - 0.26) / 0.5);
      onde.style.left = `${x}px`;
      onde.style.top = `${y}px`;
      onde.style.opacity = String(dt > 0.26 ? (1 - o) * 0.9 : 0);
      onde.style.transform = `scale(${1 + o * 2.2})`;
    }
    if (!visible) {
      tape.style.opacity = "0";
      onde.style.opacity = "0";
    }
  });
  A("#m-1 .appui", 21.27, 0.12, { opacity: [0, 1] }, "out2");
  A("#m-1 .appui", 21.9, 0.6, { opacity: 0 }, "out2");
  A("#m-3 .appui", 23.97, 0.12, { opacity: [0, 1] }, "out2");
  A("#m-3 .appui", 24.6, 0.6, { opacity: 0 }, "out2");
  A("#v-saut", 21.36, 0.08, { opacity: [0, 0.75] }, "linear");
  A("#v-saut", 21.44, 0.25, { opacity: 0 }, "out2");
  A("#v-saut", 24.06, 0.08, { opacity: [0, 0.75] }, "linear");
  A("#v-saut", 24.14, 0.25, { opacity: 0 }, "out2");
  A("#s6-but", 23.02, 0.45, { opacity: [0, 1], s: [0.2, 1], rz: [-24, -6] }, "outBackStrong");
  A("#s6-but", 23.8, 0.3, { opacity: 0, s: 0.8 }, "in2");
  A("#s6-def", 24.95, 0.45, { opacity: [0, 1], s: [0.2, 1], rz: [20, 5] }, "outBackStrong");
  A(q("#s6 > .tout"), 25.25, 0.45, { opacity: [1, 0], y: [0, -120], blur: [0, 12] }, "in3");

  construitCamera(q("#plan"));

  // =============================================================================
  // S7 — Sur le terrain
  // =============================================================================
  const PLACES = {
    noire: { gardien: [[200, 36]], ailes: [[80, 121], [200, 121], [320, 121]], attaque: [[200, 206]] },
    bleue: { attaque: [[200, 300]], ailes: [[80, 385], [200, 385], [320, 385]], gardien: [[200, 470]] },
  };
  const NOMS_POSTES = { gardien: ["Gardien"], ailes: ["Aile 1", "Aile 2", "Aile 3"], attaque: ["Attaque"] };
  const placesHtml = [];
  for (const equipe of ["noire", "bleue"]) {
    for (const poste of Object.keys(PLACES[equipe])) {
      S.terrain[equipe][poste].forEach((id, k) => {
        const [x, y] = PLACES[equipe][poste][k];
        const j = J(id);
        placesHtml.push(`
          <div class="pied ${equipe}" style="left:${x}px;top:${y - 23}px">
            <div class="place"><span class="avatar md ${equipe === "noire" ? "noire" : ""}">${j.initiales}</span>
            <span class="prenom">${j.nom.split(" ")[0]}</span><span class="poste">${NOMS_POSTES[poste][k]}</span></div>
          </div>`);
      });
    }
  }
  const nbJoueurs = S.terrain.bleue.attaque.length + S.terrain.bleue.ailes.length + S.terrain.bleue.gardien.length
    + S.terrain.noire.attaque.length + S.terrain.noire.ailes.length + S.terrain.noire.gardien.length;
  const s7 = nouvelleScene(
    "s7",
    25.35,
    29.25,
    `
    <div class="abs s7-texte"><div class="kicker">Les équipes telles qu'elles ont joué</div><div class="titre-app" id="s7-h">Sur le terrain (${nbJoueurs})</div></div>
    <div class="abs" id="s7-pivot"><div class="ui"><div class="terrain" id="s7-terrain">
      <div class="bandes"></div>
      <svg class="lignes" viewBox="0 0 400 540" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2">
        <rect x="9" y="9" width="382" height="522" rx="8" pathLength="1" stroke-dasharray="1 1"/>
        <path d="M9 270H391" pathLength="1" stroke-dasharray="1 1"/>
        <circle cx="200" cy="270" r="32" pathLength="1" stroke-dasharray="1 1"/>
        <path d="M136 9V40Q136 48 144 48H256Q264 48 264 40V9" pathLength="1" stroke-dasharray="1 1"/>
        <path d="M136 531V500Q136 492 144 492H256Q264 492 264 500V531" pathLength="1" stroke-dasharray="1 1"/>
      </svg>
      <div class="filigrane" style="top:96px">${couleurEquipe(noire.nom)}</div>
      <div class="filigrane" style="top:372px">${couleurEquipe(bleue.nom)}</div>
      <div class="score-equipe" id="se-noire" style="top:238px"><i style="background:#0b0e14;box-shadow:0 0 0 1px rgba(255,255,255,.6)"></i>${couleurEquipe(noire.nom)}<b>${noire.score}</b></div>
      <div class="score-equipe" id="se-bleue" style="top:282px"><i style="background:#2f63d6"></i>${couleurEquipe(bleue.nom)}<b>${bleue.score}</b></div>
      ${placesHtml.join("")}
    </div></div></div>`,
  );
  A(q(".s7-texte .kicker", s7), 25.42, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
  titreMonte(q("#s7-h"), 25.46, 0.028);
  A("#s7-pivot", 25.5, 1.0, { opacity: [0, 1], y: [560, 0], rx: [60, 24] }, "out4");
  A("#s7-pivot", 26.5, 2.2, { rx: [24, 14] }, "inOut2");
  A("#s7-pivot", 28.7, 0.5, { rx: 78, y: -160, opacity: 0 }, "inExpo");
  A(qa("#s7-terrain svg.lignes > *"), 25.75, 0.85, { dash: [1, 0] }, "inOut3", 0.07);
  A(qa(".filigrane", s7), 26.1, 0.6, { opacity: [0, 1] }, "out2");
  const pieds = qa(".pied", s7);
  pieds.forEach((pied, i) => {
    const place = q(".place", pied);
    A(place, 26.15 + i * 0.065 + (i >= 5 ? 0.12 : 0), 0.5, { opacity: [0, 1], s: [0.2, 1], y: [-30, 0] }, "outBackStrong");
  });
  A([q("#se-noire"), q("#se-bleue")], 26.95, 0.5, { opacity: [0, 1], x: [-30, 0] }, "out4", 0.1);
  // =============================================================================
  // S8 — Appel final
  // =============================================================================
  const s8 = nouvelleScene(
    "s8",
    28.9,
    DUREE + 0.1,
    `
    <div class="abs" id="s8-heros"><img src="../flyer/img/heros-frappe.jpg" alt="" /></div>
    <div class="abs" id="s8-voile"></div>
    <div class="abs" id="s8-lueur"></div>
    <div class="abs s8-bloc">
      <img class="s8-ecusson" src="../branding/ecusson.svg" alt="" />
      <div class="s8-marque">UNO <span class="orange">LEAGUE</span></div>
      <div class="titre-italique s8-titre"><div class="l">Ta prochaine</div><div class="l">session</div><div class="l orange">t'attend.</div></div>
      <div class="s8-modes"><span>Match amical</span><span>UNO League</span></div>
      <div class="s8-sous">Réserve ta place dans l'app.</div>
      <div class="s8-stores">
        <div class="store"><span class="pastille">${ic("playFill")}</span><span><small>Disponible sur</small><b>Google Play</b></span></div>
        <div class="store"><span class="pastille">${ic("smartphone")}</span><span><small>Disponible sur</small><b>App Store</b></span></div>
      </div>
      <div class="s8-url">unoleague.be</div>
    </div>`,
  );
  A("#s8-heros", 28.95, 1.1, { opacity: [0, 1], s: [1.3, 1.08], blur: [18, 0] }, "out3");
  A("#s8-heros", 30.05, DUREE - 30.05, { s: [1.08, 1.13] }, "linear");
  A("#s8-voile", 28.95, 0.6, { opacity: [0, 1] }, "out2");
  A("#s8-lueur", 29.3, 0.9, { opacity: [0, 1] }, "out2");
  A(".s8-ecusson", 29.22, 0.75, { opacity: [0, 1], s: [0.2, 1], rz: [-30, 0] }, "outBackStrong");
  A(split(q(".s8-marque")), 29.45, 0.5, { opacity: [0, 1], y: [30, 0] }, "out4", 0.025);
  qa(".s8-titre .l", s8).forEach((ligne, i) =>
    A(ligne, 29.62 + i * 0.13, 0.65, { opacity: [0, 1], y: [100, 0], sk: [-16, 0], blur: [14, 0] }, "outExpo"),
  );
  A(qa(".s8-modes span", s8), 30.2, 0.5, { opacity: [0, 1], s: [0.6, 1] }, "outBack", 0.1);
  A(".s8-sous", 30.45, 0.5, { opacity: [0, 1], y: [20, 0] }, "out4");
  A(qa(".s8-stores .store", s8), 30.65, 0.6, { opacity: [0, 1], y: [50, 0] }, "out4", 0.12);
  A(".s8-url", 31.0, 0.5, { opacity: [0, 1] }, "out2");

  // =============================================================================
  // Transitions et finitions
  // =============================================================================
  stage.insertAdjacentHTML(
    "beforeend",
    `<div class="balayage" id="bal-1"></div><div class="balayage" id="bal-2"></div>
     <div class="flash" id="flash-1"></div><div class="flash" id="flash-2"></div><div class="flash" id="flash-3"></div>
     <div id="grain"></div><div id="vignette"></div>`,
  );
  A("#bal-1", 9.55, 0.65, { x: [-700, 1300], opacity: [1, 1] }, "inOut3");
  A("#bal-2", 25.15, 0.6, { x: [-700, 1300], opacity: [1, 1] }, "inOut3");
  set("#bal-1", 0, { rz: 12 });
  set("#bal-2", 0, { rz: 12 });
  A("#flash-1", 6.88, 0.12, { opacity: [0, 0.95] }, "out2");
  A("#flash-1", 7.0, 0.45, { opacity: 0 }, "out3");
  A("#flash-2", 28.88, 0.1, { opacity: [0, 1] }, "out2");
  A("#flash-2", 28.98, 0.5, { opacity: 0 }, "out3");
  A("#flash-3", 0.0, 0.06, { opacity: [0, 0.5] }, "out2");
  A("#flash-3", 0.06, 0.3, { opacity: 0 }, "out3");

  // Grain de pellicule : un bruit fixe, déplacé à chaque image.
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
    const aleaImage = (n) => hasard(n * 9973 + 1)();
    hook((t) => {
      const n = Math.floor(t * 60);
      q("#grain").style.transform = `translate(${Math.floor(aleaImage(n) * 64)}px, ${Math.floor(aleaImage(n + 7) * 64)}px)`;
    });
  }

  // Ajustements qui demandent les polices chargées et la mise en page faite.
  window.__ajuster = () => {
    for (const [sel, max] of [["#s4-h", 980], ["#s5-h", 980], ["#s6-h", 980], ["#s7-h", 980], [".s2-h .l2", 1000], [".s8-titre", 1000]]) {
      const el = q(sel);
      if (el) ajuste(el, max);
    }
    window.__mesures();
  };

  // ===========================================================================
  // La caméra stylisée du match (S6) : un terrain en perspective, des
  // silhouettes sans visage aux couleurs des deux équipes.
  // ===========================================================================
  function construitCamera(plan) {
    const RX = 57;
    const RZ = 0;
    const cadre = (x, y, k) => `translate(${x}px, ${y}px) scale(${k}) rotateX(${RX}deg) rotateZ(${RZ}deg)`;
    const CADRAGES = { jeu: cadre(0, -6, 1.16), but: cadre(-132, 6, 1.6), defense: cadre(128, 6, 1.6) };
    plan.style.transform = CADRAGES.jeu;
    const salle = q(".salle", plan.parentElement);
    for (let i = 0; i < 7; i++)
      salle.insertAdjacentHTML("beforeend", `<i class="projecteur" style="left:${22 + i * 50}px"></i>`);

    // Gazon : bandes de tonte, lignes, surfaces.
    let bandes = "";
    for (let i = 0; i < 12; i++)
      bandes += `<rect x="${-14 + i * 27.34}" y="-14" width="27.34" height="178" fill="${i % 2 ? "#3c8a3a" : "#357b33"}"/>`;
    plan.insertAdjacentHTML(
      "beforeend",
      `<svg class="gazon" viewBox="-14 -14 328 178" width="328" height="178" style="left:-14px;top:-14px;inset:auto">
        <rect x="-14" y="-14" width="328" height="178" fill="#2c6a2b"/>${bandes}
        <g fill="none" stroke="#f4f6fb" stroke-width="1.3" opacity="0.92">
          <rect x="0" y="0" width="300" height="150"/>
          <path d="M150 0V150"/><circle cx="150" cy="75" r="30"/>
          <path d="M0 35H38Q46 35 46 43V107Q46 115 38 115H0"/>
          <path d="M300 35H262Q254 35 254 43V107Q254 115 262 115H300"/>
        </g>
        <g fill="#f4f6fb"><circle cx="150" cy="75" r="1.3"/><circle cx="60" cy="75" r="1"/><circle cx="240" cy="75" r="1"/></g>
        <rect x="-14" y="-14" width="328" height="178" fill="url(#lumiereGazon)"/>
        <defs><radialGradient id="lumiereGazon" cx="50%" cy="45%" r="65%"><stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></radialGradient></defs>
      </svg>`,
    );

    // Bandes et filets autour du terrain (fond et extrémités).
    const filet = "repeating-linear-gradient(0deg, rgba(220,228,240,.16) 0 .4px, transparent .4px 2.2px), repeating-linear-gradient(90deg, rgba(220,228,240,.16) 0 .4px, transparent .4px 2.2px)";
    const bande = "linear-gradient(180deg, #c3232d 0 70%, #15171c 70%)";
    const mur = (x, y, l, h, debout, fond) =>
      `<div class="filet" style="left:0;top:0;width:${l}px;height:${h}px;background:${fond};transform:translate3d(${x}px,${y}px,0) ${debout}"></div>`;
    plan.insertAdjacentHTML(
      "beforeend",
      mur(-14, -14, 328, 9, "rotateX(90deg)", bande) +
        mur(-14, -14, 328, 46, "rotateX(90deg) translateY(9px)", filet) +
        mur(-14, -14, 178, 9, "rotateZ(90deg) rotateX(90deg)", bande) +
        mur(-14, -14, 178, 46, "rotateZ(90deg) rotateX(90deg) translateY(9px)", filet) +
        mur(314, -14, 178, 9, "rotateZ(90deg) rotateX(90deg)", bande) +
        mur(314, -14, 178, 46, "rotateZ(90deg) rotateX(90deg) translateY(9px)", filet),
    );

    // Les buts : cadre blanc, filets de fond, de côté et de dessus.
    const filetBut = "repeating-linear-gradient(0deg, rgba(255,255,255,.55) 0 .35px, transparent .35px 1.6px), repeating-linear-gradient(90deg, rgba(255,255,255,.55) 0 .35px, transparent .35px 1.6px)";
    const but = (x, sens) => {
      const fond = x + sens * 12;
      return (
        `<div class="filet" style="left:0;top:0;width:30px;height:20px;border:1.3px solid #f4f6fb;border-top:0;transform:translate3d(${x}px,60px,0) rotateZ(90deg) rotateX(90deg)"></div>` +
        `<div class="filet ${sens > 0 ? "fond-but-d" : "fond-but-g"}" style="left:0;top:0;width:30px;height:20px;background:${filetBut};transform:translate3d(${fond}px,60px,0) rotateZ(90deg) rotateX(90deg)"></div>` +
        `<div class="filet" style="left:0;top:0;width:12px;height:20px;background:${filetBut};transform:translate3d(${Math.min(x, fond)}px,60px,0) rotateX(90deg)"></div>` +
        `<div class="filet" style="left:0;top:0;width:12px;height:20px;background:${filetBut};transform:translate3d(${Math.min(x, fond)}px,90px,0) rotateX(90deg)"></div>` +
        `<div class="filet" style="left:0;top:0;width:12px;height:30px;background:${filetBut};transform:translate3d(${Math.min(x, fond)}px,60px,20px)"></div>`
      );
    };
    plan.insertAdjacentHTML("beforeend", but(0, -1) + but(300, 1));

    // Les acteurs : dix silhouettes et le ballon.
    const debout = `rotateZ(${-RZ}deg) rotateX(${-RX}deg)`;
    const tenue = {
      bleue: { maillot: "#3f7dff", short: "#121722", contour: "none" },
      noire: { maillot: "#0f1218", short: "#0f1218", contour: "rgba(255,255,255,.75)" },
    };
    const gardiens = { [S.terrain.bleue.gardien[0]]: "#ffc21a", [S.terrain.noire.gardien[0]]: "#2bd576" };
    const acteurs = {};
    for (const equipe of ["bleue", "noire"]) {
      const ids = [...S.terrain[equipe].attaque, ...S.terrain[equipe].ailes, ...S.terrain[equipe].gardien];
      for (const id of ids) {
        const t = tenue[equipe];
        const maillot = gardiens[id] ?? t.maillot;
        plan.insertAdjacentHTML(
          "beforeend",
          `<div class="acteur" id="a-${id}"><div class="ombre"></div><div class="debout" style="transform:${debout}">
            <svg class="silhouette" viewBox="0 0 8 18" overflow="visible">
              <g class="jambe-g"><path d="M3.1 11.6 2.6 17.4" stroke="#1c2029" stroke-width="1.35" stroke-linecap="round"/></g>
              <g class="jambe-d"><path d="M4.9 11.6 5.4 17.4" stroke="#1c2029" stroke-width="1.35" stroke-linecap="round"/></g>
              <rect x="1.9" y="9.6" width="4.2" height="2.6" rx="0.7" fill="${t.short}" stroke="${t.contour}" stroke-width="0.3"/>
              <g class="bras-g"><path d="M2 5 0.9 9" stroke="${maillot}" stroke-width="1.2" stroke-linecap="round"/></g>
              <g class="bras-d"><path d="M6 5 7.1 9" stroke="${maillot}" stroke-width="1.2" stroke-linecap="round"/></g>
              <rect x="1.6" y="4.1" width="4.8" height="6.1" rx="1.4" fill="${maillot}" stroke="${t.contour}" stroke-width="0.3"/>
              <circle cx="4" cy="2.2" r="1.75" fill="#6f5d50"/>
            </svg></div></div>`,
        );
        acteurs[id] = q(`#a-${id}`, plan);
      }
    }
    plan.insertAdjacentHTML(
      "beforeend",
      `<div class="acteur" id="a-ballon"><div class="ombre" style="left:-1.8px;top:-0.8px;width:3.6px;height:1.6px"></div><div class="debout" style="transform:${debout}"><div class="ballon"></div></div></div>`,
    );
    const ballon = q("#a-ballon", plan);
    const fondBut = q(".fond-but-d", plan);
    const transformFondBut = fondBut.style.transform;

    // --- Les trois extraits : jeu, but, défense (positions en mètres). ---
    const CLIPS = {
      jeu: {
        duree: 1.6,
        joueurs: {
          karim: [[0, 16.0, 9.0], [1.6, 13.8, 9.7]], mohamed: [[0, 12.6, 5.6], [1.6, 10.6, 6.3]],
          yousri: [[0, 18.2, 4.2], [1.6, 16.6, 3.6]], damir: [[0, 17.2, 12.4], [1.6, 15.4, 12.0]],
          yassine: [[0, 27.4, 7.6], [1.6, 26.8, 7.5]], theo: [[0, 13.6, 8.2], [1.6, 12.4, 8.5]],
          mehdi: [[0, 15.0, 6.0], [1.6, 13.6, 6.9]], najib: [[0, 11.0, 3.8], [1.6, 10.0, 4.7]],
          nadyr: [[0, 9.6, 10.6], [1.6, 8.7, 10.0]], anthony: [[0, 2.0, 7.5], [1.6, 2.4, 7.2]],
        },
        ballon: (t, P) =>
          t < 0.5 ? porte(P("karim", t), -0.4, 0.1)
          : t < 0.9 ? passe(porte(P("karim", 0.5), -0.4, 0.1), porte(P("mohamed", 0.9), 0.35, -0.1), (t - 0.5) / 0.4)
          : porte(P("mohamed", t), -0.4, 0.1),
      },
      but: {
        duree: 2.9,
        joueurs: {
          najib: [[0, 15.8, 4.2], [0.7, 19.2, 5.0], [1.2, 21.0, 4.6], [1.9, 23.6, 5.6], [2.9, 26.0, 9.4]],
          mehdi: [[0, 21.2, 10.6], [0.5, 22.6, 9.6], [0.95, 24.0, 8.6], [1.35, 25.4, 8.1], [1.6, 25.9, 8.2], [2.2, 27.0, 10.4], [2.9, 27.4, 12.6]],
          theo: [[0, 12.0, 8.6], [1.0, 15.2, 8.8], [2.0, 18.4, 9.6], [2.9, 21.0, 11.0]],
          nadyr: [[0, 9.5, 3.6], [1.4, 12.6, 4.4], [2.9, 15.4, 5.6]],
          anthony: [[0, 1.6, 7.6], [2.9, 3.2, 7.4]],
          yassine: [[0, 28.9, 7.8], [0.9, 28.7, 8.3], [1.4, 28.75, 7.9], [1.55, 29.0, 7.1], [2.0, 29.1, 6.9], [2.9, 28.8, 7.4]],
          karim: [[0, 22.6, 6.4], [0.8, 23.4, 7.2], [1.3, 24.6, 7.6], [2.0, 25.4, 8.4], [2.9, 25.0, 9.0]],
          yousri: [[0, 18.8, 2.8], [0.7, 20.0, 4.0], [1.3, 21.2, 4.6], [2.9, 22.0, 5.4]],
          damir: [[0, 24.2, 12.0], [1.0, 25.2, 10.6], [1.6, 26.0, 9.8], [2.9, 25.6, 10.8]],
          mohamed: [[0, 14.4, 6.6], [1.5, 16.6, 6.8], [2.9, 18.0, 7.6]],
        },
        ballon: (t, P) => {
          if (t < 0.7) return porte(P("najib", t), 0.35, 0.15);
          if (t < 1.0) return passe(porte(P("najib", 0.7), 0.35, 0.15), porte(P("mehdi", 1.0), 0.3, -0.1), (t - 0.7) / 0.3);
          if (t < 1.35) return porte(P("mehdi", t), 0.35, -0.1);
          if (t < 1.6) {
            const s = (t - 1.35) / 0.25;
            const depart = porte(P("mehdi", 1.35), 0.4, -0.1);
            return { x: depart.x + (30.5 - depart.x) * s, y: depart.y + (6.9 - depart.y) * s, z: 0.15 + 1.1 * s - 0.45 * s * s };
          }
          const s = clamp01((t - 1.6) / 0.6);
          return { x: 30.5 + 0.45 * Math.sin(s * 1.6), y: 6.9 + 0.1 * s, z: Math.max(0, 0.8 * (1 - s) * (1 - s)) };
        },
        filet: (t) => (t < 1.6 ? 0 : Math.exp(-(t - 1.6) * 5) * Math.sin((t - 1.6) * 20) * 0.6 + Math.exp(-(t - 1.6) * 3) * 0.5),
      },
      defense: {
        duree: 1.7,
        joueurs: {
          mohamed: [[0, 10.5, 6.2], [0.6, 8.6, 6.8], [1.0, 7.9, 7.1], [1.7, 7.6, 7.6]],
          theo: [[0, 6.6, 9.4], [0.6, 7.8, 8.0], [0.85, 8.2, 7.2], [1.7, 10.6, 6.0]],
          karim: [[0, 13.0, 9.5], [1.7, 11.4, 9.8]], yousri: [[0, 12.4, 3.4], [1.7, 10.4, 3.2]],
          damir: [[0, 14.6, 12.0], [1.7, 12.6, 11.6]], yassine: [[0, 26.0, 7.5], [1.7, 25.4, 7.4]],
          mehdi: [[0, 12.2, 5.4], [1.7, 13.4, 5.0]], najib: [[0, 6.6, 4.0], [1.7, 7.6, 4.4]],
          nadyr: [[0, 5.2, 10.2], [1.7, 6.0, 9.6]], anthony: [[0, 1.4, 7.4], [1.7, 1.6, 7.2]],
        },
        ballon: (t, P) => (t < 0.85 ? porte(P("mohamed", t), -0.4, 0.1) : porte(P("theo", t), 0.45, -0.15)),
      },
    };

    function porte(p, dx, dy) {
      return { x: p.x + dx, y: p.y + dy, z: 0 };
    }
    function passe(a, b, s) {
      const e = 1 - Math.pow(1 - clamp01(s), 1.6);
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z: 0.05 };
    }
    /** Interpolation de Hermite sur des points datés [t, x, y]. */
    function interpole(points, t) {
      const n = points.length;
      if (n === 1 || t <= points[0][0]) return { x: points[0][1], y: points[0][2] };
      if (t >= points[n - 1][0]) return { x: points[n - 1][1], y: points[n - 1][2] };
      let i = 0;
      while (t > points[i + 1][0]) i++;
      const p0 = points[i], p1 = points[i + 1];
      const avant = points[i - 1] ?? p0, apres = points[i + 2] ?? p1;
      const h = p1[0] - p0[0];
      const s = (t - p0[0]) / h;
      const pente = (a, b, k) => (b[k] - a[k]) / Math.max(1e-6, b[0] - a[0]);
      const m0x = pente(avant, p1, 1), m0y = pente(avant, p1, 2);
      const m1x = pente(p0, apres, 1), m1y = pente(p0, apres, 2);
      const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s;
      const h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
      return {
        x: h00 * p0[1] + h10 * h * m0x + h01 * p1[1] + h11 * h * m1x,
        y: h00 * p0[2] + h10 * h * m0y + h01 * p1[2] + h11 * h * m1y,
      };
    }

    const horloge = (s) => {
      const total = Math.floor(s);
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
    };
    const LONGUEUR = 3738;
    const tempsEl = q("#v-temps");
    const luEl = q("#v-lu");
    const teteEl = q("#v-tete");
    const ordre = Object.keys(acteurs);

    hook((t) => {
      if (t < 19.4 || t > 25.8) return;
      let clip, tau, affiche;
      let cadrage;
      if (t < 21.42) [clip, tau, affiche, cadrage] = [CLIPS.jeu, t - 19.85, 845, CADRAGES.jeu];
      else if (t < 24.09) [clip, tau, affiche, cadrage] = [CLIPS.but, t - 21.45, 41, CADRAGES.but];
      else [clip, tau, affiche, cadrage] = [CLIPS.defense, t - 24.12, 72, CADRAGES.defense];
      if (plan.style.transform !== cadrage) plan.style.transform = cadrage;
      tau = Math.max(0, Math.min(clip.duree, tau));
      const P = (id, instant) => interpole(clip.joueurs[id], instant);
      ordre.forEach((id, k) => {
        const p = P(id, tau);
        const q2 = P(id, tau + 0.04);
        const vitesse = Math.hypot(q2.x - p.x, q2.y - p.y) / 0.04;
        const el = acteurs[id];
        el.style.transform = `translate3d(${p.x * 10}px, ${p.y * 10}px, 0)`;
        const angle = Math.sin(tau * 15 + k * 1.7) * Math.min(1, vitesse / 3.5) * 26;
        const svg = el.firstElementChild.nextElementSibling.firstElementChild;
        svg.querySelector(".jambe-g").setAttribute("transform", `rotate(${angle} 3.1 11.6)`);
        svg.querySelector(".jambe-d").setAttribute("transform", `rotate(${-angle} 4.9 11.6)`);
        svg.querySelector(".bras-g").setAttribute("transform", `rotate(${-angle * 0.8} 2 5)`);
        svg.querySelector(".bras-d").setAttribute("transform", `rotate(${angle * 0.8} 6 5)`);
        svg.style.transform = `translateY(${-Math.abs(Math.sin(tau * 15 + k * 1.7)) * Math.min(1, vitesse / 3.5) * 0.6}px)`;
      });
      const b = clip.ballon(tau, P);
      ballon.style.transform = `translate3d(${b.x * 10}px, ${b.y * 10}px, 0)`;
      ballon.querySelector(".ballon").style.transform = `translateY(${-b.z * 10}px)`;
      const bombe = clip.filet ? clip.filet(tau) : 0;
      fondBut.style.transform = transformFondBut.replace(/translate3d\(([-\d.]+)px/, (m, x) => `translate3d(${parseFloat(x) + bombe * 6}px`);
      const temps = affiche + tau;
      tempsEl.textContent = horloge(temps);
      luEl.style.width = `${(temps / LONGUEUR) * 100}%`;
      teteEl.style.left = `${(temps / LONGUEUR) * 100}%`;
    });
  }
})();
