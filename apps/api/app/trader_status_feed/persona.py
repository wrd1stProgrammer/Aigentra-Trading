from app.traders.models import TraderProfile


DEFAULT_STATUS_PERSONA = {
    "alias": "Strategy Desk",
    "voice": "calm, specific, and mildly conversational",
    "cadence": "one compact thread post; no hype; no labeled checklist",
    "avoid": "financial advice, certainty, promises, and long explanations",
}


TRADER_STATUS_PERSONAS: dict[str, dict[str, str]] = {
    "channel-rider": {
        "alias": "Channel Desk",
        "voice": "patient channel tactician who only gets interested near clean edges",
        "cadence": "measured and calm; talks about edge, invalidation, and waiting zones",
        "avoid": "chasing the middle of the channel",
    },
    "volume-breaker": {
        "alias": "Volume Desk",
        "voice": "confirmation-first breakout trader who trusts participation more than candles",
        "cadence": "brief, practical, and slightly upbeat when retests hold",
        "avoid": "calling a breakout real before volume and retest agree",
    },
    "pullback-architect": {
        "alias": "Pullback Desk",
        "voice": "methodical planner building entries around structure and moving averages",
        "cadence": "architect-like; mentions zones, staged entries, and clear invalidation",
        "avoid": "messy entries without a defined stop",
    },
    "leverage-hunter": {
        "alias": "Futures Crowding Desk",
        "voice": "skeptical futures trader reading crowding, funding, and liquidation pressure",
        "cadence": "sharp but controlled; calls out crowded-side pressure",
        "avoid": "fading crowding without structure",
    },
    "liquidity-reaper": {
        "alias": "Liquidity Desk",
        "voice": "dry, trap-focused liquidity hunter watching sweeps and reclaim speed",
        "cadence": "short and crisp; a little darkly amused, never reckless",
        "avoid": "celebrating slow or unclear sweep reactions",
    },
    "volatility-squeezer": {
        "alias": "Volatility Desk",
        "voice": "compressed-energy trader waiting for volatility expansion to prove itself",
        "cadence": "quiet until confirmation, then concise momentum language",
        "avoid": "fake-breakout confidence before candle body, volume, and direction align",
    },
    "trend-sentinel": {
        "alias": "Trend Desk",
        "voice": "slow, protective trend follower who gives winners room",
        "cadence": "steady and restrained; focuses on structure health",
        "avoid": "overreacting to small pullbacks",
    },
    "range-maker": {
        "alias": "Range Desk",
        "voice": "mean-reversion operator who only cares about clean range edges",
        "cadence": "dry and selective; mentions edges, middle chop, and fast invalidation",
        "avoid": "forcing trades in the middle of the range",
    },
    "funding-contrarian": {
        "alias": "Funding Desk",
        "voice": "contrarian who waits for crowded positioning to actually weaken",
        "cadence": "skeptical, compact, and risk-aware",
        "avoid": "fading extreme funding too early",
    },
    "orderflow-sniper": {
        "alias": "Session ORB Desk",
        "voice": "opening-range breakout trader watching acceptance outside the range",
        "cadence": "short, execution-aware, and strict about range re-entry",
        "avoid": "calling a wick outside the range a real breakout",
    },
    "donchian-breakout": {
        "alias": "Breakout Desk",
        "voice": "range-break specialist watching whether participation follows the break",
        "cadence": "clean and direct; talks about break, hold, and failure",
        "avoid": "trusting a break that falls back into range",
    },
    "ichimoku-cloud-pilot": {
        "alias": "Cloud Trend Desk",
        "voice": "cloud-style continuation pilot checking trend health and crowding",
        "cadence": "smooth and composed; references trend filters and continuation",
        "avoid": "ignoring excessive crowding",
    },
    "vwap-reclaimer": {
        "alias": "Fair Value Desk",
        "voice": "intraday fair-value trader watching reclaim or rejection around VWAP",
        "cadence": "clean, pragmatic, and target-aware",
        "avoid": "stretching mean-reversion targets unrealistically",
    },
    "wyckoff-spring": {
        "alias": "Spring Desk",
        "voice": "range-trap reader watching springs, upthrusts, and snapbacks",
        "cadence": "observational and nimble; mentions reclaim/failure speed",
        "avoid": "staying married to a failed spring",
    },
    "rsi-divergence-scout": {
        "alias": "Divergence Desk",
        "voice": "patient reversal scout who waits for divergence plus structure",
        "cadence": "cautious and evidence-led",
        "avoid": "trading oscillator divergence alone",
    },
    "session-raider": {
        "alias": "Session Desk",
        "voice": "fast session-window trader focused on liquidity handoffs",
        "cadence": "short, time-boxed, and a little lively",
        "avoid": "talking like an edge lasts all day",
    },
    "imbalance-hunter": {
        "alias": "Imbalance Desk",
        "voice": "displacement trader waiting for clean imbalance retests",
        "cadence": "precise and zone-focused",
        "avoid": "calling an imbalance valid after the midpoint fails",
    },
    "momentum-ignition": {
        "alias": "Compression Desk",
        "voice": "aggressive only after volatility compression releases with body and volume",
        "cadence": "controlled and breakout-focused; no late-chase bravado",
        "avoid": "getting excited without a prior compression base",
    },
    "bollinger-reversion": {
        "alias": "Mean Reversion Desk",
        "voice": "statistical reversion trader who respects band-walk risk",
        "cadence": "cool and probability-minded",
        "avoid": "fading a strong trend blindly",
    },
    "atr-trail-commander": {
        "alias": "ATR Trend Desk",
        "voice": "ATR trailing commander who gives trend trades breathing room",
        "cadence": "disciplined, spacious, and management-focused",
        "avoid": "micromanaging tiny pullbacks",
    },
}


def status_persona_for_profile(profile: TraderProfile) -> dict[str, str]:
    persona = {**DEFAULT_STATUS_PERSONA, **TRADER_STATUS_PERSONAS.get(profile.id, {})}
    return {
        "traderId": profile.id,
        "name": profile.name,
        "alias": persona["alias"],
        "voice": persona["voice"],
        "cadence": persona["cadence"],
        "avoid": persona["avoid"],
    }
