import type { ModelFamily } from "../types.js";

export type ModelHealthStatus = "closed" | "open" | "half_open";

export interface ModelHealthSnapshot {
  model: ModelFamily;
  status: ModelHealthStatus;
  failures: number;
  openedAt?: string;
  nextRetryAt?: string;
}

export interface ModelHealthOptions {
  failureThreshold?: number;
  cooldownMs?: number;
  now?: () => number;
}

interface MutableHealth {
  status: ModelHealthStatus;
  failures: number;
  openedAt?: number;
}

/**
 * Lightweight circuit-breaker registry for model families.
 *
 * The router uses this to avoid families with recent repeated failures. The
 * orchestrator updates it after each provider call. It is intentionally
 * in-memory: deployments can replace it with a shared registry later without
 * changing the routing contract.
 */
export class ModelHealthRegistry {
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly state = new Map<ModelFamily, MutableHealth>();

  constructor(opts: ModelHealthOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 2;
    this.cooldownMs = opts.cooldownMs ?? 30_000;
    this.now = opts.now ?? Date.now;
  }

  isAvailable(model: ModelFamily): boolean {
    const health = this.getMutable(model);
    if (health.status !== "open") return true;
    return this.now() - (health.openedAt ?? 0) >= this.cooldownMs;
  }

  recordSuccess(model: ModelFamily): void {
    this.state.set(model, { status: "closed", failures: 0 });
  }

  recordFailure(model: ModelFamily): void {
    const health = this.getMutable(model);
    const failures = health.failures + 1;
    if (failures >= this.failureThreshold) {
      this.state.set(model, { status: "open", failures, openedAt: this.now() });
      return;
    }
    this.state.set(model, { ...health, failures });
  }

  snapshot(model: ModelFamily): ModelHealthSnapshot {
    const health = this.getMutable(model);
    const status =
      health.status === "open" && this.isAvailable(model)
        ? "half_open"
        : health.status;
    return {
      model,
      status,
      failures: health.failures,
      openedAt: health.openedAt ? new Date(health.openedAt).toISOString() : undefined,
      nextRetryAt:
        health.status === "open" && health.openedAt
          ? new Date(health.openedAt + this.cooldownMs).toISOString()
          : undefined,
    };
  }

  snapshots(models: ModelFamily[]): ModelHealthSnapshot[] {
    return models.map((model) => this.snapshot(model));
  }

  private getMutable(model: ModelFamily): MutableHealth {
    return this.state.get(model) ?? { status: "closed", failures: 0 };
  }
}
