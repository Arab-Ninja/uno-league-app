import { beforeEach, describe, expect, it } from "vitest";
import { AppError } from "@uno/shared";
import { traduireErreur } from "../src/i18n/index.js";
import { assertAvatarCutOut } from "../src/storage/index.js";
import {
  createPlayer,
  promoteToAdmin,
  resetDatabase,
  type TestPlayer,
} from "./helpers.js";

const AVATAR_NOT_CUT_OUT =
  "La photo doit être détourée : mettez l'application à jour, puis reprenez la photo.";

/**
 * Photos de profil sans fond (PHOTO-003).
 *
 * Le détourage est obligatoire : la carte d'un joueur n'affiche plus de
 * cuisine ni de canapé. Deux choses le tiennent côté serveur — le refus d'une
 * photo arrivée avec son fond, et la liste des photos déjà en place que
 * l'administration repasse au détourage.
 */

describe("photo envoyée avec son fond (PHOTO-003)", () => {
  it("PHOTO-003 — un JPEG de joueur est refusé : il a gardé son fond", () => {
    expect(() => assertAvatarCutOut("image/jpeg", "user")).toThrow(AppError);
    expect(() => assertAvatarCutOut("image/jpeg", "user")).toThrow(
      AVATAR_NOT_CUT_OUT,
    );
  });

  it("PHOTO-003 — un WebP ou un PNG détouré passe", () => {
    expect(() => assertAvatarCutOut("image/webp", "user")).not.toThrow();
    expect(() => assertAvatarCutOut("image/png", "user")).not.toThrow();
  });

  it("PHOTO-003 — l'administration n'y est pas soumise", () => {
    expect(() => assertAvatarCutOut("image/jpeg", "admin")).not.toThrow();
  });

  it("PHOTO-003 — le refus se lit dans la langue du joueur", () => {
    expect(traduireErreur("en", AVATAR_NOT_CUT_OUT)).toMatch(/update the app/);
    expect(traduireErreur("nl", AVATAR_NOT_CUT_OUT)).toMatch(/werk de app bij/);
  });
});

describe("photos déjà en place (PHOTO-003)", () => {
  let admin: TestPlayer;

  beforeEach(async () => {
    await resetDatabase();
    admin = await promoteToAdmin(await createPlayer());
  });

  it("PHOTO-003 — la liste ne garde que les comptes actifs qui ont une photo", async () => {
    const avecPhoto = await createPlayer();
    const sansPhoto = await createPlayer();
    const supprime = await createPlayer();

    for (const joueur of [avecPhoto, supprime]) {
      await admin.caller.admin.updatePlayer({
        playerId: joueur.identity.playerId,
        profilePhotoUrl: "/uploads/avatars/essai.jpg",
      });
    }
    await admin.caller.admin.deletePlayerAccount({
      playerId: supprime.identity.playerId,
    });

    const photos = await admin.caller.admin.playerPhotos();
    const ids = photos.map((photo) => photo.playerId);

    expect(ids).toContain(avecPhoto.identity.playerId);
    expect(ids).not.toContain(sansPhoto.identity.playerId);
    expect(ids).not.toContain(supprime.identity.playerId);
    expect(
      photos.find((photo) => photo.playerId === avecPhoto.identity.playerId),
    ).toMatchObject({ profilePhotoUrl: "/uploads/avatars/essai.jpg" });
  });

  it("PHOTO-003 — la photo détourée remplace l'ancienne, cadrage compris", async () => {
    const joueur = await createPlayer();
    await admin.caller.admin.updatePlayer({
      playerId: joueur.identity.playerId,
      profilePhotoUrl: "/uploads/avatars/avec-fond.jpg",
      photoOffsetY: 62,
    });

    // Ce que fait l'écran d'administration après le détourage.
    await admin.caller.admin.updatePlayer({
      playerId: joueur.identity.playerId,
      profilePhotoUrl: "/uploads/avatars/detouree.webp",
      reason: "Détourage de la photo de profil",
    });

    const profil = await admin.caller.admin.player({
      playerId: joueur.identity.playerId,
    });
    expect(profil.profilePhotoUrl).toBe("/uploads/avatars/detouree.webp");
    expect(profil.photoOffsetY).toBe(62);
  });

  it("PHOTO-003 — un joueur ne peut pas lire la liste", async () => {
    const joueur = await createPlayer();
    await expect(joueur.caller.admin.playerPhotos()).rejects.toThrow();
  });
});
