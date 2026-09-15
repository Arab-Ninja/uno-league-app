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
    await founder.caller.squads.contribute({ squadId: squad.id, amount: treasury });
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
  await db.execute(sql`UPDATE squads SET rating = ${rating} WHERE id = ${squadId}`);
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
    date: daysFromNow(6),
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

    // Même préavis qu'une séance : un tournoi pour demain ne laisse à aucun
    // club le temps d'engager son effectif.
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
        date: daysFromNow(6),
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

    await one.founder.caller.tournaments.register({ tournamentId: tournament.id });
    const engaged = await treasuryOf(one.squadId);

    await one.founder.caller.tournaments.withdraw({
      tournamentId: tournament.id,
    });

    const back = await treasuryOf(one.squadId);
    expect(back.available).toBe(engaged.available + ENTRY_FEE);
    expect(back.locked).toBe(0);
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

    // Le cinquième arrive trop tard : un plateau de quatre en accueille
    // quatre, et un cinquième n'aurait nulle part où jouer.
    await expect(
      clubs[4]!.founder.caller.tournaments.register({
        tournamentId: tournament.id,
      }),
    ).rejects.toThrow(/complet/i);
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

    const drawn = await admin.caller.tournaments.draw({
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

    let view = await admin.caller.tournaments.draw({ tournamentId: tournament.id });
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

    const view = await admin.caller.tournaments.draw({
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
    const seenByLoner = await loner.caller.tournaments.list({ mineOnly: false });
    expect(seenByLoner).toHaveLength(1);
    expect(seenByLoner[0]!.viewer.squadId).toBeNull();
    expect(seenByLoner[0]!.viewer.mayRegister).toBe(false);
    await expect(
      loner.caller.tournaments.register({ tournamentId: tournament.id }),
    ).rejects.toThrow(/SQUAD/i);

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

    await one.founder.caller.tournaments.register({ tournamentId: tournament.id });
    expect(
      await one.founder.caller.tournaments.list({ mineOnly: true }),
    ).toHaveLength(1);
    // Le membre aussi voit le tournoi de son club dans « les miens ».
    expect(
      await one.member.caller.tournaments.list({ mineOnly: true }),
    ).toHaveLength(1);
  });
});
