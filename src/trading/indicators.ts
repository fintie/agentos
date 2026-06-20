import type { PriceBar, TechnicalSnapshot } from "./types.js";

export function calculateTechnicalSnapshot(
  bars: PriceBar[],
  premarketHigh: number,
  previousDayHigh: number,
): TechnicalSnapshot {
  if (bars.length < 200) throw new Error("Technical analysis requires at least 200 price bars.");
  const closes = bars.map((bar) => bar.close);
  const price = closes.at(-1)!;
  const sma20 = sma(closes, 20);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const currentRsi = rsi(closes, 14);
  const currentMacd = ema(closes, 12) - ema(closes, 26);
  const totalVolume = bars.reduce((sum, bar) => sum + bar.volume, 0);
  const vwap = bars.reduce((sum, bar) => sum + ((bar.high + bar.low + bar.close) / 3) * bar.volume, 0) / totalVolume;
  const alignment = [price > sma20, sma20 > sma50, sma50 > sma200, price > vwap].filter(Boolean).length;
  const breakoutChecks = [price > premarketHigh, price > previousDayHigh, currentMacd > 0, currentRsi > 50 && currentRsi < 78].filter(Boolean).length;
  return {
    sma20: round(sma20), sma50: round(sma50), sma200: round(sma200), rsi: round(currentRsi),
    macd: round(currentMacd), vwap: round(vwap), premarketHigh, previousDayHigh,
    trendScore: Math.round(alignment * 22.5 + (currentMacd > 0 ? 10 : 0)),
    breakoutProbability: Math.round(breakoutChecks * 21 + Math.min(16, Math.max(0, (price / previousDayHigh - 1) * 100))),
    supportLevels: [round(Math.min(sma20, vwap)), round(sma50)],
    resistanceLevels: [round(Math.max(premarketHigh, previousDayHigh)), round(price * 1.04)],
  };
}

function sma(values: number[], period: number): number {
  return values.slice(-period).reduce((sum, value) => sum + value, 0) / period;
}

function ema(values: number[], period: number): number {
  const factor = 2 / (period + 1);
  return values.reduce((average, value, index) => index === 0 ? value : value * factor + average * (1 - factor), values[0]!);
}

function rsi(values: number[], period: number): number {
  const slice = values.slice(-(period + 1));
  let gains = 0; let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const delta = slice[i]! - slice[i - 1]!;
    if (delta >= 0) gains += delta; else losses -= delta;
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}

function round(value: number): number { return Number(value.toFixed(2)); }
