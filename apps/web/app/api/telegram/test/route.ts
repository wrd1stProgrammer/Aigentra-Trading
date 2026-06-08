import { NextResponse } from "next/server";
import { auth, authSetupComplete } from "@/auth";
import { composeTelegramTestMessage, parseTelegramAlertTestPayload, sendTelegramMessage } from "@/lib/telegram-alerts";

export async function POST(request: Request) {
  if (authSetupComplete) {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "auth_not_configured" }, { status: 503 });
  }

  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    return NextResponse.json({ error: "missing_telegram_bot_token" }, { status: 503 });
  }

  const payload = parseTelegramAlertTestPayload(await readJson(request));
  if (!payload) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const result = await sendTelegramMessage({
    chatId: payload.chatId,
    text: composeTelegramTestMessage(payload)
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.code, description: result.description ?? null },
      { status: result.code === "missing_token" ? 503 : 502 }
    );
  }

  return NextResponse.json({ ok: true });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
