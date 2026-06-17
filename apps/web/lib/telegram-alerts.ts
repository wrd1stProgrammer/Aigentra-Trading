import { z } from "zod";
import type { Locale } from "@/lib/i18n";
import { telegramEventTypes, type TelegramEventType } from "@/lib/subscriber-preferences";

const telegramEventSchema = z.enum(telegramEventTypes);

const telegramAlertTestPayloadSchema = z.object({
  chatId: z.string().trim().min(1),
  locale: z.enum(["ko", "en"]).default("ko"),
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
  ko: {
    pending_entry: "진입대기",
    position_entry: "진입완료",
    take_profit: "익절",
    stop_loss: "손절",
    ai_review_low: "AI 리뷰 낮음",
    ai_review_medium: "AI 리뷰 중간",
    ai_review_high: "AI 리뷰 높음",
    risk: "리스크",
  },
  en: {
    pending_entry: "Entry Pending",
    position_entry: "Entry Filled",
    take_profit: "Take Profit",
    stop_loss: "Stop Loss",
    ai_review_low: "AI Review Low",
    ai_review_medium: "AI Review Medium",
    ai_review_high: "AI Review High",
    risk: "Risk",
  }
};

export function parseTelegramAlertTestPayload(input: unknown): TelegramAlertTestPayload | null {
  const parsedPayload = telegramAlertTestPayloadSchema.safeParse(input);
  return parsedPayload.success ? parsedPayload.data : null;
}

export function composeTelegramTestMessage(payload: TelegramAlertTestPayload): string {
  const locale = payload.locale;
  const eventLabels = payload.eventTypes.map((eventType) => EVENT_LABELS[locale][eventType]).join(", ");
  const traderScope = payload.favoriteTraderIds.length > 0 ? payload.favoriteTraderIds.join(", ") : locale === "ko" ? "전체 관심 트레이더" : "all favorite traders";

  if (locale === "ko") {
    return [
      "[Aigentra Trading] Telegram 알림 테스트",
      `관심 트레이더: ${traderScope}`,
      `알림 유형: ${eventLabels || "선택 없음"}`,
      `최소 수익률 필터: ${payload.minReturnPct}%`,
      "실제 진입/청산/관리 이벤트가 발생하면 이 채팅으로 알림이 전송됩니다."
    ].join("\n");
  }

  return [
    "[Aigentra Trading] Telegram alert test",
    `Favorite traders: ${traderScope}`,
    `Alert types: ${eventLabels || "None selected"}`,
    `Minimum return filter: ${payload.minReturnPct}%`,
    "Live entry, exit, and management events will be delivered to this chat."
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
