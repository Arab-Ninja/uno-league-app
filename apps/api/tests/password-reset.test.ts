import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Réinitialisation de mot de passe (AUTH-009).
 *
 * **Le transport est remplacé, le reste ne l'est pas.** Les tests tournent
 * contre la vraie base : jetons, unicité, transactions et révocation de
 * sessions s'y jouent réellement. Seul l'envoi SMTP est doublé — le joindre
 * demanderait un serveur de courrier, et ce qu'on veut vérifier ici n'est pas
 * qu'un message part, mais *ce qu'il contient* et *ce que le jeton autorise*.
 *
 * Deux propriétés méritent qu'on insiste, parce qu'elles ne se voient pas en
 * lisant le code : le jeton n'est jamais en clair dans la base, et la réponse
 * de l'API ne dit pas si l'adresse a un compte.
 */

const envois: { to: string; subject: string; text: string; html: string }[] = [];

vi.mock("../src/email/mailer.js", () => ({
  mailEnabled: () => true,
  mailCredentials: () => ({
    host: "smtp.test.local",
    port: 587,
    user: "test",
    password: "test",
    from: "UNO League <test@test.local>",
  }),
  sendMail: vi.fn(async (mail: (typeof envois)[number]) => {
    envois.push(mail);
    return true;
  }),
  closeMailer: () => undefined,
}));

const { db } = await import("../src/db/client.js");
const { passwordResetTokens, sessions, users } = await import(
  "../src/db/schema.js"
);
const { RESET_TTL_MINUTES } = await import(
  "../src/services/password-reset.service.js"
);
const { anonymousCaller, createPlayer, resetDatabase } = await import(
  "./helpers.js"
);

/**
 * Crée un joueur et oublie le courrier de bienvenue.
 *
 * L'inscription envoie désormais un message d'accueil (MAIL-001), qui n'a rien
 * à faire dans les vérifications de ce fichier — il y occuperait la première
 * place du journal d'envois et décalerait tous les index. Il a son propre test,
 * juste en dessous.
 */
async function creerJoueur(
  overrides?: Parameters<typeof createPlayer>[0],
): Promise<Awaited<ReturnType<typeof createPlayer>>> {
  const joueur = await createPlayer(overrides);
  envois.length = 0;
  return joueur;
}

/** Le jeton tel qu'il voyage : extrait du lien contenu dans le courrier. */
function tokenDuDernierCourrier(): string {
  const dernier = envois.at(-1);
  if (!dernier) throw new Error("aucun courrier envoyé");
  const trouve = /\/mot-de-passe\/([A-Za-z0-9_-]+)/.exec(dernier.text);
  if (!trouve?.[1]) throw new Error(`lien introuvable dans : ${dernier.text}`);
  return trouve[1];
}

// `PUBLIC_WEB_URL` est posée dans `setup.ts` : `env.ts` fige la configuration
// au premier import applicatif, donc avant qu'un `beforeAll` puisse parler.

beforeEach(async () => {
  await resetDatabase();
  envois.length = 0;
});

describe("demande de réinitialisation (AUTH-009)", () => {
  it("AUTH-009 — une adresse inconnue ne lève pas et n'envoie rien", async () => {
    /*
     * La propriété qui compte : l'appelant ne peut pas distinguer une adresse
     * inscrite d'une adresse qui ne l'est pas. Sans quoi le formulaire devient
     * un annuaire de comptes, essayé adresse par adresse.
     */
    await expect(
      anonymousCaller().auth.requestPasswordReset({
        email: "personne@test.local",
      }),
    ).resolves.toEqual({ success: true });

    expect(envois).toHaveLength(0);
  });

  it("AUTH-009 — un compte existant reçoit un lien, et la réponse est la même", async () => {
    const joueur = await creerJoueur();

    const reponse = await anonymousCaller().auth.requestPasswordReset({
      email: joueur.email,
    });

    // Mot pour mot la réponse de l'adresse inconnue.
    expect(reponse).toEqual({ success: true });
    expect(envois).toHaveLength(1);
    expect(envois[0]!.to).toBe(joueur.email);
    expect(envois[0]!.text).toContain("https://unoleague.test/mot-de-passe/");
    // Les deux versions partent : un message sans texte est signalé comme
    // pourriel par la plupart des filtres.
    expect(envois[0]!.html).toContain("<!doctype html>");
  });

  it("AUTH-009 — le jeton n'est jamais stocké en clair", async () => {
    /*
     * Le test qui justifie tout le reste. Un jeton lisible en base vaut le
     * compte : qui lit la table peut réinitialiser n'importe qui, y compris
     * un administrateur.
     */
    const joueur = await creerJoueur();
    await anonymousCaller().auth.requestPasswordReset({ email: joueur.email });

    const token = tokenDuDernierCourrier();
    const lignes = await db.select().from(passwordResetTokens);

    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.tokenHash).not.toBe(token);
    expect(lignes[0]!.tokenHash).toHaveLength(64);
    expect(lignes[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("AUTH-009 — un compte suspendu ne reçoit rien", async () => {
    const joueur = await creerJoueur();
    await db
      .update(users)
      .set({ status: "suspended" })
      .where(eq(users.id, joueur.identity.userId));

    await expect(
      anonymousCaller().auth.requestPasswordReset({ email: joueur.email }),
    ).resolves.toEqual({ success: true });

    expect(envois).toHaveLength(0);
  });

  it("AUTH-009 — demander deux fois n'invalide pas le premier lien", async () => {
    /*
     * Le premier courrier tarde, on reclique : c'est le comportement normal.
     * Un premier lien annulé par le second enfermerait dehors celui qui ouvre
     * le courrier le plus ancien — et il n'a aucun moyen de le savoir.
     */
    const joueur = await creerJoueur();

    await anonymousCaller().auth.requestPasswordReset({ email: joueur.email });
    const premier = tokenDuDernierCourrier();
    await anonymousCaller().auth.requestPasswordReset({ email: joueur.email });
    const second = tokenDuDernierCourrier();

    expect(premier).not.toBe(second);

    await expect(
      anonymousCaller().auth.resetPassword({
        token: premier,
        newPassword: "NouveauMdp1",
      }),
    ).resolves.toEqual({ success: true });
  });
});

describe("courrier de bienvenue (MAIL-001)", () => {
  it("MAIL-001 — l'inscription annonce quelle adresse porte le compte", async () => {
    /*
     * Ce n'est pas une politesse. Une faute de frappe à l'inscription ne se
     * découvre autrement que le jour où l'on a besoin d'un lien de
     * réinitialisation — c'est-à-dire quand il est trop tard pour la corriger
     * soi-même.
     */
    const joueur = await createPlayer();

    expect(envois).toHaveLength(1);
    expect(envois[0]!.to).toBe(joueur.email);
    expect(envois[0]!.subject).toContain("Bienvenue");
    expect(envois[0]!.text).toContain(joueur.email);
  });
});

describe("usage d'un lien (AUTH-009)", () => {
  it("AUTH-009 — le nouveau mot de passe remplace l'ancien", async () => {
    const joueur = await creerJoueur({ password: "Password1" });
    await anonymousCaller().auth.requestPasswordReset({ email: joueur.email });

    await anonymousCaller().auth.resetPassword({
      token: tokenDuDernierCourrier(),
      newPassword: "ToutAutre9",
    });

    await expect(
      anonymousCaller().auth.login({
        email: joueur.email,
        password: "ToutAutre9",
      }),
    ).resolves.toMatchObject({ user: { email: joueur.email } });

    // L'ancien ne vaut plus rien : sans cela, un compte pris par quelqu'un
    // d'autre resterait accessible avec le mot de passe qu'il avait posé.
    await expect(
      anonymousCaller().auth.login({
        email: joueur.email,
        password: "Password1",
      }),
    ).rejects.toThrow();
  });

  it("AUTH-009 — toutes les sessions tombent", async () => {
    /*
     * C'est le point de la manœuvre. Si l'oubli vient d'un compte pris par
     * quelqu'un d'autre, laisser ouvertes les sessions de l'intrus rendrait
     * la réinitialisation décorative.
     */
    const joueur = await creerJoueur();
    await anonymousCaller().auth.login({
      email: joueur.email,
      password: "Password1",
    });

    const avant = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, joueur.identity.userId));
    expect(avant.length).toBeGreaterThan(0);

    await anonymousCaller().auth.requestPasswordReset({ email: joueur.email });
    await anonymousCaller().auth.resetPassword({
      token: tokenDuDernierCourrier(),
      newPassword: "ToutAutre9",
    });

    const apres = await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, joueur.identity.userId));
    expect(apres).toHaveLength(0);
  });

  it("AUTH-009 — un lien ne sert qu'une fois", async () => {
    const joueur = await creerJoueur();
    await anonymousCaller().auth.requestPasswordReset({ email: joueur.email });
    const token = tokenDuDernierCourrier();

    await anonymousCaller().auth.resetPassword({
      token,
      newPassword: "ToutAutre9",
    });

    await expect(
      anonymousCaller().auth.resetPassword({
        token,
        newPassword: "EncoreAutre8",
      }),
    ).rejects.toThrow(/n'est plus valable/);
  });

  it("AUTH-009 — utiliser un lien consomme les autres du même compte", async () => {
    /*
     * Trois demandes laissent trois jetons vivants. Une fois le propriétaire
     * revenu aux commandes, les deux autres n'ont plus de raison d'ouvrir son
     * compte — et un lien qui traîne dans une boîte est exactement ce qu'on
     * cherche à ne pas laisser.
     */
    const joueur = await creerJoueur();
    await anonymousCaller().auth.requestPasswordReset({ email: joueur.email });
    const premier = tokenDuDernierCourrier();
    await anonymousCaller().auth.requestPasswordReset({ email: joueur.email });
    const second = tokenDuDernierCourrier();

    await anonymousCaller().auth.resetPassword({
      token: second,
      newPassword: "ToutAutre9",
    });

    await expect(
      anonymousCaller().auth.resetPassword({
        token: premier,
        newPassword: "EncoreAutre8",
      }),
    ).rejects.toThrow(/n'est plus valable/);
  });

  it("AUTH-009 — un lien périmé est refusé", async () => {
    const joueur = await creerJoueur();
    await anonymousCaller().auth.requestPasswordReset({ email: joueur.email });
    const token = tokenDuDernierCourrier();

    // On vieillit la ligne plutôt que d'attendre une heure.
    await db
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResetTokens.userId, joueur.identity.userId));

    await expect(
      anonymousCaller().auth.resetPassword({
        token,
        newPassword: "ToutAutre9",
      }),
    ).rejects.toThrow(/n'est plus valable/);
  });

  it("AUTH-009 — un jeton inventé est refusé comme un jeton périmé", async () => {
    /*
     * Le même message pour les trois refus. Distinguer « inconnu » de « déjà
     * utilisé » renseignerait qui essaie des jetons au hasard sur ce qu'il a
     * touché, et l'utilisateur légitime fait de toute façon la même chose
     * dans les trois cas : redemander un lien.
     */
    await expect(
      anonymousCaller().auth.resetPassword({
        token: "jeton-totalement-invente-mais-assez-long",
        newPassword: "ToutAutre9",
      }),
    ).rejects.toThrow(/n'est plus valable/);
  });

  it("AUTH-009 — la durée annoncée dans le courrier est celle qui s'applique", async () => {
    /*
     * Un message qui promet une heure et un jeton qui vit dix minutes est
     * pire qu'un lien sans promesse : le joueur croit avoir le temps.
     */
    const joueur = await creerJoueur();
    await anonymousCaller().auth.requestPasswordReset({ email: joueur.email });

    expect(envois[0]!.text).toContain(`${RESET_TTL_MINUTES} minutes`);

    const [ligne] = await db.select().from(passwordResetTokens);
    const dureeMinutes = Math.round(
      (ligne!.expiresAt.getTime() - ligne!.createdAt.getTime()) / 60_000,
    );
    expect(dureeMinutes).toBe(RESET_TTL_MINUTES);
  });
});
