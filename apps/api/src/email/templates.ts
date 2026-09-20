import type { Locale } from "@uno/shared";

import type { Mail } from "./mailer.js";
import { remplir, textesCourriel } from "./textes.js";

/**
 * Gabarits de courrier (MAIL-001).
 *
 * **Pourquoi le HTML est écrit ainsi.** Un client de messagerie n'est pas un
 * navigateur. Outlook rend le HTML avec le moteur de Word, Gmail supprime les
 * balises `<style>` dans certains contextes, et aucun ne charge de police
 * distante. Trois règles en découlent, et elles expliquent tout ce qui suit :
 * la mise en page se fait en tableaux, les styles sont écrits sur chaque
 * élément, et la largeur est bornée à six cents pixels.
 *
 * **Chaque message part en deux versions.** Le texte n'est pas un repli
 * poussiéreux : c'est ce que lisent les montres, les lecteurs d'écran et les
 * clients réglés en texte seul — et un message qui n'a que du HTML est un
 * signal de pourriel reconnu par la plupart des filtres.
 *
 * **Tout ce qui vient d'un joueur est échappé.** Un nom d'affichage est une
 * chaîne que son propriétaire écrit, et un client de messagerie qui rend du
 * HTML rend aussi celui-là.
 */

const NAVY = "#0F172A";
const ORANGE = "#EA580C";
const INK = "#334155";
const MUTED = "#94A3B8";
const RULE = "#E2E8F0";

/** Une valeur venue d'un joueur ne doit jamais atterrir telle quelle en HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Block {
  /** Le titre, en haut du cadre blanc. */
  heading: string;
  /** Les paragraphes du corps, déjà échappés si besoin. */
  paragraphs: string[];
  action?: { label: string; url: string };
  /** Une précision discrète sous le bouton — durée de validité, avertissement. */
  footnote?: string;
}

/**
 * L'enveloppe commune : bandeau, cadre blanc, pied de page.
 *
 * Le pied dit toujours pourquoi le message arrive. Un courrier qu'on ne
 * s'explique pas est signalé comme indésirable, et un expéditeur signalé
 * assez souvent cesse d'arriver pour tout le monde — y compris pour les
 * réinitialisations de mot de passe.
 */
function layout(block: Block): string {
  const paragraphs = block.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${INK}">${text}</p>`,
    )
    .join("");

  const action = block.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">
         <tr><td style="border-radius:8px;background:${ORANGE}">
           <a href="${escapeHtml(block.action.url)}"
              style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;
                     color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(block.action.label)}</a>
         </td></tr>
       </table>`
    : "";

  const footnote = block.footnote
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${MUTED}">${block.footnote}</p>`
    : "";

  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F1F5F9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F1F5F9;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;border-collapse:collapse">

        <tr><td style="background:${NAVY};padding:22px 28px;border-radius:12px 12px 0 0">
          <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">UNO <span style="color:#F97316">LEAGUE</span></span>
        </td></tr>

        <tr><td style="background:#ffffff;padding:32px 28px">
          <h1 style="margin:0 0 18px;font-size:21px;line-height:1.3;color:${NAVY};font-weight:700">${escapeHtml(block.heading)}</h1>
          ${paragraphs}
          ${action}
          ${footnote}
        </td></tr>

        <tr><td style="background:#ffffff;padding:0 28px 28px;border-radius:0 0 12px 12px">
          <div style="border-top:1px solid ${RULE};padding-top:18px">
            <p style="margin:0;font-size:12px;line-height:1.6;color:${MUTED}">
              Ce message vous est adressé parce que vous avez un compte sur UNO League,
              la ligue de futsal amateur. Vous pouvez régler les notifications depuis
              votre profil, dans l'application.
            </p>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Le pied de page, en version texte. */
const PIED_TEXTE =
  "\n\n—\nCe message vous est adressé parce que vous avez un compte sur UNO League, " +
  "la ligue de futsal amateur. Vous pouvez régler les notifications depuis votre " +
  "profil, dans l'application.";

/**
 * Réinitialisation de mot de passe.
 *
 * Rien n'est envoyé quand l'adresse ne correspond à aucun compte : c'est la
 * *réponse de l'API* qui reste identique dans les deux cas, pas le courrier.
 * Envoyer un « aucun compte à cette adresse » confirmerait l'inverse à qui
 * essaie des adresses au hasard.
 */
export function passwordResetMail(params: {
  to: string;
  displayName: string;
  url: string;
  validityMinutes: number;
  locale?: Locale | undefined;
}): Mail {
  const nom = escapeHtml(params.displayName);
  const x = textesCourriel(params.locale).reinitialisation;
  const pied = textesCourriel(params.locale).pied;
  const minutes = { minutes: params.validityMinutes };

  return {
    to: params.to,
    subject: x.sujet,
    text:
      `${remplir(x.bonjour, { nom: params.displayName })}\n\n` +
      `${x.texteIntro}\n\n${params.url}\n\n` +
      `${remplir(x.texteValidite, minutes)}\n\n` +
      x.texteIgnorer +
      pied,
    html: layout({
      heading: x.titre,
      paragraphs: [remplir(x.bonjour, { nom }), x.demande],
      action: { label: x.bouton, url: params.url },
      footnote: remplir(x.note, minutes),
    }),
  };
}

/** Bienvenue, à la création du compte. */
export function welcomeMail(params: {
  to: string;
  displayName: string;
  url: string;
  locale?: Locale | undefined;
}): Mail {
  const nom = escapeHtml(params.displayName);
  const x = textesCourriel(params.locale).bienvenue;
  const pied = textesCourriel(params.locale).pied;

  return {
    to: params.to,
    subject: x.sujet,
    text:
      `${remplir(x.ouvert, { nom: params.displayName })}\n\n` +
      `${x.texteIntro}\n\n` +
      `${x.textePuce1}\n${x.textePuce2}\n${x.textePuce3}\n\n` +
      `${remplir(x.texteEspace, { url: params.url })}\n\n` +
      remplir(x.note, { email: params.to }) +
      pied,
    html: layout({
      heading: x.titre,
      paragraphs: [remplir(x.ouvert, { nom }), x.etape1, x.etape2, x.etape3],
      action: { label: x.bouton, url: params.url },
      footnote: remplir(x.note, { email: escapeHtml(params.to) }),
    }),
  };
}

/**
 * Le repli d'une notification que le push n'a pas pu porter.
 *
 * Le titre et le corps sont ceux de la notification interne : un seul texte à
 * écrire et à relire, et le joueur retrouve dans sa boîte exactement ce que
 * son téléphone aurait affiché.
 */
export function eventMail(params: {
  to: string;
  displayName: string;
  title: string;
  body: string;
  url?: string | undefined;
}): Mail {
  const nom = escapeHtml(params.displayName);

  return {
    to: params.to,
    subject: params.title,
    text:
      `Bonjour ${params.displayName},\n\n${params.body}\n` +
      (params.url ? `\n${params.url}\n` : "") +
      "\nVous recevez ce message par courrier parce que les notifications ne sont " +
      "pas actives sur votre appareil. Les activer dans l'application vous les " +
      "apportera plus vite." +
      PIED_TEXTE,
    html: layout({
      heading: params.title,
      paragraphs: [`Bonjour ${nom},`, escapeHtml(params.body)],
      ...(params.url
        ? { action: { label: "Voir dans l'application", url: params.url } }
        : {}),
      footnote:
        "Vous recevez ce message par courrier parce que les notifications ne sont pas " +
        "actives sur votre appareil. Les activer dans l'application vous les apportera " +
        "plus vite.",
    }),
  };
}
