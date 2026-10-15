import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../src/db/client.js";
import { adminEvents, proposals } from "../src/db/schema.js";
import { alertUnbookedVenues } from "../src/services/venue-booking.service.js";
import {
  createPlayer,
  daysFromNow,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Réservation des terrains (VENUE-001).
 *
 * Le terrain se loue chez l'exploitant, hors de l'application, et rien ne
 * permet de l'y lire. Ce qui est vérifié ici : la page de réservation tenue
 * par salle, la déclaration « terrain réservé » que voient les joueurs, et
 * l'alerte qui prévient l'administration avant que le dernier terrain ne
 * parte — une session presque complète, à moins de deux jours, terrain non
 * déclaré.
 */

async function openFriendly(admin: TestPlayer, date = daysFromNow(1)) {
  const created = await admin.caller.admin.createProposal({
    date,
    slotStartHour: 18,
    venueId: "arena",
    modeId: "friendly",
  });
  return created.proposal;
}

/** Le remplissage, posé directement : c'est le compte que lit l'alerte. */
async function setSignedUp(proposalId: number, count: number): Promise<void> {
  await db
    .update(proposals)
    .set({ participantCount: count })
    .where(eq(proposals.id, proposalId));
}

async function venueAlerts(proposalId: number) {
  return db
    .select({ body: adminEvents.body, key: adminEvents.eventKey })
    .from(adminEvents)
    .where(
      sql`${adminEvents.type} = 'proposal.venue' AND ${adminEvents.entityId} = ${proposalId}`,
    );
}

describe("réservation des terrains (VENUE-001)", () => {
  let admin: TestPlayer;

  beforeEach(async () => {
    await resetDatabase();
    admin = await promoteToAdmin(await createPlayer());
  });

  it("VENUE-001 — la salle garde sa page de réservation, en http(s) seulement", async () => {
    const [arena] = (await admin.caller.admin.venues()).filter(
      (venue) => venue.slug === "arena",
    );
    const base = {
      name: arena!.name,
      description: arena!.description,
      images: arena!.images,
      active: true,
    };
    const url =
      "https://www.sport-finder.com/fr/center/fit-five/booking/field_rental/116/book?sport=1";

    const saved = await admin.caller.admin.updateVenue({
      venueId: arena!.id,
      data: { ...base, bookingUrl: url },
    });
    expect(saved.bookingUrl).toBe(url);

    // La valeur finit dans un lien : rien d'autre que http(s).
    await expect(
      admin.caller.admin.updateVenue({
        venueId: arena!.id,
        data: { ...base, bookingUrl: "javascript:alert(1)" },
      }),
    ).rejects.toThrow();

    // Absente, elle reste ; vide, elle s'efface.
    const kept = await admin.caller.admin.updateVenue({
      venueId: arena!.id,
      data: base,
    });
    expect(kept.bookingUrl).toBe(url);
    const cleared = await admin.caller.admin.updateVenue({
      venueId: arena!.id,
      data: { ...base, bookingUrl: "" },
    });
    expect(cleared.bookingUrl).toBeNull();
  });

  it("VENUE-001 — le terrain déclaré réservé se lit sur la session, et la page vient de la salle", async () => {
    const [arena] = (await admin.caller.admin.venues()).filter(
      (venue) => venue.slug === "arena",
    );
    await admin.caller.admin.updateVenue({
      venueId: arena!.id,
      data: {
        name: arena!.name,
        description: arena!.description,
        images: arena!.images,
        active: true,
        bookingUrl: "https://reservation.example/arena",
      },
    });
    const proposal = await openFriendly(admin);
    const joueur = await createPlayer();

    const avant = await joueur.caller.proposals.get({
      proposalId: proposal.id,
    });
    expect(avant.venueBooked).toBe(false);

    const result = await admin.caller.admin.setVenueBooked({
      proposalId: proposal.id,
      booked: true,
    });
    expect(result.venueBookedAt).not.toBeNull();

    const apres = await joueur.caller.proposals.get({
      proposalId: proposal.id,
    });
    expect(apres.venueBooked).toBe(true);

    const [row] = (await admin.caller.admin.manageableProposals()).filter(
      (item) => item.id === proposal.id,
    );
    expect(row!.venueBookedAt).toBe(result.venueBookedAt);
    expect(row!.venueBookingUrl).toBe("https://reservation.example/arena");

    // La déclaration se retire si la réservation tombe chez l'exploitant.
    await admin.caller.admin.setVenueBooked({
      proposalId: proposal.id,
      booked: false,
    });
    const retire = await joueur.caller.proposals.get({
      proposalId: proposal.id,
    });
    expect(retire.venueBooked).toBe(false);
  });

  it("VENUE-001 — seule l'administration déclare un terrain", async () => {
    const proposal = await openFriendly(admin);
    const joueur = await createPlayer();
    await expect(
      joueur.caller.admin.setVenueBooked({
        proposalId: proposal.id,
        booked: true,
      }),
    ).rejects.toThrow();
  });

  it("VENUE-001 — huit inscrits sur dix la veille, terrain non réservé : l'administration est prévenue, une fois", async () => {
    const proposal = await openFriendly(admin);
    await setSignedUp(proposal.id, 8);
    const kickoff = new Date(proposal.startsAtUtc);
    const veille = new Date(kickoff.getTime() - 24 * 3_600_000);

    expect(await alertUnbookedVenues(veille)).toBe(1);
    const [alerte] = await venueAlerts(proposal.id);
    expect(alerte!.body).toContain("8/10 inscrits");
    expect(alerte!.body).toContain("pas encore réservé");

    // L'entretien repasse toutes les cinq minutes : pas de seconde alerte.
    expect(await alertUnbookedVenues(veille)).toBe(0);
    expect(await venueAlerts(proposal.id)).toHaveLength(1);
  });

  it("VENUE-001 — pas d'alerte trop tôt, trop vide, ou terrain déjà réservé", async () => {
    const proposal = await openFriendly(admin);
    const kickoff = new Date(proposal.startsAtUtc);

    // Sept sur dix : la session n'est pas encore « presque complète ».
    await setSignedUp(proposal.id, 7);
    expect(
      await alertUnbookedVenues(new Date(kickoff.getTime() - 24 * 3_600_000)),
    ).toBe(0);

    // Huit sur dix, mais trois jours avant : rien ne presse encore.
    await setSignedUp(proposal.id, 8);
    expect(
      await alertUnbookedVenues(new Date(kickoff.getTime() - 72 * 3_600_000)),
    ).toBe(0);

    // Huit sur dix la veille, terrain déjà déclaré : rien à signaler.
    await admin.caller.admin.setVenueBooked({
      proposalId: proposal.id,
      booked: true,
    });
    expect(
      await alertUnbookedVenues(new Date(kickoff.getTime() - 24 * 3_600_000)),
    ).toBe(0);
    expect(await venueAlerts(proposal.id)).toHaveLength(0);
  });
});
