import type { PlayerPosition } from "./constants.js";

/**
 * Le cinq type d'un club (CLUB-001).
 *
 * « Cinq » et non « onze » : le futsal se joue à cinq, gardien compris, et
 * emprunter le mot du football à onze à une application de futsal était une
 * étourderie.
 *
 * **Et cinq emplacements, pas quatre.** La première version n'en montrait que
 * quatre — un par statistique — au motif que le cinquième joueur de champ n'en
 * porte aucune qui lui soit propre. Le terrain démentait alors son propre
 * titre : on lisait « le cinq type » au-dessus de quatre cartes. Le futsal
 * s'aligne en gardien, fixo, **deux ailes** et pivot ; la seconde aile revient
 * donc au deuxième passeur du club. Rien n'est inventé pour combler un trou :
 * c'est la composition réelle de ce sport.
 *
 * Les règles vivent ici, pures et testables, plutôt que dans l'écran : ce que
 * le terrain montre est une affirmation sur l'effectif, et une affirmation se
 * vérifie.
 */

/** Les cinq emplacements, du but à la pointe : c'est l'ordre d'affichage. */
export const LINEUP_SLOTS = ["GB", "DEF", "AILE_G", "AILE_D", "ATT"] as const;
export type LineupSlot = (typeof LINEUP_SLOTS)[number];

/**
 * Le poste déclaré qui correspond à chaque emplacement.
 *
 * Les deux ailes partagent le même : un joueur qui s'est dit milieu est chez
 * lui sur l'une comme sur l'autre. Cette table sert au départage à statistique
 * égale, et à rien d'autre — les emplacements de champ restent attribués par
 * les chiffres, pas par le poste qu'on se donne.
 */
const SLOT_POSITION: Record<LineupSlot, PlayerPosition> = {
  GB: "GB",
  DEF: "DEF",
  AILE_G: "MIL",
  AILE_D: "MIL",
  ATT: "ATT",
};

/**
 * L'ordre dans lequel les postes se servent — qui n'est pas celui du terrain.
 *
 * Un même joueur mène souvent deux classements, et le premier poste servi
 * l'emporte : l'ordre décide donc du terrain. C'est celui du titre le plus
 * parlant vers le moins parlant — buteur, passeur, défenseur, gardien.
 *
 * Les arrêts viennent en dernier parce que c'est la statistique la plus
 * creuse d'un effectif de futsal : un joueur de champ en compte un ou deux
 * par saison sans être gardien pour autant. Servis en premier, ils envoyaient
 * dans les buts le meilleur défenseur du club — cinquante-cinq défenses, deux
 * arrêts — et laissaient la défense à quelqu'un qui en avait treize. Servis
 * en dernier, ils ne prennent que ce dont personne d'autre n'a besoin.
 *
 * La **seconde aile** passe après la défense, et non juste après la première :
 * « meilleur défenseur du club » est un titre plus fort que « deuxième
 * passeur ». L'ordre des quatre emplacements d'origine est ainsi inchangé —
 * le cinquième ne prend que ce qui reste, il ne déplace personne.
 *
 * Cet ordre ne s'applique qu'**après** le tour des gardiens déclarés
 * (`claimGoal`) : sans quoi il produisait la faute inverse, décrite là-bas.
 */
const FILL_ORDER: readonly LineupSlot[] = [
  "ATT",
  "AILE_G",
  "DEF",
  "AILE_D",
  "GB",
];

export const LINEUP_SLOT_LABELS: Record<LineupSlot, string> = {
  GB: "Gardien",
  DEF: "Défense",
  AILE_G: "Aile",
  AILE_D: "Aile",
  ATT: "Attaque",
};

/**
 * Ce qui désigne le meilleur à chaque poste, et le mot qui l'accompagne.
 *
 * Le singulier est porté ici plutôt que reconstruit à l'écran : « 1 arrêts »
 * est le genre de détail qui fait douter du reste.
 */
export const LINEUP_SLOT_STAT: Record<
  LineupSlot,
  {
    key: "saves" | "defenses" | "assists" | "goals";
    label: string;
    one: string;
  }
> = {
  GB: { key: "saves", label: "arrêts", one: "arrêt" },
  DEF: { key: "defenses", label: "défenses", one: "défense" },
  AILE_G: { key: "assists", label: "passes", one: "passe" },
  AILE_D: { key: "assists", label: "passes", one: "passe" },
  ATT: { key: "goals", label: "buts", one: "but" },
};

/** Le minimum qu'un joueur doit porter pour figurer sur le terrain. */
export interface LineupCandidate {
  id: number;
  position: PlayerPosition;
  goals: number;
  assists: number;
  defenses: number;
  saves: number;
  matchesPlayed: number;
  rating: number;
}

export interface LineupPick<T> {
  slot: LineupSlot;
  label: string;
  /** `null` quand personne ne peut occuper le poste. */
  player: T | null;
  /** La statistique qui l'a désigné, pour l'afficher sous la carte. */
  value: number;
  statLabel: string;
}

/**
 * Compose le terrain.
 *
 * Trois règles, et chacune répare un affichage qui mentirait :
 *
 *  - **un joueur n'occupe qu'un poste.** Le meilleur buteur est souvent le
 *    meilleur passeur ; le montrer deux fois donnerait un terrain à deux
 *    joueurs et laisserait croire que le club n'a personne d'autre ;
 *  - **les postes se servent dans un ordre fixe** — celui de `FILL_ORDER`,
 *    par force du titre et non par position sur le terrain. Sans ordre fixe,
 *    le même effectif donnerait deux compositions différentes selon l'ordre
 *    de lecture de la base ;
 *  - **le gardien déclaré garde les buts, avant tout le reste.** Gardien est
 *    un rôle, pas un classement : on ne monte pas son portier en défense
 *    parce qu'il y a bien récupéré de ballons. Les trois postes de champ,
 *    eux, restent statistiques — qui marque le plus est l'attaquant, quel que
 *    soit le poste qu'il s'est donné. À statistique égale seulement, le poste
 *    déclaré départage : un attaquant qui a fait trois arrêts a dépanné.
 *
 * Un poste sans candidat reste vide plutôt que d'être comblé par quelqu'un
 * qui n'a jamais joué : une carte à zéro n'est pas une mise en avant.
 */
export function composeLineup<T extends LineupCandidate>(
  players: readonly T[],
): LineupPick<T>[] {
  const taken = new Set<number>();
  const picked = new Map<LineupSlot, LineupPick<T>>();

  /*
   * Le tour du gardien, avant les autres.
   *
   * Un club qui a un vrai portier le voyait partir en défense : il touche
   * beaucoup de ballons, donc il mène souvent le compte des défenses, et la
   * défense se sert avant les buts. Le club d'essai l'a montré sans appel —
   * cent quarante-cinq arrêts sur le banc de la défense, et les buts gardés
   * par un défenseur qui en avait deux.
   *
   * Le correctif ne consiste pas à remonter les arrêts dans l'ordre de
   * service : ce serait rouvrir la faute inverse, où deux arrêts de dépannage
   * volent le meilleur défenseur d'un club qui n'a pas de gardien. Il
   * consiste à traiter le poste pour ce qu'il est — un rôle qu'on déclare, et
   * non un classement qu'on gagne.
   */
  const keeper = claimGoal(players);
  if (keeper) taken.add(keeper.id);

  for (const slot of FILL_ORDER) {
    if (slot === "GB" && keeper) {
      picked.set("GB", describe("GB", keeper));
      continue;
    }

    const { key, label, one } = LINEUP_SLOT_STAT[slot];

    const eligible = players.filter(
      (player) => !taken.has(player.id) && player[key] > 0,
    );

    const best = eligible.reduce<T | null>((champion, player) => {
      if (!champion) return player;

      const mine = player[key];
      const theirs = champion[key];
      if (mine !== theirs) return mine > theirs ? player : champion;

      // Départages successifs : le poste déclaré, puis la note, puis
      // l'identifiant. Sans ce dernier, deux effectifs identiques donneraient
      // deux terrains différents d'un chargement à l'autre.
      const mineAtHome = player.position === SLOT_POSITION[slot];
      const theirsAtHome = champion.position === SLOT_POSITION[slot];
      if (mineAtHome !== theirsAtHome) return mineAtHome ? player : champion;

      if (player.rating !== champion.rating) {
        return player.rating > champion.rating ? player : champion;
      }
      return player.id < champion.id ? player : champion;
    }, null);

    if (best) taken.add(best.id);
    picked.set(slot, describe(slot, best));
  }

  // Rendu dans l'ordre du terrain : le but d'abord, la pointe en dernier.
  return LINEUP_SLOTS.map((slot) => picked.get(slot)!);
}

/** Un emplacement du terrain et le joueur que le club y a mis (CLUB-002). */
export interface LineupAssignment {
  slot: LineupSlot;
  playerId: number;
}

/**
 * Le terrain tel qu'il doit s'afficher : ce que le club a choisi, sinon ce
 * que disent les chiffres.
 *
 * **La composition enregistrée l'emporte entièrement**, y compris sur ses
 * trous. Un club qui n'a placé que son gardien voit quatre emplacements
 * vides, et c'est voulu : compléter le reste à la statistique ferait
 * apparaître des joueurs que personne n'a alignés, et retirer une carte en
 * ferait aussitôt surgir une autre. Une composition partielle est une
 * composition ; elle se complète en la modifiant.
 *
 * Un joueur aligné puis parti du club ne figure plus dans `players` : son
 * emplacement retombe vide, sans que la ligne soit effacée — il peut revenir.
 *
 * Sans aucune composition, rien ne change : le terrain reste la déduction
 * d'avant, et un club qui ne s'en occupe pas n'a rien à faire.
 */
export function resolveLineup<T extends LineupCandidate>(
  players: readonly T[],
  stored: readonly LineupAssignment[],
): LineupPick<T>[] {
  return stored.length === 0
    ? composeLineup(players)
    : lineupFromAssignments(players, stored);
}

/**
 * Le terrain tel qu'une composition le dessine, sans repli statistique.
 *
 * Distinct de `resolveLineup` pour un cas précis : l'écran de composition.
 * Là-bas, vider le dernier emplacement doit donner un terrain vide — et non
 * faire surgir cinq joueurs que personne n'a alignés, ce qui laisserait
 * croire que le geste a échoué. La lecture, elle, veut bien le repli : un
 * club qui n'a rien composé mérite mieux qu'un terrain nu.
 */
export function lineupFromAssignments<T extends LineupCandidate>(
  players: readonly T[],
  stored: readonly LineupAssignment[],
): LineupPick<T>[] {
  const taken = new Set<number>();

  return LINEUP_SLOTS.map((slot) => {
    const assignment = stored.find((entry) => entry.slot === slot);
    if (!assignment) return describe<T>(slot, null);

    /*
     * Un joueur ne s'affiche qu'une fois, et c'est le premier emplacement de
     * l'ordre du terrain qui le garde. La base tient déjà la règle — un index
     * unique par club et par joueur —, mais une composition lue ailleurs
     * qu'en base n'a pas cette garantie, et deux cartes identiques sur un
     * terrain donneraient un effectif imaginaire.
     */
    if (taken.has(assignment.playerId)) return describe<T>(slot, null);

    const player = players.find(
      (candidate) => candidate.id === assignment.playerId,
    );
    if (!player) return describe<T>(slot, null);

    taken.add(player.id);
    return describe(slot, player);
  });
}

/**
 * Le meilleur des gardiens déclarés, s'il y en a un qui a arrêté quelque
 * chose.
 *
 * Personne ne se déclare gardien, ou aucun n'a le moindre arrêt : la fonction
 * rend `null`, et le poste retombe dans l'ordre de service ordinaire — servi
 * en dernier, il n'y prendra que ce dont les autres n'ont pas besoin.
 */
function claimGoal<T extends LineupCandidate>(
  players: readonly T[],
): T | null {
  return players
    .filter((player) => player.position === "GB" && player.saves > 0)
    .reduce<T | null>((champion, player) => {
      if (!champion) return player;
      if (player.saves !== champion.saves) {
        return player.saves > champion.saves ? player : champion;
      }
      if (player.rating !== champion.rating) {
        return player.rating > champion.rating ? player : champion;
      }
      return player.id < champion.id ? player : champion;
    }, null);
}

/** La carte d'un poste, telle que l'écran l'affiche. */
function describe<T extends LineupCandidate>(
  slot: LineupSlot,
  player: T | null,
): LineupPick<T> {
  const { key, label, one } = LINEUP_SLOT_STAT[slot];
  return {
    slot,
    label: LINEUP_SLOT_LABELS[slot],
    player,
    value: player ? player[key] : 0,
    statLabel: player && player[key] === 1 ? one : label,
  };
}

/**
 * Comment classer l'effectif sous le terrain.
 *
 * La note de carte d'abord : c'est le chiffre que le joueur regarde, et celui
 * que la ligue met en avant partout ailleurs. Les buts départagent les ex
 * æquo, puis les matchs joués — à note égale, celui qui a joué davantage l'a
 * méritée plus longtemps.
 */
export function compareForRoster(
  a: LineupCandidate,
  b: LineupCandidate,
): number {
  return (
    b.rating - a.rating ||
    b.goals - a.goals ||
    b.matchesPlayed - a.matchesPlayed ||
    a.id - b.id
  );
}
