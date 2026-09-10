import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  ClipboardList,
  Database,
  Film,
  MapPin,
  Package,
  Receipt,
  Shield,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn.js";
import { trpc } from "@/lib/trpc.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { AdminOverview } from "./overview.js";
import { AdminPlayers } from "./players.js";
import { AdminShop } from "./shop.js";
import { AdminOrders } from "./orders.js";
import { AdminSessions } from "./sessions.js";
import { AdminVenues } from "./venues.js";
import { AdminEvents } from "./events.js";
import { AdminAudit } from "./audit.js";

/**
 * Console d'administration (CDC §15).
 *
 * L'accès est déjà refusé côté serveur pour un compte non administrateur ;
 * cet écran n'est qu'une commodité d'interface, jamais une barrière de
 * sécurité (ADMIN-001).
 */
const TABS = [
  { id: "overview", label: "Vue d'ensemble", icon: Database },
  { id: "events", label: "Évènements", icon: Bell },
  { id: "sessions", label: "Sessions", icon: ClipboardList },
  { id: "players", label: "Joueurs", icon: Users },
  { id: "shop", label: "Boutique", icon: Package },
  { id: "orders", label: "Commandes", icon: Receipt },
  { id: "venues", label: "Lieux", icon: MapPin },
  { id: "audit", label: "Audit", icon: Shield },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminScreen() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>("overview");
  // Le compteur d'évènements non lus est le seul chiffre qui doit sauter aux
  // yeux avant même d'ouvrir l'onglet : il dit s'il s'est passé quelque chose.
  const counts = trpc.admin.eventCounts.useQuery();
  const unread = counts.data?.unread ?? 0;

  // La barre d'onglets reste affichée ici, contrairement aux autres écrans
  // secondaires : la console est le seul endroit où l'on descendait dans une
  // feuille de saisie assez longue pour perdre de vue le haut de l'écran, sans
  // plus rien pour en sortir.
  return (
    <Screen title="Administration" back backTo="/profil">
      <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {/* La saisie en visionnage est un écran plein cadre : elle a besoin de
            la vidéo et du pavé de saisie côte à côte, ce que la console, large
            de 520 px, ne peut pas offrir. */}
        <button
          type="button"
          onClick={() => {
            void tapFeedback();
            navigate("/visionnage");
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent/15 px-3.5 py-2 text-xs font-medium text-accent hover:bg-accent/25"
        >
          <Film className="size-3.5" aria-hidden />
          Saisie vidéo
        </button>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              void tapFeedback();
              setTab(item.id);
            }}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
              tab === item.id
                ? "bg-accent text-background"
                : "bg-surface text-muted hover:text-foreground",
            )}
            aria-pressed={tab === item.id}
          >
            <item.icon className="size-3.5" aria-hidden />
            {item.label}
            {item.id === "events" && unread > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                  tab === item.id
                    ? "bg-background/25"
                    : "bg-accent text-background",
                )}
                aria-label={`${unread} évènement(s) non lu(s)`}
              >
                {unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && <AdminOverview />}
      {tab === "events" && <AdminEvents />}
      {tab === "sessions" && <AdminSessions />}
      {tab === "players" && <AdminPlayers />}
      {tab === "shop" && <AdminShop />}
      {tab === "orders" && <AdminOrders />}
      {tab === "venues" && <AdminVenues />}
      {tab === "audit" && <AdminAudit />}
    </Screen>
  );
}
