import { bcp47 } from "@/lib/format.js";

/**
 * Les nationalités proposées à l'inscription (CDC §6.2).
 *
 * **Les codes sont écrits, les noms ne le sont pas.** Le module ne tient que
 * la liste des pays retenus — ISO 3166-1 alpha-2 — et laisse `Intl` les
 * nommer dans la langue de l'interface (I18N-001). Trois listes de
 * soixante-six pays tenues à la main auraient divergé au premier ajout, et
 * chaque navigateur porte déjà ces noms.
 *
 * Le code est ce qui se stocke, en base comme sur la carte du joueur ; le nom
 * n'existe qu'à l'affichage.
 */
export interface Country {
  code: string;
  name: string;
}

/**
 * Les pays retenus.
 *
 * La ligue est bruxelloise : la liste couvre les nationalités qu'on y croise,
 * pas les cent-nonante-cinq États du monde. Un joueur dont le pays manque le
 * signale, et on l'ajoute ici.
 */
const CODES = [
  "AL",
  "DE",
  "AO",
  "AR",
  "AM",
  "AU",
  "AT",
  "BE",
  "BR",
  "BG",
  "BF",
  "CM",
  "CA",
  "CV",
  "CL",
  "CN",
  "CO",
  "CG",
  "CD",
  "KR",
  "CI",
  "HR",
  "DK",
  "DZ",
  "EG",
  "ES",
  "US",
  "FI",
  "FR",
  "GA",
  "GH",
  "GR",
  "GN",
  "HU",
  "IN",
  "IE",
  "IT",
  "JP",
  "JO",
  "LB",
  "LU",
  "MA",
  "MK",
  "ML",
  "MX",
  "NL",
  "NG",
  "NO",
  "PK",
  "PS",
  "PE",
  "PL",
  "PT",
  "RO",
  "GB",
  "RU",
  "RS",
  "SN",
  "SK",
  "SE",
  "CH",
  "SY",
  "TG",
  "TN",
  "TR",
  "UA",
  "UY",
  "VN",
] as const;

/**
 * Le nom d'un pays dans la langue active, son code à défaut.
 *
 * `Intl.DisplayNames` existe partout depuis 2021 ; le repli sur le code
 * couvre le navigateur qui ne l'a pas, où « BE » reste plus utile qu'un vide.
 */
export function countryName(code: string): string {
  try {
    const noms = new Intl.DisplayNames([bcp47()], { type: "region" });
    return noms.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/**
 * La liste, nommée et triée dans la langue active.
 *
 * Une fonction et non une constante : les noms changent avec la langue, et
 * l'ordre alphabétique aussi — « Allemagne » vient avant « Belgique », mais
 * « Duitsland » vient après « België ».
 */
export function countries(): Country[] {
  const langue = bcp47();
  return CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
    a.name.localeCompare(b.name, langue),
  );
}
