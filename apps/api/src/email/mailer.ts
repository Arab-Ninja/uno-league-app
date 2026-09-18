import { createTransport, type Transporter } from "nodemailer";
import { env } from "../env.js";
import { logger } from "../lib/logger.js";

/**
 * Envoi de courrier (MAIL-001).
 *
 * **Pourquoi le courrier existe malgré les notifications.** Le push est un
 * canal d'attention : il prévient quelqu'un qui a déjà l'application, qui l'a
 * autorisée à sonner, et dont l'appareil est joignable. Le courrier est un
 * canal d'identité : il atteint un compte, pas un appareil. Deux choses ne
 * peuvent se faire que par lui — rendre l'accès à qui a oublié son mot de
 * passe, et joindre un joueur qui n'a activé aucune notification.
 *
 * **Pourquoi `nodemailer` ici, alors que Firebase a été écrit à la main.**
 * L'envoi Firebase tenait en deux appels HTTP et une signature : le faire
 * soi-même coûtait soixante lignes et évitait cinquante mégaoctets. SMTP est
 * d'un autre ordre. Il faut négocier STARTTLS, s'authentifier, composer un
 * corps MIME multipart, encoder en quoted-printable, plier les lignes à
 * soixante-dix-huit caractères et encoder les en-têtes accentués — « Séance
 * confirmée » dans un `Subject:` n'est pas de l'ASCII. Chacun de ces points
 * se rate silencieusement : le message part, et arrive illisible ou en
 * indésirable. Deux mégaoctets sont un prix honnête pour ne pas réécrire
 * trente ans de RFC.
 *
 * **L'envoi ne lève jamais.** Comme le push : être prévenu est un
 * supplément, et une panne de courrier ne doit pas faire échouer l'action
 * qu'elle annonce. La seule exception est la réinitialisation de mot de
 * passe, où l'appelant a besoin de savoir — le retour booléen le lui dit,
 * sans pour autant propager d'exception.
 */

export interface MailCredentials {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/**
 * Les identifiants, ou `null` si le courrier n'est pas configuré.
 *
 * L'absence est un état de marche valable — une ligue peut tourner sans
 * courrier —, à une réserve près, écrite dans `env.ts` : sans lui, un mot de
 * passe oublié est définitif.
 */
export function mailCredentials(): MailCredentials | null {
  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASSWORD, MAIL_FROM } = env;
  if (!MAIL_HOST || !MAIL_USER || !MAIL_PASSWORD || !MAIL_FROM) return null;

  return {
    host: MAIL_HOST,
    port: MAIL_PORT,
    user: MAIL_USER,
    password: MAIL_PASSWORD,
    from: MAIL_FROM,
  };
}

export function mailEnabled(): boolean {
  return mailCredentials() !== null;
}

/**
 * Le transport, construit une fois.
 *
 * `nodemailer` garde un jeu de connexions ouvertes et les réutilise : une
 * connexion SMTP demande une poignée de main TLS et une authentification, ce
 * qui se compte en centaines de millisecondes. En rouvrir une par message
 * ferait payer ce prix à chaque notification, et certains serveurs comptent
 * les connexions plutôt que les messages pour décider qu'on abuse.
 */
let transport: Transporter | null = null;

function transporter(credentials: MailCredentials): Transporter {
  if (transport) return transport;

  transport = createTransport({
    host: credentials.host,
    port: credentials.port,
    /*
     * Le port dit le chiffrement, et c'est la convention universelle : 465
     * chiffre dès la connexion (« SMTPS »), tout autre port commence en clair
     * et passe à TLS par STARTTLS. En faire une variable de configuration
     * aurait ajouté un réglage de plus à se tromper, pour une valeur qui se
     * déduit sans ambiguïté.
     */
    secure: credentials.port === 465,
    auth: { user: credentials.user, pass: credentials.password },
    /*
     * Le serveur doit présenter un certificat valable. La tentation, au
     * premier échec, est de poser `rejectUnauthorized: false` : cela ferait
     * passer les messages, et les ferait passer chez n'importe qui capable de
     * se placer entre les deux. Un mot de passe de boîte et des liens de
     * réinitialisation transitent ici.
     */
    tls: { rejectUnauthorized: true },
    pool: true,
    maxConnections: 2,
  });

  return transport;
}

export interface Mail {
  to: string;
  subject: string;
  /** Version texte, toujours présente : voir `sendMail`. */
  text: string;
  html: string;
}

/**
 * Dépose un message.
 *
 * Ne lève jamais. Le retour dit si le serveur l'a accepté — ce qui n'est pas
 * la même chose que « le joueur l'a reçu », et aucune API SMTP ne sait le
 * dire.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const credentials = mailCredentials();
  if (!credentials) return false;

  try {
    await transporter(credentials).sendMail({
      from: credentials.from,
      to: mail.to,
      subject: mail.subject,
      /*
       * Les deux versions partent ensemble, et ce n'est pas une politesse.
       * Un message qui n'a que du HTML est un signal de pourriel reconnu par
       * à peu près tous les filtres ; la version texte est aussi ce que lisent
       * les montres, les lecteurs d'écran et les clients configurés en texte
       * seul.
       */
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch (error) {
    /*
     * Ni le destinataire ni le contenu ne sont journalisés (SEC-007) : un
     * courrier de réinitialisation porte un jeton, et l'adresse d'un joueur
     * est une donnée personnelle. Le message d'erreur SMTP suffit à
     * distinguer une panne de réseau d'un refus d'authentification.
     */
    logger.warn({ err: error }, "envoi de courrier en échec");
    return false;
  }
}

/** Ferme le jeu de connexions. Réservé aux tests et à l'arrêt du serveur. */
export function closeMailer(): void {
  transport?.close();
  transport = null;
}
