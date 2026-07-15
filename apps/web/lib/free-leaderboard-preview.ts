import type { TraderStanding } from "@/lib/league";
import { FREE_LEADERBOARD_LIMIT } from "@/lib/subscriber-access-cache-policy";

export function currentFreeLeaderboardPreviewSeed(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function buildFreeLeaderboardPreview(
  standings: readonly TraderStanding[],
  seed = currentFreeLeaderboardPreviewSeed()
) {
  const eligibleStandings = standings.filter(isLeaderboardStandingVisible);
  if (eligibleStandings.length <= FREE_LEADERBOARD_LIMIT) return eligibleStandings;

  const selected: TraderStanding[] = [];
  const selectedIds = new Set<string>();
  const addTrader = (trader?: TraderStanding | null) => {
    if (!trader || selectedIds.has(trader.id) || selected.length >= FREE_LEADERBOARD_LIMIT) return;
    selected.push(trader);
    selectedIds.add(trader.id);
  };
  const remaining = () => eligibleStandings.filter((trader) => !selectedIds.has(trader.id));

  addTrader(eligibleStandings.find((trader) => trader.rank === 1) ?? eligibleStandings[0]);

  const nonNegativeCandidates = remaining().filter((trader) => previewReturn(trader) >= 0);
  addTrader(pickSeededTrader(nonNegativeCandidates, `${seed}:non-negative`));

  const softNegativeCandidates = remaining()
    .filter((trader) => previewReturn(trader) < 0)
    .sort((a, b) => previewReturn(b) - previewReturn(a) || a.rank - b.rank)
    .slice(0, Math.max(FREE_LEADERBOARD_LIMIT, 1));
  addTrader(pickSeededTrader(softNegativeCandidates, `${seed}:soft-negative`));

  for (const trader of eligibleStandings) {
    addTrader(trader);
  }

  return selected;
}

export function isLeaderboardStandingVisible(
  trader: Pick<TraderStanding, "lifecycleStatus" | "retiredFromMonth" | "trades">
) {
  const lifecycleStatus = String(trader.lifecycleStatus ?? "").trim().toLowerCase();
  const lifecycleEnded = lifecycleStatus === "retired" || lifecycleStatus === "terminated" || lifecycleStatus === "ended";
  return trader.trades > 0 && !lifecycleEnded && !trader.retiredFromMonth;
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
