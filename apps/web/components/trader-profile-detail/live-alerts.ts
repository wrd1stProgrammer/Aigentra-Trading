import type { TimelineItem, Translator } from "@/components/trader-profile-detail/types";

export type LiveDetailAlert = {
  key: string;
  title: string;
  itemTitle: string;
  body: string;
  time: string;
  kind: "scenario" | "exit" | "event";
  item: TimelineItem;
};

export function nextLiveDetailAlert({
  previousKey,
  item,
  hydrated,
  minSortMs,
  t
}: {
  previousKey: string | null;
  item: TimelineItem | null | undefined;
  hydrated: boolean;
  minSortMs?: number | null;
  t: Translator;
}): { nextKey: string | null; alert: LiveDetailAlert | null } {
  const nextKey = item?.id ?? previousKey;
  if (!item || !nextKey) return { nextKey: previousKey, alert: null };
  if (!hydrated || !previousKey || previousKey === nextKey) return { nextKey, alert: null };
  if (isBeforeLiveAlertWindow(item, minSortMs)) return { nextKey, alert: null };

  const kind = alertKind(item);
  return {
    nextKey,
    alert: {
      key: nextKey,
      title: t(alertTitleKey(kind)),
      itemTitle: item.title,
      body: item.body,
      time: item.time,
      kind,
      item
    }
  };
}

function isBeforeLiveAlertWindow(item: TimelineItem, minSortMs: number | null | undefined) {
  if (typeof minSortMs !== "number" || !Number.isFinite(minSortMs)) return false;
  if (typeof item.sortMs !== "number" || !Number.isFinite(item.sortMs)) return true;
  return item.sortMs <= minSortMs;
}

function alertKind(item: TimelineItem): LiveDetailAlert["kind"] {
  const normalized = `${item.id} ${item.title} ${item.movement} ${item.body}`.toUpperCase();
  if (
    item.id.startsWith("realized-event-") ||
    normalized.includes("TAKE_PROFIT") ||
    normalized.includes("STOP_LOSS")
  ) {
    return "exit";
  }
  if (item.scenario || item.id === "latest-plan" || item.id.startsWith("scenario-")) return "scenario";
  return "event";
}

function alertTitleKey(kind: LiveDetailAlert["kind"]) {
  if (kind === "exit") return "detail.liveAlertExit";
  if (kind === "scenario") return "detail.liveAlertScenario";
  return "detail.liveAlertEvent";
}
