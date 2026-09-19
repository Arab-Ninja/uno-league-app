import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { countInconsistentBalances } from "../src/services/ledger.service.js";
import { deviceTokens, players, sessions, users } from "../src/db/schema.js";
import {
  anonymousCaller,
  balanceOf,
  createFundedPlayer,
  createPlayer,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

/**
 * Suppression d'un compte joueur (ADMIN-012).
 *
 * Ce qui est vérifié ici n'est pas une fonctionnalité : c'est une promesse
 * publiée. La page `/suppression-compte.html`, déclarée à Google Play, dit ce
 * qui est effacé et ce qui est conservé. Ces tests sont la relecture de cette
 * page côté base de données — et la seule chose qui empêchera un remaniement
 * futur de la démentir en silence.
 */

async function compte(player: TestPlayer) {
  const [row] = await db
    .select({
      email: users.email,
      status: users.status,
      passwordHash: users.passwordHash,
      displayName: players.displayName,
      firstName: players.firstName,
      lastName: players.lastName,
      address: players.address,
      nationality: players.nationality,
      dateOfBirth: players.dateOfBirth,
      photo: players.profilePhotoUrl,
      isSupervisor: players.isSupervisor,
    })
    .from(players)
    .innerJoin(users, eq(users.id, players.userId))
    .where(eq(players.id, player.identity.playerId))
    .limit(1);
  return row!;
}

describe("suppression d'un compte (ADMIN-012)", () => {
  let admin: TestPlayer;

  beforeEach(async () => {
    await resetDatabase();
    admin = await promoteToAdmin(await createPlayer());
  });

  it("ADMIN-012 — l'identité disparaît, le compte reste", async () => {
    const joueur = await createPlayer({
      firstName: "Yassine",
      lastName: "Bakhtaoui",
    });

    await admin.caller.admin.deletePlayerAccount({
      playerId: joueur.identity.playerId,
    });

    const apres = await compte(joueur);

    // Rien de ce qui désignait une personne ne subsiste.
    expect(apres.displayName).toBe("Joueur supprimé");
    expect(apres.firstName).not.toContain("Yassine");
    expect(apres.lastName).not.toContain("Bakhtaoui");
    expect(apres.email).not.toBe(joueur.email);
    expect(apres.email).toContain(".invalid");
    expect(apres.address).toBeNull();
    expect(apres.photo).toBeNull();
    expect(apres.dateOfBirth).toBe("1900-01-01");
    expect(apres.status).toBe("anonymized");

    // La ligne, elle, existe toujours : c'est ce qui permet aux feuilles de
    // match et au registre de continuer à y renvoyer.
    expect(apres.displayName.length).toBeGreaterThan(0);
  });

  it("ADMIN-012 — on ne peut plus se connecter, ni par l'ancienne adresse ni par la nouvelle", async () => {
    const joueur = await createPlayer({ password: "Password1" });

    await admin.caller.admin.deletePlayerAccount({
      playerId: joueur.identity.playerId,
    });

    const anonyme = anonymousCaller();

    await expect(
      anonyme.auth.login({ email: joueur.email, password: "Password1" }),
    ).rejects.toThrow();

    // Et le mot de passe d'origine ne vaut rien sur l'adresse de remplacement.
    const apres = await compte(joueur);
    await expect(
      anonyme.auth.login({ email: apres.email, password: "Password1" }),
    ).rejects.toThrow();
  });

  it("ADMIN-012 — les sessions ouvertes tombent, sur tous les appareils", async () => {
    const joueur = await createPlayer();

    const avant = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, joueur.identity.userId));
    expect(avant.length).toBeGreaterThan(0);

    await admin.caller.admin.deletePlayerAccount({
      playerId: joueur.identity.playerId,
    });

    const apres = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, joueur.identity.userId));
    expect(apres).toHaveLength(0);
  });

  it("ADMIN-012 — plus aucun appareil n'est joignable au nom du compte", async () => {
    const joueur = await createPlayer();

    await db.insert(deviceTokens).values({
      playerId: joueur.identity.playerId,
      platform: "android",
      transport: "fcm",
      pushToken: "jeton-de-test",
    });

    const resultat = await admin.caller.admin.deletePlayerAccount({
      playerId: joueur.identity.playerId,
    });
    expect(resultat.devicesRemoved).toBe(1);

    const restants = await db
      .select({ id: deviceTokens.id })
      .from(deviceTokens)
      .where(eq(deviceTokens.playerId, joueur.identity.playerId));
    expect(restants).toHaveLength(0);
  });

  it("ADMIN-012 — le solde est repris par une écriture, pas par une remise à zéro", async () => {
    /*
     * Le solde d'un joueur vaut la somme de son historique (WAL-006). Écrire
     * `0` dans la colonne romprait cette égalité pour toujours, sur un compte
     * dont le registre se conserve pourtant sept ans. La vérification porte
     * donc sur les deux : le solde **et** la ligne qui l'explique.
     */
    const joueur = await createFundedPlayer();
    expect(await balanceOf(joueur.identity.playerId)).toBe(1000);

    const resultat = await admin.caller.admin.deletePlayerAccount({
      playerId: joueur.identity.playerId,
    });

    expect(resultat.unoReclaimed).toBe(1000);
    expect(await balanceOf(joueur.identity.playerId)).toBe(0);

    // Le contrôle qui compte : aucun solde de la ligue ne diverge de son
    // registre. Une remise à zéro directe le ferait échouer ici.
    expect(await countInconsistentBalances(db)).toBe(0);
  });

  it("ADMIN-012 — un administrateur ne peut pas supprimer son propre compte", async () => {
    await expect(
      admin.caller.admin.deletePlayerAccount({
        playerId: admin.identity.playerId,
      }),
    ).rejects.toThrow(/propre compte/i);
  });

  it("ADMIN-012 — un autre administrateur doit d'abord perdre son rôle", async () => {
    const second = await promoteToAdmin(await createPlayer());

    await expect(
      admin.caller.admin.deletePlayerAccount({
        playerId: second.identity.playerId,
      }),
    ).rejects.toThrow(/administrateur/i);
  });

  it("ADMIN-012 — un compte déjà supprimé ne se supprime pas deux fois", async () => {
    const joueur = await createPlayer();

    await admin.caller.admin.deletePlayerAccount({
      playerId: joueur.identity.playerId,
    });

    await expect(
      admin.caller.admin.deletePlayerAccount({
        playerId: joueur.identity.playerId,
      }),
    ).rejects.toThrow(/déjà supprimé/i);
  });

  it("ADMIN-012 — un joueur ordinaire ne peut pas supprimer un compte", async () => {
    const joueur = await createPlayer();
    const victime = await createPlayer();

    await expect(
      joueur.caller.admin.deletePlayerAccount({
        playerId: victime.identity.playerId,
      }),
    ).rejects.toThrow();
  });

  it("ADMIN-012 — l'aperçu annonce le solde et le motif d'un refus avant d'agir", async () => {
    const riche = await createFundedPlayer();

    const vu = await admin.caller.admin.previewPlayerDeletion({
      playerId: riche.identity.playerId,
    });
    expect(vu.unoPoints).toBe(1000);
    expect(vu.isAdmin).toBe(false);
    expect(vu.isSelf).toBe(false);
    expect(vu.alreadyDeleted).toBe(false);

    const soi = await admin.caller.admin.previewPlayerDeletion({
      playerId: admin.identity.playerId,
    });
    expect(soi.isSelf).toBe(true);

    // L'aperçu n'agit pas : le compte est intact après l'avoir consulté.
    expect(await balanceOf(riche.identity.playerId)).toBe(1000);
  });

  it("ADMIN-012 — la trace d'audit ne recopie pas l'identité qu'on vient d'effacer", async () => {
    /*
     * Le journal se conserve douze mois. Y écrire l'adresse et le nom
     * supprimés rendrait la suppression vaine pendant un an — c'est le genre
     * de détail qu'un remaniement bien intentionné rajoute « pour la
     * traçabilité ».
     */
    const joueur = await createPlayer({
      firstName: "Yassine",
      lastName: "Bakhtaoui",
    });
    const adresse = joueur.email;

    await admin.caller.admin.deletePlayerAccount({
      playerId: joueur.identity.playerId,
    });

    const entrees = await admin.caller.admin.auditLogs({ limit: 50 });
    const trace = JSON.stringify(entrees);

    expect(trace).toContain("user.account.delete");
    expect(trace).not.toContain(adresse);
    expect(trace).not.toContain("Bakhtaoui");
  });
});
