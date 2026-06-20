import type { Market, MarketCandidate, NewsCatalyst, PriceBar } from "./types.js";

export interface TradingDataProvider {
  scan(market: Market): Promise<MarketCandidate[]>;
  researchNews(symbol: string): Promise<NewsCatalyst>;
}

interface DemoSeed {
  symbol: string;
  market: Market;
  price: number;
  gap: number;
  rvol: number;
  volume: number;
  catalyst: string;
  category: NewsCatalyst["category"];
}

const SEEDS: DemoSeed[] = [
  { symbol: "NVDA", market: "US", price: 225, gap: 4.8, rvol: 3.7, volume: 48_200_000, catalyst: "AI infrastructure demand and raised data-center outlook", category: "earnings" },
  { symbol: "PLTR", market: "US", price: 142.4, gap: 6.1, rvol: 4.2, volume: 31_100_000, catalyst: "New government AI platform partnership", category: "partnership" },
  { symbol: "AMD", market: "US", price: 184.8, gap: 3.2, rvol: 2.8, volume: 27_800_000, catalyst: "Analyst upgrade on accelerator market share", category: "upgrade" },
  { symbol: "TSLA", market: "US", price: 392.1, gap: -2.6, rvol: 2.4, volume: 39_600_000, catalyst: "Delivery update draws mixed analyst revisions", category: "industry" },
  { symbol: "CRWD", market: "US", price: 518.7, gap: 5.4, rvol: 3.1, volume: 8_900_000, catalyst: "Security platform earnings beat and guidance raise", category: "earnings" },
  { symbol: "COIN", market: "US", price: 318.5, gap: 4.1, rvol: 3.4, volume: 14_700_000, catalyst: "Digital asset volumes accelerate with institutional inflows", category: "industry" },
  { symbol: "BHP", market: "ASX", price: 46.2, gap: 2.2, rvol: 2.3, volume: 12_400_000, catalyst: "Iron ore outlook improves on regional demand", category: "industry" },
  { symbol: "CBA", market: "ASX", price: 198.3, gap: 1.7, rvol: 1.9, volume: 4_800_000, catalyst: "Broker raises target following margin resilience", category: "upgrade" },
  { symbol: "WTC", market: "ASX", price: 151.6, gap: 3.8, rvol: 2.7, volume: 3_200_000, catalyst: "Logistics software partnership expands global network", category: "partnership" },
  { symbol: "XRO", market: "ASX", price: 203.9, gap: 4.4, rvol: 3.0, volume: 2_900_000, catalyst: "Subscriber growth exceeds consensus expectations", category: "earnings" },
  { symbol: "FMG", market: "ASX", price: 21.7, gap: -3.1, rvol: 2.6, volume: 18_300_000, catalyst: "Production filing flags higher near-term costs", category: "filing" },
  { symbol: "ZIP", market: "ASX", price: 4.12, gap: 7.3, rvol: 5.1, volume: 22_600_000, catalyst: "US transaction volume and cash earnings accelerate", category: "earnings" },
];

export class DemoTradingDataProvider implements TradingDataProvider {
  async scan(market: Market): Promise<MarketCandidate[]> {
    return SEEDS.filter((seed) => seed.market === market).map((seed, index) => ({
      symbol: seed.symbol,
      market: seed.market,
      price: seed.price,
      volume: seed.volume,
      gapPercent: seed.gap,
      relativeVolume: seed.rvol,
      unusualOptions: seed.market === "US" && index % 2 === 0,
      tags: tagsFor(seed),
      bars: buildBars(seed),
      premarketHigh: round(seed.price * (seed.gap > 0 ? 0.994 : 1.008)),
      previousDayHigh: round(seed.price * (seed.gap > 0 ? 0.982 : 1.014)),
    }));
  }

  async researchNews(symbol: string): Promise<NewsCatalyst> {
    const seed = SEEDS.find((item) => item.symbol === symbol);
    if (!seed) throw new Error(`No demo catalyst for ${symbol}`);
    const positive = seed.gap > 0;
    return {
      catalystScore: clamp(Math.round(58 + Math.abs(seed.gap) * 4 + seed.rvol * 2), 0, 96),
      summary: seed.catalyst,
      sentiment: positive ? "positive" : seed.gap < -3 ? "negative" : "neutral",
      confidence: round(clamp(0.69 + seed.rvol / 20, 0, 0.94), 2),
      category: seed.category,
    };
  }
}

function tagsFor(seed: DemoSeed): string[] {
  const tags: string[] = [];
  if (Math.abs(seed.gap) >= 3) tags.push("Gapper");
  if (seed.rvol >= 2) tags.push("High RVOL");
  if (seed.gap > 2 && seed.rvol > 2) tags.push("Momentum");
  if (seed.gap > 3.5) tags.push("Breakout");
  return tags;
}

function buildBars(seed: DemoSeed): PriceBar[] {
  const bars: PriceBar[] = [];
  const drift = seed.gap >= 0 ? 0.00115 : -0.00045;
  let close = seed.price / Math.pow(1 + drift, 220);
  for (let i = 0; i < 220; i++) {
    const wave = Math.sin(i * 0.43 + seed.symbol.length) * 0.004;
    const open = close;
    close = open * (1 + drift + wave);
    const spread = Math.abs(wave) + 0.004;
    bars.push({
      timestamp: new Date(Date.UTC(2025, 8, 1 + i)).toISOString(),
      open: round(open), high: round(Math.max(open, close) * (1 + spread)),
      low: round(Math.min(open, close) * (1 - spread)), close: round(close),
      volume: Math.round(seed.volume / seed.rvol * (0.82 + (i % 7) * 0.06)),
    });
  }
  bars[bars.length - 1] = { ...bars[bars.length - 1]!, close: seed.price, high: round(seed.price * 1.006), low: round(seed.price * 0.991), volume: seed.volume };
  return bars;
}

function round(value: number, digits = 2): number { return Number(value.toFixed(digits)); }
function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }
