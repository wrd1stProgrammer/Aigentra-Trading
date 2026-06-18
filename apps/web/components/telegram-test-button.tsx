"use client";

import { PaperPlaneTilt } from "@phosphor-icons/react";
import { useState } from "react";
import { useAppContext } from "@/components/app-provider";
import type { SubscriberPreferences, TelegramDeliveryReadiness } from "@/lib/subscriber-preferences";

type TelegramTestButtonProps = {
  readonly preferences: SubscriberPreferences;
  readonly readiness: TelegramDeliveryReadiness;
};

const COPY = {
  en: {
    send: "Send test alert",
    sending: "Sending",
    sent: "Test alert sent.",
    failed: "Delivery failed. Check the token and chat ID.",
    waiting: "You can send a test alert after the settings are ready."
  },
  ko: {
    send: "테스트 알림 전송",
    sending: "전송 중",
    sent: "테스트 알림을 전송했습니다.",
    failed: "전송에 실패했습니다. 토큰과 chat ID를 확인하세요.",
    waiting: "설정이 준비되면 테스트 알림을 보낼 수 있습니다."
  },
  ru: {
    send: "Отправить тест",
    sending: "Отправка",
    sent: "Тестовое уведомление отправлено.",
    failed: "Не удалось отправить. Проверьте токен и chat ID.",
    waiting: "Тест можно отправить после готовности настроек."
  },
  "pt-BR": {
    send: "Enviar teste",
    sending: "Enviando",
    sent: "Alerta de teste enviado.",
    failed: "Falha no envio. Verifique o token e o chat ID.",
    waiting: "Você poderá enviar um teste quando as configurações estiverem prontas."
  },
  tr: {
    send: "Test bildirimi gönder",
    sending: "Gönderiliyor",
    sent: "Test bildirimi gönderildi.",
    failed: "Gönderim başarısız. Token ve chat ID'yi kontrol edin.",
    waiting: "Ayarlar hazır olduğunda test bildirimi gönderebilirsiniz."
  }
} as const;

export function TelegramTestButton({ preferences, readiness }: TelegramTestButtonProps) {
  const { locale } = useAppContext();
  const copy = COPY[locale];
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const disabled = !readiness.canSend || status === "sending";

  async function sendTestAlert() {
    if (!readiness.canSend) return;
    setStatus("sending");
    try {
      const response = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: preferences.telegramSettings.chatId,
          eventTypes: preferences.telegramSettings.eventTypes,
          favoriteTraderIds: preferences.favoriteTraderIds,
          locale,
          minReturnPct: preferences.telegramSettings.minReturnPct
        })
      });
      setStatus(response.ok ? "sent" : "failed");
    } catch {
      setStatus("failed");
    }
  }

  const message = status === "sent" ? copy.sent : status === "failed" ? copy.failed : copy.waiting;

  return (
    <div className="rounded-lg border bg-[var(--surface-muted)] p-3" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={sendTestAlert}
        className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-3 py-2 text-sm font-semibold text-[var(--surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <PaperPlaneTilt size={16} />
        {status === "sending" ? copy.sending : copy.send}
      </button>
      <p className="text-muted-app mt-2 text-xs leading-5">{message}</p>
    </div>
  );
}
