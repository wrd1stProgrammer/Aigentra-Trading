"use client";

import { ArrowsClockwise, CheckCircle, TelegramLogo, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { useAppContext } from "@/components/app-provider";
import { SUBSCRIBER_ACCOUNT_COPY } from "@/components/subscriber-account-copy";
import type { SubscriberPreferences } from "@/lib/subscriber-preferences";

type TelegramConnectPanelProps = {
  readonly preferences: SubscriberPreferences;
  readonly onRefreshPreferences: () => Promise<void>;
};

type ConnectState = "idle" | "opening" | "opened" | "refreshing" | "failed";

export function TelegramConnectPanel({ preferences, onRefreshPreferences }: TelegramConnectPanelProps) {
  const { locale } = useAppContext();
  const copy = SUBSCRIBER_ACCOUNT_COPY[locale];
  const [connectState, setConnectState] = useState<ConnectState>("idle");
  const [fallbackUrl, setFallbackUrl] = useState("");
  const connectedChatId = preferences.telegramSettings.chatId;
  const isConnected = connectedChatId.length > 0;

  async function openTelegramLink() {
    setConnectState("opening");
    setFallbackUrl("");
    try {
      const response = await fetch("/api/telegram/link", { method: "POST" });
      if (!response.ok) {
        setConnectState("failed");
        return;
      }
      const telegramUrl = readTelegramUrl(await response.json());
      if (!telegramUrl) {
        setConnectState("failed");
        return;
      }
      setFallbackUrl(telegramUrl);
      window.open(telegramUrl, "_blank", "noopener,noreferrer");
      setConnectState("opened");
    } catch (error) {
      setConnectState(error instanceof Error ? "failed" : "failed");
    }
  }

  async function refreshPreferences() {
    setConnectState("refreshing");
    await onRefreshPreferences();
    setConnectState("idle");
  }

  return (
    <div className={`rounded-xl border p-4 text-xs transition duration-300 ${
      isConnected
        ? "border-emerald-500/15 bg-emerald-50/30 text-emerald-800 dark:bg-emerald-950/5 dark:text-emerald-400"
        : "border-zinc-200/80 bg-white text-zinc-700 dark:border-white/[0.06] dark:bg-[#070908] dark:text-zinc-300"
    }`}>
      <div className="flex items-start gap-2.5">
        {isConnected ? (
          <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-500" />
        ) : (
          <TelegramLogo size={16} className="mt-0.5 shrink-0 text-sky-500" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <span className="block font-bold">
            {isConnected ? copy.telegramConnectedTitle : copy.telegramConnectTitle}
          </span>
          <span className="block break-keep text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            {isConnected
              ? `${copy.telegramConnectedChat} ${maskTelegramChatId(connectedChatId)}`
              : copy.telegramConnectHelp}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={openTelegramLink}
          disabled={connectState === "opening"}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-3 py-2 text-xs font-bold text-[var(--surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <TelegramLogo size={15} />
          {connectState === "opening"
            ? copy.telegramConnecting
            : isConnected
              ? copy.telegramReconnect
              : copy.telegramConnect}
        </button>
        <button
          type="button"
          onClick={refreshPreferences}
          disabled={connectState === "refreshing"}
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/[0.08] dark:bg-[#0c0f0d] dark:text-zinc-300 dark:hover:bg-white/[0.04]"
        >
          <ArrowsClockwise size={15} />
          {connectState === "refreshing" ? copy.telegramRefreshing : copy.telegramRefresh}
        </button>
      </div>
      {connectState === "opened" ? (
        <p className="mt-2 break-keep text-[11px] leading-relaxed text-emerald-600 dark:text-emerald-400">
          {copy.telegramConnectOpened}
        </p>
      ) : null}
      {connectState === "failed" ? (
        <p className="mt-2 flex items-start gap-1.5 break-keep text-[11px] leading-relaxed text-rose-600 dark:text-rose-300">
          <WarningCircle size={13} className="mt-0.5 shrink-0" />
          {copy.telegramLinkFailed}
        </p>
      ) : null}
      {fallbackUrl ? (
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-[11px] font-bold text-sky-600 underline-offset-4 hover:underline dark:text-sky-300"
        >
          {copy.telegramOpenFallback}
        </a>
      ) : null}
    </div>
  );
}

function readTelegramUrl(input: unknown): string {
  if (typeof input !== "object" || input === null || !("telegramUrl" in input)) return "";
  return typeof input.telegramUrl === "string" ? input.telegramUrl : "";
}

function maskTelegramChatId(chatId: string): string {
  if (chatId.length <= 4) return "****";
  return `****${chatId.slice(-4)}`;
}
