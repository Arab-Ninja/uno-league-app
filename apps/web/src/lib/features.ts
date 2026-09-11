import { trpc } from "./trpc.js";

/**
 * Ce que cet environnement ouvre (SQUAD-001).
 *
 * Le drapeau vient du **serveur**, pas du build : le mode s'ouvre alors en
 * changeant une variable d'environnement, sans recompiler ni redéployer
 * l'application web. `VITE_API_URL` est lu à la compilation, et un drapeau
 * qui suivrait le même chemin obligerait à reconstruire pour l'activer.
 *
 * Pendant le chargement, la réponse est `false` : mieux vaut un onglet qui
 * apparaît une demi-seconde plus tard qu'un onglet qui disparaît sous le
 * doigt.
 */
export function useFeatures(): { squad: boolean; ready: boolean } {
  const config = trpc.proposals.config.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  return {
    squad: config.data?.features.squad ?? false,
    ready: config.isSuccess,
  };
}
