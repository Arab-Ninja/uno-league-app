import { afterEach, describe, expect, it, vi } from "vitest";
import {
  answerAppUpdate,
  compareVersions,
  decideAppUpdate,
  resetAppUpdateCache,
  type AppUpdateManifest,
} from "../src/services/app-update.service.js";

/**
 * Mises à jour à chaud servies par la ligue (OTA-001).
 *
 * Le plugin de l'application demande à chaque lancement s'il y a plus récent.
 * La réponse doit être juste à la version près : un paquet de trop remplace
 * un binaire neuf par du code ancien, ou envoie à un vieux binaire un code
 * qui appelle un plugin natif qu'il n'a pas.
 */

const SITE = "https://unoleague.test";
const CHECKSUM = "a".repeat(64);

const manifest: AppUpdateManifest = {
  version: "1.0.8",
  fichier: "uno-1.0.8-aaaaaaaaaa.zip",
  checksum: CHECKSUM,
  natifMinimum: "1.0.6",
};

const AUCUNE = expect.objectContaining({ kind: "up_to_date" });

describe("mises à jour à chaud (OTA-001)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAppUpdateCache();
  });

  it("OTA-001 — compare les versions numériquement", () => {
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    expect(compareVersions("1.0.6", "1.0.6")).toBe(0);
    expect(compareVersions("1.0.6", "1.1.0")).toBe(-1);
    expect(compareVersions("builtin", "1.0.6")).toBeNull();
  });

  it("OTA-001 — propose le paquet à un binaire qui ne l'a pas", () => {
    expect(
      decideAppUpdate(
        manifest,
        { version_build: "1.0.6", version_name: "builtin" },
        SITE,
      ),
    ).toEqual({
      version: "1.0.8",
      url: `${SITE}/ota/uno-1.0.8-aaaaaaaaaa.zip`,
      checksum: CHECKSUM,
    });
    expect(
      decideAppUpdate(
        manifest,
        { version_build: "1.0.6", version_name: "1.0.7" },
        SITE,
      ),
    ).toMatchObject({ version: "1.0.8" });
  });

  it("OTA-001 — rien pour un appareil déjà à jour", () => {
    expect(
      decideAppUpdate(
        manifest,
        { version_build: "1.0.6", version_name: "1.0.8" },
        SITE,
      ),
    ).toEqual(AUCUNE);
  });

  it("OTA-001 — jamais moins récent que le binaire installé", () => {
    // Le store vient d'installer 1.0.8 : le même numéro n'apporte rien.
    expect(
      decideAppUpdate(
        manifest,
        { version_build: "1.0.8", version_name: "builtin" },
        SITE,
      ),
    ).toEqual(AUCUNE);
    expect(
      decideAppUpdate(
        manifest,
        { version_build: "1.0.9", version_name: "builtin" },
        SITE,
      ),
    ).toEqual(AUCUNE);
  });

  it("OTA-001 — rien pour un binaire plus ancien que le minimum natif", () => {
    expect(
      decideAppUpdate(
        { ...manifest, natifMinimum: "1.0.7" },
        { version_build: "1.0.6", version_name: "builtin" },
        SITE,
      ),
    ).toEqual(AUCUNE);
  });

  it("OTA-001 — un retour en arrière reste possible", () => {
    // 1.0.9 était défectueux : le manifeste repasse à 1.0.8.
    expect(
      decideAppUpdate(
        manifest,
        { version_build: "1.0.6", version_name: "1.0.9" },
        SITE,
      ),
    ).toMatchObject({ version: "1.0.8" });
  });

  it("OTA-001 — une demande malformée ou sans manifeste ne reçoit rien", () => {
    expect(decideAppUpdate(null, { version_build: "1.0.6" }, SITE)).toEqual(
      AUCUNE,
    );
    expect(decideAppUpdate(manifest, {}, SITE)).toEqual(AUCUNE);
    expect(
      decideAppUpdate(manifest, { version_build: 106, version_name: [] }, SITE),
    ).toEqual(AUCUNE);
  });

  it("OTA-001 — lit le manifeste publié par le site, et ignore une page HTML", async () => {
    const fetchManifeste = vi.fn(async (_url: string) =>
      Response.json({ ...manifest, taille: 8_000_000 }),
    );
    vi.stubGlobal("fetch", fetchManifeste);

    await expect(
      answerAppUpdate({ version_build: "1.0.6", version_name: "builtin" }),
    ).resolves.toMatchObject({
      version: "1.0.8",
      url: `${SITE}/ota/uno-1.0.8-aaaaaaaaaa.zip`,
    });
    // Mémorisé : une seconde demande ne relit pas le site.
    await answerAppUpdate({ version_build: "1.0.6" });
    expect(fetchManifeste).toHaveBeenCalledTimes(1);
    expect(String(fetchManifeste.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/unoleague\.test\/ota\/manifest\.json\?t=\d+$/,
    );

    // Sans manifeste, le site renvoie sa page d'accueil : aucune mise à jour.
    resetAppUpdateCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<!doctype html><html></html>")),
    );
    await expect(
      answerAppUpdate({ version_build: "1.0.6", version_name: "builtin" }),
    ).resolves.toEqual(AUCUNE);
  });
});
