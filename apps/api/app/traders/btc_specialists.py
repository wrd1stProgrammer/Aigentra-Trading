from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.traders.models import EntryPlan, TakeProfitPlan, TradeCandidate, TraderProfile
from app.traders.strategy_base import (
    TraderStrategy,
    candidate_geometry_errors,
    candle_body_ratio,
    default_leverage_plan,
    default_order_intent,
    default_risk_plan,
    estimate_risk_reward,
    fvalue,
    funding_abs_percentile,
    latest_candle,
    market_regime,
    normalize_entries_for_side,
    open_interest_change,
    round_price,
    taker_buy_share,
    timeframe,
    trend_for,
    wick_ratios,
)


def _mock_performance() -> Dict[str, Any]:
    return {"return7d": 0.0, "return30d": 0.0, "winRate": 0.0, "maxDrawdown": 0.0, "currentEquity": 10000.0}


SPECIALIST_CONFIGS: List[Dict[str, Any]] = [
    {
        "id": "donchian-breakout",
        "name": "Donchian Breakout",
        "description": "Trades BTC range expansion after recent swing highs or lows break with volume.",
        "concept": "Turtle/Donchian style breakout with 15m confirmation, OI expansion, and ATR-based trailing.",
        "risk": 0.62,
        "riskLevel": "MEDIUM_HIGH",
        "mode": "breakout",
        "setupLong": "DONCHIAN_RANGE_EXPANSION_LONG",
        "setupShort": "DONCHIAN_RANGE_EXPANSION_SHORT",
        "leverage": 7,
        "maxLeverage": 9,
        "riskMult": 1.0,
        "targets": (1.6, 3.2),
        "order": "BREAKOUT_CLOSE_OR_RETEST",
        "entry": "hybrid",
        "currentPlan": "Waiting for BTC to break a recent Donchian boundary with real participation.",
        "long": ["15m/1H close above recent swing high", "Volume z-score or OI confirms expansion", "4H trend is not bearish", "ATR stop can support at least 1.45R"],
        "short": ["15m/1H close below recent swing low", "Volume z-score or OI confirms expansion", "4H trend is not bullish", "ATR stop can support at least 1.45R"],
        "entryRules": ["60% on breakout close", "40% on first retest that holds outside the range"],
        "tpRules": ["TP1 at 1.6R", "TP2 trails toward 3.2R or next swing liquidity"],
        "slRules": ["Behind broken Donchian boundary", "Cancel retest entry if price closes back inside range"],
        "aiChecklist": ["Is this a clean range expansion or a fakeout?", "Is the retest entry reachable without chasing?", "Should the second entry be cancelled if momentum runs?", "Does OI expansion support new trend participation?"],
    },
    {
        "id": "ichimoku-cloud-pilot",
        "name": "Ichimoku Cloud Pilot",
        "description": "Uses EMA cloud proxy, 4H trend, and RSI health to ride BTC continuation.",
        "concept": "Ichimoku-inspired trend filter: price above/below cloud proxy, momentum health, delayed confirmation.",
        "risk": 0.58,
        "riskLevel": "MEDIUM",
        "mode": "trend",
        "setupLong": "CLOUD_CONTINUATION_LONG",
        "setupShort": "CLOUD_CONTINUATION_SHORT",
        "leverage": 6,
        "maxLeverage": 8,
        "riskMult": 1.25,
        "targets": (1.8, 3.8),
        "order": "CLOUD_PULLBACK_CONTINUATION",
        "entry": "staged",
        "currentPlan": "Waiting for BTC to hold the trend cloud proxy after a controlled pullback.",
        "long": ["4H trend bullish", "1H close holds above EMA20/EMA50 cloud proxy", "RSI remains constructive but not euphoric", "Funding is not extreme"],
        "short": ["4H trend bearish", "1H close holds below EMA20/EMA50 cloud proxy", "RSI remains weak but not capitulated", "Funding is not extreme"],
        "entryRules": ["40% near cloud edge", "60% after continuation candle confirms"],
        "tpRules": ["TP1 near prior swing", "TP2 uses wider trend extension"],
        "slRules": ["Outside cloud proxy", "Exit if 1H closes through the opposite cloud side"],
        "aiChecklist": ["Is the cloud proxy actually trending or flat?", "Is the pullback healthy rather than reversal?", "Should the agent trail instead of taking quick profit?", "Is funding too crowded for continuation?"],
    },
    {
        "id": "vwap-reclaimer",
        "name": "VWAP Reclaimer",
        "description": "Trades reclaim/failure around BTC intraday fair value after stretched moves.",
        "concept": "VWAP-like mean reclaim using EMA20 proxy, volume response, and rejection of unfair price.",
        "risk": 0.5,
        "riskLevel": "MEDIUM",
        "mode": "reclaim",
        "setupLong": "VWAP_RECLAIM_LONG",
        "setupShort": "VWAP_REJECT_SHORT",
        "leverage": 6,
        "maxLeverage": 8,
        "riskMult": 0.85,
        "targets": (1.35, 2.4),
        "order": "VWAP_RECLAIM_THEN_LIMIT",
        "entry": "hybrid",
        "currentPlan": "Waiting for BTC to reclaim or reject intraday fair value with volume confirmation.",
        "long": ["Price stretched below fair value then reclaims EMA20/VWAP proxy", "15m close confirms reclaim", "Seller volume fades", "OI does not expand against the reclaim"],
        "short": ["Price stretched above fair value then fails EMA20/VWAP proxy", "15m close confirms rejection", "Buyer volume fades", "OI does not expand against the rejection"],
        "entryRules": ["50% on reclaim/fail close", "50% on shallow retest of fair value"],
        "tpRules": ["TP1 at nearest swing midpoint", "TP2 at opposite intraday liquidity"],
        "slRules": ["Beyond failed reclaim candle", "Cancel if price accepts back through fair value"],
        "aiChecklist": ["Is this real reclaim or a dead-cat bounce?", "Is current price too close to target?", "Should size be smaller because mean trades decay quickly?", "Is taker flow confirming the reclaim/fail?"],
    },
    {
        "id": "wyckoff-spring",
        "name": "Wyckoff Spring",
        "description": "Looks for BTC spring/upthrust behavior around range extremes before reversal.",
        "concept": "Wyckoff spring/upthrust: sweep outside range, reclaim/failure close, volume spike, and fast invalidation.",
        "risk": 0.56,
        "riskLevel": "HIGH",
        "mode": "reversal",
        "setupLong": "WYCKOFF_SPRING_LONG",
        "setupShort": "WYCKOFF_UPTHRUST_SHORT",
        "leverage": 7,
        "maxLeverage": 9,
        "riskMult": 0.8,
        "targets": (1.5, 2.9),
        "order": "SPRING_RECLAIM_CONFIRMATION",
        "entry": "hybrid",
        "currentPlan": "Waiting for BTC to sweep a range extreme and quickly reclaim or fail it.",
        "long": ["Price sweeps range low", "Lower wick is meaningful", "15m closes back inside range", "Volume spike shows stop run participation"],
        "short": ["Price sweeps range high", "Upper wick is meaningful", "15m closes back inside range", "Volume spike shows stop run participation"],
        "entryRules": ["60% on reclaim/failure candle", "40% on retest of swept level"],
        "tpRules": ["TP1 at range midpoint", "TP2 near opposite liquidity pocket"],
        "slRules": ["Outside wick extreme", "Exit if swept level is accepted again"],
        "aiChecklist": ["Is this a spring/upthrust or real breakout?", "Is wick plus volume enough?", "Is stop outside the actual sweep?", "Should this be a fast partial-profit trade?"],
    },
    {
        "id": "rsi-divergence-scout",
        "name": "RSI Divergence Scout",
        "description": "Scans BTC for momentum divergence before structure reclaim or failure.",
        "concept": "RSI divergence proxy with swing structure, exhaustion, and confirmation candle.",
        "risk": 0.48,
        "riskLevel": "MEDIUM",
        "mode": "divergence",
        "setupLong": "BULLISH_RSI_DIVERGENCE_RECLAIM",
        "setupShort": "BEARISH_RSI_DIVERGENCE_FAILURE",
        "leverage": 5,
        "maxLeverage": 7,
        "riskMult": 0.9,
        "targets": (1.4, 2.6),
        "order": "DIVERGENCE_CONFIRMATION",
        "entry": "staged",
        "currentPlan": "Waiting for BTC exhaustion divergence plus a structure confirmation candle.",
        "long": ["15m/1H RSI below neutral but improving", "Price stops making clean downside progress", "15m reclaim candle appears", "Funding/crowding do not fight the reversal"],
        "short": ["15m/1H RSI above neutral but weakening", "Price stops making clean upside progress", "15m failure candle appears", "Funding/crowding do not fight the reversal"],
        "entryRules": ["35% on confirmation", "65% on retest of reclaim/failure level"],
        "tpRules": ["TP1 near mean reversion target", "TP2 near prior swing"],
        "slRules": ["Beyond divergence invalidation swing", "Exit if RSI thrust accelerates against thesis"],
        "aiChecklist": ["Is divergence real or just weak momentum in trend?", "Does structure confirm before entry?", "Should the trade be skipped if HTF trend is too strong?", "Is RR still valid after fee buffer?"],
    },
    {
        "id": "session-raider",
        "name": "Session Raider",
        "description": "Trades BTC session-range breaks around Asia/London/New York transition windows.",
        "concept": "Session breakout: time-of-day window, intraday range boundary, impulse candle, and fast stale-order expiry.",
        "risk": 0.52,
        "riskLevel": "MEDIUM_HIGH",
        "mode": "session",
        "setupLong": "SESSION_RANGE_BREAK_LONG",
        "setupShort": "SESSION_RANGE_BREAK_SHORT",
        "leverage": 7,
        "maxLeverage": 9,
        "riskMult": 0.75,
        "targets": (1.25, 2.2),
        "order": "SESSION_BREAKOUT_FAST",
        "entry": "single",
        "currentPlan": "Waiting for BTC to break a session range during a high-liquidity transition window.",
        "long": ["Session transition window is active", "15m candle breaks above local range", "Volume or body expansion appears", "No immediate 4H bearish conflict"],
        "short": ["Session transition window is active", "15m candle breaks below local range", "Volume or body expansion appears", "No immediate 4H bullish conflict"],
        "entryRules": ["Single entry on confirmed session break", "Expire quickly if not filled"],
        "tpRules": ["TP1 fast liquidity target", "TP2 only if momentum persists"],
        "slRules": ["Behind session break candle", "Close if price re-enters session range"],
        "aiChecklist": ["Is this a real session expansion or thin-liquidity wick?", "Should order expire quickly?", "Is spread/fee buffer worth the scalp-like target?", "Does higher timeframe block the direction?"],
    },
    {
        "id": "imbalance-hunter",
        "name": "Imbalance Hunter",
        "description": "Uses BTC displacement candles and fair-value-gap style pullbacks.",
        "concept": "Smart-money inspired displacement: strong body, imbalance midpoint retest, structure continuation.",
        "risk": 0.57,
        "riskLevel": "MEDIUM_HIGH",
        "mode": "imbalance",
        "setupLong": "BULLISH_IMBALANCE_RETEST",
        "setupShort": "BEARISH_IMBALANCE_RETEST",
        "leverage": 6,
        "maxLeverage": 8,
        "riskMult": 0.95,
        "targets": (1.55, 3.0),
        "order": "DISPLACEMENT_MIDPOINT_RETEST",
        "entry": "staged",
        "currentPlan": "Waiting for BTC displacement to leave an imbalance and retest it cleanly.",
        "long": ["15m displacement body is strong", "Price holds above EMA20/structure", "Retest into imbalance midpoint is possible", "OI/volume support continuation"],
        "short": ["15m displacement body is strong", "Price holds below EMA20/structure", "Retest into imbalance midpoint is possible", "OI/volume support continuation"],
        "entryRules": ["70% at imbalance midpoint", "30% after continuation resumes"],
        "tpRules": ["TP1 at displacement extension", "TP2 at next liquidity pool"],
        "slRules": ["Beyond imbalance origin", "Cancel if midpoint is sliced through"],
        "aiChecklist": ["Is the imbalance meaningful or just a normal candle?", "Is retest entry on the correct side?", "Does continuation room justify holding?", "Should later scale be cancelled if price runs?"],
    },
    {
        "id": "momentum-ignition",
        "name": "Momentum Ignition",
        "description": "Takes BTC momentum continuation only when trend, RSI, volume, and OI align.",
        "concept": "Momentum ignition: EMA stack, RSI thrust, OI increase, taker share confirmation.",
        "risk": 0.6,
        "riskLevel": "HIGH",
        "mode": "momentum",
        "setupLong": "MOMENTUM_IGNITION_LONG",
        "setupShort": "MOMENTUM_IGNITION_SHORT",
        "leverage": 8,
        "maxLeverage": 10,
        "riskMult": 0.85,
        "targets": (1.4, 2.8),
        "order": "IGNITION_PARTICIPATION",
        "entry": "single",
        "currentPlan": "Waiting for BTC momentum, OI, and taker pressure to ignite in the same direction.",
        "long": ["1H EMA20 > EMA50", "RSI thrust is constructive", "Taker buy share and OI confirm", "Price is not already overextended to TP"],
        "short": ["1H EMA20 < EMA50", "RSI thrust is weak", "Taker sell pressure and OI confirm", "Price is not already overextended to TP"],
        "entryRules": ["Single aggressive entry on ignition", "No averaging down"],
        "tpRules": ["TP1 before momentum stalls", "TP2 only if OI/flow persist"],
        "slRules": ["Behind ignition candle", "Reduce fast if flow flips"],
        "aiChecklist": ["Is this ignition or late chase?", "Does taker flow agree with OI?", "Should leverage be capped by volatility?", "Is there enough room after fees?"],
    },
    {
        "id": "bollinger-reversion",
        "name": "Bollinger Reversion",
        "description": "Fades BTC statistical overextension only when trend strength is weak enough.",
        "concept": "Bollinger/RSI mean reversion with range filter, volume exhaustion, and midpoint exits.",
        "risk": 0.42,
        "riskLevel": "LOW_MEDIUM",
        "mode": "mean",
        "setupLong": "LOW_BAND_MEAN_REVERSION_LONG",
        "setupShort": "UPPER_BAND_MEAN_REVERSION_SHORT",
        "leverage": 5,
        "maxLeverage": 7,
        "riskMult": 0.7,
        "targets": (1.15, 1.9),
        "order": "STATISTICAL_REVERSION_LIMIT",
        "entry": "staged",
        "currentPlan": "Waiting for BTC to stretch statistically while trend strength stays contained.",
        "long": ["RSI is depressed", "Price is below lower statistical band/proxy", "Trend regime is not strong bearish", "Volume does not show breakout continuation"],
        "short": ["RSI is elevated", "Price is above upper statistical band/proxy", "Trend regime is not strong bullish", "Volume does not show breakout continuation"],
        "entryRules": ["50% at stretch", "50% deeper into band extension"],
        "tpRules": ["TP1 at mean", "TP2 near opposite half-band only if reversion persists"],
        "slRules": ["Outside statistical extension", "Exit if band walk begins"],
        "aiChecklist": ["Is this range reversion or a strong band walk?", "Should size be cut if trend regime is strong?", "Is TP close enough for mean reversion?", "Is funding/crowding worsening the fade?"],
    },
    {
        "id": "atr-trail-commander",
        "name": "ATR Trail Commander",
        "description": "Lets BTC trend winners breathe using ATR stops and slower AI management.",
        "concept": "ATR continuation system: higher timeframe trend, volatility-adjusted stop, pyramiding only after profit cushion.",
        "risk": 0.55,
        "riskLevel": "MEDIUM",
        "mode": "trend",
        "setupLong": "ATR_TREND_TRAIL_LONG",
        "setupShort": "ATR_TREND_TRAIL_SHORT",
        "leverage": 6,
        "maxLeverage": 8,
        "riskMult": 1.55,
        "targets": (2.0, 4.2),
        "order": "ATR_TREND_PULLBACK",
        "entry": "staged",
        "currentPlan": "Waiting for BTC trend continuation where ATR stop gives enough room to hold.",
        "long": ["4H trend bullish", "Price stays above 1H EMA50", "ATR stop remains structurally valid", "Momentum is not blow-off"],
        "short": ["4H trend bearish", "Price stays below 1H EMA50", "ATR stop remains structurally valid", "Momentum is not capitulation exhaustion"],
        "entryRules": ["40% on trend pullback", "60% after continuation resumes"],
        "tpRules": ["TP1 after 2R", "TP2 trails using ATR rather than fixed scalp target"],
        "slRules": ["ATR stop outside structure", "Trail only after profit cushion"],
        "aiChecklist": ["Should this winner be allowed to run?", "Is ATR stop too wide for account risk?", "Is adding/pyramiding justified after profit cushion?", "Has the trend actually ended or only pulled back?"],
    },
]


class BtcSpecialistStrategy(TraderStrategy):
    def __init__(self, config: Dict[str, Any]) -> None:
        self.config = config
        self.profile = TraderProfile(
            id=config["id"],
            name=config["name"],
            description=config["description"],
            concept=config["concept"],
            baseRiskPercent=config["risk"],
            riskLevel=config["riskLevel"],
            longConditions=config["long"],
            shortConditions=config["short"],
            entryRules=config["entryRules"],
            takeProfitRules=config["tpRules"],
            stopLossRules=config["slRules"],
            aiReviewChecklist=config["aiChecklist"],
            mockPerformance=_mock_performance(),
            currentPlan=config["currentPlan"],
        )

    def evaluate(self, snapshot: Dict[str, Any]) -> TradeCandidate:
        price = float(snapshot["price"])
        one_hour = timeframe(snapshot, "1h")
        four_hour = timeframe(snapshot, "4h")
        fifteen = timeframe(snapshot, "15m")
        candle = latest_candle(fifteen)
        atr = max(fvalue(one_hour.get("atr14"), price * 0.008), price * 0.003)
        side = self._choose_side(snapshot)
        if side is None:
            return TradeCandidate(created=False, reason=f"{self.profile.name} 1차 조건이 아직 충분히 겹치지 않았습니다.", setupScore=self._score(snapshot))

        score = self._score(snapshot)
        if score < 58:
            return TradeCandidate(created=False, reason=f"{self.profile.name} score {score} is below entry threshold.", setupScore=score)

        risk_distance = max(atr * float(self.config["riskMult"]), price * 0.004)
        entries = self._entries(side, price, risk_distance)
        stop = round_price(price - risk_distance if side == "LONG" else price + risk_distance)
        tp1_r, tp2_r = self.config["targets"]
        take_profits = self._take_profits(side, price, risk_distance, float(tp1_r), float(tp2_r))
        risk_reward = estimate_risk_reward(side, entries, stop, take_profits, fee_buffer_percent=0.09)
        errors = candidate_geometry_errors(side, price, entries, stop, take_profits, min_risk_reward=1.15, fee_buffer_percent=0.09)
        if errors:
            return TradeCandidate(created=False, reason=f"{self.profile.name} geometry gate failed: " + "; ".join(errors), setupScore=score)

        setup_type = self.config["setupLong"] if side == "LONG" else self.config["setupShort"]
        return TradeCandidate(
            created=True,
            side=side,
            setupType=setup_type,
            setupScore=min(score, 92),
            entries=entries,
            stopLoss=stop,
            takeProfits=take_profits,
            riskPercent=self.profile.baseRiskPercent,
            orderIntent=default_order_intent(str(self.config["order"]), post_only=self.config["entry"] != "single"),
            leveragePlan=default_leverage_plan(
                suggested=int(self.config["leverage"]),
                maximum=int(self.config["maxLeverage"]),
                reason=f"{self.profile.name} uses {self.config['leverage']}x only when its BTC-specific first-stage filters and AI review agree.",
            ),
            riskPlan=default_risk_plan(
                risk_percent=self.profile.baseRiskPercent,
                risk_reward=risk_reward,
                sizing_note=f"{self.profile.name}: BTC-only sizing, cancel stale entries quickly and let AI manage add/reduce decisions after fill.",
                min_risk_reward=1.15,
                fee_buffer_percent=0.09,
            ),
            earlyExitRules=[
                "Exit or reduce if a 15m close invalidates the setup trigger.",
                "Cancel unfilled scale entries when the market reaches TP1 before fill.",
            ],
            managementNotes=[
                "Position agent may add, pyramid, reduce, or trail only when recent reviews and current market structure agree.",
                f"Mode: {self.config['mode']}; order style: {self.config['entry']}.",
            ],
            invalidation="Invalidate on a 15m close through the trigger level or if fee-adjusted RR drops below 1.15.",
            notes=self._notes(snapshot),
        )

    def _choose_side(self, snapshot: Dict[str, Any]) -> Optional[str]:
        price = float(snapshot["price"])
        one_hour = timeframe(snapshot, "1h")
        four_hour = timeframe(snapshot, "4h")
        fifteen = timeframe(snapshot, "15m")
        candle = latest_candle(fifteen)
        mode = str(self.config["mode"])
        trend_4h = trend_for(snapshot, "4h")
        ema20 = fvalue(one_hour.get("ema20"), price)
        ema50 = fvalue(one_hour.get("ema50"), price)
        rsi = fvalue(one_hour.get("rsi14"), 50.0)
        close = fvalue(candle.get("close"), price)
        open_ = fvalue(candle.get("open"), close)
        high = fvalue(candle.get("high"), price)
        low = fvalue(candle.get("low"), price)
        volume_z = fvalue(fifteen.get("volumeZscore"), 0.0)
        channel = four_hour.get("channel") or one_hour.get("channel") or {}
        position = fvalue(channel.get("position"), 0.5)
        body = candle_body_ratio(candle)
        upper_wick, lower_wick = wick_ratios(candle)
        taker_share = taker_buy_share(snapshot)

        if mode in {"breakout", "session", "imbalance"}:
            if close >= max(open_, ema20) and trend_4h != "bearish" and (volume_z > -0.35 or body > 0.42):
                return "LONG"
            if close <= min(open_, ema20) and trend_4h != "bullish" and (volume_z > -0.35 or body > 0.42):
                return "SHORT"
        if mode == "trend":
            if trend_4h == "bullish" and price >= ema50 and ema20 >= ema50:
                return "LONG"
            if trend_4h == "bearish" and price <= ema50 and ema20 <= ema50:
                return "SHORT"
        if mode == "reclaim":
            if close > ema20 and low < ema20 and taker_share >= 0.48:
                return "LONG"
            if close < ema20 and high > ema20 and taker_share <= 0.52:
                return "SHORT"
        if mode == "reversal":
            if position <= 0.25 and lower_wick >= 0.32 and trend_4h != "bearish":
                return "LONG"
            if position >= 0.75 and upper_wick >= 0.32 and trend_4h != "bullish":
                return "SHORT"
        if mode == "divergence":
            if rsi <= 44 and close > open_ and trend_4h != "bearish":
                return "LONG"
            if rsi >= 56 and close < open_ and trend_4h != "bullish":
                return "SHORT"
        if mode == "momentum":
            if ema20 > ema50 and rsi >= 52 and taker_share >= 0.52:
                return "LONG"
            if ema20 < ema50 and rsi <= 48 and taker_share <= 0.48:
                return "SHORT"
        if mode == "mean":
            if rsi <= 38 or position <= 0.18:
                return "LONG"
            if rsi >= 62 or position >= 0.82:
                return "SHORT"
        return None

    def _score(self, snapshot: Dict[str, Any]) -> int:
        price = float(snapshot["price"])
        one_hour = timeframe(snapshot, "1h")
        fifteen = timeframe(snapshot, "15m")
        candle = latest_candle(fifteen)
        volume_z = fvalue(fifteen.get("volumeZscore"), 0.0)
        rsi = fvalue(one_hour.get("rsi14"), 50.0)
        oi_change = open_interest_change(snapshot)
        funding_percentile = funding_abs_percentile(snapshot)
        regime = market_regime(snapshot)
        body = candle_body_ratio(candle)
        score = 52
        score += min(12, max(0, int((volume_z + 0.5) * 5)))
        score += min(10, abs(int(oi_change * 3)))
        score += 7 if regime in {"trend", "squeeze"} and self.config["mode"] in {"breakout", "trend", "momentum", "imbalance"} else 0
        score += 7 if regime in {"range", "mixed"} and self.config["mode"] in {"mean", "reversal", "reclaim"} else 0
        score += 6 if body >= 0.42 else 0
        score += 5 if 38 <= rsi <= 64 else 0
        score -= 6 if funding_percentile >= 95 else 0
        score -= 10 if price <= 0 else 0
        return max(0, min(95, score))

    def _entries(self, side: str, price: float, risk_distance: float) -> List[EntryPlan]:
        style = str(self.config["entry"])
        if style == "single":
            return [EntryPlan(price=round_price(price), weight=1.0, reason="Confirmed BTC setup participation")]
        pullback = risk_distance * (0.28 if style == "hybrid" else 0.45)
        if side == "LONG":
            entries = [
                EntryPlan(price=round_price(price), weight=0.45 if style == "hybrid" else 0.35, reason="Confirmation entry"),
                EntryPlan(price=round_price(price - pullback), weight=0.55 if style == "hybrid" else 0.65, reason="Planned BTC retest/scale entry"),
            ]
        else:
            entries = [
                EntryPlan(price=round_price(price), weight=0.45 if style == "hybrid" else 0.35, reason="Confirmation entry"),
                EntryPlan(price=round_price(price + pullback), weight=0.55 if style == "hybrid" else 0.65, reason="Planned BTC retest/scale entry"),
            ]
        return normalize_entries_for_side(side, price, entries)

    def _take_profits(self, side: str, price: float, risk_distance: float, tp1_r: float, tp2_r: float) -> List[TakeProfitPlan]:
        if side == "LONG":
            return [
                TakeProfitPlan(price=round_price(price + risk_distance * tp1_r), weight=0.45, reason="First BTC liquidity target"),
                TakeProfitPlan(price=round_price(price + risk_distance * tp2_r), weight=0.55, reason="Extended BTC thesis target"),
            ]
        return [
            TakeProfitPlan(price=round_price(price - risk_distance * tp1_r), weight=0.45, reason="First BTC liquidity target"),
            TakeProfitPlan(price=round_price(price - risk_distance * tp2_r), weight=0.55, reason="Extended BTC thesis target"),
        ]

    def _notes(self, snapshot: Dict[str, Any]) -> List[str]:
        one_hour = timeframe(snapshot, "1h")
        fifteen = timeframe(snapshot, "15m")
        return [
            f"BTC specialist mode: {self.config['mode']}.",
            f"1H RSI {fvalue(one_hour.get('rsi14'), 50.0):.1f}, 15m volume z-score {fvalue(fifteen.get('volumeZscore'), 0.0):.2f}.",
            f"Regime {market_regime(snapshot)}, OI 30m change {open_interest_change(snapshot):.2f}%, funding percentile {funding_abs_percentile(snapshot):.0f}.",
        ]


class DonchianBreakout(BtcSpecialistStrategy):
    def __init__(self) -> None:
        super().__init__(SPECIALIST_CONFIGS[0])


class IchimokuCloudPilot(BtcSpecialistStrategy):
    def __init__(self) -> None:
        super().__init__(SPECIALIST_CONFIGS[1])


class VwapReclaimer(BtcSpecialistStrategy):
    def __init__(self) -> None:
        super().__init__(SPECIALIST_CONFIGS[2])


class WyckoffSpring(BtcSpecialistStrategy):
    def __init__(self) -> None:
        super().__init__(SPECIALIST_CONFIGS[3])


class RsiDivergenceScout(BtcSpecialistStrategy):
    def __init__(self) -> None:
        super().__init__(SPECIALIST_CONFIGS[4])


class SessionRaider(BtcSpecialistStrategy):
    def __init__(self) -> None:
        super().__init__(SPECIALIST_CONFIGS[5])

    def _score(self, snapshot: Dict[str, Any]) -> int:
        base = super()._score(snapshot)
        candle = latest_candle(timeframe(snapshot, "15m"))
        open_time = int(fvalue(candle.get("openTime"), 0))
        hour = datetime.fromtimestamp(open_time / 1000, timezone.utc).hour if open_time else datetime.now(timezone.utc).hour
        session_bonus = 8 if hour in {0, 1, 7, 8, 13, 14, 15} else -4
        return max(0, min(95, base + session_bonus))


class ImbalanceHunter(BtcSpecialistStrategy):
    def __init__(self) -> None:
        super().__init__(SPECIALIST_CONFIGS[6])


class MomentumIgnition(BtcSpecialistStrategy):
    def __init__(self) -> None:
        super().__init__(SPECIALIST_CONFIGS[7])

    def _score(self, snapshot: Dict[str, Any]) -> int:
        base = super()._score(snapshot)
        one_hour = timeframe(snapshot, "1h")
        fifteen = timeframe(snapshot, "15m")
        candle = latest_candle(fifteen)
        rsi = fvalue(one_hour.get("rsi14"), 50.0)
        body = candle_body_ratio(candle)
        oi_change = open_interest_change(snapshot)
        taker_share = taker_buy_share(snapshot)
        direction_bonus = 0
        if rsi >= 56 and taker_share >= 0.54 and oi_change > 0:
            direction_bonus += 8
        if rsi <= 44 and taker_share <= 0.46 and oi_change > 0:
            direction_bonus += 8
        if body >= 0.55:
            direction_bonus += 5
        if 47 < rsi < 53 or abs(oi_change) < 0.15:
            direction_bonus -= 8
        return max(0, min(95, base + direction_bonus))


class BollingerReversion(BtcSpecialistStrategy):
    def __init__(self) -> None:
        super().__init__(SPECIALIST_CONFIGS[8])

    def _score(self, snapshot: Dict[str, Any]) -> int:
        base = super()._score(snapshot)
        one_hour = timeframe(snapshot, "1h")
        channel = timeframe(snapshot, "4h").get("channel") or one_hour.get("channel") or {}
        position = fvalue(channel.get("position"), 0.5)
        rsi = fvalue(one_hour.get("rsi14"), 50.0)
        regime = market_regime(snapshot)
        adjustment = 0
        if regime in {"range", "mixed"}:
            adjustment += 8
        if rsi <= 36 or rsi >= 64:
            adjustment += 7
        if position <= 0.15 or position >= 0.85:
            adjustment += 5
        if regime in {"trend", "squeeze"} and 42 <= rsi <= 58:
            adjustment -= 12
        return max(0, min(95, base + adjustment))


class AtrTrailCommander(BtcSpecialistStrategy):
    def __init__(self) -> None:
        super().__init__(SPECIALIST_CONFIGS[9])

    def _score(self, snapshot: Dict[str, Any]) -> int:
        base = super()._score(snapshot)
        price = float(snapshot["price"])
        one_hour = timeframe(snapshot, "1h")
        four_hour = timeframe(snapshot, "4h")
        trend = trend_for(snapshot, "4h")
        ema20 = fvalue(four_hour.get("ema20"), price)
        ema50 = fvalue(four_hour.get("ema50"), price)
        atr = fvalue(one_hour.get("atr14"), price * 0.008)
        atr_percent = atr / price if price > 0 else 0
        adjustment = 0
        if trend == "bullish" and ema20 >= ema50:
            adjustment += 7
        if trend == "bearish" and ema20 <= ema50:
            adjustment += 7
        if 0.006 <= atr_percent <= 0.022:
            adjustment += 6
        if atr_percent > 0.035 or trend == "sideways":
            adjustment -= 10
        return max(0, min(95, base + adjustment))
