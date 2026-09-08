import webpush from "web-push";

/**
 * Génère une paire de clés VAPID pour les notifications push (ANN-004).
 *
 * À exécuter **une seule fois**, puis à conserver : changer ces clés invalide
 * tous les abonnements existants, et chaque joueur devrait réautoriser les
 * notifications. Elles ne sont pas des secrets de session mais bien des
 * secrets d'application — la clé privée ne quitte jamais le serveur.
 *
 *   pnpm push:keys
 */
const keys = webpush.generateVAPIDKeys();

console.log("Clés VAPID générées. Ajoutez ces trois lignes à votre .env :\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:votre.email@exemple.com");
console.log(
  "\nConservez-les : les remplacer obligerait chaque joueur à réautoriser " +
    "les notifications.",
);
