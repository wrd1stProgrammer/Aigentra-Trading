import type { LeagueSymbol, TraderScenario } from "@/lib/league";

export type Translator = (key: string) => string;

export type VisualProfile = {
  tone: string;
  initials: string;
  alias: string;
};

export type PlanEntry = {
  price: number | null;
  weight: number | null;
  reason: string;
};

export type PlanTarget = {
  price: number | null;
  weight: number | null;
  reason: string;
};

export type PlanView = Record<string, unknown> & {
  status?: string | null;
  side?: string | null;
  createdAt?: string | null;
  riskPercent?: number | null;
  leverage?: number | null;
  stopLoss?: number | null;
  orderStyle?: string | null;
  entries: PlanEntry[];
  takeProfits: PlanTarget[];
  notes: string[];
};

export type ChartPlanResult = {
  tradePlan: PlanView;
};

export type TimelineItem = {
  id: string;
  time: string;
  title: string;
  body: string;
  importance: ScenarioImportance;
  movement: string;
  movementTone: "good" | "bad" | "warn" | "neutral";
  priceLabel: string;
  iconLabel: string;
  sortMs?: number;
  scenario?: TraderScenario;
};

export type ScenarioImportance = "routine" | "watch" | "important" | "critical";

export type HoldingItem = {
  id: string;
  label: string;
  subLabel: string;
  weight: number;
  deploymentPercent: number;
  exposurePercent: number | null;
  returnPct: number | null;
  colorClass: string;
  badges: HoldingBadge[];
  details: HoldingDetail[];
};

export type HoldingBadge = {
  label: string;
  tone: "long" | "short" | "warn" | "neutral";
};

export type HoldingDetail = {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
};

export type TradeHistoryItem = {
  id: string;
  time: string;
  action: string;
  actionTone: "good" | "bad" | "neutral";
  label: string;
  quantity: string;
  basis: string;
  basisDetail: string;
  priceLabel?: string;
  sideLabel: string;
  leverageLabel: string;
  entryLabel: string;
  exitLabel: string;
  pnlLabel: string;
  pnlTone: "good" | "bad" | "neutral";
  resultLabel: string;
  isPositionAction: boolean;
};

export type PlanRecord = Record<string, unknown>;

export const SYMBOLS: readonly LeagueSymbol[] = ["BTCUSDT"];
