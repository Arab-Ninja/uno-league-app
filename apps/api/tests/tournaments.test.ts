import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import {
  createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Tournois entre SQUADs (TOUR-001 à TOUR-004).
 *
 * Ce qui est vérifié ici n'est pas qu'un tournoi se crée, mais qu'aucune
 * séquence ne permette de fausser le tableau ou la caisse : engager un club
 * dont on n'est pas capitaine, s'inscrire deux fois, remplir un plateau
 * au-delà de sa taille, faire avancer un club qui n'a pas gagné, ou repartir
 * avec un droit d'engagement qu'on a pourtant joué.
 */

interface Club {
  founder: TestPlayer;
  member: TestPlayer;
  squadId: number;
  name: string;
}

/** Fonde un club et alimente sa caisse par le vrai chemin. */
async function club(name: string, treasury: number): Promise<Club> {
  const founder = await createPlayer();
  const squad = await founder.caller.squads.create({ name });

  const member = await createPlayer();
  await member.caller.squads.requestToJoin({ squadId: squad.id });
  const detail = await founder.caller.squads.detail({ squadId: squad.id });
  await founder.caller.squads.decideRequest({
    requestId: detail.pendingRequests[0]!.id,
    accept: true,
  });

  if (treasury > 0) {
    await grantUno(founder.identity.playerId, treasury);
    await founder.caller.squads.contribute({
      squadId: squad.id,
      amount: treasury,
    });
  }

  return { founder, member, squadId: squad.id, name };
}

async function treasuryOf(
  squadId: number,
): Promise<{ available: number; locked: number }> {
  const rows = await db.execute<{ a: number; l: number }>(
    sql`SELECT treasury_available AS a, treasury_locked AS l FROM squads WHERE id = ${squadId}`,
  );
  const row = (rows[0] as unknown as { a: number; l: number }[])[0]!;
  return { available: Number(row.a), locked: Number(row.l) };
}

/** Fixe la cote d'un club, pour rendre les têtes de série prévisibles. */
async function setRating(squadId: number, rating: number): Promise<void> {
  await db.execute(
    sql`UPDATE squads SET rating = ${rating} WHERE id = ${squadId}`,
  );
}

const ENTRY_FEE = 200;
const PRIZE = 1000;

async function openTournament(
  admin: TestPlayer,
  size: 4 | 8,
  options: { entryFeeUno?: number; prizeUno?: number } = {},
) {
  return admin.caller.tournaments.create({
    name: `Coupe des clubs ${size}`,
    date: daysFromNow(9),
    slotStartHour: 18,
    venueId: "arena",
    size,
    entryFeeUno: options.entryFeeUno ?? ENTRY_FEE,
    prizeUno: options.prizeUno ?? PRIZE,
  });
}

describe("tournois entre SQUADs (TOUR-001)", () => {
  beforeEach(resetDatabase);

  it("TOUR-001 — un tournoi s'ouvre avec ses paramètres et son plateau vide", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 8);

    expect(tournament.status).toBe("open");
    expect(tournament.size).toBe(8);
    expect(tournament.entryCount).toBe(0);
    expect(tournament.entryFeeUno).toBe(ENTRY_FEE);
    expect(tournament.prizeUno).toBe(PRIZE);
    // La salle vient de la base, pas du client : son nom en est la preuve.
    expect(tournament.venueName).not.toBe("");

    // Le préavis des tournois : une semaine, le temps qu'un plateau de clubs
    // entiers se remplisse (TOUR-006).
    await expect(
      admin.caller.tournaments.create({
        name: "Coupe de demain",
        date: daysFromNow(1),
        slotStartHour: 18,
        venueId: "arena",
        size: 4,
        entryFeeUno: 0,
        prizeUno: 0,
      }),
    ).rejects.toThrow(/à l'avance/);
  });

  it("TOUR-001 — créer, tirer et saisir sont réservés à l'administration", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4);
    const outsider = await createPlayer();

    await expect(
      outsider.caller.tournaments.create({
        name: "Ma coupe à moi",
        date: daysFromNow(9),
        slotStartHour: 18,
        venueId: "arena",
        size: 4,
        entryFeeUno: 0,
        prizeUno: 0,
      }),
    ).rejects.toThrow(/droits nécessaires/i);

    await expect(
      outsider.caller.tournaments.draw({ tournamentId: tournament.id }),
    ).rejects.toThrow(/droits nécessaires/i);
    await expect(
      outsider.caller.tournaments.cancel({ tournamentId: tournament.id }),
    ).rejects.toThrow(/droits nécessaires/i);
  });

  it("TOUR-002 — l'engagement séquestre le droit et n'appartient qu'aux dirigeants", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4);
    const one = await club("Les Aigles", 1000);

    // Un simple membre n'engage ni le nom du club ni sa caisse.
    await expect(
      one.member.caller.tournaments.register({ tournamentId: tournament.id }),
    ).rejects.toThrow(/fondateur|capitaine/i);

    const before = await treasuryOf(one.squadId);
    const after = await one.founder.caller.tournaments.register({
      tournamentId: tournament.id,
    });

    expect(after.entryCount).toBe(1);
    expect(after.viewer.isRegistered).toBe(true);
    expect(after.viewer.mayRegister).toBe(false);

    // Le droit est séquestré, pas dépensé : il quitte le disponible pour la
    // part engagée, et le total du club ne bouge pas.
    const treasury = await treasuryOf(one.squadId);
    expect(treasury.available).toBe(before.available - ENTRY_FEE);
    expect(treasury.locked).toBe(before.locked + ENTRY_FEE);

    // Deux engagements donneraient deux places dans le tableau.
    await expect(
      one.founder.caller.tournaments.register({ tournamentId: tournament.id }),
    ).rejects.toThrow(/déjà engagé/i);
  });

  it("TOUR-002 — une caisse trop maigre ne s'engage pas, et rien n'est écrit", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4);
    const poor = await club("Les Fauchés", ENTRY_FEE - 1);

    await expect(
      poor.founder.caller.tournaments.register({ tournamentId: tournament.id }),
    ).rejects.toThrow(/trésorerie/i);

    // L'inscription et le mouvement sont dans la même transaction : un refus
    // ne laisse ni ligne d'engagement ni caisse entamée.
    const detail = await admin.caller.tournaments.get({
      tournamentId: tournament.id,
    });
    expect(detail.entries).toHaveLength(0);
    expect((await treasuryOf(poor.squadId)).locked).toBe(0);
  });

  it("TOUR-002 — le retrait rend le droit, tant que le tableau n'est pas tiré", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4);
    const one = await club("Les Aigles", 1000);

    await one.founder.caller.tournaments.register({
      tournamentId: tournament.id,
    });
    const engaged = await treasuryOf(one.squadId);

    await one.founder.caller.tournaments.withdraw({
      tournamentId: tournament.id,
    });

    const back = await treasuryOf(one.squadId);
    expect(back.available).toBe(engaged.available + ENTRY_FEE);
    expect(back.locked).toBe(0);

    // Et l'on peut revenir sur sa décision : un second engagement est une
    // nouvelle inscription, pas le rejeu de la première. La clé d'idempotence
    // porte donc l'inscription, sans quoi ce droit-ci passerait pour déjà
    // versé — et le club serait rentré sans payer, ou refoulé au motif qu'il
    // était « déjà engagé ».
    await one.founder.caller.tournaments.register({
      tournamentId: tournament.id,
    });

    const again = await treasuryOf(one.squadId);
    expect(again.locked).toBe(ENTRY_FEE);
    expect(again.available).toBe(engaged.available);
  });

  it("TOUR-003 — le plateau se remplit, puis se ferme", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4);

    const clubs: Club[] = [];
    for (let i = 0; i < 5; i++) {
      clubs.push(await club(`Club ${i}`, 1000));
    }

    for (const entrant of clubs.slice(0, 4)) {
      await entrant.founder.caller.tournaments.register({
        tournamentId: tournament.id,
      });
    }

    // Le quatrième engagement complète le plateau et tire le tableau : le
    // cinquième arrive donc devant une porte déjà close.
    await expect(
      clubs[4]!.founder.caller.tournaments.register({
        tournamentId: tournament.id,
      }),
    ).rejects.toThrow(/déjà tiré/i);
  });

  it("TOUR-003 — le tirage apparie par les deux bouts et dessine tout le tableau", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4);

    const clubs: Club[] = [];
    for (let i = 0; i < 4; i++) {
      clubs.push(await club(`Club ${i}`, 1000));
    }
    // Cotes distinctes : 1400, 1300, 1200, 1100.
    for (const [index, entrant] of clubs.entries()) {
      await setRating(entrant.squadId, 1400 - index * 100);
    }
    for (const entrant of clubs) {
      await entrant.founder.caller.tournaments.register({
        tournamentId: tournament.id,
      });
    }

    // Un plateau incomplet ne se tire pas : le tableau aurait des trous.
    const half = await openTournament(admin, 8);
    await expect(
      admin.caller.tournaments.draw({ tournamentId: half.id }),
    ).rejects.toThrow(/pas complet/i);

    // Le quatrième engagement a tiré le tableau tout seul (TOUR-005).
    const drawn = await admin.caller.tournaments.get({
      tournamentId: tournament.id,
    });

    expect(drawn.status).toBe("drawn");
    // Quatre clubs : demi-finales puis finale, jamais de quarts fantômes.
    expect(drawn.rounds.map((round) => round.round)).toEqual(["semi", "final"]);
    // Un tableau complet compte une affiche de moins que de clubs.
    expect(drawn.matches).toHaveLength(3);

    const semis = drawn.matches.filter((match) => match.round === "semi");
    expect(semis).toHaveLength(2);
    // Tête de série 1 contre tête de série 4, 2 contre 3 : sans cela, les deux
    // meilleurs clubs peuvent se croiser d'entrée.
    expect(semis[0]!.home?.id).toBe(clubs[0]!.squadId);
    expect(semis[0]!.away?.id).toBe(clubs[3]!.squadId);
    expect(semis[1]!.home?.id).toBe(clubs[1]!.squadId);
    expect(semis[1]!.away?.id).toBe(clubs[2]!.squadId);

    // La finale existe déjà, vide : l'écran montre le chemin dès le tirage.
    const final = drawn.matches.find((match) => match.round === "final")!;
    expect(final.home).toBeNull();
    expect(final.away).toBeNull();

    // Une fois tiré, le plateau est clos.
    const latecomer = await club("Les Retardataires", 1000);
    await expect(
      latecomer.founder.caller.tournaments.register({
        tournamentId: tournament.id,
      }),
    ).rejects.toThrow(/déjà tiré/i);
  });

  it("TOUR-003 — le vainqueur avance, et la dotation va au club qui gagne", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4);

    const clubs: Club[] = [];
    for (let i = 0; i < 4; i++) {
      clubs.push(await club(`Club ${i}`, 1000));
      await setRating(clubs[i]!.squadId, 1400 - i * 100);
    }
    for (const entrant of clubs) {
      await entrant.founder.caller.tournaments.register({
        tournamentId: tournament.id,
      });
    }

    let view = await admin.caller.tournaments.get({
      tournamentId: tournament.id,
    });
    const semis = view.matches.filter((match) => match.round === "semi");

    // Un vainqueur qui contredit le score est une faute de saisie.
    await expect(
      admin.caller.tournaments.record({
        matchId: semis[0]!.id,
        scoreHome: 3,
        scoreAway: 1,
        winnerEntryId: view.entries.find(
          (entry) => entry.squad.id === semis[0]!.away!.id,
        )!.id,
      }),
    ).rejects.toThrow(/ne correspond pas au score/i);

    const entryOf = (squadId: number) =>
      view.entries.find((entry) => entry.squad.id === squadId)!.id;

    view = await admin.caller.tournaments.record({
      matchId: semis[0]!.id,
      scoreHome: 3,
      scoreAway: 1,
      winnerEntryId: entryOf(clubs[0]!.squadId),
    });

    // Un nul se tranche aux tirs au but : le score reste 2-2, le vainqueur est
    // désigné, et le serveur l'accepte.
    view = await admin.caller.tournaments.record({
      matchId: semis[1]!.id,
      scoreHome: 2,
      scoreAway: 2,
      winnerEntryId: entryOf(clubs[2]!.squadId),
    });

    const final = view.matches.find((match) => match.round === "final")!;
    expect(final.home?.id).toBe(clubs[0]!.squadId);
    expect(final.away?.id).toBe(clubs[2]!.squadId);

    const treasuryBefore = await treasuryOf(clubs[2]!.squadId);

    const done = await admin.caller.tournaments.record({
      matchId: final.id,
      scoreHome: 0,
      scoreAway: 2,
      winnerEntryId: entryOf(clubs[2]!.squadId),
    });

    expect(done.status).toBe("completed");
    expect(done.winner?.id).toBe(clubs[2]!.squadId);

    // Le vainqueur : son droit sort de la caisse, la dotation y entre.
    const winner = await treasuryOf(clubs[2]!.squadId);
    expect(winner.locked).toBe(0);
    expect(winner.available).toBe(treasuryBefore.available + PRIZE);

    // Les autres : ce qui est joué est dû, le droit ne revient pas.
    const loser = await treasuryOf(clubs[1]!.squadId);
    expect(loser.locked).toBe(0);
    expect(loser.available).toBe(1000 - ENTRY_FEE);

    // Un tournoi terminé ne se rejoue pas.
    await expect(
      admin.caller.tournaments.record({
        matchId: final.id,
        scoreHome: 1,
        scoreAway: 0,
        winnerEntryId: entryOf(clubs[0]!.squadId),
      }),
    ).rejects.toThrow(/terminé/i);
  });

  it("TOUR-003 — corriger un tour dont la suite est jouée est refusé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    // Huit clubs : il faut trois tours pour qu'une correction puisse laisser
    // un résultat orphelin derrière elle sans clore le tournoi.
    const tournament = await openTournament(admin, 8, { entryFeeUno: 0 });

    const clubs: Club[] = [];
    for (let i = 0; i < 8; i++) {
      clubs.push(await club(`Club ${i}`, 0));
      await setRating(clubs[i]!.squadId, 1500 - i * 50);
    }
    for (const entrant of clubs) {
      await entrant.founder.caller.tournaments.register({
        tournamentId: tournament.id,
      });
    }

    let view = await admin.caller.tournaments.get({
      tournamentId: tournament.id,
    });
    const quarters = view.matches
      .filter((match) => match.round === "quarter")
      .sort((a, b) => a.slot - b.slot);

    // Les deux premiers quarts, puis la demie qu'ils alimentent.
    for (const quarter of quarters.slice(0, 2)) {
      view = await admin.caller.tournaments.record({
        matchId: quarter.id,
        scoreHome: 2,
        scoreAway: 0,
        winnerEntryId: quarter.homeEntryId!,
      });
    }

    // Tant que la demie n'est pas jouée, le quart se corrige : rien n'en
    // dépend encore.
    view = await admin.caller.tournaments.record({
      matchId: quarters[0]!.id,
      scoreHome: 0,
      scoreAway: 3,
      winnerEntryId: quarters[0]!.awayEntryId!,
    });
    let semi = view.matches.find(
      (match) => match.round === "semi" && match.slot === 0,
    )!;
    expect(semi.homeEntryId).toBe(quarters[0]!.awayEntryId);

    view = await admin.caller.tournaments.record({
      matchId: semi.id,
      scoreHome: 1,
      scoreAway: 0,
      winnerEntryId: semi.homeEntryId!,
    });

    // La demie est jouée : reprendre le quart remplacerait un demi-finaliste
    // sans toucher au résultat de cette demie — on se retrouverait avec une
    // rencontre gagnée par un club qui n'y figure plus.
    await expect(
      admin.caller.tournaments.record({
        matchId: quarters[0]!.id,
        scoreHome: 4,
        scoreAway: 0,
        winnerEntryId: quarters[0]!.homeEntryId!,
      }),
    ).rejects.toThrow(/tour suivant est déjà joué/i);

    // Et le message dit par où commencer : la demie, elle, reste corrigible.
    await expect(
      admin.caller.tournaments.record({
        matchId: semi.id,
        scoreHome: 0,
        scoreAway: 2,
        winnerEntryId: semi.awayEntryId!,
      }),
    ).resolves.toBeTruthy();
  });

  it("TOUR-003 — une affiche sans qualifiés ne se saisit pas", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4);

    const clubs: Club[] = [];
    for (let i = 0; i < 4; i++) {
      clubs.push(await club(`Club ${i}`, 1000));
    }
    for (const entrant of clubs) {
      await entrant.founder.caller.tournaments.register({
        tournamentId: tournament.id,
      });
    }

    const view = await admin.caller.tournaments.get({
      tournamentId: tournament.id,
    });
    const final = view.matches.find((match) => match.round === "final")!;

    // Saisir la finale avant les demies écrirait un résultat entre deux
    // absents, et qualifierait un club qui n'a rien joué.
    await expect(
      admin.caller.tournaments.record({
        matchId: final.id,
        scoreHome: 1,
        scoreAway: 0,
        winnerEntryId: view.entries[0]!.id,
      }),
    ).rejects.toThrow(/attend encore ses qualifiés/i);
  });

  it("TOUR-002 — l'annulation rend son droit à chaque club engagé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4);

    const clubs: Club[] = [];
    for (let i = 0; i < 2; i++) {
      clubs.push(await club(`Club ${i}`, 1000));
      await clubs[i]!.founder.caller.tournaments.register({
        tournamentId: tournament.id,
      });
    }

    await admin.caller.tournaments.cancel({ tournamentId: tournament.id });

    for (const entrant of clubs) {
      const treasury = await treasuryOf(entrant.squadId);
      expect(treasury.locked).toBe(0);
      expect(treasury.available).toBe(1000);
    }

    const after = await admin.caller.tournaments.get({
      tournamentId: tournament.id,
    });
    expect(after.status).toBe("cancelled");
  });

  it("TOUR-004 — un joueur voit les tournois et ce qu'il peut en faire", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4);

    const one = await club("Les Aigles", 1000);
    const loner = await createPlayer();

    // Sans club, rien à engager — et la liste le dit plutôt que d'offrir un
    // bouton qui échouerait.
    const seenByLoner = await loner.caller.tournaments.list({
      mineOnly: false,
    });
    expect(seenByLoner).toHaveLength(1);
    expect(seenByLoner[0]!.viewer.squadId).toBeNull();
    expect(seenByLoner[0]!.viewer.mayRegister).toBe(false);
    await expect(
      loner.caller.tournaments.register({ tournamentId: tournament.id }),
    ).rejects.toThrow(/club/i);

    const seenByFounder = await one.founder.caller.tournaments.list({
      mineOnly: false,
    });
    expect(seenByFounder[0]!.viewer.mayRegister).toBe(true);

    // Un simple membre n'engage pas : le bouton ne lui est pas proposé non plus.
    const seenByMember = await one.member.caller.tournaments.list({
      mineOnly: false,
    });
    expect(seenByMember[0]!.viewer.mayRegister).toBe(false);

    // « Les miens » reste vide tant que le club n'est pas engagé.
    expect(
      await one.founder.caller.tournaments.list({ mineOnly: true }),
    ).toHaveLength(0);

    await one.founder.caller.tournaments.register({
      tournamentId: tournament.id,
    });
    expect(
      await one.founder.caller.tournaments.list({ mineOnly: true }),
    ).toHaveLength(1);
    // Le membre aussi voit le tournoi de son club dans « les miens ».
    expect(
      await one.member.caller.tournaments.list({ mineOnly: true }),
    ).toHaveLength(1);
  });
});

describe("propositions de tournoi par les clubs (TOUR-005)", () => {
  beforeEach(resetDatabase);

  /** Ouvre un format côté ligue. */
  async function format(
    admin: TestPlayer,
    size: 4 | 8,
    options: { entryFeeUno?: number; prizeUno?: number } = {},
  ) {
    await admin.caller.tournaments.saveFormat({
      name: size === 4 ? "Demi-finales" : "Quarts de finale",
      size,
      entryFeeUno: options.entryFeeUno ?? ENTRY_FEE,
      prizeUno: options.prizeUno ?? PRIZE,
      active: true,
    });
    const formats = await admin.caller.tournaments.formats();
    return formats.find((row) => row.size === size)!;
  }

  it("TOUR-005 — la ligue ouvre des formats, les clubs y posent des dates", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const opened = await format(admin, 4);

    expect(opened.size).toBe(4);
    expect(opened.entryFeeUno).toBe(ENTRY_FEE);
    expect(opened.prizeUno).toBe(PRIZE);
    expect(opened.openCount).toBe(0);

    const one = await club("Les Aigles", 1000);
    const proposed = await one.founder.caller.tournaments.propose({
      formatId: opened.id,
      date: daysFromNow(9),
      slotStartHour: 18,
      venueId: "arena",
    });

    // Proposer, c'est s'engager : un plateau que personne ne défend ferait
    // attendre le premier arrivant devant un club fantôme.
    expect(proposed.entryCount).toBe(1);
    expect(proposed.viewer.isRegistered).toBe(true);
    expect(proposed.size).toBe(4);
    expect(proposed.entryFeeUno).toBe(ENTRY_FEE);
    // Deux heures pleines, comme tous les tournois.
    expect(proposed.localTimeLabel).toBe("18:00 - 20:00");

    const after = await admin.caller.tournaments.allFormats();
    expect(after.find((row) => row.id === opened.id)?.openCount).toBe(1);
  });

  it("TOUR-005 — un simple membre ne propose pas au nom du club", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const opened = await format(admin, 4);
    const one = await club("Les Aigles", 1000);

    await expect(
      one.member.caller.tournaments.propose({
        formatId: opened.id,
        date: daysFromNow(9),
        slotStartHour: 18,
        venueId: "arena",
      }),
    ).rejects.toThrow(/fondateur|capitaine/i);
  });

  it("TOUR-005 — le plateau complet se tire tout seul", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const opened = await format(admin, 4);

    const clubs: Club[] = [];
    for (let i = 0; i < 4; i++) {
      clubs.push(await club(`Club ${i}`, 1000));
      await setRating(clubs[i]!.squadId, 1400 - i * 100);
    }

    const proposed = await clubs[0]!.founder.caller.tournaments.propose({
      formatId: opened.id,
      date: daysFromNow(9),
      slotStartHour: 20,
      venueId: "arena",
    });

    for (const entrant of clubs.slice(1, 3)) {
      const view = await entrant.founder.caller.tournaments.register({
        tournamentId: proposed.id,
      });
      // Tant qu'il manque un club, rien ne bouge.
      expect(view.status).toBe("open");
    }

    const last = await clubs[3]!.founder.caller.tournaments.register({
      tournamentId: proposed.id,
    });

    // Le quatrième engagement complète le plateau : le tableau est tiré sans
    // qu'on ait eu à le demander.
    expect(last.status).toBe("drawn");

    const detail = await admin.caller.tournaments.get({
      tournamentId: proposed.id,
    });
    expect(detail.status).toBe("drawn");
    expect(detail.matches).toHaveLength(3);
    expect(detail.entries.every((entry) => entry.seed !== null)).toBe(true);

    // Et il est bel et bien clos : plus personne n'entre.
    const latecomer = await club("Les Retardataires", 1000);
    await expect(
      latecomer.founder.caller.tournaments.register({
        tournamentId: proposed.id,
      }),
    ).rejects.toThrow(/déjà tiré/i);
  });

  it("TOUR-005 — un club peut se placer sur plusieurs propositions", async () => {
    // « Chaque équipe peut se proposer dans l'un ou l'autre tournoi à sa
    // guise jusqu'à ce que l'un d'eux se remplisse. »
    const admin = await promoteToAdmin(await createPlayer());
    const four = await format(admin, 4);
    const eight = await format(admin, 8);

    const one = await club("Les Aigles", 1000);
    const first = await one.founder.caller.tournaments.propose({
      formatId: four.id,
      date: daysFromNow(9),
      slotStartHour: 18,
      venueId: "arena",
    });
    const second = await one.founder.caller.tournaments.propose({
      formatId: eight.id,
      date: daysFromNow(10),
      slotStartHour: 18,
      venueId: "arena",
    });

    expect(first.id).not.toBe(second.id);

    const mine = await one.founder.caller.tournaments.list({ mineOnly: true });
    expect(mine).toHaveLength(2);

    // Deux engagements, deux droits séquestrés : la caisse le montre.
    const treasury = await treasuryOf(one.squadId);
    expect(treasury.locked).toBe(ENTRY_FEE * 2);
  });

  it("TOUR-005 — un format retiré n'accueille plus de proposition", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const opened = await format(admin, 4);
    await admin.caller.tournaments.saveFormat({
      formatId: opened.id,
      name: opened.name,
      size: 4,
      entryFeeUno: opened.entryFeeUno,
      prizeUno: opened.prizeUno,
      active: false,
    });

    const one = await club("Les Aigles", 1000);
    await expect(
      one.founder.caller.tournaments.propose({
        formatId: opened.id,
        date: daysFromNow(9),
        slotStartHour: 18,
        venueId: "arena",
      }),
    ).rejects.toThrow(/n'accueille plus/i);

    // Les clubs ne le voient plus non plus.
    expect(await one.founder.caller.tournaments.formats()).toHaveLength(0);
  });

  it("TOUR-005 — retoucher un format ne réécrit pas un tournoi déjà posé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const opened = await format(admin, 4, { entryFeeUno: 100, prizeUno: 500 });

    const one = await club("Les Aigles", 1000);
    const proposed = await one.founder.caller.tournaments.propose({
      formatId: opened.id,
      date: daysFromNow(9),
      slotStartHour: 18,
      venueId: "arena",
    });

    await admin.caller.tournaments.saveFormat({
      formatId: opened.id,
      name: opened.name,
      size: 4,
      entryFeeUno: 900,
      prizeUno: 9000,
      active: true,
    });

    // Relever la dotation ne doit pas enrichir rétroactivement des clubs qui
    // n'avaient pas joué pour cela.
    const detail = await admin.caller.tournaments.get({
      tournamentId: proposed.id,
    });
    expect(detail.entryFeeUno).toBe(100);
    expect(detail.prizeUno).toBe(500);
  });

  it("TOUR-006 — une proposition se pose au moins sept jours à l'avance", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const opened = await format(admin, 4);
    const one = await club("Les Aigles", 1000);

    // Six jours : refusé. Un plateau de clubs entiers ne se remplit pas en
    // moins d'une semaine — chacun doit consulter les siens et voter la
    // dépense sur sa caisse.
    await expect(
      one.founder.caller.tournaments.propose({
        formatId: opened.id,
        date: daysFromNow(6),
        slotStartHour: 18,
        venueId: "arena",
      }),
    ).rejects.toThrow(/7 jours à l'avance/);

    // Sept jours tout juste : accepté. La borne est inclusive, sans quoi
    // l'écran proposerait une date que le serveur refuserait.
    const proposed = await one.founder.caller.tournaments.propose({
      formatId: opened.id,
      date: daysFromNow(7),
      slotStartHour: 18,
      venueId: "arena",
    });
    expect(proposed.localDate).toBe(daysFromNow(7));
  });

  it("TOUR-006 — un tournoi annulé disparaît de la liste", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const opened = await format(admin, 4);
    const one = await club("Les Aigles", 1000);

    const kept = await one.founder.caller.tournaments.propose({
      formatId: opened.id,
      date: daysFromNow(9),
      slotStartHour: 18,
      venueId: "arena",
    });
    const doomed = await one.founder.caller.tournaments.propose({
      formatId: opened.id,
      date: daysFromNow(10),
      slotStartHour: 20,
      venueId: "arena",
    });

    await admin.caller.tournaments.cancel({ tournamentId: doomed.id });

    const visible = await one.founder.caller.tournaments.list({
      mineOnly: false,
    });
    expect(visible.map((row) => row.id)).toEqual([kept.id]);

    // Même vu depuis son propre club : un tournoi annulé n'a pas eu lieu.
    const mine = await one.founder.caller.tournaments.list({ mineOnly: true });
    expect(mine.map((row) => row.id)).toEqual([kept.id]);

    // Il n'est pas effacé pour autant : l'administration peut le retrouver en
    // nommant le statut, et le droit d'engagement a bien été rendu.
    const asked = await admin.caller.tournaments.list({
      mineOnly: false,
      status: "cancelled",
    });
    expect(asked.map((row) => row.id)).toEqual([doomed.id]);
    expect((await treasuryOf(one.squadId)).locked).toBe(ENTRY_FEE);
  });

  it("TOUR-006 — le calendrier filtre par mois et par format", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const four = await format(admin, 4);
    const eight = await format(admin, 8);
    const one = await club("Les Aigles", 2000);

    const soon = await one.founder.caller.tournaments.propose({
      formatId: four.id,
      date: daysFromNow(9),
      slotStartHour: 18,
      venueId: "arena",
    });
    const later = await one.founder.caller.tournaments.propose({
      formatId: eight.id,
      date: daysFromNow(60),
      slotStartHour: 18,
      venueId: "arena",
    });

    // Une fenêtre qui s'arrête avant le second ne rend que le premier : c'est
    // ce qui permet à la grille de ne peindre que son mois.
    const window = await one.founder.caller.tournaments.list({
      mineOnly: false,
      from: daysFromNow(0),
      to: daysFromNow(30),
    });
    expect(window.map((row) => row.id)).toEqual([soon.id]);

    // Le filtre de format traverse les mois : c'est un choix de tournoi, pas
    // de date.
    const byFormat = await one.founder.caller.tournaments.list({
      mineOnly: false,
      formatId: eight.id,
    });
    expect(byFormat.map((row) => row.id)).toEqual([later.id]);
  });

  it("TOUR-006 — l'affiche d'un format suit le format, et s'enlève", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const opened = await format(admin, 4);
    expect(opened.coverImageUrl).toBeNull();

    await admin.caller.tournaments.saveFormat({
      formatId: opened.id,
      name: opened.name,
      size: 4,
      entryFeeUno: opened.entryFeeUno,
      prizeUno: opened.prizeUno,
      active: true,
      coverImageUrl: "/uploads/tournaments/demi.webp",
    });

    const one = await club("Les Aigles", 1000);
    const seen = await one.founder.caller.tournaments.formats();
    expect(seen[0]?.coverImageUrl).toBe("/uploads/tournaments/demi.webp");

    // Une adresse hors du dossier des téléversements est refusée : le champ
    // est écrit par l'administration, pas par le premier venu, mais il finit
    // dans un attribut `src` — c'est le serveur qui en décide la forme.
    await expect(
      admin.caller.tournaments.saveFormat({
        formatId: opened.id,
        name: opened.name,
        size: 4,
        entryFeeUno: opened.entryFeeUno,
        prizeUno: opened.prizeUno,
        active: true,
        coverImageUrl: "javascript:alert(1)",
      }),
    ).rejects.toThrow();

    // Reposer le format sans affiche la retire.
    await admin.caller.tournaments.saveFormat({
      formatId: opened.id,
      name: opened.name,
      size: 4,
      entryFeeUno: opened.entryFeeUno,
      prizeUno: opened.prizeUno,
      active: true,
    });
    const cleared = await one.founder.caller.tournaments.formats();
    expect(cleared[0]?.coverImageUrl).toBeNull();
  });
});

/**
 * Le cinq d'un club pour un tournoi (TOUR-007).
 *
 * Un tournoi ne demandait à personne qui jouait : le club s'engageait entier,
 * et le jour venu on ne savait pas qui devait se présenter. Ces tests portent
 * sur la feuille — et sur ce qu'elle ne permet pas : composer celle d'un
 * autre club, y mettre quelqu'un d'ailleurs, ou la retoucher une fois le
 * tournoi joué.
 */
describe("le cinq d'un club en tournoi (TOUR-007)", () => {
  beforeEach(resetDatabase);

  /** Un tournoi à quatre, avec un club engagé, et l'engagement de ce club. */
  async function engaged() {
    const admin = await promoteToAdmin(await createPlayer());
    const tournament = await openTournament(admin, 4, { entryFeeUno: 0 });
    const one = await club("Les Loups", 0);

    await one.founder.caller.tournaments.register({
      tournamentId: tournament.id,
    });

    const detail = await one.founder.caller.tournaments.get({
      tournamentId: tournament.id,
    });
    const entryId = detail.entries.find(
      (entry) => entry.squad.id === one.squadId,
    )!.id;

    return { admin, tournament, one, entryId };
  }

  it("TOUR-007 — sans feuille, un engagement n'annonce personne", async () => {
    const { one, entryId } = await engaged();
    expect(
      (await one.founder.caller.tournaments.entryLineup({ entryId }))
        .assignments,
    ).toEqual([]);
  });

  it("TOUR-007 — le fondateur pose son cinq, rendu dans l'ordre du terrain", async () => {
    const { one, entryId } = await engaged();

    await one.founder.caller.tournaments.setEntryLineup({
      entryId,
      assignments: [
        { slot: "ATT1", playerId: one.member.identity.playerId },
        { slot: "GB", playerId: one.founder.identity.playerId },
      ],
    });

    const { assignments: lineup } =
      await one.founder.caller.tournaments.entryLineup({
        entryId,
      });
    expect(lineup.map((row) => row.slot)).toEqual(["GB", "ATT1"]);
  });

  it("TOUR-007 — un joueur d'un autre club n'entre pas sur la feuille", async () => {
    const { one, entryId } = await engaged();
    const other = await club("Les Aigles", 0);

    await expect(
      one.founder.caller.tournaments.setEntryLineup({
        entryId,
        assignments: [
          { slot: "GB", playerId: other.founder.identity.playerId },
        ],
      }),
    ).rejects.toThrow(/effectif/i);
  });

  it("TOUR-007 — un simple membre ne compose pas la feuille", async () => {
    const { one, entryId } = await engaged();

    await expect(
      one.member.caller.tournaments.setEntryLineup({
        entryId,
        assignments: [{ slot: "GB", playerId: one.member.identity.playerId }],
      }),
    ).rejects.toThrow();
  });

  it("TOUR-007 — le cinq type du club sert de point de départ", async () => {
    const { one, entryId } = await engaged();

    await one.founder.caller.squads.setLineup({
      squadId: one.squadId,
      assignments: [
        { slot: "GB", playerId: one.founder.identity.playerId },
        { slot: "ATT1", playerId: one.member.identity.playerId },
      ],
    });

    await one.founder.caller.tournaments.fillEntryFromSquadLineup({ entryId });

    const { assignments: lineup } =
      await one.founder.caller.tournaments.entryLineup({
        entryId,
      });
    expect(lineup).toEqual([
      { slot: "GB", playerId: one.founder.identity.playerId },
      { slot: "ATT1", playerId: one.member.identity.playerId },
    ]);
  });

  it("TOUR-007 — sans cinq type, le raccourci le dit", async () => {
    const { one, entryId } = await engaged();

    await expect(
      one.founder.caller.tournaments.fillEntryFromSquadLineup({ entryId }),
    ).rejects.toThrow(/cinq type/i);
  });

  it("TOUR-007 — les feuilles du tournoi sont visibles de tous les engagés", async () => {
    const { tournament, one, entryId } = await engaged();
    const outsider = await createPlayer();

    await one.founder.caller.tournaments.setEntryLineup({
      entryId,
      assignments: [{ slot: "GB", playerId: one.founder.identity.playerId }],
    });

    // Savoir qui l'on affronte fait partie du tournoi : la lecture est
    // ouverte, comme les deux feuilles d'un défi.
    const feuilles = await outsider.caller.tournaments.lineups({
      tournamentId: tournament.id,
    });
    expect(feuilles).toHaveLength(1);
    expect(feuilles[0]?.squad.name).toBe("Les Loups");
    expect(feuilles[0]?.players[0]?.player.id).toBe(
      one.founder.identity.playerId,
    );
  });

  it("TOUR-007 — un joueur parti du club disparaît de la feuille", async () => {
    const { tournament, one, entryId } = await engaged();

    await one.founder.caller.tournaments.setEntryLineup({
      entryId,
      assignments: [
        { slot: "GB", playerId: one.founder.identity.playerId },
        { slot: "ATT1", playerId: one.member.identity.playerId },
      ],
    });

    await one.member.caller.squads.leave();

    // Sa ligne survit — il peut revenir, et une lecture n'écrit pas — mais il
    // n'est plus annoncé comme jouant pour ce club.
    const { assignments: lineup } =
      await one.founder.caller.tournaments.entryLineup({
        entryId,
      });
    expect(lineup.map((row) => row.playerId)).toEqual([
      one.founder.identity.playerId,
    ]);

    const feuilles = await one.founder.caller.tournaments.lineups({
      tournamentId: tournament.id,
    });
    expect(feuilles[0]?.players).toHaveLength(1);
  });

  it("TOUR-007 — un tournoi annulé ne se compose plus", async () => {
    const { admin, tournament, one, entryId } = await engaged();

    await admin.caller.tournaments.cancel({ tournamentId: tournament.id });

    await expect(
      one.founder.caller.tournaments.setEntryLineup({
        entryId,
        assignments: [{ slot: "GB", playerId: one.founder.identity.playerId }],
      }),
    ).rejects.toThrow(/annulé/i);
  });
});
