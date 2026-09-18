import { deflateSync } from "node:zlib";

/**
 * Visuels de démonstration.
 *
 * Le jeu de démo a d'abord pointé vers un service d'images public : hors
 * ligne, derrière un proxy d'entreprise ou simplement le jour où ce service
 * répond mal, tout le catalogue s'affichait cassé — et le carrousel devenait
 * intestable. Les images sont donc fabriquées ici, puis déposées par la
 * couche de stockage habituelle (`storeImage`), exactement comme une image
 * téléversée par l'administration : même validation, même nommage, même URL
 * publique, et le pilote S3 fonctionne aussi bien que le pilote local.
 *
 * Chaque produit reçoit une teinte propre et chaque vue une composition
 * différente : le carrousel est ainsi vérifiable d'un coup d'œil.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(data: Buffer): number {
  let crc = -1;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type: string, payload: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(payload.length, 0);

  const body = Buffer.concat([Buffer.from(type, "ascii"), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

/** Teinte HSL vers RVB, saturation et luminosité en 0..1. */
function hsl(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = ((hue % 360) + 360) % 360 / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const [r, g, b] =
    sector < 1 ? [chroma, second, 0] :
    sector < 2 ? [second, chroma, 0] :
    sector < 3 ? [0, chroma, second] :
    sector < 4 ? [0, second, chroma] :
    sector < 5 ? [second, 0, chroma] : [chroma, 0, second];

  const offset = lightness - chroma / 2;
  return [
    Math.round((r + offset) * 255),
    Math.round((g + offset) * 255),
    Math.round((b + offset) * 255),
  ];
}

export interface ProductImageOptions {
  /** Détermine la teinte : un produit garde toujours la même. */
  hue: number;
  /** Numéro de la vue, à partir de 0 : change la composition. */
  variant: number;
  size?: number;
}

/**
 * Fabrique un PNG 24 bits : dégradé diagonal dans la teinte du produit,
 * surmonté d'un halo dont la position dépend de la vue.
 */
export function productImagePng(options: ProductImageOptions): Buffer {
  const size = options.size ?? 640;
  const hue = ((options.hue % 360) + 360) % 360;
  const variant = options.variant;

  // Le halo tourne autour du centre d'une vue à l'autre.
  const angle = (variant * 2 * Math.PI) / 3 + 0.7;
  const focusX = 0.5 + 0.22 * Math.cos(angle);
  const focusY = 0.5 + 0.22 * Math.sin(angle);
  const tilt = variant % 2 === 0 ? 1 : -1;

  const raw = Buffer.alloc((size * 3 + 1) * size);
  let cursor = 0;

  for (let y = 0; y < size; y++) {
    raw[cursor++] = 0; // filtre « None » : la ligne est écrite telle quelle.
    const v = y / (size - 1);

    for (let x = 0; x < size; x++) {
      const u = x / (size - 1);

      // Fond : dégradé diagonal du sombre vers la teinte.
      const diagonal = tilt > 0 ? (u + v) / 2 : (u + (1 - v)) / 2;
      const base = 0.18 + 0.34 * diagonal;

      // Halo : éclaircit doucement autour du point focal.
      const dx = u - focusX;
      const dy = v - focusY;
      const glow = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 0.55) ** 2;

      const [r, g, b] = hsl(
        hue + 24 * diagonal,
        0.42 + 0.18 * glow,
        Math.min(0.82, base + 0.3 * glow),
      );

      raw[cursor++] = r;
      raw[cursor++] = g;
      raw[cursor++] = b;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bits par canal
  header[9] = 2; // couleur vraie, sans alpha
  header[10] = 0; // compression deflate
  header[11] = 0; // filtrage standard
  header[12] = 0; // pas d'entrelacement

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
