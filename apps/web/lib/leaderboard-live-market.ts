import type { PaperPosition } from "@/lib/api";

const OKX_BUSINESS_STREAM_URL = "wss://ws.okx.com:8443/ws/v5/business";

export function parseOkxLiveMarkPrice(message: string): number | null {
  try {
    const parsed: unknown = JSON.parse(message);
    if (!isRecord(parsed) || !Array.isArray(parsed.data)) return null;
    const firstRow = parsed.data[0];
    if (!Array.isArray(firstRow)) return null;
    return finiteNumber(firstRow[4]);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export function livePositionRoi(position: PaperPosition, markPrice: number | null): number | null {
  const margin = finiteNumber(position.margin) ?? finiteNumber(position.openMargin);
  if (margin === null || margin <= 0) return null;

  const livePnl = markToMarketPnl(position, markPrice);
  const fallbackPnl = finiteNumber(position.unrealizedPnl);
  const pnl = livePnl ?? fallbackPnl;
  return pnl === null ? null : (pnl / margin) * 100;
}

export function okxLivePriceStreamUrl(): string {
  return OKX_BUSINESS_STREAM_URL;
}

export function okxLivePriceSubscription(symbol: string): string {
  const base = symbol.trim().toUpperCase().replace(/USDT$/, "");
  return JSON.stringify({ op: "subscribe", args: [{ channel: "candle1m", instId: `${base}-USDT-SWAP` }] });
}

function markToMarketPnl(position: PaperPosition, markPrice: number | null): number | null {
  if (markPrice === null || !Number.isFinite(markPrice)) return null;
  const quantity = Math.abs(finiteNumber(position.quantity) ?? finiteNumber(position.size) ?? 0);
  const entryPrice = finiteNumber(position.averageEntryPrice) ?? finiteNumber(position.entryPrice);
  const side = String(position.side ?? "").trim().toUpperCase();
  if (quantity <= 0 || entryPrice === null) return null;
  if (side === "LONG" || side === "BUY") return (markPrice - entryPrice) * quantity;
  if (side === "SHORT" || side === "SELL") return (entryPrice - markPrice) * quantity;
  return null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
