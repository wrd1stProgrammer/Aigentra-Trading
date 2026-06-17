from typing import Any

import httpx


def send_telegram_message(*, bot_token: str, chat_id: str, text: str) -> dict[str, Any]:
    response = httpx.post(
        f"https://api.telegram.org/bot{bot_token}/sendMessage",
        json={"chat_id": chat_id, "text": text, "disable_web_page_preview": True},
        timeout=5.0,
    )
    if response.headers.get("content-type", "").startswith("application/json"):
        data = response.json()
    else:
        data = {"ok": response.is_success, "description": response.text}
    if not response.is_success and "ok" not in data:
        data["ok"] = False
    return data


def get_telegram_bot_username(*, bot_token: str) -> str:
    try:
        response = httpx.get(f"https://api.telegram.org/bot{bot_token}/getMe", timeout=5.0)
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return ""
    if not response.is_success or data.get("ok") is not True:
        return ""
    result = data.get("result")
    if not isinstance(result, dict):
        return ""
    username = result.get("username")
    return username.strip() if isinstance(username, str) else ""
