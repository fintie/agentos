import { runTradingWorkflow, type TradingWorkflowOptions } from "./engine.js";
import type { Market, TradingDashboardSnapshot } from "./types.js";

export interface TradingSchedulerOptions extends Omit<TradingWorkflowOptions, "markets"> {
  usIntervalMs?: number;
  asxIntervalMs?: number;
  runImmediately?: boolean;
  onSnapshot(snapshot: TradingDashboardSnapshot, market: Market): void | Promise<void>;
  onError?(error: unknown, market: Market): void;
}

export class TradingScheduler {
  private timers: ReturnType<typeof setInterval>[] = [];
  constructor(private readonly options: TradingSchedulerOptions) {}

  start(): void {
    if (this.timers.length) return;
    this.schedule("US", this.options.usIntervalMs ?? 15 * 60_000);
    this.schedule("ASX", this.options.asxIntervalMs ?? 30 * 60_000);
    if (this.options.runImmediately ?? true) {
      void this.run("US");
      void this.run("ASX");
    }
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  private schedule(market: Market, intervalMs: number): void {
    const timer = setInterval(() => void this.run(market), intervalMs);
    timer.unref?.();
    this.timers.push(timer);
  }

  private async run(market: Market): Promise<void> {
    try {
      const { onSnapshot, onError: _onError, usIntervalMs: _us, asxIntervalMs: _asx, runImmediately: _immediate, ...workflow } = this.options;
      const snapshot = await runTradingWorkflow({ ...workflow, markets: [market] });
      await onSnapshot(snapshot, market);
    } catch (error) {
      this.options.onError?.(error, market);
    }
  }
}
