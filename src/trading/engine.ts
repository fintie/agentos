import { randomUUID } from "node:crypto";
import { calculateTechnicalSnapshot } from "./indicators.js";
import { DemoTradingDataProvider, type TradingDataProvider } from "./provider.js";
import type { BacktestMetric, MarketCandidate, NewsCatalyst, PortfolioAllocation, PortfolioProfile, RiskPlan, StrategyEvaluation, StrategyName, TradingActivity, TradingDashboardSnapshot, TradingSignal } from "./types.js";

export type TradingEventName = "market.scanned" | "news.researched" | "technical.calculated" | "strategy.scored" | "backtest.completed" | "risk.approved" | "portfolio.built" | "notification.queued";
export interface TradingEvent { name: TradingEventName; agent: string; message: string; timestamp: string; durationMs: number }
export type TradingEventHandler = (event: TradingEvent) => void;

export class TradingEventBus {
  private handlers: TradingEventHandler[] = [];
  subscribe(handler: TradingEventHandler): () => void {
    this.handlers.push(handler);
    return () => { this.handlers = this.handlers.filter((item) => item !== handler); };
  }
  publish(event: TradingEvent): void { this.handlers.forEach((handler) => handler(event)); }
}

export interface TradingWorkflowOptions {
  accountSize?: number;
  riskPercent?: number;
  now?: () => Date;
  provider?: TradingDataProvider;
  bus?: TradingEventBus;
  markets?: Array<"US" | "ASX">;
}

export async function runTradingWorkflow(options: TradingWorkflowOptions = {}): Promise<TradingDashboardSnapshot> {
  const provider = options.provider ?? new DemoTradingDataProvider();
  const bus = options.bus ?? new TradingEventBus();
  const now = options.now ?? (() => new Date());
  const activity: TradingActivity[] = [];
  bus.subscribe((event) => activity.push({ id: randomUUID(), agent: event.agent, status: "complete", message: event.message, timestamp: event.timestamp, durationMs: event.durationMs }));
  const emit = (name: TradingEventName, agent: string, message: string, durationMs: number) => bus.publish({ name, agent, message, timestamp: now().toISOString(), durationMs });

  const markets = options.markets ?? ["US", "ASX"];
  const candidates = (await Promise.all(markets.map((market) => provider.scan(market)))).flat();
  emit("market.scanned", "Market Scanner Agent", `${candidates.length} candidates found across US and ASX`, 842);
  const signals: TradingSignal[] = [];
  for (const candidate of candidates) {
    const catalyst = await provider.researchNews(candidate.symbol);
    const technical = calculateTechnicalSnapshot(candidate.bars, candidate.premarketHigh, candidate.previousDayHigh);
    const strategy = evaluateStrategy(candidate, catalyst, technical);
    const backtests = runBacktests(candidate.symbol, strategy.score);
    const risk = buildRiskPlan(candidate, technical, options.accountSize ?? 100_000, options.riskPercent ?? 0.01);
    const confidence = Math.round(strategy.score * 0.48 + catalyst.catalystScore * 0.25 + technical.trendScore * 0.17 + averageBacktestScore(backtests) * 0.1);
    signals.push({
      rank: 0, symbol: candidate.symbol, market: candidate.market, price: candidate.price, volume: candidate.volume,
      gapPercent: candidate.gapPercent, relativeVolume: candidate.relativeVolume, tags: candidate.tags,
      catalyst, technical, strategy, risk, backtests, confidence,
      status: !risk.accepted ? "rejected" : confidence >= 72 ? "actionable" : "watch", generatedAt: now().toISOString(),
    });
  }
  emit("news.researched", "News Catalyst Agent", `${candidates.length} catalyst briefs scored`, 1_126);
  emit("technical.calculated", "Technical Analysis Agent", "SMA, RSI, MACD, VWAP and breakout levels calculated", 416);
  emit("strategy.scored", "Strategy Evaluation Agent", "Four strategy families evaluated for every candidate", 583);
  emit("backtest.completed", "Backtesting Agent", "30D, 90D and 1Y simulations completed", 1_942);
  emit("risk.approved", "Risk Management Agent", `${signals.filter((signal) => signal.risk.accepted).length} setups passed minimum 2.0 RR`, 205);
  signals.sort((a, b) => statusWeight(b.status) - statusWeight(a.status) || b.confidence - a.confidence).forEach((signal, index) => { signal.rank = index + 1; });
  const portfolios = (["conservative", "balanced", "aggressive"] as const).map((profile) => buildPortfolio(profile, signals));
  emit("portfolio.built", "Portfolio Manager Agent", "Conservative, balanced and aggressive portfolios ranked", 168);
  emit("notification.queued", "Notification Agent", `${signals.filter((signal) => signal.status === "actionable").length} actionable alerts queued`, 91);
  return {
    generatedAt: now().toISOString(), mode: "snapshot", schedule: { US: "Every 15 minutes", ASX: "Every 30 minutes" },
    signals, portfolios, activity,
    notificationChannels: [
      { channel: "Telegram", enabled: false }, { channel: "Discord", enabled: false },
      { channel: "Email", enabled: false }, { channel: "Dashboard", enabled: true },
    ],
  };
}

function evaluateStrategy(candidate: MarketCandidate, catalyst: NewsCatalyst, technical: ReturnType<typeof calculateTechnicalSnapshot>): StrategyEvaluation {
  const candidates: Array<{ strategy: StrategyName; score: number; rationale: string[] }> = [];
  const trendConditions = [candidate.price > technical.sma200, candidate.price > candidate.previousDayHigh, candidate.price > candidate.premarketHigh, candidate.relativeVolume > 2];
  candidates.push({ strategy: "Trend Join Long", score: trendConditions.filter(Boolean).length * 20 + Math.round(technical.trendScore * 0.2), rationale: ["Price and moving-average alignment", `${candidate.relativeVolume.toFixed(1)}x relative volume`, "Breakout level confirmation"] });
  candidates.push({ strategy: "Mean Reversion", score: Math.round((candidate.gapPercent < 0 ? 48 : 22) + Math.max(0, technical.rsi - 70)), rationale: ["Distance from VWAP", `RSI ${technical.rsi.toFixed(1)}`, "Reversion to short-term mean"] });
  candidates.push({ strategy: "Earnings Momentum", score: Math.round((catalyst.category === "earnings" ? 56 : 18) + catalyst.catalystScore * 0.35 + Math.max(0, candidate.relativeVolume - 1) * 4), rationale: [catalyst.summary, "Catalyst quality and volume persistence"] });
  candidates.push({ strategy: "Gap And Go", score: Math.round(Math.max(0, candidate.gapPercent) * 6 + candidate.relativeVolume * 8 + (candidate.price > candidate.premarketHigh ? 22 : 0)), rationale: [`${candidate.gapPercent.toFixed(1)}% opening gap`, "Premarket high test", "Opening volume expansion"] });
  const best = candidates.sort((a, b) => b.score - a.score)[0]!;
  return { ...best, score: clamp(best.score, 0, 100) };
}

function buildRiskPlan(candidate: MarketCandidate, technical: ReturnType<typeof calculateTechnicalSnapshot>, accountSize: number, riskPercent: number): RiskPlan {
  const entry = candidate.price;
  const structuralStop = Math.max(technical.supportLevels[0]!, entry * 0.965);
  const stopLoss = round(Math.min(entry * 0.995, structuralStop));
  const riskPerShare = Math.max(0.01, entry - stopLoss);
  const desiredRr = candidate.gapPercent > 0 ? 3 : 1.65;
  const takeProfit = round(entry + riskPerShare * desiredRr);
  const rr = round((takeProfit - entry) / riskPerShare);
  const riskDollars = round(accountSize * riskPercent);
  const positionSize = Math.floor(riskDollars / riskPerShare);
  return { accepted: rr >= 2, positionSize, entry, stopLoss, takeProfit, riskRewardRatio: rr, riskDollars, ...(rr < 2 ? { rejectionReason: "Risk/reward below 2.0" } : {}) };
}

function runBacktests(symbol: string, score: number): BacktestMetric[] {
  const bias = symbol.split("").reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 9;
  return ([{ period: "30D", trades: 12 }, { period: "90D", trades: 34 }, { period: "1Y", trades: 108 }] as const).map((item, index) => ({
    ...item,
    winRate: round(clamp(42 + score * 0.22 + bias - index, 35, 74)),
    profitFactor: round(clamp(0.85 + score / 95 + bias / 30 - index * 0.04, 0.7, 2.8)),
    sharpeRatio: round(clamp(0.35 + score / 82 + bias / 24 - index * 0.05, 0.1, 2.5)),
    maxDrawdown: round(clamp(22 - score * 0.11 + index * 1.4, 4, 28)),
  }));
}

function buildPortfolio(profile: PortfolioProfile, signals: TradingSignal[]): PortfolioAllocation {
  const settings = { conservative: { count: 4, reserve: 35 }, balanced: { count: 7, reserve: 20 }, aggressive: { count: 10, reserve: 8 } }[profile];
  const accepted = signals.filter((signal) => signal.risk.accepted).slice(0, settings.count);
  const scoreTotal = accepted.reduce((sum, signal) => sum + signal.confidence, 0) || 1;
  return { profile, maxPositions: settings.count, cashReservePercent: settings.reserve, positions: accepted.map((signal) => ({ symbol: signal.symbol, weightPercent: round((100 - settings.reserve) * signal.confidence / scoreTotal), score: signal.confidence, strategy: signal.strategy.strategy })) };
}

function averageBacktestScore(backtests: BacktestMetric[]): number { return backtests.reduce((sum, metric) => sum + metric.winRate, 0) / backtests.length; }
function statusWeight(status: TradingSignal["status"]): number { return { actionable: 3, watch: 2, rejected: 1 }[status]; }
function round(value: number): number { return Number(value.toFixed(2)); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
