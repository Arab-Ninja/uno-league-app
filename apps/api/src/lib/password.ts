import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// `promisify` perd la surcharge à quatre arguments de scrypt ; on la restaure
// explicitement pour garder le typage des options de coût.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Hachage des mots de passe (AUTH-002, SEC-001).
 *
 * scrypt est fourni nativement par Node : pas de module natif à compiler,
 * donc pas de divergence entre l'image Docker et la machine de développement.
 *
 * Paramètres : N = 2^15, r = 8, p = 3 → 32 Mo de mémoire, ~280 ms par
 * vérification. C'est une des configurations recommandées par l'OWASP ; le
 * coût mémoire est ce qui rend l'attaque par GPU non rentable. Les paramètres
 * sont encodés dans le hash, ce qui permet de les renforcer plus tard sans
 * invalider les mots de passe existants.
 */
const PARAMS = { N: 32768, r: 8, p: 3, keyLength: 64 } as const;

const SALT_BYTES = 16;

/** `maxmem` doit couvrir 128 · N · r, avec une marge. */
function maxmemFor(N: number, r: number): number {
  return 256 * N * r;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(
    password.normalize("NFKC"),
    salt,
    PARAMS.keyLength,
    {
      N: PARAMS.N,
      r: PARAMS.r,
      p: PARAMS.p,
      maxmem: maxmemFor(PARAMS.N, PARAMS.r),
    },
  );

  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Vérifie un mot de passe. Renvoie toujours un booléen, jamais d'exception :
 * un hash corrompu se comporte comme un mot de passe faux, sans révéler la
 * cause au client (AUTH-004).
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  try {
    const parts = storedHash.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;

    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4] as string, "base64");
    const expected = Buffer.from(parts[5] as string, "base64");

    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
      return false;
    }
    // Garde-fou : un hash forgé ne doit pas pouvoir imposer un coût mémoire
    // arbitraire au serveur.
    if (N > 1 << 20 || r > 32 || p > 16) return false;

    const derived = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: maxmemFor(N, r),
    });

    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Vrai si le hash utilise des paramètres plus faibles que ceux en vigueur. */
export function needsRehash(storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return (
    Number(parts[1]) < PARAMS.N ||
    Number(parts[2]) < PARAMS.r ||
    Number(parts[3]) < PARAMS.p
  );
}
