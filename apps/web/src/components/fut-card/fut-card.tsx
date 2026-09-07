import { useEffect, useRef, useState } from "react";
import {
  CARD_STAT_SLOTS,
  POSITION_LABELS,
  type PublicPlayer,
} from "@uno/shared";
import { cn } from "@/lib/cn.js";
import { flagEmoji, initials } from "@/lib/format.js";
import { tapFeedback } from "@/lib/native.js";
import "./fut-card.css";

/**
 * Carte joueur, reprise du modèle FUT fourni.
 *
 * La silhouette est découpée par un `clipPath` SVG déclaré une seule fois
 * dans le document (voir `FutCardShape`) : `clip-path: url(#id)` référence un
 * identifiant global, le dupliquer à chaque carte produirait un document
 * invalide.
 *
 * Toutes les valeurs affichées viennent du serveur — note, palier, poste,
 * statistiques. Le client ne calcule rien (P-004).
 */

export type FutCardSize = "sm" | "md" | "lg";

const SCALES: Record<FutCardSize, number> = {
  sm: 0.44,
  md: 0.64,
  lg: 1,
};

export interface FutCardProps {
  player: PublicPlayer;
  size?: FutCardSize;
  /** Joue l'animation de révélation. Désactivée dans les longues listes. */
  animated?: boolean;
  onClick?: () => void;
  className?: string;
}

export function FutCard({
  player,
  size = "md",
  animated = size === "lg",
  onClick,
  className,
}: FutCardProps) {
  const [revealed, setRevealed] = useState(!animated);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animated) {
      setRevealed(true);
      return;
    }

    // La révélation démarre lorsque la carte entre à l'écran : dans une liste
    // qui défile, l'animation ne se joue pas hors du champ de vision.
    const node = frameRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setRevealed(true), 80);
      return () => clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [animated]);

  const stats = CARD_STAT_SLOTS.map((slot) => ({
    label: slot.label,
    value: player[slot.key],
  }));

  // Comme sur une carte FIFA, seul le patronyme figure sur la carte : un nom
  // complet déborde de la largeur disponible. Le nom entier reste affiché
  // sous la carte, partout où elle est présentée.
  const parts = player.displayName.trim().split(/\s+/);
  const cardName = parts.length > 1 ? parts[parts.length - 1] : player.displayName;

  const card = (
    // L'échelle est posée sur le CADRE : sa largeur et sa hauteur en dépendent
    // autant que la transformation de la carte. La déclarer sur la carte
    // laisserait le cadre à sa taille pleine, et les cartes d'une grille se
    // chevaucheraient.
    <div
      ref={frameRef}
      className="fut-card-frame"
      style={{ "--fut-scale": SCALES[size] } as React.CSSProperties}
    >
      <div
        className={cn(
          "fut-card",
          `fut-card--${player.tier}`,
          revealed && "is-revealed",
          className,
        )}
      >
        <div className="fut-card__inner">
          <div className="fut-card__top">
            <div className="fut-card__backfont" aria-hidden>
              UNO
            </div>

            <div className="fut-card__info">
              <div className="fut-card__rating">{player.rating}</div>
              <div
                className="fut-card__position"
                title={POSITION_LABELS[player.position]}
              >
                {player.position}
              </div>
              <div className="fut-card__flag" aria-hidden>
                {flagEmoji(player.nationality)}
              </div>
              <div className="fut-card__club">{player.division}</div>
            </div>

            <div className="fut-card__photo">
              {player.profilePhotoUrl ? (
                <img src={player.profilePhotoUrl} alt="" loading="lazy" />
              ) : (
                <span className="fut-card__initials" aria-hidden>
                  {initials(player.displayName)}
                </span>
              )}
            </div>
          </div>

          <div className="fut-card__bottom">
            <div className="fut-card__name" title={player.displayName}>
              {cardName}
            </div>
            <div className="fut-card__stats">
              {[stats.slice(0, 3), stats.slice(3, 6)].map((column, index) => (
                <div className="fut-card__column" key={index}>
                  <ul>
                    {column.map((stat) => (
                      <li key={stat.label}>
                        <span>{stat.value}</span>
                        <span>{stat.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (!onClick) {
    return (
      <div
        role="img"
        aria-label={`${player.displayName}, ${POSITION_LABELS[player.position]}, division ${player.division}, note ${player.rating}`}
      >
        {card}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="fut-card-button"
      aria-label={`Carte de ${player.displayName}`}
      onClick={() => {
        void tapFeedback();
        onClick();
      }}
    >
      {card}
    </button>
  );
}

/**
 * Silhouette de la carte, montée une seule fois à la racine de l'application.
 * Le tracé provient du modèle d'origine ; les coordonnées sont exprimées dans
 * un espace 0-1 (`objectBoundingBox`) pour s'appliquer quelle que soit la
 * taille de la carte.
 */
export function FutCardShape() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden
      focusable="false"
      style={{ position: "absolute" }}
    >
      <defs>
        <clipPath id="futCardShape" clipPathUnits="objectBoundingBox">
          <path
            transform="scale(0.003742, 0.002340)"
            d="M265.3 53.9a33.3 33.3 0 0 1-17.8-5.5 32 32 0 0 1-13.7-22.9c-.2-1.1-.4-2.3-.4-3.4 0-1.3-1-1.5-1.8-1.9a163 163 0 0 0-31-11.6A257.3 257.3 0 0 0 133.7 0a254.9 254.9 0 0 0-67.1 8.7 170 170 0 0 0-31 11.6c-.8.4-1.8.6-1.8 1.9 0 1.1-.2 2.3-.4 3.4a32.4 32.4 0 0 1-13.7 22.9A33.8 33.8 0 0 1 2 53.9c-1.5.1-2.1.4-2 2v293.9c0 3.3 0 6.6.4 9.9a22 22 0 0 0 7.9 14.4c3.8 3.2 8.3 5.3 13 6.8 12.4 3.9 24.8 7.5 37.2 11.5a388.7 388.7 0 0 1 50 19.4 88.7 88.7 0 0 1 25 15.5v.1-.1c7.2-7 16.1-11.3 25-15.5a427 427 0 0 1 50-19.4l37.2-11.5c4.7-1.5 9.1-3.5 13-6.8 4.5-3.8 7.2-8.5 7.9-14.4.4-3.3.4-6.6.4-9.9V231.6 60.5v-4.6c.4-1.6-.3-1.9-1.7-2z"
          />
        </clipPath>
      </defs>
    </svg>
  );
}
