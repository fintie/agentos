export type Market = "US" | "ASX";
export type StrategyName = "Trend Join Long" | "Mean Reversion" | "Earnings Momentum" | "Gap And Go";
export type PortfolioProfile = "conservative" | "balanced" | "aggressive";

export interface PriceBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketCandidate {
  symbol: string;
  market: Market;
  price: number;
  volume: number;
  gapPercent: number;
  relativeVolume: number;
  unusualOptions: boolean;
  tags: string[];
  bars: PriceBar[];
  premarketHigh: number;
  previousDayHigh: number;
}

export interface NewsCatalyst {
  catalystScore: number;
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  confidence: number;
  category: "earnings" | "upgrade" | "filing" | "acquisition" | "partnership" | "industry";
}

export interface TechnicalSnapshot {
  sma20: number;
  sma50: number;
  sma200: number;
  rsi: number;
  macd: number;
  vwap: number;
  premarketHigh: number;
  previousDayHigh: number;
  trendScore: number;
  breakoutProbability: number;
  supportLevels: number[];
  resistanceLevels: number[];
}

export interface StrategyEvaluation {
  strategy: StrategyName;
  score: number;
  rationale: string[];
}

export interface RiskPlan {
  accepted: boolean;
  positionSize: number;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  riskDollars: number;
  rejectionReason?: string;
}

export interface BacktestMetric {
  period: "30D" | "90D" | "1Y";
  trades: number;
  winRate: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface TradingSignal {
  rank: number;
  symbol: string;
  market: Market;
  price: number;
  volume: number;
  gapPercent: number;
  relativeVolume: number;
  tags: string[];
  catalyst: NewsCatalyst;
  technical: TechnicalSnapshot;
  strategy: StrategyEvaluation;
  risk: RiskPlan;
  backtests: BacktestMetric[];
  confidence: number;
  status: "actionable" | "watch" | "rejected";
  generatedAt: string;
}

export interface PortfolioAllocation {
  profile: PortfolioProfile;
  maxPositions: number;
  cashReservePercent: number;
  positions: Array<{ symbol: string; weightPercent: number; score: number; strategy: StrategyName }>;
}

export interface TradingActivity {
  id: string;
  agent: string;
  status: "complete" | "running" | "waiting";
  message: string;
  timestamp: string;
  durationMs: number;
}

export interface TradingDashboardSnapshot {
  generatedAt: string;
  mode: "snapshot" | "live";
  schedule: { US: string; ASX: string };
  signals: TradingSignal[];
  portfolios: PortfolioAllocation[];
  activity: TradingActivity[];
  notificationChannels: Array<{ channel: "Telegram" | "Discord" | "Email" | "Dashboard"; enabled: boolean }>;
}
