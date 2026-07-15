import type { Locale } from "@/lib/i18n";
import { learnContentByLocale, type LearnLocalizedContent, type LearnSlug } from "@/lib/learn-locales";

type LearnEntryDefinition = {
  readonly slug: LearnSlug;
  readonly term: string;
  readonly category: "Derivatives" | "Risk" | "Research";
  readonly relatedSlugs: readonly LearnSlug[];
  readonly relatedBlogSlugs: readonly string[];
  readonly source: { readonly label: string; readonly url: string };
  readonly updatedAt: string;
};

export type LearnEntry = LearnEntryDefinition & LearnLocalizedContent;

const learnEntryDefinitions = [
  {
    slug: "funding-rate",
    term: "Funding Rate",
    category: "Derivatives",
    relatedSlugs: ["open-interest", "liquidation"],
    relatedBlogSlugs: ["crypto-funding-rates", "futures-vs-perpetuals"],
    source: { label: "Binance Futures funding rate documentation", url: "https://www.binance.com/en/support/faq/introduction-to-binance-futures-funding-rates-360033525031" },
    updatedAt: "2026-07-13",
  },
  {
    slug: "open-interest",
    term: "Open Interest",
    category: "Derivatives",
    relatedSlugs: ["funding-rate", "liquidation"],
    relatedBlogSlugs: ["open-interest-explained", "volume-vs-liquidity"],
    source: { label: "CME Group open interest overview", url: "https://www.cmegroup.com/education/courses/introduction-to-futures/open-interest.html" },
    updatedAt: "2026-07-13",
  },
  {
    slug: "liquidation",
    term: "Liquidation",
    category: "Derivatives",
    relatedSlugs: ["position-sizing", "funding-rate"],
    relatedBlogSlugs: ["leverage-margin-liquidation", "stop-loss-execution-risk"],
    source: { label: "Bybit liquidation process documentation", url: "https://www.bybit.com/en/help-center/article/Liquidation-Process-USDT-Contract" },
    updatedAt: "2026-07-13",
  },
  {
    slug: "position-sizing",
    term: "Position Sizing",
    category: "Risk",
    relatedSlugs: ["maximum-drawdown", "liquidation"],
    relatedBlogSlugs: ["position-sizing-risk-budget", "r-multiple-expectancy"],
    source: { label: "CME Group position sizing lesson", url: "https://www.cmegroup.com/education/courses/trade-and-risk-management/the-2-percent-rule.html" },
    updatedAt: "2026-07-13",
  },
  {
    slug: "maximum-drawdown",
    term: "Maximum Drawdown",
    category: "Risk",
    relatedSlugs: ["position-sizing", "backtest-overfitting"],
    relatedBlogSlugs: ["drawdown-loss-streak-risk", "sharpe-ratio-limitations"],
    source: { label: "CFA Institute investment risk reading", url: "https://rpc.cfainstitute.org/research/foundation/2013/investment-risk-and-performance" },
    updatedAt: "2026-07-13",
  },
  {
    slug: "backtest-overfitting",
    term: "Backtest Overfitting",
    category: "Research",
    relatedSlugs: ["maximum-drawdown", "position-sizing"],
    relatedBlogSlugs: ["lookahead-survivorship-bias", "walk-forward-testing"],
    source: { label: "Bailey et al., The Probability of Backtest Overfitting", url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2326253" },
    updatedAt: "2026-07-13",
  },
] as const satisfies readonly LearnEntryDefinition[];

export const learnSlugs = learnEntryDefinitions.map((entry) => entry.slug);

export function learnEntries(locale: Locale): readonly LearnEntry[] {
  return learnEntryDefinitions.map((entry) => ({ ...entry, ...learnContentByLocale[locale][entry.slug] }));
}

export function learnEntryBySlug(slug: string, locale: Locale = "ko"): LearnEntry | undefined {
  const entry = learnEntryDefinitions.find((candidate) => candidate.slug === slug);
  return entry ? { ...entry, ...learnContentByLocale[locale][entry.slug] } : undefined;
}
