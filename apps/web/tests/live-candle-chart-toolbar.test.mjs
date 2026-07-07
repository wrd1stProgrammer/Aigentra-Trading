import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const chartSource = readFileSync(new URL("../components/live-candle-chart.tsx", import.meta.url), "utf8");
const i18nSource = readFileSync(new URL("../lib/i18n.ts", import.meta.url), "utf8");

test("live candle chart uses a market status header instead of plan clutter chips", () => {
  assert.match(chartSource, /data-testid="chart-market-status"/, "chart should expose a compact market status header");
  assert.match(chartSource, /chart\.marketPrice/, "chart header should show current BTC price copy");
  assert.match(chartSource, /dayChangePct/, "chart header should calculate daily price change");
  assert.doesNotMatch(chartSource, /chart\.lastPrice/, "old current-price badge should be removed from the header");
  assert.doesNotMatch(chartSource, /chart\.planMarkers/, "target-marker header chip should be removed");
  assert.doesNotMatch(chartSource, /chart\.paperMarkers/, "simulation position/order header chip should be removed");
});

test("live candle drawing tools are collapsed behind an accessible toolbar toggle", () => {
  assert.match(chartSource, /data-testid="chart-tool-toggle"/, "chart should expose a tool toggle");
  assert.match(chartSource, /aria-expanded=\{showDrawingTools\}/, "tool toggle should communicate expanded state");
  assert.match(chartSource, /data-testid="chart-drawing-toolbar"/, "drawing toolbar should be testable when expanded");
  assert.match(chartSource, /pointerEvents: showDrawingTools && activeTool !== "cursor" \? "auto" : "none"/, "overlay canvas should only capture input for active drawing tools");
  assert.doesNotMatch(chartSource, />\s*Wide\s*</, "wide height option should be removed");
  assert.doesNotMatch(chartSource, />\s*Tall\s*</, "tall height option should be removed");
  assert.match(i18nSource, /"chart\.showTools"/, "tool toggle copy should be localized");
  assert.match(i18nSource, /"chart\.dayChange"/, "daily change copy should be localized");
});

test("mobile chart gestures reach the chart surface like TradingView", () => {
  assert.match(chartSource, /handleScale:\s*\{[\s\S]*pinch: true/, "mobile pinch zoom should remain enabled in the chart engine");
  assert.match(chartSource, /handleScroll:\s*\{[\s\S]*horzTouchDrag: true/, "mobile horizontal drag should remain enabled in the chart engine");
  assert.match(chartSource, /handleScroll:\s*\{[\s\S]*vertTouchDrag: true/, "mobile vertical drag should move the price scale like TradingView");
  assert.match(chartSource, /function handleChartSurfacePointerMove/, "chart should directly handle vertical touch pans on the canvas surface");
  assert.match(chartSource, /absX > CHART_SURFACE_TOUCH_PAN_THRESHOLD_PX && absX > absY/, "custom vertical pan should not hijack clear horizontal swipes");
  assert.match(chartSource, /onPointerMove=\{handleChartSurfacePointerMove\}/, "chart surface should wire the vertical touch pan handler");
  assert.match(chartSource, /data-testid="chart-price-axis-touch-scale"/, "mobile should expose a touch-only price-axis scale layer");
  assert.match(chartSource, /chart\.priceScale\("right"\)\.setVisibleRange/, "price-axis touch drag should scale the visible price range directly");
  assert.match(chartSource, /w-16 touch-none select-none/, "mobile price-axis touch layer should be wide enough to catch price-label drags");
  assert.match(chartSource, /\[@media\(pointer:coarse\)\]:pointer-events-auto/, "the price-axis touch layer should not steal desktop mouse axis handling");
  assert.match(chartSource, /onLostPointerCapture=\{finishPriceAxisTouch\}/, "price-axis touch cleanup should run if the browser ends pointer capture");
  assert.match(chartSource, /className="w-full touch-none rounded-xl/, "chart container should route touch drags to the chart instead of browser page scrolling");
  assert.match(chartSource, /data-testid="live-candle-chart-surface"/, "chart touch surface should be targetable in mobile QA");
  assert.match(chartSource, /\[@media\(pointer:coarse\)\]:pointer-events-none/, "execution markers should not steal mobile chart gestures on touch devices");
  assert.match(chartSource, /onTouchMove=\{handleMarkerTouchMove\}/, "execution markers should distinguish tap from drag on touch devices");
  assert.match(chartSource, /event\.currentTarget\.style\.pointerEvents = "none"/, "marker drags should hand gesture control back to the underlying chart");
  assert.match(chartSource, /document\.elementFromPoint/, "marker touch release should restore pass-through markers after the browser retargets the gesture");
});

test("live candle chart removes the dense legend below the canvas", () => {
  assert.doesNotMatch(chartSource, /<Legend/, "chart should not render the old entry-average-order legend row below the canvas");
  assert.doesNotMatch(chartSource, /function Legend/, "dead legend helper should be removed with the row");
  assert.doesNotMatch(chartSource, /chart\.interactionHint/, "chart should not show the old interaction hint copy below the canvas");
  assert.doesNotMatch(chartSource, /chart\.waitingForPlan/, "chart should not show waiting-for-plan filler below the canvas");
});
