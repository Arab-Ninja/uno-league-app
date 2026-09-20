import { useId, useState } from "react";
import type { StatSessionPoint } from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { useT } from "@/lib/i18n.js";

/**
 * Évolution d'un joueur, séance après séance (STAT-001).
 *
 * **Une seule échelle par cadre.** Buts et passes se comptent dans la même
 * unité et partagent donc un axe ; la note de carte, qui n'a rien à voir, a
 * sa propre courbe. Superposer deux échelles sur un même cadre laisserait
 * croire à des croisements qui n'existent pas — c'est la faute de graphique
 * la plus répandue, et la plus trompeuse.
 *
 * **Les couleurs sont vérifiées, pas choisies à l'œil.** Le couple retenu
 * passe les six contrôles du barème — bande de clarté, chroma, séparation
 * sous deutéranopie et protanopie, plancher en vision normale, contraste sur
 * le fond sombre — avec un écart de 24,7 sous deutéranopie là où 8 est le
 * seuil. La légende double malgré tout l'information : l'identité d'une
 * courbe ne repose jamais sur la seule couleur.
 */

/** Orange et bleu, validés ensemble contre le fond `#1e293b`. */
export const SERIES_COLORS = ["#e06010", "#1f9fd6"] as const;

interface Series {
  label: string;
  color: string;
  values: number[];
}

export function SessionLineChart({
  sessions,
  series,
  suffix = "",
  baseline = "zero",
  emptyLabel,
}: {
  sessions: StatSessionPoint[];
  series: Series[];
  suffix?: string;
  /**
   * D'où part l'axe vertical.
   *
   * `zero` pour un **dénombrement** — buts, passes : la hauteur d'un point y
   * représente une quantité, et tronquer la base exagérerait les écarts.
   *
   * `auto` pour un **indice borné**, comme la note de carte, qui vit entre 50
   * et 99. Partir de zéro y écraserait toute la variation contre le haut du
   * cadre : on verrait une ligne plate là où la note a bougé de six points.
   */
  baseline?: "zero" | "auto";
  emptyLabel?: string;
}) {
  const t = useT();
  const clipId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  // Une courbe demande deux points. En dessous, une phrase est plus honnête
  // qu'un trait tiré entre deux bords.
  if (sessions.length < 2) {
    return (
      <p className="py-6 text-center text-xs text-muted">
        {emptyLabel ?? t("results.notEnough")}
      </p>
    );
  }

  const width = 320;
  const height = 140;
  const padding = { top: 12, right: 10, bottom: 22, left: 26 };

  const all = series.flatMap((entry) => entry.values);
  const dataMax = Math.max(...all);
  const dataMin = Math.min(...all);

  /**
   * Trois repères, et la grille passe **à la valeur qu'elle annonce**.
   *
   * La version précédente plaçait le repère médian à `max / 2` tout en
   * affichant sa valeur arrondie : sur un maximum de 19, le trait était à 9,5
   * et l'étiquette disait 10. Un axe qui ment d'un demi-point sur lui-même
   * décrédibilise tout ce qu'on lit autour.
   */
  const top = baseline === "zero" ? Math.max(1, dataMax) : niceCeil(dataMax);
  const bottom = baseline === "zero" ? 0 : niceFloor(dataMin, top);
  const span = Math.max(1, top - bottom);

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const x = (index: number) =>
    padding.left + (index / (sessions.length - 1)) * plotWidth;
  const y = (value: number) =>
    padding.top + plotHeight - ((value - bottom) / span) * plotHeight;

  const ticks = [bottom, Math.round((bottom + top) / 2), top].filter(
    (value, index, list) => list.indexOf(value) === index,
  );

  const point = hovered === null ? null : sessions[hovered];

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          role="img"
          aria-label={t("a11y.chart", {
            series: series.map((entry) => entry.label).join(", "),
          })}
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={padding.left}
                y={padding.top}
                width={plotWidth}
                height={plotHeight}
              />
            </clipPath>
          </defs>

          {ticks.map((value) => (
            <g key={value}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(value)}
                y2={y(value)}
                stroke="currentColor"
                strokeWidth={1}
                className="text-border/40"
              />
              <text
                x={padding.left - 5}
                y={y(value) + 3}
                textAnchor="end"
                className="fill-current text-[8px] text-muted"
              >
                {value}
              </text>
            </g>
          ))}

          {series.map((entry) => (
            <polyline
              key={entry.label}
              points={entry.values
                .map((value, index) => `${x(index)},${y(value)}`)
                .join(" ")}
              fill="none"
              stroke={entry.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              clipPath={`url(#${clipId})`}
            />
          ))}

          {hovered !== null && (
            <line
              x1={x(hovered)}
              x2={x(hovered)}
              y1={padding.top}
              y2={padding.top + plotHeight}
              stroke="currentColor"
              strokeWidth={1}
              className="text-muted/50"
            />
          )}

          {/* Le point survolé, cerclé de la couleur du fond : deux marques qui
              se chevauchent restent distinctes. */}
          {hovered !== null &&
            series.map((entry) => (
              <circle
                key={entry.label}
                cx={x(hovered)}
                cy={y(entry.values[hovered] ?? 0)}
                r={4}
                fill={entry.color}
                stroke="#1e293b"
                strokeWidth={2}
              />
            ))}

          {/* Zones de survol larges : viser un trait de deux pixels au doigt
              est impossible. */}
          {sessions.map((session, index) => (
            <rect
              key={session.proposalId}
              x={x(index) - plotWidth / (sessions.length * 2) - 2}
              y={padding.top}
              width={plotWidth / sessions.length + 4}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
              onTouchStart={() => setHovered(index)}
            />
          ))}
        </svg>

        {point && (
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-[11px] shadow-lg">
            <p className="font-medium">{formatShortDate(point.date)}</p>
            {series.map((entry) => (
              <p
                key={entry.label}
                className="flex items-center gap-1.5 text-muted"
              >
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ backgroundColor: entry.color }}
                  aria-hidden
                />
                {entry.label} :{" "}
                <span className="font-semibold tabular-nums text-foreground">
                  {entry.values[hovered ?? 0]}
                  {suffix}
                </span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* La légende accompagne toute courbe multiple. */}
      {series.length > 1 && (
        <div className="flex flex-wrap justify-center gap-3">
          {series.map((entry) => (
            <span
              key={entry.label}
              className="flex items-center gap-1.5 text-[11px] text-muted"
            >
              <span
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              {entry.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Borne haute arrondie vers le haut, pour un axe qui ne part pas de zéro. */
function niceCeil(value: number): number {
  const step = value > 200 ? 10 : value > 40 ? 5 : 1;
  return Math.ceil(value / step) * step;
}

/** Borne basse : un peu sous le minimum, sans jamais passer sous zéro. */
function niceFloor(value: number, top: number): number {
  const step = top > 200 ? 10 : top > 40 ? 5 : 1;
  return Math.max(0, Math.floor((value - step) / step) * step);
}

/** « 2026-09-12 » → « 12/09 ». */
function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

/** Une valeur mise en avant, sans graphique : le cas du chiffre unique. */
export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-surface px-3 py-3 text-center",
        className,
      )}
    >
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted/70">{hint}</p>}
    </div>
  );
}
