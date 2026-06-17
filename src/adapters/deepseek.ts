import type { ModelFamily } from "../types.js";
import { OpenAICompatibleAdapter } from "./openaiCompatible.js";

/** DeepSeek V4 Pro — OpenAI-compatible chat completions. */
export class DeepSeekAdapter extends OpenAICompatibleAdapter {
  readonly family: ModelFamily = "deepseek-v4-pro";
}
