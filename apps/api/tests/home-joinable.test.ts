import { beforeEach, describe, expect, it } from "vitest";
import { getGameMode } from "@uno/shared";
import {
  createFundedPlayer as createPlayer,
  daysFromNow,
  promoteToAdmin,
  resetDatabase,
} from "./helpers.js";

/**
 * Ce que l'accueil propose à qui n'a encore rien réservé (HOME-002).
 *
 * L'écran affichait « Aucune session à venir » — vrai de son point de vue, et
 * trompeur du point de vue de la ligue, qui en comptait dix-neuf. Il montre
 * désormais les séances ouvertes ; encore faut-il qu'elles le soient vraiment,
 * d'où ce fichier.
 */
describe("séances à rejoindre depuis l'accueil (HOME-002)", () => {
  beforeEach(resetDatabase);

  const amical = {
    date: daysFromNow(4),
    slotStartHour: 20,
    venueId: "yc-five" as const,
    modeId: "friendly" as const,
  };

  it("HOME-002 — une séance ouverte apparaît à qui n'y est pas inscrit", async () => {
    const hote = await createPlayer();
    const created = await hote.caller.proposals.create(amical);

    const nouveau = await createPlayer();
    const { upcoming, joinable } = await nouveau.caller.players.dashboard();

    expect(upcoming).toHaveLength(0);
    expect(joinable.map((p) => p.id)).toContain(created.proposal.id);
  });

  it("HOME-002 — sa propre séance n'est pas une séance à rejoindre", async () => {
    const hote = await createPlayer();
    const created = await hote.caller.proposals.create(amical);

    const { upcoming, joinable } = await hote.caller.players.dashboard();

    // Le créateur est participant d'office : elle lui revient dans « à venir »,
    // et surtout pas dans « à rejoindre ».
    expect(upcoming.map((p) => p.id)).toContain(created.proposal.id);
    expect(joinable.map((p) => p.id)).not.toContain(created.proposal.id);
  });

  it("HOME-002 — une séance complète n'est plus à prendre", async () => {
    const hote = await createPlayer();
    const created = await hote.caller.proposals.create(amical);
    const quota = getGameMode("friendly")!.minParticipants;

    // Le créateur compte pour un ; on remplit le reste du plateau.
    for (let i = 1; i < quota; i++) {
      const joueur = await createPlayer();
      await joueur.caller.proposals.join({ proposalId: created.proposal.id });
    }

    const nouveau = await createPlayer();
    const { joinable } = await nouveau.caller.players.dashboard();

    expect(joinable.map((p) => p.id)).not.toContain(created.proposal.id);
  });

  it("HOME-002 — une séance d'une autre division ne lui est pas proposée", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const hoteD1 = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: hoteD1.identity.playerId,
      division: "D1",
    });

    // UNO League est classée : sa proposition porte la division de son hôte.
    const created = await hoteD1.caller.proposals.create({
      date: daysFromNow(4),
      slotStartHour: 20,
      venueId: "arena",
      modeId: "league",
    });

    // Un inscrit neuf démarre en D3.
    const nouveau = await createPlayer();
    const { joinable } = await nouveau.caller.players.dashboard();

    expect(joinable.map((p) => p.id)).not.toContain(created.proposal.id);
  });

  it("HOME-002 — un amical reste ouvert à toutes les divisions", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const hoteD1 = await createPlayer();
    await admin.caller.admin.setDivision({
      playerId: hoteD1.identity.playerId,
      division: "D1",
    });

    const created = await hoteD1.caller.proposals.create(amical);

    const nouveau = await createPlayer();
    const { joinable } = await nouveau.caller.players.dashboard();

    expect(joinable.map((p) => p.id)).toContain(created.proposal.id);
  });
});
