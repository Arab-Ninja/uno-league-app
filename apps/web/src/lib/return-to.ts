/**
 * L'écran où revenir une fois connecté.
 *
 * La connexion le reçoit déjà dans l'état de navigation, mais l'inscription
 * passe par plusieurs écrans — formulaire, photo — et l'état ne survit pas au
 * trajet. Un ami qui ouvre une invitation sans compte finissait donc sur
 * l'accueil, la séance perdue. On garde la destination le temps de l'onglet.
 *
 * Seul un chemin interne est rendu (« /… », jamais « //… ») : une adresse
 * extérieure glissée ici ferait de la connexion une redirection ouverte.
 */
const KEY = "uno.returnTo";

/** Un chemin de l'application, et rien d'autre. */
export function internalPath(path: string | null | undefined): string | null {
  return path && path.startsWith("/") && !path.startsWith("//") ? path : null;
}

export function rememberReturnTo(path: string): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // Stockage indisponible (navigation privée stricte) : on rentrera à l'accueil.
  }
}

/**
 * Lire sans consommer : les redirections qui s'en servent s'exécutent au
 * rendu, que React peut répéter. C'est l'écran d'arrivée qui l'efface.
 */
export function peekReturnTo(): string | null {
  try {
    return internalPath(sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Rien à effacer.
  }
}

/** Lire et effacer d'un coup, depuis un geste (un bouton, un envoi). */
export function takeReturnTo(): string | null {
  const path = peekReturnTo();
  clearReturnTo();
  return path;
}
