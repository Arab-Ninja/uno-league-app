import { Play, Smartphone } from "lucide-react";
import { useT } from "@/lib/i18n.js";
import { isNative } from "@/lib/native.js";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/stores.js";
import { cn } from "@/lib/cn.js";

/**
 * « Disponible sur Google Play » — et sur l'App Store quand il y sera.
 *
 * Un lien, pas un bouton : un visiteur peut le copier, et un moteur de
 * recherche le suit jusqu'à la fiche. Rien ne s'affiche dans l'application
 * installée, qui n'a pas à se proposer elle-même.
 */
export function StoreButtons({ className }: { className?: string }) {
  const t = useT();
  if (isNative) return null;

  return (
    <div className={cn("flex flex-wrap justify-center gap-3", className)}>
      <StoreLink
        href={PLAY_STORE_URL}
        icon={<Play className="size-5 fill-current" aria-hidden />}
        lead={t("stores.playLead")}
        name="Google Play"
      />
      {APP_STORE_URL && (
        <StoreLink
          href={APP_STORE_URL}
          icon={<Smartphone className="size-5" aria-hidden />}
          lead={t("stores.appStoreLead")}
          name="App Store"
        />
      )}
    </div>
  );
}

function StoreLink({
  href,
  icon,
  lead,
  name,
}: {
  href: string;
  icon: React.ReactNode;
  lead: string;
  name: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className="flex min-w-[200px] items-center gap-3 rounded-2xl border border-border/60 bg-surface px-4 py-2.5 text-left transition-colors hover:border-accent/60 hover:bg-surface-raised active:opacity-80"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
        {icon}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
          {lead}
        </span>
        <span className="text-base font-bold text-foreground">{name}</span>
      </span>
    </a>
  );
}
