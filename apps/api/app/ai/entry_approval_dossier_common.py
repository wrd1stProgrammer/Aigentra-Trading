from typing import Any, Literal, Optional

from app.traders.models import EntryPlan, TakeProfitPlan

CheckStatus = Literal["pass", "warn", "fail"]


def append_check(checks: list[dict[str, Any]], code: str, status: CheckStatus, detail: str, value: Optional[str] = None) -> None:
    item: dict[str, Any] = {"code": code, "status": status, "detail": detail}
    if value is not None:
        item["value"] = value
    checks.append(item)


def compact_mapping(value: Any, keys: tuple[str, ...]) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    return {key: value[key] for key in keys if value.get(key) not in (None, "", [], {})}


def compact_text(value: Any, limit: int) -> Optional[str]:
    if value is None:
        return None
    text = " ".join(str(value).split())
    if not text:
        return None
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1].rstrip()}…"


def model_dump(value: Any) -> Optional[dict[str, Any]]:
    if value is None:
        return None
    dumped = value.model_dump()
    return {key: item for key, item in dumped.items() if item not in (None, "", [], {})}


def price_plan(plan: EntryPlan | TakeProfitPlan) -> dict[str, Any]:
    return {"price": plan.price, "weight": plan.weight, "reason": plan.reason}


def safe_float(value: Any) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return 0.0
    return parsed if parsed == parsed else 0.0
