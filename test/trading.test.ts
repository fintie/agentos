import { describe, expect, it } from "vitest";
import { calculateTechnicalSnapshot, DashboardNotificationChannel, DemoTradingDataProvider, formatSignalAlert, runTradingWorkflow, TradingEventBus, TradingNotifier } from "../src/trading/index.js";

describe("Trading Agent workflow", () => {
  it("discovers, scores, risk-checks, backtests, and ranks both markets", async () => {
    const result = await runTradingWorkflow({ now: () => new Date("2026-06-20T02:15:00.000Z") });
    expect(result.signals).toHaveLength(12);
    expect(new Set(result.signals.map((signal) => signal.market))).toEqual(new Set(["US", "ASX"]));
    expect(result.signals[0]?.rank).toBe(1);
    expect(result.signals.every((signal) => signal.backtests.map((metric) => metric.period).join(",") === "30D,90D,1Y")).toBe(true);
    expect(result.signals.filter((signal) => signal.risk.accepted).every((signal) => signal.risk.riskRewardRatio >= 2)).toBe(true);
    expect(result.portfolios.map((portfolio) => portfolio.profile)).toEqual(["conservative", "balanced", "aggressive"]);
    expect(result.activity).toHaveLength(8);
  });

  it("publishes every pipeline stage on the event bus", async () => {
    const bus = new TradingEventBus();
    const events: string[] = [];
    bus.subscribe((event) => events.push(event.name));
    await runTradingWorkflow({ bus });
    expect(events).toEqual(["market.scanned", "news.researched", "technical.calculated", "strategy.scored", "backtest.completed", "risk.approved", "portfolio.built", "notification.queued"]);
  });

  it("calculates finite technical indicators from provider bars", async () => {
    const candidate = (await new DemoTradingDataProvider().scan("US"))[0]!;
    const technical = calculateTechnicalSnapshot(candidate.bars, candidate.premarketHigh, candidate.previousDayHigh);
    expect(technical.sma200).toBeGreaterThan(0);
    expect(technical.rsi).toBeGreaterThanOrEqual(0);
    expect(technical.rsi).toBeLessThanOrEqual(100);
    expect(technical.supportLevels).toHaveLength(2);
  });

  it("formats and queues actionable dashboard notifications", async () => {
    const result = await runTradingWorkflow();
    const signal = result.signals.find((item) => item.status === "actionable")!;
    const dashboard = new DashboardNotificationChannel();
    expect(await new TradingNotifier([dashboard]).notify(signal)).toEqual(["Dashboard"]);
    expect(formatSignalAlert(signal)).toContain(`Ticker: ${signal.symbol}`);
    expect(dashboard.notifications).toHaveLength(1);
  });
});
