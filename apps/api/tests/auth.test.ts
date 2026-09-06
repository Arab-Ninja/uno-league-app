import { beforeEach, describe, expect, it } from "vitest";
import { SIGNUP_BONUS_UNO } from "@uno/shared";
import {
  anonymousCaller,
  balanceOf,
  createPlayer,
  resetDatabase,
} from "./helpers.js";

/** Recette du domaine authentification (E2E-001 à E2E-003). */
describe("authentification", () => {
  beforeEach(resetDatabase);

  it("E2E-001 — une inscription valide crée un compte D3, niveau 1, 1000 UNO", async () => {
    const player = await createPlayer();
    const profile = await player.caller.players.me();

    expect(profile.division).toBe("D3");
    expect(profile.level).toBe(1);
    expect(profile.xp).toBe(0);
    expect(profile.unoPoints).toBe(SIGNUP_BONUS_UNO);
  });

  it("le bonus de bienvenue laisse une trace au registre (WAL-006)", async () => {
    const player = await createPlayer();
    const wallet = await player.caller.wallet.summary();

    expect(wallet.balance).toBe(SIGNUP_BONUS_UNO);
    expect(wallet.transactions).toHaveLength(1);
    expect(wallet.transactions[0]).toMatchObject({
      amount: SIGNUP_BONUS_UNO,
      balanceAfter: SIGNUP_BONUS_UNO,
      type: "signup_bonus",
    });
  });

  it("E2E-002 — un email déjà utilisé renvoie un conflit sans dupliquer", async () => {
    const player = await createPlayer({ email: "doublon@test.local" });

    await expect(
      createPlayer({ email: "doublon@test.local" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Aucun second compte, et le premier est intact.
    expect(await balanceOf(player.identity.playerId)).toBe(SIGNUP_BONUS_UNO);
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
    expect(profile.unoPoints).toBe(SIGNUP_BONUS_UNO);
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
