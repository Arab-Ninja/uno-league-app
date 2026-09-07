import { useState } from "react";
import { Database, Package, Receipt, Shield, Users } from "lucide-react";
import { cn } from "@/lib/cn.js";
import { tapFeedback } from "@/lib/native.js";
import { Screen } from "@/components/layout/index.js";
import { AdminOverview } from "./overview.js";
import { AdminPlayers } from "./players.js";
import { AdminShop } from "./shop.js";
import { AdminOrders } from "./orders.js";
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
  { id: "players", label: "Joueurs", icon: Users },
  { id: "shop", label: "Boutique", icon: Package },
  { id: "orders", label: "Commandes", icon: Receipt },
  { id: "audit", label: "Audit", icon: Shield },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AdminScreen() {
  const [tab, setTab] = useState<TabId>("overview");

  return (
    <Screen title="Administration" back withTabBar={false}>
      <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
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
          </button>
        ))}
      </div>

      {tab === "overview" && <AdminOverview />}
      {tab === "players" && <AdminPlayers />}
      {tab === "shop" && <AdminShop />}
      {tab === "orders" && <AdminOrders />}
      {tab === "audit" && <AdminAudit />}
    </Screen>
  );
}
