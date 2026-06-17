import { loadConfig, providerIsLive, type AgentOSConfig } from "../config.js";
import type { ModelFamily } from "../types.js";
import { DeepSeekAdapter } from "./deepseek.js";
import { GeminiFlashAdapter } from "./gemini.js";
import { KimiAdapter } from "./kimi.js";
import { MockModelAdapter } from "./mock.js";
import type { ModelAdapter } from "./types.js";

export * from "./types.js";
export { GeminiFlashAdapter } from "./gemini.js";
export { KimiAdapter } from "./kimi.js";
export { DeepSeekAdapter } from "./deepseek.js";
export { MockModelAdapter } from "./mock.js";

/**
 * Builds and caches one adapter per family. Falls back to a family-tagged
 * MockModelAdapter whenever the provider has no key or AGENTOS_FORCE_MOCK is on,
 * so the same registry works in CI, local dev, and production.
 */
export class AdapterRegistry {
  private readonly cache = new Map<ModelFamily, ModelAdapter>();

  constructor(private readonly cfg: AgentOSConfig = loadConfig()) {}

  get(family: ModelFamily): ModelAdapter {
    const cached = this.cache.get(family);
    if (cached) return cached;
    const adapter = this.build(family);
    this.cache.set(family, adapter);
    return adapter;
  }

  /** True when the family will hit a real provider (vs. the mock fallback). */
  isLive(family: ModelFamily): boolean {
    return providerIsLive(this.cfg, family);
  }

  private build(family: ModelFamily): ModelAdapter {
    if (family === "mock") return new MockModelAdapter("mock");
    const providerCfg = this.cfg.providers[family];
    if (!providerIsLive(this.cfg, family)) {
      // Mock stands in for the real family, preserving its cost/context profile.
      return new MockModelAdapter(family, providerCfg);
    }
    switch (family) {
      case "gemini-3-flash":
        return new GeminiFlashAdapter(providerCfg);
      case "kimi-k2.6":
        return new KimiAdapter(providerCfg);
      case "deepseek-v4-pro":
        return new DeepSeekAdapter(providerCfg);
    }
  }
}
