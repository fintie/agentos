import type {
  CostEstimate,
  GenerateOptions,
  GenerateResult,
  ModelFamily,
  TokenUsage,
} from "../types.js";

/** Async chunk stream for streaming generation. */
export type TextStream = AsyncIterable<string>;

/**
 * Common interface every model adapter implements. The orchestration layer
 * only ever talks to this interface — providers stay fully abstracted.
 */
export interface ModelAdapter {
  readonly family: ModelFamily;
  readonly modelId: string;

  /** Free-form text generation. */
  generate(opts: GenerateOptions): Promise<GenerateResult>;

  /**
   * Generation constrained to a JSON schema. Returns the raw text plus a
   * best-effort parsed object; schema *validation* is done one layer up
   * (src/orchestration/structured.ts) so retries can be centralised.
   */
  generateStructured(
    opts: GenerateOptions & { jsonSchema: Record<string, unknown> },
  ): Promise<GenerateResult>;

  /** Token-by-token (or chunk) streaming. */
  stream(opts: GenerateOptions): TextStream;

  /** Estimate the USD cost of a call given token usage. */
  estimateCost(usage: TokenUsage): CostEstimate;

  supportsMultimodal(): boolean;
  maxContextTokens(): number;
}
