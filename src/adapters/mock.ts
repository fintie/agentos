import type { ProviderConfig } from "../config.js";
import type { GenerateOptions, GenerateResult, ModelFamily } from "../types.js";
import { BaseAdapter, estimateTokens, messagesToText } from "./base.js";

const DEFAULT_MOCK_CONFIG: ProviderConfig = {
  baseUrl: "mock://local",
  model: "mock-1",
  inputPricePerMTok: 0,
  outputPricePerMTok: 0,
  maxContextTokens: 1_000_000,
  supportsMultimodal: true,
};

/**
 * Deterministic, offline adapter for local dev and tests. It produces
 * plausible, schema-aware output without any network calls.
 *
 * - If a JSON schema is supplied, it synthesises a minimal object matching the
 *   schema's top-level properties (so structured-output retries can be tested).
 * - Otherwise it echoes a short, deterministic summary of the prompt.
 *
 * `family` is configurable so the same mock can stand in for any provider,
 * letting cascades/dual-review run end-to-end with no keys.
 */
export class MockModelAdapter extends BaseAdapter {
  readonly family: ModelFamily;
  private readonly behavior: MockBehavior;

  constructor(
    family: ModelFamily = "mock",
    cfg: Partial<ProviderConfig> = {},
    behavior: MockBehavior = {},
  ) {
    super({ ...DEFAULT_MOCK_CONFIG, ...cfg, model: cfg.model ?? `mock-${family}` });
    this.family = family;
    this.behavior = behavior;
  }

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    if (opts.signal?.aborted) {
      return this.errorResult(opts);
    }
    const prompt = messagesToText(opts.messages);
    const text = this.behavior.respond
      ? this.behavior.respond(prompt, opts)
      : opts.responseJsonSchema
        ? synthesizeJson(opts.responseJsonSchema, prompt)
        : this.fakeProse(prompt);

    const inputTokens = estimateTokens(prompt);
    const outputTokens = estimateTokens(text);
    return {
      text,
      usage: { inputTokens, outputTokens },
      model: this.family,
      finishReason: "stop",
      raw: { mock: true, family: this.family },
    };
  }

  private fakeProse(prompt: string): string {
    const firstLine = prompt.split("\n").find((l) => l.trim().length > 0) ?? "";
    return `[${this.family}] ${firstLine.slice(0, 160)}`.trim();
  }

  private errorResult(opts: GenerateOptions): GenerateResult {
    return {
      text: "",
      usage: { inputTokens: estimateTokens(messagesToText(opts.messages)), outputTokens: 0 },
      model: this.family,
      finishReason: "error",
    };
  }
}

export interface MockBehavior {
  /** Override the produced text entirely (for failure injection in tests). */
  respond?: (prompt: string, opts: GenerateOptions) => string;
}

/** Build a minimal JSON object that satisfies a JSON-schema's top-level props. */
function synthesizeJson(schema: Record<string, unknown>, prompt: string): string {
  const props = (schema.properties as Record<string, any> | undefined) ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(props)) {
    out[key] = sampleValue(key, def, prompt);
  }
  return JSON.stringify(out);
}

function sampleValue(key: string, def: any, prompt: string): unknown {
  const type = def?.type;
  if (def?.enum?.length) return def.enum[0];
  switch (type) {
    case "string":
      if (/summary|note|text|content|feedback|plan|reason/i.test(key)) {
        return `Mock ${key}: ${prompt.split("\n")[0]?.slice(0, 80) ?? ""}`.trim();
      }
      return `mock-${key}`;
    case "number":
    case "integer":
      if (/confidence|score/i.test(key)) return 0.82;
      return 1;
    case "boolean":
      return /compliant|approved|correct|pass|safe/i.test(key);
    case "array":
      return [sampleValue(`${key}_item`, def.items ?? { type: "string" }, prompt)];
    case "object":
      return def.properties ? JSON.parse(synthesizeJson(def, prompt)) : {};
    default:
      return null;
  }
}
