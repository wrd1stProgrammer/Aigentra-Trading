export type LeaderboardInitialOverlayInput = {
  hasResolvedLeaderboardData: boolean;
  rankingPending: boolean;
  rankingFetching?: boolean;
  rankingPlaceholder: boolean;
  rankingWarming?: boolean;
};

export function shouldShowLeaderboardInitialOverlay({
  hasResolvedLeaderboardData,
  rankingPending,
  rankingFetching = false,
  rankingPlaceholder,
  rankingWarming = false
}: LeaderboardInitialOverlayInput) {
  const waitingForInitialBundle = rankingPending || rankingPlaceholder || (rankingFetching && !rankingWarming);
  return !hasResolvedLeaderboardData && waitingForInitialBundle;
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

export type LeaderboardSecondaryDataInput = {
  primaryFetching: boolean;
  primaryPlaceholder: boolean;
};

export function shouldFetchLeaderboardSecondaryData({
  primaryFetching,
  primaryPlaceholder
}: LeaderboardSecondaryDataInput) {
  return !(primaryFetching && primaryPlaceholder);
}

export type CurrentLeagueCompanionInput = LeaderboardSecondaryDataInput & {
  selectedLeagueMonth?: string;
};

export function shouldFetchCurrentLeagueCompanion({
  selectedLeagueMonth,
  primaryFetching,
  primaryPlaceholder
}: CurrentLeagueCompanionInput) {
  return Boolean(selectedLeagueMonth) && shouldFetchLeaderboardSecondaryData({ primaryFetching, primaryPlaceholder });
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
