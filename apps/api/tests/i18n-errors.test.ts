import { TRPCError } from "@trpc/server";
import {
  AppError,
  ERROR_LABELS_FR,
  ORDER_STATUS_LABELS,
  TOURNAMENT_ROUND_LABELS,
  gabarit,
} from "@uno/shared";
import { describe, expect, it } from "vitest";
import { CATALOGUE_ERREURS, LIBELLES_ERREURS } from "../src/i18n/erreurs.js";
import { LOCALE_HEADER, localeDeRequete } from "../src/i18n/index.js";
import { formaterErreur } from "../src/trpc/init.js";
import { releverMessages } from "./i18n-extraction.js";

/**
 * I18N-002 — les messages d'erreur du serveur, dans la langue du joueur.
 */

const jetons = (texte: string) =>
  [...texte.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("catalogue des messages d'erreur", () => {
  const { textes, inconnus } = releverMessages();

  it("chaque message du code se plie en texte", () => {
    // Un message fait d'une variable échappe au relevé, donc au catalogue :
    // il doit passer par `gabarit()`.
    expect(inconnus).toEqual([]);
  });

  it("chaque message du code a sa traduction anglaise et néerlandaise", () => {
    const manquants = [...textes.entries()]
      .filter(([texte]) => !CATALOGUE_ERREURS[texte])
      .map(([texte, ou]) => `${ou} — ${texte}`);
    expect(manquants).toEqual([]);
  });

  it("le catalogue ne garde pas de traduction orpheline", () => {
    // Un message retouché laisse derrière lui l'ancienne clé : elle ne sert
    // plus, et sa présence ferait croire qu'il est traduit.
    const orphelins = Object.keys(CATALOGUE_ERREURS).filter(
      (texte) => !textes.has(texte),
    );
    expect(orphelins).toEqual([]);
  });

  it("chaque traduction garde exactement les mêmes {jetons}", () => {
    const ecarts: string[] = [];
    for (const [texte, traductions] of Object.entries(CATALOGUE_ERREURS)) {
      for (const [langue, traduit] of Object.entries(traductions)) {
        if (jetons(traduit).join() !== jetons(texte).join()) {
          ecarts.push(`${langue} — ${texte}`);
        }
      }
    }
    expect(ecarts).toEqual([]);
  });

  it("aucune traduction n'est restée en français", () => {
    const suspects = Object.entries(CATALOGUE_ERREURS)
      .filter(([texte, t]) => t.en === texte || t.nl === texte)
      .map(([texte]) => texte);
    expect(suspects).toEqual([]);
  });

  it("les libellés français cités suivent ceux du domaine", () => {
    for (const [cle, libelle] of Object.entries(ORDER_STATUS_LABELS)) {
      expect(ERROR_LABELS_FR.orderStatus[cle]).toBe(libelle.toLowerCase());
    }
    for (const [cle, libelle] of Object.entries(TOURNAMENT_ROUND_LABELS)) {
      expect(ERROR_LABELS_FR.tournamentRound[cle]).toBe(libelle.toLowerCase());
    }
  });

  it("chaque langue a les mêmes libellés que le français", () => {
    for (const langue of ["en", "nl"] as const) {
      for (const [famille, libelles] of Object.entries(ERROR_LABELS_FR)) {
        expect(
          Object.keys(
            LIBELLES_ERREURS[langue][famille as keyof typeof ERROR_LABELS_FR],
          ).sort(),
        ).toEqual(Object.keys(libelles).sort());
      }
    }
  });
});

describe("langue d'une requête", () => {
  it("l'en-tête de l'application l'emporte sur le compte", () => {
    expect(localeDeRequete({ [LOCALE_HEADER]: "nl" }, "en")).toBe("nl");
  });

  it("sans en-tête, la langue du compte", () => {
    expect(localeDeRequete({ "accept-language": "nl-BE" }, "en")).toBe("en");
  });

  it("sans compte, celle du navigateur", () => {
    expect(
      localeDeRequete({ "accept-language": "de-DE,nl;q=0.8,en;q=0.5" }, null),
    ).toBe("nl");
  });

  it("une valeur inconnue ne passe pas", () => {
    expect(localeDeRequete({ [LOCALE_HEADER]: "xx" }, null)).toBe("fr");
  });
});

describe("rendu des erreurs pour le client", () => {
  const rendre = (error: TRPCError, locale: "fr" | "en" | "nl") =>
    formaterErreur({
      shape: { message: error.message, code: -32600, data: {} },
      error,
      ctx: { locale },
    });

  const metier = (cause: AppError) =>
    new TRPCError({ code: "CONFLICT", message: cause.message, cause });

  it("une erreur métier se lit dans la langue de la requête", () => {
    const cause = new AppError(
      "RULE_VIOLATION",
      gabarit("L'équipe {camp} est complète ({taille} joueurs).", {
        camp: "A",
        taille: 5,
      }),
    );
    expect(rendre(metier(cause), "en").message).toBe(
      "Team A is full (5 players).",
    );
    expect(rendre(metier(cause), "nl").message).toBe(
      "Ploeg A is volzet (5 spelers).",
    );
    expect(rendre(metier(cause), "fr").message).toBe(
      "L'équipe A est complète (5 joueurs).",
    );
  });

  it("un libellé cité se traduit avec la phrase", () => {
    const cause = new AppError(
      "RULE_VIOLATION",
      gabarit("Une commande {de} ne peut pas passer à « {vers} ».", {
        de: { libelle: "orderStatus", cle: "fulfilled" },
        vers: { libelle: "orderStatus", cle: "pending" },
      }),
    );
    expect(cause.message).toBe(
      "Une commande livrée ne peut pas passer à « en attente ».",
    );
    expect(rendre(metier(cause), "en").message).toBe(
      "An order that is delivered cannot move to “pending”.",
    );
  });

  it("les messages par champ suivent", () => {
    const cause = new AppError(
      "VALIDATION_ERROR",
      gabarit("Une contre-offre monte la mise : au moins {minimum} UNO.", {
        minimum: 40,
      }),
      { stakeUno: gabarit("Au moins {minimum} UNO.", { minimum: 40 }) },
    );
    expect(cause.fields).toEqual({ stakeUno: "Au moins 40 UNO." });
    const rendu = rendre(metier(cause), "nl");
    expect(rendu.data).toMatchObject({
      appCode: "VALIDATION_ERROR",
      fields: { stakeUno: "Minstens 40 UNO." },
    });
  });

  it("le message par défaut d'un code se traduit aussi", () => {
    const cause = new AppError("INSUFFICIENT_FUNDS");
    expect(rendre(metier(cause), "en").message).toBe(
      "You do not have enough UNO points.",
    );
  });

  it("une erreur de protocole se traduit depuis son texte", () => {
    const erreur = new TRPCError({
      code: "UNAUTHORIZED",
      message: "Votre session a expiré. Veuillez vous reconnecter.",
    });
    expect(rendre(erreur, "nl").message).toBe(
      "Je sessie is verlopen. Meld je opnieuw aan.",
    );
  });
});
