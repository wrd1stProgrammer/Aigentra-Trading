import type { TraderStanding } from "@/lib/league";
import { FREE_LEADERBOARD_LIMIT } from "@/lib/subscriber-access-cache-policy";

export function currentFreeLeaderboardPreviewSeed(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function buildFreeLeaderboardPreview(
  standings: readonly TraderStanding[],
  seed = currentFreeLeaderboardPreviewSeed()
) {
  if (standings.length <= FREE_LEADERBOARD_LIMIT) return [...standings];

  const selected: TraderStanding[] = [];
  const selectedIds = new Set<string>();
  const addTrader = (trader?: TraderStanding | null) => {
    if (!trader || selectedIds.has(trader.id) || selected.length >= FREE_LEADERBOARD_LIMIT) return;
    selected.push(trader);
    selectedIds.add(trader.id);
  };
  const remaining = () => standings.filter((trader) => !selectedIds.has(trader.id));

  addTrader(standings.find((trader) => trader.rank === 1) ?? standings[0]);

  const nonNegativeCandidates = remaining().filter((trader) => previewReturn(trader) >= 0);
  addTrader(pickSeededTrader(nonNegativeCandidates, `${seed}:non-negative`));

  const softNegativeCandidates = remaining()
    .filter((trader) => previewReturn(trader) < 0)
    .sort((a, b) => previewReturn(b) - previewReturn(a) || a.rank - b.rank)
    .slice(0, Math.max(FREE_LEADERBOARD_LIMIT, 1));
  addTrader(pickSeededTrader(softNegativeCandidates, `${seed}:soft-negative`));

  for (const trader of standings) {
    addTrader(trader);
  }

  return selected;
}

function previewReturn(trader: TraderStanding) {
  return Number.isFinite(trader.rankingReturn) ? trader.rankingReturn : trader.returnPct;
}

function pickSeededTrader(candidates: readonly TraderStanding[], seed: string) {
  if (!candidates.length) return null;
  return candidates[stableSeedIndex(seed, candidates.length)] ?? null;
}

function stableSeedIndex(seed: string, length: number) {
  if (length <= 1) return 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}
