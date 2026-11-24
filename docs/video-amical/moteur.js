/**
 * Moteur d'animation déterministe.
 *
 * L'image affichée à l'instant t ne dépend que de t : `seek(t)` recalcule
 * chaque propriété animée à partir de la liste de ses segments. Rien ne
 * dépend de l'horloge du navigateur, ce qui permet de rendre la vidéo image
 * par image, à n'importe quelle cadence, et d'obtenir deux fois la même.
 *
 * Un segment décrit une propriété qui va de `from` à `to` entre `start` et
 * `start + dur`. Pour une propriété donnée, le dernier segment commencé
 * l'emporte ; avant le premier, elle vaut son `from`.
 */
(function () {
  const easings = {
    linear: (p) => p,
    in2: (p) => p * p,
    out2: (p) => 1 - (1 - p) * (1 - p),
    inOut2: (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
    in3: (p) => p * p * p,
    out3: (p) => 1 - Math.pow(1 - p, 3),
    inOut3: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    in4: (p) => p * p * p * p,
    out4: (p) => 1 - Math.pow(1 - p, 4),
    inOut4: (p) => (p < 0.5 ? 8 * p ** 4 : 1 - Math.pow(-2 * p + 2, 4) / 2),
    out5: (p) => 1 - Math.pow(1 - p, 5),
    inExpo: (p) => (p === 0 ? 0 : Math.pow(2, 10 * p - 10)),
    outExpo: (p) => (p === 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inOutExpo: (p) =>
      p === 0
        ? 0
        : p === 1
          ? 1
          : p < 0.5
            ? Math.pow(2, 20 * p - 10) / 2
            : (2 - Math.pow(2, -20 * p + 10)) / 2,
    outBack: (p) => {
      const c1 = 1.70158;
      return 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    },
    outBackSoft: (p) => {
      const c1 = 0.9;
      return 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    },
    outBackStrong: (p) => {
      const c1 = 2.6;
      return 1 + (c1 + 1) * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
    },
    outElastic: (p) =>
      p === 0
        ? 0
        : p === 1
          ? 1
          : Math.pow(2, -10 * p) * Math.sin(((p * 10 - 0.75) * 2 * Math.PI) / 3) + 1,
  };

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, p) => a + (b - a) * p;

  /** Valeur de repos de chaque propriété, quand aucun segment ne la précède. */
  const REPOS = {
    x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sk: 0, s: 1, sx: 1, sy: 1,
    opacity: 1, blur: 0, bright: 1, sat: 1, ct: 0, cr: 0, cb: 0, cl: 0,
  };
  const TRANSFORM = ["x", "y", "z", "rx", "ry", "rz", "sk", "s", "sx", "sy"];
  const FILTRE = ["blur", "bright", "sat"];
  const DECOUPE = ["ct", "cr", "cb", "cl"];

  /** el → { propriété → [segments] } */
  const pistes = new Map();
  /** Fonctions appelées à chaque image, après les propriétés. */
  const crochets = [];
  /** Scènes : visibles seulement sur leur intervalle. */
  const scenes = [];

  function cibles(cible) {
    if (typeof cible === "string") return [...document.querySelectorAll(cible)];
    if (Array.isArray(cible) || cible instanceof NodeList) return [...cible];
    return [cible];
  }

  /**
   * Anime une ou plusieurs cibles.
   *   A(".titre", 1.2, 0.5, { y: [40, 0], opacity: [0, 1] }, "out3")
   * Une valeur seule (`{ opacity: 0 }`) part de la valeur précédente.
   */
  function A(cible, start, dur, props, ease = "out3", decalage = 0) {
    const fonction = typeof ease === "function" ? ease : easings[ease];
    if (!fonction) throw new Error(`Courbe inconnue : ${ease}`);
    cibles(cible).forEach((el, index) => {
      if (!el) return;
      let parEl = pistes.get(el);
      if (!parEl) pistes.set(el, (parEl = {}));
      for (const [cle, valeur] of Object.entries(props)) {
        const segments = (parEl[cle] ??= []);
        const precedent = segments.length
          ? segments[segments.length - 1].to
          : (REPOS[cle] ?? 0);
        const [from, to] = Array.isArray(valeur) ? valeur : [precedent, valeur];
        segments.push({
          start: start + index * decalage,
          dur,
          from,
          to,
          ease: fonction,
        });
        segments.sort((a, b) => a.start - b.start);
      }
    });
  }

  /** Pose des valeurs à un instant précis, sans transition. */
  function set(cible, instant, props) {
    const fixes = {};
    for (const [cle, valeur] of Object.entries(props)) fixes[cle] = [valeur, valeur];
    A(cible, instant, 0, fixes, "linear");
  }

  function valeurA(segments, t) {
    let v = segments[0].from;
    for (const s of segments) {
      if (t < s.start) break;
      const p = s.dur <= 0 ? 1 : clamp01((t - s.start) / s.dur);
      v = lerp(s.from, s.to, s.ease(p));
    }
    return v;
  }

  function appliquer(el, v) {
    const style = el.style;
    if (TRANSFORM.some((k) => k in v)) {
      const g = (k) => (k in v ? v[k] : REPOS[k]);
      const base = el.dataset.base ? `${el.dataset.base} ` : "";
      style.transform =
        `${base}translate3d(${g("x")}px, ${g("y")}px, ${g("z")}px) ` +
        `rotateX(${g("rx")}deg) rotateY(${g("ry")}deg) rotate(${g("rz")}deg) ` +
        `skewX(${g("sk")}deg) scale(${g("s") * g("sx")}, ${g("s") * g("sy")})`;
    }
    if ("opacity" in v) style.opacity = String(Math.max(0, Math.min(1, v.opacity)));
    if (FILTRE.some((k) => k in v)) {
      const parties = [];
      if ("blur" in v && v.blur > 0.01) parties.push(`blur(${v.blur}px)`);
      if ("bright" in v && v.bright !== 1) parties.push(`brightness(${v.bright})`);
      if ("sat" in v && v.sat !== 1) parties.push(`saturate(${v.sat})`);
      style.filter = parties.join(" ") || "none";
    }
    if (DECOUPE.some((k) => k in v)) {
      const g = (k) => (k in v ? v[k] : 0);
      style.clipPath = `inset(${g("ct")}% ${g("cr")}% ${g("cb")}% ${g("cl")}%)`;
    }
    if ("w" in v) style.width = `${v.w}px`;
    if ("h" in v) style.height = `${v.h}px`;
    if ("dash" in v) style.strokeDashoffset = String(v.dash);
    for (const cle of Object.keys(v)) {
      if (cle.startsWith("--")) style.setProperty(cle, String(v[cle]));
    }
  }

  function seek(t) {
    for (const scene of scenes) {
      const visible = t >= scene.a && t < scene.b;
      scene.el.style.display = visible ? "" : "none";
    }
    for (const [el, props] of pistes) {
      const v = {};
      for (const [cle, segments] of Object.entries(props)) v[cle] = valeurA(segments, t);
      appliquer(el, v);
    }
    for (const crochet of crochets) crochet(t);
  }

  /** La valeur d'une propriété animée à l'instant t (pour les crochets). */
  function valeur(el, cle, t) {
    const segments = pistes.get(el)?.[cle];
    return segments ? valeurA(segments, t) : (REPOS[cle] ?? 0);
  }

  /** Une fonction appelée à chaque image (compteurs, simulation…). */
  function hook(fonction) {
    crochets.push(fonction);
  }

  function scene(cible, a, b) {
    for (const el of cibles(cible)) scenes.push({ el, a, b });
  }

  /** Coupe un texte en lettres (ou en mots) animables séparément. */
  function split(cible, mode = "lettres") {
    const toutes = [];
    for (const el of cibles(cible)) {
      const texte = el.textContent;
      el.textContent = "";
      const morceaux = mode === "mots" ? texte.split(/(\s+)/) : [...texte];
      for (const morceau of morceaux) {
        if (/^\s+$/.test(morceau)) {
          el.append(document.createTextNode(morceau));
          continue;
        }
        const span = document.createElement("span");
        span.className = "morceau";
        span.textContent = morceau;
        el.append(span);
        toutes.push(span);
      }
    }
    return toutes;
  }

  /** Un nombre qui défile de `de` à `a`. */
  function compteur(el, start, dur, de, a, ease = "out3", format = (n) => String(n)) {
    const fonction = easings[ease];
    hook((t) => {
      const p = clamp01((t - start) / dur);
      const n = Math.round(lerp(de, a, fonction(p)));
      const texte = format(n);
      if (el.textContent !== texte) el.textContent = texte;
    });
  }

  /** Générateur pseudo-aléatoire reproductible (mulberry32). */
  function hasard(graine) {
    let a = graine >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  window.M = { A, set, hook, scene, split, compteur, hasard, valeur, easings, clamp01, lerp };
  window.seek = seek;
})();
