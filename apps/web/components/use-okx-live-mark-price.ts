"use client";

import { useEffect, useState } from "react";

import {
  okxLivePriceStreamUrl,
  okxLivePriceSubscription,
  parseOkxLiveMarkPrice
} from "@/lib/leaderboard-live-market";

const UPDATE_INTERVAL_MS = 750;
const INITIAL_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

export function useOkxLiveMarkPrice(symbol: string, enabled: boolean): number | null {
  const [markPrice, setMarkPrice] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof WebSocket === "undefined") return () => undefined;
    return subscribeToOkxLiveMarkPrice(symbol, (nextPrice) => {
      setMarkPrice((previous) => previous === nextPrice ? previous : nextPrice);
    });
  }, [enabled, symbol]);

  return enabled ? markPrice : null;
}

function subscribeToOkxLiveMarkPrice(symbol: string, onPrice: (price: number) => void): () => void {
  let disposed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let updateTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  let pendingPrice: number | null = null;

  const publishPendingPrice = () => {
    updateTimer = null;
    if (disposed || pendingPrice === null) return;
    const nextPrice = pendingPrice;
    pendingPrice = null;
    onPrice(nextPrice);
  };

  const connect = () => {
    if (disposed) return;
    const nextSocket = new WebSocket(okxLivePriceStreamUrl());
    socket = nextSocket;

    nextSocket.onopen = () => {
      reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      nextSocket.send(okxLivePriceSubscription(symbol));
    };
    nextSocket.onmessage = (event) => {
      if (disposed || typeof event.data !== "string") return;
      const nextPrice = parseOkxLiveMarkPrice(event.data);
      if (nextPrice === null) return;
      pendingPrice = nextPrice;
      if (updateTimer === null) updateTimer = setTimeout(publishPendingPrice, UPDATE_INTERVAL_MS);
    };
    nextSocket.onerror = () => nextSocket.close();
    nextSocket.onclose = () => {
      if (disposed || socket !== nextSocket) return;
      reconnectTimer = setTimeout(connect, reconnectDelayMs);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    };
  };

  connect();

  return () => {
    disposed = true;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    if (updateTimer !== null) clearTimeout(updateTimer);
    socket?.close();
  };
}
