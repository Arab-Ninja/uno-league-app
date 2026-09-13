import { beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  SQUAD_RATING_INITIAL,
  SQUAD_RATING_K,
  SQUAD_ROSTER_SIZE,
  expectedScore,
  nextSquadRatings,
  ratingDelta,
  squadTier,
} from "@uno/shared";
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
 * Cote des SQUADs (SQUAD-007).
 *
 * Deux choses à prouver, et la seconde compte autant que la première : que le
 * barème se comporte comme un Elo, et qu'il **ne dépend pas des mises**. Une
 * équipe riche qui mise gros ne doit pas monter plus vite qu'une autre.
 */

describe("barème de cote (SQUAD-007)", () => {
  it("SQUAD-007 — entre égaux, la victoire vaut la moitié du coefficient", () => {
    const { challenger, challenged } = nextSquadRatings(1000, 1000, "challenger");
    expect(challenger).toBe(1000 + SQUAD_RATING_K / 2);
    expect(challenged).toBe(1000 - SQUAD_RATING_K / 2);
  });

  it("SQUAD-007 — entre égaux, le nul ne déplace rien", () => {
    expect(nextSquadRatings(1000, 1000, null)).toEqual({
      challenger: 1000,
      challenged: 1000,
    });
  });

  it("SQUAD-007 — 400 points d'écart valent dix contre un", () => {
    // La constante d'origine d'Elo : la garder rend la cote comparable à
    // l'intuition qu'on en a ailleurs.
    expect(expectedScore(1400, 1000)).toBeCloseTo(10 / 11, 5);
    expect(expectedScore(1000, 1400)).toBeCloseTo(1 / 11, 5);
  });

  it("SQUAD-007 — battre plus fort rapporte, battre plus faible rapporte peu", () => {
    const exploit = ratingDelta(900, 1300, "win");
    const attendu = ratingDelta(1300, 900, "win");

    expect(exploit).toBeGreaterThan(attendu);
    expect(exploit).toBe(29);
    expect(attendu).toBe(3);

    // Et la défaite du favori coûte exactement ce que l'exploit rapporte.
    expect(ratingDelta(1300, 900, "loss")).toBe(-exploit);
  });

  it("SQUAD-007 — la somme des cotes est conservée", () => {
    // Les deux camps se calculent sur les cotes d'avant : sans cela, des
    // points apparaîtraient ou disparaîtraient à chaque match.
    for (const [a, b] of [
      [1000, 1000],
      [900, 1300],
      [1500, 800],
      [1042, 987],
    ] as const) {
      for (const winner of ["challenger", "challenged", null] as const) {
        const next = nextSquadRatings(a, b, winner);
        expect(next.challenger + next.challenged, `${a}/${b}/${winner}`).toBe(a + b);
      }
    }
  });

  it("SQUAD-007 — une cote ne descend pas sous zéro", () => {
    const { challenger } = nextSquadRatings(5, 2000, "challenged");
    expect(challenger).toBeGreaterThanOrEqual(0);
  });

  it("SQUAD-007 — le palier situe un club à partir de la cote de départ", () => {
    expect(squadTier(SQUAD_RATING_INITIAL)).toBe("Prometteur");
    expect(squadTier(SQUAD_RATING_INITIAL + 300)).toBe("Élite");
    expect(squadTier(SQUAD_RATING_INITIAL - 500)).toBe("En reconstruction");
  });
});

// ---------------------------------------------------------------------------
// La cote en situation réelle
// ---------------------------------------------------------------------------

interface Camp {
  founder: TestPlayer;
  members: TestPlayer[];
  squadId: number;
}

async function camp(name: string, treasury: number): Promise<Camp> {
  const founder = await createPlayer();
  const squad = await founder.caller.squads.create({ name });

  const members: TestPlayer[] = [];
  for (let index = 0; index < SQUAD_ROSTER_SIZE - 1; index++) {
    const member = await createPlayer();
    await member.caller.squads.requestToJoin({ squadId: squad.id });
    const detail = await founder.caller.squads.detail({ squadId: squad.id });
    const request = detail.pendingRequests.find(
      (row) => row.player.id === member.identity.playerId,
    )!;
    await founder.caller.squads.decideRequest({
      requestId: request.id,
      accept: true,
    });
    members.push(member);
  }

  await grantUno(founder.identity.playerId, treasury);
  await founder.caller.squads.contribute({ squadId: squad.id, amount: treasury });
  return { founder, members, squadId: squad.id };
}

const roster = (side: Camp): TestPlayer[] => [side.founder, ...side.members];

/** Joue un match complet et le clôture, `winner` désignant le camp vainqueur. */
async function playMatch(
  admin: TestPlayer,
  a: Camp,
  b: Camp,
  options: { stakeUno: number; winner: "a" | "b" | "draw" },
): Promise<void> {
  const view = await a.founder.caller.squads.createChallenge({
    squadId: a.squadId,
    opponentSquadId: b.squadId,
    venueId: "arena",
    date: daysFromNow(5),
    startHour: 20,
    durationMinutes: 60,
    stakeUno: options.stakeUno,
  });
  await b.founder.caller.squads.acceptChallenge({ challengeId: view.id });

  for (const side of [a, b]) {
    const all = roster(side);
    for (const player of all) {
      await side.founder.caller.squads.addSeat({
        challengeId: view.id,
        playerId: player.identity.playerId,
      });
    }
    await side.founder.caller.squads.coverSeats({
      challengeId: view.id,
      playerIds: all.map((player) => player.identity.playerId),
    });
  }

  const { proposalId } = await admin.caller.squads.createMatch({
    challengeId: view.id,
  });

  const list = await admin.caller.proposals.matches({ proposalId });
  const match = list[0]!;
  const teamA = match.teamA?.players ?? [];
  const teamB = match.teamB?.players ?? [];

  const scoreA = options.winner === "a" ? 2 : options.winner === "draw" ? 1 : 0;
  const scoreB = options.winner === "b" ? 2 : options.winner === "draw" ? 1 : 0;
  const scorerA = teamA[0]!.id;
  const scorerB = teamB[0]!.id;

  await admin.caller.supervision.record({
    proposalId,
    matches: [
      {
        matchId: match.id,
        scoreA,
        scoreB,
        stats: [...teamA, ...teamB].map((player) => ({
          playerId: player.id,
          goals:
            player.id === scorerA ? scoreA : player.id === scorerB ? scoreB : 0,
          assists: 0,
          defenses: 0,
          saves: 0,
        })),
      },
    ],
    complete: true,
  });
}

async function ratingOf(squadId: number): Promise<number> {
  const rows = await db.execute<{ rating: number }>(
    sql`SELECT rating FROM squads WHERE id = ${squadId}`,
  );
  return Number((rows[0] as unknown as { rating: number }[])[0]!.rating);
}

describe("la cote en situation (SQUAD-007)", () => {
  beforeEach(resetDatabase);

  it("AC10 — la victoire déplace les deux cotes, et l'historique la garde", async () => {
    const a = await camp("Les Corsaires", 4000);
    const b = await camp("Les Faucons", 4000);
    const admin = await promoteToAdmin(await createPlayer());

    expect(await ratingOf(a.squadId)).toBe(SQUAD_RATING_INITIAL);

    await playMatch(admin, a, b, { stakeUno: 500, winner: "a" });

    expect(await ratingOf(a.squadId)).toBe(SQUAD_RATING_INITIAL + 16);
    expect(await ratingOf(b.squadId)).toBe(SQUAD_RATING_INITIAL - 16);

    // Le mouvement se relit sur le défi : l'écran affiche « +16 », pas un
    // nombre nu, et un classement passé reste lisible.
    const rows = await db.execute<Record<string, number>>(
      sql`SELECT challenger_rating_before AS cb, challenger_rating_after AS ca,
                 challenged_rating_before AS db_, challenged_rating_after AS da
          FROM squad_challenges ORDER BY id DESC LIMIT 1`,
    );
    const history = (rows[0] as unknown as Record<string, number>[])[0]!;
    expect(Number(history.cb)).toBe(SQUAD_RATING_INITIAL);
    expect(Number(history.ca)).toBe(SQUAD_RATING_INITIAL + 16);
    expect(Number(history.db_)).toBe(SQUAD_RATING_INITIAL);
    expect(Number(history.da)).toBe(SQUAD_RATING_INITIAL - 16);
  });

  it("AC10 — la cote ne dépend pas de la mise", async () => {
    // Deux rencontres identiques sur le terrain, l'une à 0 UNO et l'autre à
    // 2000 : la cote doit bouger exactement pareil. C'est la garantie qui
    // empêche d'acheter sa place au classement.
    const pauvreA = await camp("Les Fauchés", 2000);
    const pauvreB = await camp("Les Modestes", 2000);
    const richeA = await camp("Les Nababs", 6000);
    const richeB = await camp("Les Rentiers", 6000);
    const admin = await promoteToAdmin(await createPlayer());

    await playMatch(admin, pauvreA, pauvreB, { stakeUno: 0, winner: "a" });
    await playMatch(admin, richeA, richeB, { stakeUno: 2000, winner: "a" });

    expect(await ratingOf(richeA.squadId)).toBe(await ratingOf(pauvreA.squadId));
    expect(await ratingOf(richeB.squadId)).toBe(await ratingOf(pauvreB.squadId));
  });

  it("AC10 — un nul entre égaux ne change aucune cote", async () => {
    const a = await camp("Les Corsaires", 4000);
    const b = await camp("Les Faucons", 4000);
    const admin = await promoteToAdmin(await createPlayer());

    await playMatch(admin, a, b, { stakeUno: 300, winner: "draw" });

    expect(await ratingOf(a.squadId)).toBe(SQUAD_RATING_INITIAL);
    expect(await ratingOf(b.squadId)).toBe(SQUAD_RATING_INITIAL);
  });

  it("AC10 — le classement place le mieux coté en tête", async () => {
    const a = await camp("Les Corsaires", 4000);
    const b = await camp("Les Faucons", 4000);
    const admin = await promoteToAdmin(await createPlayer());

    await playMatch(admin, b, a, { stakeUno: 0, winner: "a" });

    const classement = await admin.caller.squads.list({ limit: 10 });
    expect(classement[0]!.name).toBe("Les Faucons");
    expect(classement[0]!.rating).toBeGreaterThan(classement[1]!.rating);
  });
});
