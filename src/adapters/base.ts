import type { ProviderConfig } from "../config.js";
import type {
  ContentPart,
  CostEstimate,
  GenerateOptions,
  Message,
  ModelFamily,
  TokenUsage,
} from "../types.js";
import type { ModelAdapter, TextStream } from "./types.js";

/** ~4 chars per token heuristic, good enough for budgeting/estimation. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function partText(part: ContentPart): string {
  if (part.type === "text") return part.text;
  return `[${part.type}:${part.mimeType}]`;
}

export function messageToText(msg: Message): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content.map(partText).join("\n");
}

export function messagesToText(messages: Message[]): string {
  return messages.map((m) => `${m.role}: ${messageToText(m)}`).join("\n\n");
}

export function hasMultimodalContent(messages: Message[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((p) => p.type === "image" || p.type === "audio"),
  );
}

/**
 * Shared adapter behaviour: cost math, capability reporting, and a default
 * stream() that falls back to a single generate() call. Concrete adapters
 * override the provider-specific request shaping.
 */
export abstract class BaseAdapter implements ModelAdapter {
  abstract readonly family: ModelFamily;

  constructor(protected readonly cfg: ProviderConfig) {}

  get modelId(): string {
    return this.cfg.model;
  }

  abstract generate(opts: GenerateOptions): Promise<import("../types.js").GenerateResult>;

  generateStructured(
    opts: GenerateOptions & { jsonSchema: Record<string, unknown> },
  ): Promise<import("../types.js").GenerateResult> {
    return this.generate({ ...opts, responseJsonSchema: opts.jsonSchema });
  }

  /** Default streaming: emit the full result as one chunk. Adapters with
   *  native SSE support override this. */
  async *stream(opts: GenerateOptions): AsyncGenerator<string> {
    const result = await this.generate(opts);
    yield result.text;
  }

  estimateCost(usage: TokenUsage): CostEstimate {
    const inputCostUsd = (usage.inputTokens / 1_000_000) * this.cfg.inputPricePerMTok;
    const outputCostUsd = (usage.outputTokens / 1_000_000) * this.cfg.outputPricePerMTok;
    return {
      inputCostUsd,
      outputCostUsd,
      totalUsd: inputCostUsd + outputCostUsd,
    };
  }

  supportsMultimodal(): boolean {
    return this.cfg.supportsMultimodal;
  }

  maxContextTokens(): number {
    return this.cfg.maxContextTokens;
  }
}

// Keep TextStream referenced for downstream imports.
export type { TextStream };
