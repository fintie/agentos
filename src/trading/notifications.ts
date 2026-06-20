import type { TradingSignal } from "./types.js";

export type NotificationChannelName = "Telegram" | "Discord" | "Email" | "Dashboard";

export interface SignalNotification {
  title: string;
  message: string;
  signal: TradingSignal;
}

export interface NotificationChannelAdapter {
  readonly name: NotificationChannelName;
  send(notification: SignalNotification): Promise<void>;
}

export class TradingNotifier {
  constructor(private readonly channels: NotificationChannelAdapter[]) {}

  async notify(signal: TradingSignal): Promise<NotificationChannelName[]> {
    if (signal.status !== "actionable" || !signal.risk.accepted) return [];
    const notification = { title: "NEW SIGNAL", message: formatSignalAlert(signal), signal };
    await Promise.all(this.channels.map((channel) => channel.send(notification)));
    return this.channels.map((channel) => channel.name);
  }
}

/** In-process adapter used by the AgentOS dashboard and tests. */
export class DashboardNotificationChannel implements NotificationChannelAdapter {
  readonly name = "Dashboard" as const;
  readonly notifications: SignalNotification[] = [];
  async send(notification: SignalNotification): Promise<void> { this.notifications.unshift(notification); }
}

/** Bridge Telegram, Discord, or email to the user's own secure transport. */
export class CallbackNotificationChannel implements NotificationChannelAdapter {
  constructor(readonly name: Exclude<NotificationChannelName, "Dashboard">, private readonly deliver: (notification: SignalNotification) => Promise<void>) {}
  send(notification: SignalNotification): Promise<void> { return this.deliver(notification); }
}

export function formatSignalAlert(signal: TradingSignal): string {
  const currency = signal.market === "ASX" ? "A$" : "$";
  return [
    "NEW SIGNAL", "", `Ticker: ${signal.symbol}`, "", `Strategy: ${signal.strategy.strategy}`, "",
    `Entry: ${currency}${signal.risk.entry.toFixed(2)}`, `Stop: ${currency}${signal.risk.stopLoss.toFixed(2)}`,
    `Target: ${currency}${signal.risk.takeProfit.toFixed(2)}`, "", `Risk Reward: ${signal.risk.riskRewardRatio.toFixed(1)}`,
    "", `Catalyst: ${signal.catalyst.summary}`, "", `Confidence: ${signal.confidence}%`,
  ].join("\n");
}
