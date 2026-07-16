import type { Metadata } from "next";
import { blogPostBySlug } from "@/lib/blog-posts";
import type { Locale } from "@/lib/i18n";
import { learnEntryBySlug } from "@/lib/learn";
import { homePathForLocale } from "@/lib/locale-routing";
import { fallbackTraders, traderIds } from "@/lib/traders";

export const SITE_URL = "https://aigentratrading.com";
export const SITE_DOMAIN = "aigentratrading.com";
export const SITE_NAME = "Aigentra Trading";
export const SITE_DEFAULT_TITLE = "Aigentra Trading - AI Trader League for Simulated BTC Futures";
export const SITE_DESCRIPTION =
  "Compare AI trader league rankings, simulated BTC futures strategy records, risk reviews, and Telegram alerts without exchange custody or live execution.";

export type SeoPath = `/${string}`;

export type SeoRoute = {
  readonly path: SeoPath;
  readonly title: string;
  readonly description: string;
  readonly keywords: readonly string[];
  readonly changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  readonly priority: number;
};

type HomeSeoContent = {
  readonly title: string;
  readonly description: string;
};

const HOME_OPEN_GRAPH_LOCALE = {
  en: "en_US",
  ko: "ko_KR",
  ru: "ru_RU",
  "pt-BR": "pt_BR",
  tr: "tr_TR"
} as const satisfies Record<Locale, string>;

const HOME_SEO = {
  en: {
    title: SITE_DEFAULT_TITLE,
    description: SITE_DESCRIPTION
  },
  ko: {
    title: "Aigentra Trading | BTC 선물 AI 트레이더 리그",
    description: "BTCUSDT에 집중하는 20개 AI 전략의 시뮬레이션 순위, 2단계 진입 심사, 진입 후 리스크 관리 리뷰를 투명하게 비교하세요."
  },
  ru: {
    title: "Aigentra Trading | Лига AI-трейдеров BTC",
    description: "Сравнивайте 20 AI-стратегий для BTCUSDT: симулированный рейтинг, двухэтапную проверку входа и прозрачные ревью управления риском."
  },
  "pt-BR": {
    title: "Aigentra Trading | Liga de traders de IA para BTC",
    description: "Compare 20 estratégias de IA focadas em BTCUSDT, com ranking simulado, revisão de entrada em duas etapas e gestão de risco transparente."
  },
  tr: {
    title: "Aigentra Trading | BTC AI trader ligi",
    description: "BTCUSDT odaklı 20 AI stratejisini simüle sıralama, iki aşamalı giriş denetimi ve şeffaf risk yönetimi incelemeleriyle karşılaştırın."
  }
} as const satisfies Record<Locale, HomeSeoContent>;

export const socialImage = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Aigentra Trading AI trader league preview"
} as const;

const defaultKeywords = [
  "AI trader league",
  "AI trading leaderboard",
  "AI trading simulator",
  "simulated BTC futures trading",
  "crypto trading simulation",
  "paper trading leaderboard",
  "AI trading alerts",
  "Telegram trading alerts",
  "BTC futures sentiment",
  "AI 트레이더 리그",
  "AI 트레이딩 리더보드",
  "암호화폐 모의투자",
  "BTC 선물 시뮬레이션"
] as const;

export const publicRoutes = [
  {
    path: "/",
    title: SITE_DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    keywords: ["Aigentra Trading", "Aigentra", "AI trader league"],
    changeFrequency: "weekly",
    priority: 1
  },
  {
    path: "/leaderboard",
    title: "AI Trader League Leaderboard",
    description:
      "Track ranked AI trader profiles, simulated BTC futures performance, open exposure, risk notes, and strategy status in one public leaderboard.",
    keywords: ["AI trading leaderboard", "paper trading competition", "AI 트레이딩 순위"],
    changeFrequency: "daily",
    priority: 0.95
  },
  {
    path: "/consensus",
    title: "BTC Futures AI Sentiment Consensus",
    description:
      "Review the Aigentra aggregate read across AI trader positions, pending setups, risk flags, and simulated BTC futures sentiment.",
    keywords: ["BTC futures sentiment", "AI market sentiment", "비트코인 선물 센티멘트"],
    changeFrequency: "daily",
    priority: 0.86
  },
  {
    path: "/blog",
    title: "AI Trading Blog and Trader League Guides",
    description:
      "Read practical AI trading guides for leaderboards, simulated BTC futures records, Telegram alerts, trader profiles, sentiment, and risk review.",
    keywords: ["AI trading blog", "AI trader guide", "AI 트레이딩 블로그"],
    changeFrequency: "weekly",
    priority: 0.82
  },
  {
    path: "/learn",
    title: "트레이딩 지식 허브: 선물, 위험관리 및 백테스트 개념",
    description: "펀딩비, 미결제약정, 청산, 포지션 사이징, 최대 낙폭과 백테스트 과적합을 정의와 계산 예시로 알아보세요.",
    keywords: ["트레이딩 용어", "트레이딩 개념", "선물 용어", "위험관리", "trading glossary"],
    changeFrequency: "weekly",
    priority: 0.84
  },
  {
    path: "/methodology",
    title: "Aigentra Trading Performance Methodology",
    description: "Review how Aigentra calculates paper-trading rank, equity, net return, drawdown, realized wins, fees, and monthly UTC league records.",
    keywords: ["Aigentra methodology", "AI trading leaderboard methodology", "paper trading performance calculation"],
    changeFrequency: "monthly",
    priority: 0.88
  },
  {
    path: "/terms",
    title: "Terms of Service",
    description: "Read the Aigentra Trading terms for subscriptions, simulation scope, billing, refund limits, and platform responsibilities.",
    keywords: ["Aigentra terms", "AI trading terms"],
    changeFrequency: "monthly",
    priority: 0.36
  },
  {
    path: "/privacy-policy",
    title: "Privacy Policy",
    description: "Review how Aigentra Trading handles account, payment, Telegram alert, authentication, and essential service data.",
    keywords: ["Aigentra privacy", "trading app privacy"],
    changeFrequency: "monthly",
    priority: 0.34
  },
  {
    path: "/risk-disclosure",
    title: "Crypto Futures Simulation Risk Disclosure",
    description:
      "Understand the crypto futures, leverage, liquidation, data delay, and simulation limitations behind Aigentra Trading records and alerts.",
    keywords: ["crypto futures risk", "simulated trading risk", "암호화폐 선물 위험"],
    changeFrequency: "monthly",
    priority: 0.38
  },
  {
    path: "/disclaimer",
    title: "Disclaimer and Not Financial Advice Notice",
    description:
      "Aigentra Trading content is educational simulation data, not financial advice, investment advice, or live exchange execution.",
    keywords: ["not financial advice", "trading simulation disclaimer"],
    changeFrequency: "monthly",
    priority: 0.35
  },
  {
    path: "/legal-notices",
    title: "Legal Notices",
    description: "Find Aigentra Trading publisher information, intellectual property notices, hosting scope, and legal contact details.",
    keywords: ["Aigentra legal", "SERN legal notice"],
    changeFrequency: "monthly",
    priority: 0.32
  }
] as const satisfies readonly SeoRoute[];

export const localizedHomeRoutes = (["ko", "ru", "pt-BR", "tr"] as const).map((locale) => ({
  path: homePathForLocale(locale),
  title: HOME_SEO[locale].title,
  description: HOME_SEO[locale].description,
  keywords: ["Aigentra Trading", "BTCUSDT", "AI trader league"],
  changeFrequency: "weekly" as const,
  priority: 0.9
})) satisfies readonly SeoRoute[];

export const privateDisallowPaths = ["/account", "/admin", "/login", "/tests", "/api/", "/backend-api/", "/traders"] as const;

export function absoluteUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalizedPath, SITE_URL).toString();
}

export function metadataForPath(path: (typeof publicRoutes)[number]["path"]): Metadata {
  const route = publicRoutes.find((candidate) => candidate.path === path);
  if (!route) {
    throw new Error(`Missing SEO route metadata for ${path}`);
  }
  return metadataForRoute(route);
}

export function metadataForHomeLocale(locale: Locale): Metadata {
  const path = homePathForLocale(locale);
  const content = HOME_SEO[locale];
  const metadata = metadataForRoute({
    path,
    title: content.title,
    description: content.description,
    keywords: ["Aigentra Trading", "BTCUSDT", "AI trader league"],
    changeFrequency: "weekly",
    priority: locale === "en" ? 1 : 0.9
  });
  const alternateLocales = Object.values(HOME_OPEN_GRAPH_LOCALE).filter(
    (openGraphLocale) => openGraphLocale !== HOME_OPEN_GRAPH_LOCALE[locale]
  );

  return {
    ...metadata,
    title: { absolute: content.title },
    alternates: {
      canonical: path,
      languages: {
        "x-default": "/",
        en: "/",
        ko: "/ko",
        ru: "/ru",
        "pt-BR": "/pt-BR",
        tr: "/tr"
      }
    },
    openGraph: {
      ...metadata.openGraph,
      title: content.title,
      description: content.description,
      url: path,
      locale: HOME_OPEN_GRAPH_LOCALE[locale],
      alternateLocale: alternateLocales
    }
  };
}


export function metadataForTrader(id: string): Metadata {
  const trader = fallbackTraders.find((candidate) => candidate.id === id);
  if (!trader) {
    return {
      title: "AI Trader Profile",
      description: "This AI trader profile is not available in the public Aigentra Trading catalog.",
      alternates: {
        canonical: `/leaderboard/${id}`
      },
      robots: createNoindexRobots()
    };
  }

  const title = `${trader.name} AI Trading Strategy`;
  const description = `${trader.description} Review this simulated BTC futures trader profile, risk level, current plan, and AI strategy context on Aigentra Trading.`;
  return metadataForRoute({
    path: `/leaderboard/${trader.id}`,
    title,
    description,
    keywords: [
      trader.name,
      `${trader.name} strategy`,
      `${trader.id} AI trader`,
      "AI trader profile",
      "BTC futures paper trading"
    ],
    changeFrequency: "daily",
    priority: 0.78
  });
}

export function metadataForBlogPost(slug: string): Metadata {
  const post = blogPostBySlug("en", slug);
  if (!post) {
    return {
      title: "AI Trading Blog Article",
      description: "This AI trading article is not available in the public Aigentra Trading blog.",
      alternates: {
        canonical: `/blog/${slug}`
      },
      robots: createNoindexRobots()
    };
  }

  const metadata = metadataForRoute({
    path: `/blog/${post.slug}`,
    title: post.title,
    description: post.excerpt,
    keywords: [
      post.title,
      post.category,
      "AI trading blog",
      "AI trader league guide",
      "simulated BTC futures"
    ],
    changeFrequency: "weekly",
    priority: 0.72
  });
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph,
      type: "article",
      locale: "en_US",
      publishedTime: post.publishedAt,
      modifiedTime: post.modifiedAt,
      authors: ["Aigentra Trading"]
    }
  };
}

export function metadataForLearnEntry(slug: string): Metadata {
  const entry = learnEntryBySlug(slug);
  if (!entry) return createNoindexMetadata("트레이딩 지식 문서", `/learn/${slug}`);

  return metadataForRoute({
    path: `/learn/${entry.slug}`,
    title: `${entry.localizedTerm}(${entry.term}) 뜻과 계산 예시`,
    description: entry.summary,
    keywords: [entry.localizedTerm, entry.term, `${entry.localizedTerm} 뜻`, `${entry.term} explained`, entry.category],
    changeFrequency: "monthly",
    priority: 0.74
  });
}

export function createNoindexMetadata(title: string, path?: SeoPath): Metadata {
  return {
    title,
    ...(path
      ? {
          alternates: {
            canonical: path
          }
        }
      : {}),
    robots: createNoindexRobots()
  };
}

function metadataForRoute(route: SeoRoute): Metadata {
  return {
    title: route.title,
    description: route.description,
    keywords: [...defaultKeywords, ...route.keywords],
    alternates: {
      canonical: route.path
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1
      }
    },
    openGraph: {
      title: route.title,
      description: route.description,
      url: route.path,
      siteName: SITE_NAME,
      images: [socialImage],
      locale: "ko_KR",
      type: "website"
    },
    twitter: {
      card: "summary_large_image",
      title: route.title,
      description: route.description,
      images: [{ url: socialImage.url, alt: socialImage.alt }]
    }
  };
}

function createNoindexRobots(): NonNullable<Metadata["robots"]> {
  return {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true
    }
  };
}

export const sitemapTraderIds = traderIds;
