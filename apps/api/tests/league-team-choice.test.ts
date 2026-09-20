import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { getGameMode } from "@uno/shared";
import {
  createPlayer,
  daysFromNow,
  grantUno,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * On choisit son équipe en UNO League (MODE-005).
 *
 * **Ce que la compétition échange, et contre quoi.** Le tirage intégral
 * garantissait que personne ne choisit ses coéquipiers : c'est ce qui donnait
 * sa valeur au classement, et c'est aussi ce qui séparait trois amis venus
 * ensemble. Les trois équipes existent désormais dès la proposition et se
 * remplissent au fil des jours ; le tirage de clôture ne répartit plus que
 * ceux qui n'ont rien choisi, en visant l'équilibre.
 *
 * Deux règles tiennent l'ensemble, et les tests d'ici les suivent : une
 * équipe pleine est pleine — le choix n'existe que parce que les places sont
 * comptées —, et ce qu'un joueur a choisi ne lui est jamais repris.
 */

const league = getGameMode("league")!;
const TEAM_SIZE = league.minParticipants / league.teamCount;

/**
 * Une proposition de UNO League avec `inscrits` joueurs déjà dedans.
 *
 * `enAttente` donne des joueurs de la même division, éligibles mais pas
 * encore inscrits : c'est ainsi qu'un test déclenche la clôture au moment
 * exact qu'il choisit, une fois les équipes formées comme il l'entend.
 */
async function leagueProposal(
  inscrits: number,
  enAttente = 0,
): Promise<{
  admin: TestPlayer;
  squad: TestPlayer[];
  banc: TestPlayer[];
  proposalId: number;
}> {
  const admin = await promoteToAdmin(await createPlayer());

  const recruter = async () => {
    const player = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: player.identity.playerId,
      division: "D1",
    });
    await grantUno(player.identity.playerId, 1000);
    return player;
  };

  const squad: TestPlayer[] = [];
  for (let i = 0; i < inscrits; i++) squad.push(await recruter());

  const { proposal } = await squad[0]!.caller.proposals.create({
    date: daysFromNow(3),
    slotStartHour: 18,
    venueId: "arena",
    modeId: "league",
  });

  for (const player of squad.slice(1)) {
    await player.caller.proposals.join({ proposalId: proposal.id });
  }

  const banc: TestPlayer[] = [];
  for (let i = 0; i < enAttente; i++) banc.push(await recruter());

  return { admin, squad, banc, proposalId: proposal.id };
}

/** L'équipe qui porte ce joueur, s'il y en a une. */
function teamOf(
  teams: { teamIndex: number; players: { id: number }[] }[],
  playerId: number,
): number | null {
  return (
    teams.find((team) => team.players.some((p) => p.id === playerId))
      ?.teamIndex ?? null
  );
}

describe("choisir son équipe en UNO League (MODE-005)", () => {
  beforeEach(resetDatabase);

  it("MODE-005 — une proposition naît avec ses trois équipes, vides", async () => {
    const { squad, proposalId } = await leagueProposal(2);

    const teams = await squad[0]!.caller.proposals.teams({ proposalId });

    expect(teams).toHaveLength(league.teamCount);
    expect(teams.map((team) => team.teamIndex)).toEqual([0, 1, 2]);
    // Vides : le créateur lui-même n'est placé nulle part. Choisir est une
    // option, et l'imposer à l'inscription en aurait fait une formalité.
    for (const team of teams) expect(team.players).toHaveLength(0);
  });

  it("MODE-005 — on rejoint l'équipe de son choix, dès la proposition", async () => {
    const { squad, proposalId } = await leagueProposal(3);
    const moi = squad[1]!;

    await moi.caller.proposals.chooseTeam({ proposalId, teamIndex: 2 });

    const teams = await moi.caller.proposals.teams({ proposalId });
    expect(teamOf(teams, moi.identity.playerId)).toBe(2);
  });

  it("MODE-005 — on rejoint la séance et l'équipe du même geste", async () => {
    const { admin, squad, proposalId } = await leagueProposal(2);

    const tardif = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: tardif.identity.playerId,
      division: "D1",
    });
    await tardif.caller.proposals.join({ proposalId, teamIndex: 1 });

    const teams = await squad[0]!.caller.proposals.teams({ proposalId });
    expect(teamOf(teams, tardif.identity.playerId)).toBe(1);
  });

  it("MODE-005 — une équipe complète est refusée, et le refus dit où aller", async () => {
    const { squad, proposalId } = await leagueProposal(TEAM_SIZE + 1);

    for (const player of squad.slice(0, TEAM_SIZE)) {
      await player.caller.proposals.chooseTeam({ proposalId, teamIndex: 0 });
    }

    await expect(
      squad[TEAM_SIZE]!.caller.proposals.chooseTeam({
        proposalId,
        teamIndex: 0,
      }),
    ).rejects.toThrow(/Équipe A est complète.*Équipe B et en Équipe C/s);
  });

  it("MODE-005 — toucher une place dans une autre équipe, c'est la rejoindre", async () => {
    const { squad, proposalId } = await leagueProposal(3);
    const moi = squad[0]!;

    await moi.caller.proposals.choosePitchSlot({
      proposalId,
      slot: "GB",
      teamIndex: 0,
    });
    expect(
      teamOf(
        await moi.caller.proposals.teams({ proposalId }),
        moi.identity.playerId,
      ),
    ).toBe(0);

    await moi.caller.proposals.choosePitchSlot({
      proposalId,
      slot: "ATT1",
      teamIndex: 1,
    });

    const teams = await moi.caller.proposals.teams({ proposalId });
    expect(teamOf(teams, moi.identity.playerId)).toBe(1);
    // La place quittée est libre, et la nouvelle est bien la sienne.
    expect(teams[0]!.slots).toHaveLength(0);
    expect(teams[1]!.slots).toEqual([
      { playerId: moi.identity.playerId, pitchSlot: "ATT1" },
    ]);
  });

  it("MODE-005 — quitter la séance libère sa place dans l'équipe", async () => {
    const { squad, proposalId } = await leagueProposal(3);
    const moi = squad[2]!;

    await moi.caller.proposals.chooseTeam({ proposalId, teamIndex: 1 });
    await moi.caller.proposals.leave({ proposalId });

    const teams = await squad[0]!.caller.proposals.teams({ proposalId });
    expect(teamOf(teams, moi.identity.playerId)).toBeNull();
  });

  it("MODE-005 — le tirage de clôture ne touche pas à ceux qui ont choisi", async () => {
    const { squad, banc, proposalId } = await leagueProposal(
      league.minParticipants - 1,
      1,
    );

    /*
     * Douze choisissent — quatre par équipe —, trois s'en remettent au
     * tirage. C'est le cas que la règle promet : personne ne perd l'équipe
     * qu'il a demandée, et il reste une place par équipe à répartir.
     */
    const choisis = squad.slice(0, 12);
    for (const [index, player] of choisis.entries()) {
      await player.caller.proposals.chooseTeam({
        proposalId,
        teamIndex: index % 3,
      });
    }

    // Le quinzième inscrit ferme la proposition et déclenche le tirage.
    await banc[0]!.caller.proposals.join({ proposalId });

    const teams = await squad[0]!.caller.proposals.teams({ proposalId });
    for (const team of teams) expect(team.players).toHaveLength(TEAM_SIZE);

    for (const [index, player] of choisis.entries()) {
      expect(teamOf(teams, player.identity.playerId), `joueur ${index}`).toBe(
        index % 3,
      );
    }

    // Et tout le monde joue : les indécis ont bien été placés.
    const surLeTerrain = teams.flatMap((team) => team.players.map((p) => p.id));
    expect(new Set(surLeTerrain).size).toBe(league.minParticipants);
  });

  it("MODE-005 — la séance confirmée, une équipe pleine ne s'échange plus", async () => {
    const { squad, proposalId } = await leagueProposal(league.minParticipants);

    // Personne n'a choisi : le tirage a tout réparti, les trois équipes sont
    // pleines. Le plafond suffit alors à figer la composition, sans qu'aucune
    // règle de statut n'ait à l'interdire.
    const moi = squad[0]!;
    const sienne = teamOf(
      await moi.caller.proposals.teams({ proposalId }),
      moi.identity.playerId,
    )!;

    await expect(
      moi.caller.proposals.chooseTeam({
        proposalId,
        teamIndex: (sienne + 1) % 3,
      }),
    ).rejects.toThrow(/complète/i);
  });

  it("MODE-005 — une séance qui se défait garde les équipes choisies", async () => {
    const { admin, squad, banc, proposalId } = await leagueProposal(
      league.minParticipants - 1,
      1,
    );

    const fidele = squad[1]!;
    const partant = squad[2]!;

    // Le fidèle choisit son équipe avant la clôture ; le tirage placera les
    // autres, dont le partant.
    await fidele.caller.proposals.chooseTeam({ proposalId, teamIndex: 1 });
    await banc[0]!.caller.proposals.join({ proposalId });

    /*
     * Le partant change de division : sa place devient inéligible et, faute
     * de remplaçant, la séance repasse sous le quota. Le tirage est effacé —
     * mais pas ce qu'un joueur avait décidé de lui-même.
     */
    await admin.caller.admin.setDivision({
      playerId: partant.identity.playerId,
      division: "D2",
    });

    const teams = await fidele.caller.proposals.teams({ proposalId });
    expect(teams).toHaveLength(league.teamCount);
    expect(teamOf(teams, fidele.identity.playerId)).toBe(1);
    expect(teamOf(teams, partant.identity.playerId)).toBeNull();
    // Les places rendues par le tirage sont bien libres.
    expect(teams.flatMap((team) => team.players)).toHaveLength(1);
  });

  it("MODE-005 — un mode où le camp se choisit ne connaît pas cette route", async () => {
    const createur = await createPlayer();
    await grantUno(createur.identity.playerId, 1000);
    const { proposal } = await createur.caller.proposals.create({
      date: daysFromNow(3),
      slotStartHour: 19,
      venueId: "arena",
      modeId: "friendly",
    });

    await expect(
      createur.caller.proposals.chooseTeam({
        proposalId: proposal.id,
        teamIndex: 1,
      }),
    ).rejects.toThrow(/ne se choisissent pas/i);
  });

  it("MODE-005 — qui n'est pas inscrit ne choisit pas d'équipe", async () => {
    const { admin, proposalId } = await leagueProposal(2);

    const curieux = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: curieux.identity.playerId,
      division: "D1",
    });

    await expect(
      curieux.caller.proposals.chooseTeam({ proposalId, teamIndex: 0 }),
    ).rejects.toThrow();
  });

  it("MODE-005 — le paiement ne déplace personne", async () => {
    const { squad, banc, proposalId } = await leagueProposal(
      league.minParticipants - 1,
      1,
    );
    const moi = squad[1]!;

    // Choisir, puis voir la séance se confirmer, puis régler sa place : les
    // trois moments où une composition pourrait se refaire dans son dos.
    await moi.caller.proposals.chooseTeam({ proposalId, teamIndex: 2 });
    await banc[0]!.caller.proposals.join({ proposalId });

    await moi.caller.proposals.pay({
      proposalId,
      method: "uno",
      idempotencyKey: randomUUID(),
    });

    expect(
      teamOf(
        await moi.caller.proposals.teams({ proposalId }),
        moi.identity.playerId,
      ),
    ).toBe(2);
  });
});
