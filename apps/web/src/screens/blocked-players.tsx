import { useT } from "@/lib/i18n.js";
import { Screen } from "@/components/layout/index.js";
import { Card } from "@/components/ui/index.js";
import { BlockedPlayers } from "@/components/domain/moderation.js";

/** Les joueurs qu'on a bloqués, et de quoi revenir sur sa décision (MOD-001). */
export function BlockedPlayersScreen() {
  const t = useT();
  return (
    <Screen
      title={t("moderation.blockedTitle")}
      back
      backTo="/profil"
      withTabBar={false}
    >
      <Card>
        <BlockedPlayers />
      </Card>
    </Screen>
  );
}
