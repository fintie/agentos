import type { ModelFamily } from "../types.js";
import { OpenAICompatibleAdapter } from "./openaiCompatible.js";

/** Kimi K2.6 (Moonshot) — OpenAI-compatible chat completions. */
export class KimiAdapter extends OpenAICompatibleAdapter {
  readonly family: ModelFamily = "kimi-k2.6";
}
