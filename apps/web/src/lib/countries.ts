/**
 * Liste des nationalités proposées à l'inscription (CDC §6.2).
 * Codes ISO 3166-1 alpha-2 ; le libellé français est affiché, le code est
 * stocké. Les pays les plus représentés dans la ligue sont en tête.
 */
export interface Country {
  code: string;
  name: string;
}

const PRIORITY: Country[] = [
  { code: "BE", name: "Belgique" },
  { code: "FR", name: "France" },
  { code: "MA", name: "Maroc" },
  { code: "DZ", name: "Algérie" },
  { code: "TN", name: "Tunisie" },
  { code: "CD", name: "Congo (RDC)" },
  { code: "PT", name: "Portugal" },
  { code: "IT", name: "Italie" },
  { code: "ES", name: "Espagne" },
  { code: "TR", name: "Turquie" },
];

const OTHERS: Country[] = [
  { code: "AL", name: "Albanie" }, { code: "DE", name: "Allemagne" },
  { code: "AO", name: "Angola" }, { code: "AR", name: "Argentine" },
  { code: "AM", name: "Arménie" }, { code: "AU", name: "Australie" },
  { code: "AT", name: "Autriche" }, { code: "BR", name: "Brésil" },
  { code: "BG", name: "Bulgarie" }, { code: "BF", name: "Burkina Faso" },
  { code: "CM", name: "Cameroun" }, { code: "CA", name: "Canada" },
  { code: "CV", name: "Cap-Vert" }, { code: "CL", name: "Chili" },
  { code: "CN", name: "Chine" }, { code: "CO", name: "Colombie" },
  { code: "CG", name: "Congo" }, { code: "KR", name: "Corée du Sud" },
  { code: "CI", name: "Côte d'Ivoire" }, { code: "HR", name: "Croatie" },
  { code: "DK", name: "Danemark" }, { code: "EG", name: "Égypte" },
  { code: "US", name: "États-Unis" }, { code: "FI", name: "Finlande" },
  { code: "GA", name: "Gabon" }, { code: "GH", name: "Ghana" },
  { code: "GR", name: "Grèce" }, { code: "GN", name: "Guinée" },
  { code: "HU", name: "Hongrie" }, { code: "IN", name: "Inde" },
  { code: "IE", name: "Irlande" }, { code: "JP", name: "Japon" },
  { code: "JO", name: "Jordanie" },
  { code: "LB", name: "Liban" }, { code: "LU", name: "Luxembourg" },
  { code: "MK", name: "Macédoine du Nord" }, { code: "ML", name: "Mali" },
  { code: "MX", name: "Mexique" }, { code: "NL", name: "Pays-Bas" },
  { code: "NG", name: "Nigéria" }, { code: "NO", name: "Norvège" },
  { code: "PK", name: "Pakistan" }, { code: "PS", name: "Palestine" },
  { code: "PE", name: "Pérou" }, { code: "PL", name: "Pologne" },
  { code: "RO", name: "Roumanie" }, { code: "GB", name: "Royaume-Uni" },
  { code: "RU", name: "Russie" }, { code: "RS", name: "Serbie" },
  { code: "SN", name: "Sénégal" }, { code: "SK", name: "Slovaquie" },
  { code: "SE", name: "Suède" }, { code: "CH", name: "Suisse" },
  { code: "SY", name: "Syrie" }, { code: "TG", name: "Togo" },
  { code: "UA", name: "Ukraine" }, { code: "UY", name: "Uruguay" },
  { code: "VN", name: "Viêt Nam" },
];

export const COUNTRIES: Country[] = [
  ...PRIORITY,
  ...OTHERS.sort((a, b) => a.name.localeCompare(b.name, "fr")),
];

export function countryName(code: string): string {
  return COUNTRIES.find((country) => country.code === code)?.name ?? code;
}
