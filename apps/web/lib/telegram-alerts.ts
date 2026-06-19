import { z } from "zod";
import type { Locale } from "@/lib/i18n";
import { telegramEventTypes, type TelegramEventType } from "@/lib/subscriber-preferences";

const telegramEventSchema = z.enum(telegramEventTypes);

const telegramAlertTestPayloadSchema = z.object({
  chatId: z.string().trim().min(1),
  locale: z.enum(["en", "ko", "ru", "pt-BR", "tr"]).default("en"),
  eventTypes: z.array(telegramEventSchema).default([...telegramEventTypes]),
  minReturnPct: z.coerce.number().finite().default(0),
  favoriteTraderIds: z.array(z.string().trim().min(1)).default([])
});

export type TelegramAlertTestPayload = z.infer<typeof telegramAlertTestPayloadSchema>;

type TelegramSendResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: "missing_token" | "telegram_api_error"; readonly description?: string };

type SendTelegramMessageInput = {
  readonly chatId: string;
  readonly text: string;
  readonly botToken?: string;
};

const EVENT_LABELS: Record<Locale, Record<TelegramEventType, string>> = {
  en: {
    pending_entry: "Entry Pending",
    position_entry: "Entry Filled",
    take_profit: "Take Profit",
    stop_loss: "Stop Loss",
    ai_review_low: "AI Review Low",
    ai_review_medium: "AI Review Medium",
    ai_review_high: "AI Review High",
    league_sentiment: "Aigentra Opinion",
    trader_status_feed: "Trader Feed",
    risk: "Risk",
  },
  ko: {
    pending_entry: "진입대기",
    position_entry: "진입완료",
    take_profit: "익절",
    stop_loss: "손절",
    ai_review_low: "AI 리뷰 낮음",
    ai_review_medium: "AI 리뷰 중간",
    ai_review_high: "AI 리뷰 높음",
    league_sentiment: "Aigentra 종합 의견",
    trader_status_feed: "트레이더 피드",
    risk: "리스크",
  },
  ru: {
    pending_entry: "Ожидает входа",
    position_entry: "Вход исполнен",
    take_profit: "Тейк-профит",
    stop_loss: "Стоп-лосс",
    ai_review_low: "AI-обзор низкий",
    ai_review_medium: "AI-обзор средний",
    ai_review_high: "AI-обзор высокий",
    league_sentiment: "Сводное мнение Aigentra",
    trader_status_feed: "Лента трейдера",
    risk: "Риск",
  },
  "pt-BR": {
    pending_entry: "Entrada pendente",
    position_entry: "Entrada executada",
    take_profit: "Take profit",
    stop_loss: "Stop loss",
    ai_review_low: "Revisão AI baixa",
    ai_review_medium: "Revisão AI média",
    ai_review_high: "Revisão AI alta",
    league_sentiment: "Opinião geral Aigentra",
    trader_status_feed: "Feed do trader",
    risk: "Risco",
  },
  tr: {
    pending_entry: "Giriş bekliyor",
    position_entry: "Giriş tamamlandı",
    take_profit: "Kar alındı",
    stop_loss: "Zarar kesildi",
    ai_review_low: "AI inceleme düşük",
    ai_review_medium: "AI inceleme orta",
    ai_review_high: "AI inceleme yüksek",
    league_sentiment: "Aigentra genel görüşü",
    trader_status_feed: "Trader akışı",
    risk: "Risk",
  }
};

const TEST_COPY: Record<Locale, {
  title: string;
  traders: string;
  allTraders: string;
  events: string;
  none: string;
  filter: string;
  footer: string;
}> = {
  en: {
    title: "[Aigentra Trading] Telegram alert test",
    traders: "Favorite traders",
    allTraders: "all favorite traders",
    events: "Alert types",
    none: "None selected",
    filter: "Minimum return filter",
    footer: "Live entry, exit, and management events will be delivered to this chat."
  },
  ko: {
    title: "[Aigentra Trading] Telegram 알림 테스트",
    traders: "관심 트레이더",
    allTraders: "전체 관심 트레이더",
    events: "알림 유형",
    none: "선택 없음",
    filter: "최소 수익률 필터",
    footer: "실제 진입/청산/관리 이벤트가 발생하면 이 채팅으로 알림이 전송됩니다."
  },
  ru: {
    title: "[Aigentra Trading] Тест Telegram-уведомлений",
    traders: "Избранные трейдеры",
    allTraders: "все избранные трейдеры",
    events: "Типы уведомлений",
    none: "Не выбрано",
    filter: "Минимальный фильтр доходности",
    footer: "События входа, выхода и управления будут приходить в этот чат."
  },
  "pt-BR": {
    title: "[Aigentra Trading] Teste de alerta no Telegram",
    traders: "Traders favoritos",
    allTraders: "todos os traders favoritos",
    events: "Tipos de alerta",
    none: "Nenhum selecionado",
    filter: "Filtro mínimo de retorno",
    footer: "Eventos de entrada, saída e gestão serão enviados para este chat."
  },
  tr: {
    title: "[Aigentra Trading] Telegram bildirim testi",
    traders: "Favori traderlar",
    allTraders: "tüm favori traderlar",
    events: "Bildirim türleri",
    none: "Seçilmedi",
    filter: "Minimum getiri filtresi",
    footer: "Canlı giriş, çıkış ve yönetim olayları bu sohbete gönderilecek."
  }
};

export function parseTelegramAlertTestPayload(input: unknown): TelegramAlertTestPayload | null {
  const parsedPayload = telegramAlertTestPayloadSchema.safeParse(input);
  return parsedPayload.success ? parsedPayload.data : null;
}

export function composeTelegramTestMessage(payload: TelegramAlertTestPayload): string {
  const locale = payload.locale;
  const eventLabels = payload.eventTypes.map((eventType) => EVENT_LABELS[locale][eventType]).join(", ");
  const copy = TEST_COPY[locale];
  const traderScope = payload.favoriteTraderIds.length > 0 ? payload.favoriteTraderIds.join(", ") : copy.allTraders;

  return [
    copy.title,
    `${copy.traders}: ${traderScope}`,
    `${copy.events}: ${eventLabels || copy.none}`,
    `${copy.filter}: ${payload.minReturnPct}%`,
    copy.footer
  ].join("\n");
}

export async function sendTelegramMessage({ chatId, text, botToken = process.env.TELEGRAM_BOT_TOKEN }: SendTelegramMessageInput): Promise<TelegramSendResult> {
  const normalizedToken = botToken?.trim();
  if (!normalizedToken) {
    return { ok: false, code: "missing_token" };
  }

  const response = await fetch(`https://api.telegram.org/bot${normalizedToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      disable_web_page_preview: true,
      text
    })
  });
  const responsePayload: unknown = await response.json().catch(() => null);

  if (!response.ok || !isTelegramApiResponse(responsePayload) || !responsePayload.ok) {
    return {
      ok: false,
      code: "telegram_api_error",
      description: isTelegramApiResponse(responsePayload) ? responsePayload.description : response.statusText
    };
  }

  return { ok: true };
}

function isTelegramApiResponse(input: unknown): input is { readonly ok: boolean; readonly description?: string } {
  return typeof input === "object" && input !== null && "ok" in input && typeof input.ok === "boolean";
}
