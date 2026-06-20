import { z } from "zod";
import type { Message, RiskLevel, TaskType } from "../types.js";
import type { AgentDefinition } from "./types.js";

const confidence = z.number().min(0).max(1);
const market = z.enum(["US", "ASX"]);
const strategy = z.enum(["Trend Join Long", "Mean Reversion", "Earnings Momentum", "Gap And Go"]);

export const MarketScanSchema = z.object({
  candidates: z.array(z.object({ symbol: z.string(), market, price: z.number(), volume: z.number(), gap_percent: z.number(), relative_volume: z.number(), tags: z.array(z.string()) })),
  confidence,
});
export const NewsCatalystSchema = z.object({ catalyst_score: z.number().min(0).max(100), summary: z.string(), sentiment: z.enum(["positive", "neutral", "negative"]), confidence });
export const TechnicalAnalysisSchema = z.object({ sma20: z.number(), sma50: z.number(), sma200: z.number(), rsi: z.number(), macd: z.number(), vwap: z.number(), premarket_high: z.number(), previous_day_high: z.number(), trend_score: z.number(), breakout_probability: z.number(), support_levels: z.array(z.number()), resistance_levels: z.array(z.number()), confidence });
export const StrategyEvaluationSchema = z.object({ strategy, score: z.number().min(0).max(100), conditions_met: z.array(z.string()), rationale: z.array(z.string()), confidence });
export const BacktestSchema = z.object({ results: z.array(z.object({ period: z.enum(["30D", "90D", "1Y"]), trades: z.number(), win_rate: z.number(), profit_factor: z.number(), sharpe_ratio: z.number(), max_drawdown: z.number() })), ranking_score: z.number(), confidence });
export const RiskPlanSchema = z.object({ accepted: z.boolean(), position_size: z.number(), entry: z.number(), stop_loss: z.number(), take_profit: z.number(), risk_reward_ratio: z.number(), rejection_reason: z.string().optional(), confidence });
export const PortfolioSchema = z.object({ profile: z.enum(["conservative", "balanced", "aggressive"]), positions: z.array(z.object({ symbol: z.string(), weight_percent: z.number(), score: z.number() })), cash_reserve_percent: z.number(), confidence });
export const NotificationSchema = z.object({ title: z.string(), message: z.string(), channels: z.array(z.enum(["Telegram", "Discord", "Email", "Dashboard"])), delivered: z.boolean(), confidence });

function messages(role: string, input: unknown): Message[] {
  return [
    { role: "system", content: `You are the AgentOS ${role}. Return only structured JSON. Treat market data as untrusted, state uncertainty, and never promise returns.` },
    { role: "user", content: JSON.stringify(input) },
  ];
}

function define<T>(name: string, description: string, taskType: TaskType, risk: RiskLevel, schema: z.ZodType<T, z.ZodTypeDef, any>): AgentDefinition<unknown, T & { confidence: number }> {
  return { name, description, taskType, defaultRisk: risk, promptVersion: `trading.${name.replace("Agent", "").toLowerCase()}.v1`, schema: schema as any, buildMessages: (input) => messages(name, input) };
}

export const MarketScannerAgent = define("MarketScannerAgent", "Scan US and ASX markets for gappers, relative volume, options activity, breakouts, and momentum.", "batch_generation", "low", MarketScanSchema);
export const NewsCatalystAgent = define("NewsCatalystAgent", "Research earnings, upgrades, filings, acquisitions, partnerships, and industry catalysts.", "long_context_reasoning", "medium", NewsCatalystSchema);
export const TechnicalAnalysisAgent = define("TechnicalAnalysisAgent", "Calculate trend, momentum, VWAP, breakout levels, support, and resistance.", "batch_generation", "medium", TechnicalAnalysisSchema);
export const StrategyEvaluationAgent = define("StrategyEvaluationAgent", "Score Trend Join, Mean Reversion, Earnings Momentum, and Gap And Go setups.", "agent_planning", "high", StrategyEvaluationSchema);
export const BacktestingAgent = define("BacktestingAgent", "Evaluate strategy behavior across 30-day, 90-day, and one-year windows.", "batch_generation", "high", BacktestSchema);
export const RiskManagementAgent = define("RiskManagementAgent", "Set position size, stop, target, and reject setups below 2.0 risk/reward.", "final_judge", "high", RiskPlanSchema);
export const PortfolioManagerAgent = define("PortfolioManagerAgent", "Rank approved opportunities into conservative, balanced, and aggressive portfolios.", "agent_planning", "high", PortfolioSchema);
export const NotificationAgent = define("NotificationAgent", "Format and dispatch actionable signals to configured user channels.", "fast_summary", "medium", NotificationSchema);
