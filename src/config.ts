/**
 * Environment-based configuration. All API keys come from the environment;
 * nothing is hard-coded. When keys are absent (or AGENTOS_FORCE_MOCK=true)
 * the factory falls back to the MockModelAdapter so the whole system runs
 * offline and tests stay deterministic.
 */
import type { ModelFamily } from "./types.js";

export interface ProviderConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  /** USD per 1M input / output tokens — used by estimateCost(). */
  inputPricePerMTok: number;
  outputPricePerMTok: number;
  /** Context window. */
  maxContextTokens: number;
  supportsMultimodal: boolean;
}

export interface AgentOSConfig {
  forceMock: boolean;
  evalStore: "memory" | "prisma";
  evalFile: string;
  dashboardPort: number;
  providers: Record<Exclude<ModelFamily, "mock">, ProviderConfig>;
}

function env(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export function loadConfig(): AgentOSConfig {
  return {
    forceMock: env("AGENTOS_FORCE_MOCK", "false").toLowerCase() === "true",
    evalStore: (env("AGENTOS_EVAL_STORE", "memory") as "memory" | "prisma"),
    evalFile: env("AGENTOS_EVAL_FILE", ".agentos/evaluations.json"),
    dashboardPort: Number(env("DASHBOARD_PORT", "4317")),
    providers: {
      "gemini-3-flash": {
        apiKey: env("GEMINI_API_KEY") || undefined,
        baseUrl: env("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"),
        model: env("GEMINI_MODEL", "gemini-3-flash"),
        inputPricePerMTok: 0.1,
        outputPricePerMTok: 0.4,
        maxContextTokens: 1_000_000,
        supportsMultimodal: true,
      },
      "kimi-k2.6": {
        apiKey: env("KIMI_API_KEY") || undefined,
        baseUrl: env("KIMI_BASE_URL", "https://api.moonshot.ai/v1"),
        model: env("KIMI_MODEL", "kimi-k2.6"),
        inputPricePerMTok: 0.6,
        outputPricePerMTok: 2.5,
        maxContextTokens: 256_000,
        supportsMultimodal: false,
      },
      "deepseek-v4-pro": {
        apiKey: env("DEEPSEEK_API_KEY") || undefined,
        baseUrl: env("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"),
        model: env("DEEPSEEK_MODEL", "deepseek-v4-pro"),
        inputPricePerMTok: 0.8,
        outputPricePerMTok: 3.0,
        maxContextTokens: 128_000,
        supportsMultimodal: false,
      },
    },
  };
}

/** Whether a given family can actually reach a real provider right now. */
export function providerIsLive(cfg: AgentOSConfig, family: ModelFamily): boolean {
  if (cfg.forceMock || family === "mock") return false;
  return Boolean(cfg.providers[family]?.apiKey);
}
