export type LeaderboardInitialOverlayInput = {
  hasRenderableLeaderboard: boolean;
  rankingPending: boolean;
  rankingPlaceholder: boolean;
};

export function shouldShowLeaderboardInitialOverlay({
  hasRenderableLeaderboard,
  rankingPending,
  rankingPlaceholder
}: LeaderboardInitialOverlayInput) {
  return !hasRenderableLeaderboard && rankingPending && !rankingPlaceholder;
}

export type LeaderboardPreviewLimitInput = {
  subscriberAccessPending: boolean;
  subscriberAccessUnavailable?: boolean;
  freeAccessLimited: boolean;
};

export function shouldUseLeaderboardPreviewLimit({
  subscriberAccessPending,
  subscriberAccessUnavailable = false,
  freeAccessLimited
}: LeaderboardPreviewLimitInput) {
  return subscriberAccessPending || subscriberAccessUnavailable || freeAccessLimited;
}

export function buildLeaguePeriodSearch(searchParams: string, leagueMonth: string | undefined) {
  const normalizedSearch = searchParams.startsWith("?") ? searchParams.slice(1) : searchParams;
  const next = new URLSearchParams(normalizedSearch);
  if (leagueMonth) {
    next.set("league", "monthly");
    next.set("leagueMonth", leagueMonth);
  } else {
    next.set("league", "current");
    next.delete("leagueMonth");
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}

export function buildLeaguePeriodUrl(pathname: string, searchParams: string, leagueMonth: string | undefined) {
  return `${pathname}${buildLeaguePeriodSearch(searchParams, leagueMonth)}`;
}
