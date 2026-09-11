import { eq } from "drizzle-orm";
import { levelFromXp, levelUpReward } from "@uno/shared";
import type { Transaction } from "../db/client.js";
import { players } from "../db/schema.js";
import { credit } from "./ledger.service.js";

/**
 * Progression par l'expérience (XP-002, XP-003).
 *
 * Un seul endroit ajoute de l'XP, et c'est voulu : le niveau en découle, et
 * chaque palier franchi verse des UNO. Trois écritures qui doivent aller
 * ensemble — les disperser garantissait qu'un chemin oublierait la
 * récompense, ou la verserait deux fois.
 *
 * **Chaque palier est payé une fois, définitivement.** La clé d'idempotence
 * porte le joueur et le niveau : redescendre puis remonter au niveau 7 — ce
 * qui arrive après la correction d'une session (MATCH-007) — ne le repaie
 * pas. Une récompense acquise reste acquise, comme partout ailleurs ici.
 */
export async function awardXp(
  tx: Transaction,
  playerId: number,
  amount: number,
): Promise<{ level: number; levelsGained: number; unoAwarded: number }> {
  const [before] = await tx
    .select({ xp: players.xp, level: players.level })
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (!before) return { level: 1, levelsGained: 0, unoAwarded: 0 };

  // L'XP ne descend jamais sous zéro : un retrait (réouverture de session)
  // passe par le même chemin avec un montant négatif.
  const xp = Math.max(0, before.xp + amount);
  const level = levelFromXp(xp);

  await tx
    .update(players)
    .set({ xp, level, updatedAt: new Date() })
    .where(eq(players.id, playerId));

  if (level <= before.level) {
    return { level, levelsGained: 0, unoAwarded: 0 };
  }

  let unoAwarded = 0;
  for (let step = before.level + 1; step <= level; step++) {
    const reward = levelUpReward(step);
    if (reward <= 0) continue;

    const entry = await credit(tx, {
      playerId,
      amount: reward,
      type: "reward",
      description: `Passage au niveau ${step}`,
      referenceType: "player",
      referenceId: playerId,
      idempotencyKey: `reward:level:${playerId}:${step}`,
    });
    if (!entry.replayed) unoAwarded += reward;
  }

  return { level, levelsGained: level - before.level, unoAwarded };
}
