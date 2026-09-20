import { beforeEach, describe, expect, it } from "vitest";
import { MIN_SIGNUP_AGE, ageOn } from "@uno/shared";
import {
  anonymousCaller,
  balanceOf,
  createPlayer,
  promoteToAdmin,
  resetDatabase,
} from "./helpers.js";

/** Recette du domaine authentification (E2E-001 à E2E-003). */
describe("authentification", () => {
  beforeEach(resetDatabase);

  it("E2E-001 — une inscription valide crée un compte D3, niveau 1, solde nul", async () => {
    const player = await createPlayer();
    const profile = await player.caller.players.me();

    expect(profile.division).toBe("D3");
    expect(profile.level).toBe(1);
    expect(profile.xp).toBe(0);
    expect(profile.unoPoints).toBe(0);
  });

  it("un compte neuf n'est crédité de rien (WAL-006)", async () => {
    /*
     * La ligue ne distribue pas de monnaie à l'inscription. Le registre part
     * donc vide — et c'est ce vide qu'on vérifie, plutôt que l'absence d'une
     * ligne : un solde non nul sans transaction serait une incohérence bien
     * plus grave qu'un bonus oublié.
     */
    const player = await createPlayer();
    const wallet = await player.caller.wallet.summary();

    expect(wallet.balance).toBe(0);
    expect(wallet.transactions).toHaveLength(0);
  });

  it("E2E-002 — un email déjà utilisé renvoie un conflit sans dupliquer", async () => {
    const player = await createPlayer({ email: "doublon@test.local" });

    await expect(
      createPlayer({ email: "doublon@test.local" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Aucun second compte, et le premier est intact.
    expect(await balanceOf(player.identity.playerId)).toBe(0);
  });

  it("AUTH-003 — l'email est normalisé avant enregistrement", async () => {
    await createPlayer({ email: "  MAJUSCULE@Test.Local " });
    const session = await anonymousCaller().auth.login({
      email: "majuscule@test.local",
      password: "Password1",
    });
    expect(session.user.email).toBe("majuscule@test.local");
  });

  it("AUTH-002 — un mot de passe non conforme est refusé", async () => {
    for (const password of ["court1A", "minuscules1", "SANSCHIFFRE"]) {
      await expect(createPlayer({ password })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
  });

  it("E2E-003 — un mauvais mot de passe et un email inconnu donnent la même réponse", async () => {
    await createPlayer({ email: "connu@test.local" });

    const attempt = async (email: string) =>
      anonymousCaller()
        .auth.login({ email, password: "Password2" })
        .then(() => null)
        .catch((error: unknown) => error as { message: string; code: string });

    const wrongPassword = await attempt("connu@test.local");
    const unknownEmail = await attempt("inconnu@test.local");

    expect(wrongPassword).toMatchObject({ code: "UNAUTHORIZED" });
    expect(unknownEmail).toMatchObject({ code: "UNAUTHORIZED" });
    // Aucune différence exploitable pour énumérer les comptes existants.
    expect(wrongPassword?.message).toBe(unknownEmail?.message);
  });

  it("AUTH-006 — une session absente renvoie null au lieu d'une erreur", async () => {
    expect(await anonymousCaller().auth.me()).toBeNull();
  });

  it("AUTH-010 — l'inscription est réservée aux majeurs", async () => {
    const minor = new Date();
    minor.setFullYear(minor.getFullYear() - 17);

    await expect(
      anonymousCaller().auth.signup({
        firstName: "Mineur",
        lastName: "Test",
        dateOfBirth: minor.toISOString().slice(0, 10),
        email: `mineur.${Date.now()}@test.local`,
        nationality: "BE",
        password: "Password1",
        profilePhotoUrl: null,
        accountType: "player",
      }),
    ).rejects.toThrow(/18 ans/i);

    // La veille de ses dix-huit ans ne suffit pas ; le jour même, oui.
    const exactly = new Date();
    exactly.setFullYear(exactly.getFullYear() - MIN_SIGNUP_AGE);
    expect(
      ageOn(
        exactly.toISOString().slice(0, 10),
        new Date().toISOString().slice(0, 10),
      ),
    ).toBe(MIN_SIGNUP_AGE);

    const veille = new Date(exactly);
    veille.setDate(veille.getDate() + 1);
    expect(
      ageOn(
        veille.toISOString().slice(0, 10),
        new Date().toISOString().slice(0, 10),
      ),
    ).toBe(MIN_SIGNUP_AGE - 1);
  });

  it("AUTH-009 — ni la date de naissance ni l'e-mail ne se modifient", async () => {
    const player = await createPlayer();
    const before = await player.caller.players.me();

    await player.caller.players.updateProfile({
      firstName: "Nouveau",
      // @ts-expect-error — le schéma n'accepte plus ces champs : c'est le test.
      dateOfBirth: "2010-01-01",
      email: "autre@test.local",
    });

    const after = await player.caller.players.me();
    expect(after.firstName).toBe("Nouveau");
    // Les deux identifient le compte : seule l'administration les corrige.
    expect(after.dateOfBirth).toBe(before.dateOfBirth);
    expect(after.email).toBe(before.email);
  });

  it("AUTH-007 — un joueur ne peut modifier ni sa division ni son solde", async () => {
    const player = await createPlayer();

    await player.caller.players.updateProfile({
      firstName: "Nouveau",
      lastName: "Nom",
      // @ts-expect-error — le schéma n'accepte pas ces champs : c'est le test.
      division: "D1",
      unoPoints: 999_999,
    });

    const profile = await player.caller.players.me();
    expect(profile.displayName).toBe("Nouveau Nom");
    expect(profile.division).toBe("D3");
    expect(profile.unoPoints).toBe(0);
  });

  it("AUTH-008 — le changement de mot de passe exige l'ancien", async () => {
    const player = await createPlayer({ email: "motdepasse@test.local" });

    await expect(
      player.caller.auth.changePassword({
        currentPassword: "Mauvais1",
        newPassword: "Nouveau1Mot",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await player.caller.auth.changePassword({
      currentPassword: "Password1",
      newPassword: "Nouveau1Mot",
    });

    const session = await anonymousCaller().auth.login({
      email: "motdepasse@test.local",
      password: "Nouveau1Mot",
    });
    expect(session.user.playerId).toBe(player.identity.playerId);
  });

  it("SEC-002 — une route privée sans session renvoie 401", async () => {
    await expect(anonymousCaller().players.me()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("correction d'un joueur par l'administration (ADMIN-008)", () => {
  beforeEach(resetDatabase);

  it("ADMIN-008 — l'admin corrige ce que le joueur ne peut plus toucher", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();

    await admin.caller.admin.updatePlayer({
      playerId: player.identity.playerId,
      firstName: "Yassine",
      lastName: "Bakhtaoui",
      email: "corrige@test.local",
      dateOfBirth: "1990-06-15",
      reason: "Faute de frappe à l'inscription",
    });

    const corrected = await admin.caller.admin.player({
      playerId: player.identity.playerId,
    });
    expect(corrected.firstName).toBe("Yassine");
    expect(corrected.email).toBe("corrige@test.local");
    expect(corrected.dateOfBirth).toBe("1990-06-15");
    // Le nom d'affichage suit : c'est lui qui figure sur la carte.
    expect(corrected.displayName).toBe("Yassine Bakhtaoui");
  });

  it("ADMIN-008 — corriger vers un e-mail déjà pris est refusé", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const first = await createPlayer();
    const second = await createPlayer();

    await expect(
      admin.caller.admin.updatePlayer({
        playerId: second.identity.playerId,
        email: first.email,
      }),
    ).rejects.toThrow(/déjà utilisé/i);
  });

  it("ADMIN-009 — l'admin pose la photo d'un joueur, et d'un arbitre", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const joueur = await createPlayer();
    const arbitre = await createPlayer({ accountType: "referee" });

    for (const compte of [joueur, arbitre]) {
      await admin.caller.admin.updatePlayer({
        playerId: compte.identity.playerId,
        profilePhotoUrl: "/uploads/avatars/essai.webp",
        photoOffsetY: 70,
      });

      const relu = await admin.caller.admin.player({
        playerId: compte.identity.playerId,
      });
      expect(relu.profilePhotoUrl).toBe("/uploads/avatars/essai.webp");
      expect(relu.photoOffsetY).toBe(70);
    }
  });

  it("ADMIN-009 — ne toucher que la photo ne touche que la photo", async () => {
    /*
     * L'écran d'administration envoie un patch qui ne porte que
     * `profilePhotoUrl` et `photoOffsetY`. Si les champs absents étaient pris
     * pour des effacements, poser une photo viderait le nom, la date de
     * naissance et l'adresse du joueur — en silence.
     */
    const admin = await promoteToAdmin(await createPlayer());
    const joueur = await createPlayer();
    const avant = await admin.caller.admin.player({
      playerId: joueur.identity.playerId,
    });

    await admin.caller.admin.updatePlayer({
      playerId: joueur.identity.playerId,
      profilePhotoUrl: "/uploads/avatars/essai.webp",
    });

    const apres = await admin.caller.admin.player({
      playerId: joueur.identity.playerId,
    });
    expect(apres.firstName).toBe(avant.firstName);
    expect(apres.lastName).toBe(avant.lastName);
    expect(apres.displayName).toBe(avant.displayName);
    expect(apres.email).toBe(avant.email);
    expect(apres.dateOfBirth).toBe(avant.dateOfBirth);
    expect(apres.nationality).toBe(avant.nationality);
    expect(apres.position).toBe(avant.position);
  });

  it("ADMIN-009 — la photo se retire, et une adresse douteuse est refusée", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const joueur = await createPlayer();

    await admin.caller.admin.updatePlayer({
      playerId: joueur.identity.playerId,
      profilePhotoUrl: "/uploads/avatars/essai.webp",
    });

    // `null` efface pour de bon : c'est le seul moyen de retirer un visage
    // qui n'a rien à faire là.
    await admin.caller.admin.updatePlayer({
      playerId: joueur.identity.playerId,
      profilePhotoUrl: null,
    });
    expect(
      (await admin.caller.admin.player({ playerId: joueur.identity.playerId }))
        .profilePhotoUrl,
    ).toBeNull();

    // L'adresse finit dans un attribut `src` : les schémas sont nommés, pas
    // devinés.
    for (const douteuse of [
      "javascript:alert(1)",
      "/uploads/../../etc/passwd",
      "/etc/passwd",
    ]) {
      await expect(
        admin.caller.admin.updatePlayer({
          playerId: joueur.identity.playerId,
          profilePhotoUrl: douteuse,
        }),
      ).rejects.toThrow();
    }
  });

  it("ADMIN-008 — la majorité reste exigée, et un joueur n'y accède pas", async () => {
    const admin = await promoteToAdmin(await createPlayer());
    const player = await createPlayer();
    const minor = new Date();
    minor.setFullYear(minor.getFullYear() - 15);

    // Corriger une faute de frappe ne doit pas ouvrir la porte à un mineur.
    await expect(
      admin.caller.admin.updatePlayer({
        playerId: player.identity.playerId,
        dateOfBirth: minor.toISOString().slice(0, 10),
      }),
    ).rejects.toThrow(/18 ans/i);

    await expect(
      player.caller.admin.updatePlayer({
        playerId: player.identity.playerId,
        firstName: "Pirate",
      }),
    ).rejects.toThrow(/droits nécessaires/i);
  });
});
