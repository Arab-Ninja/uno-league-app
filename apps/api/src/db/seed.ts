import { closeDatabase } from "./client.js";
import { ensureAdminAccount } from "../services/auth.service.js";
import { DEMO_ACCOUNT_PASSWORD, seedDemoData } from "./seed-data.js";

/** Crée le compte administrateur puis le jeu de données de démonstration. */
async function main(): Promise<void> {
  await ensureAdminAccount();
  const result = await seedDemoData();

  if (result.skipped) {
    console.log("Des joueurs existent déjà : le seed n'a rien modifié.");
  } else {
    console.log(
      [
        `${result.playersCreated} joueurs`,
        `${result.shopItemsCreated} produits`,
        `${result.announcementsCreated} annonces`,
        `${result.proposalsCreated} sessions`,
        `${result.ordersCreated} commandes`,
      ].join(", ") + " créés.",
    );
    console.log(`Mot de passe des comptes de démonstration : ${DEMO_ACCOUNT_PASSWORD}`);
  }

  await closeDatabase();
}

main().catch((error: unknown) => {
  console.error("Échec du seed :", error);
  process.exitCode = 1;
});
