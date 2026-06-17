import type { ContentPart, GenerateOptions, GenerateResult, Message, ModelFamily } from "../types.js";
import { BaseAdapter, estimateTokens, messagesToText } from "./base.js";

/**
 * Gemini 3 Flash adapter — uses Google's generateContent REST shape, which
 * differs from the OpenAI format (roles are user/model, system goes in a
 * separate systemInstruction, parts carry inlineData for multimodal).
 */
export class GeminiFlashAdapter extends BaseAdapter {
  readonly family: ModelFamily = "gemini-3-flash";

  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const { systemInstruction, contents } = toGeminiContents(opts.messages);
    const generationConfig: Record<string, unknown> = {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxTokens ?? 2048,
    };
    if (opts.responseJsonSchema) {
      generationConfig.responseMimeType = "application/json";
      generationConfig.responseSchema = opts.responseJsonSchema;
    }

    const url =
      `${this.cfg.baseUrl}/models/${this.cfg.model}:generateContent?key=${this.cfg.apiKey ?? ""}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(systemInstruction ? { systemInstruction } : {}),
        contents,
        generationConfig,
      }),
      signal: opts.signal,
    });

    if (!res.ok) {
      const detail = await safeText(res);
      throw new Error(`gemini request failed (${res.status}): ${detail}`);
    }

    const json: any = await res.json();
    const candidate = json.candidates?.[0];
    const text: string =
      candidate?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    const usage = json.usageMetadata ?? {};
    return {
      text,
      usage: {
        inputTokens: usage.promptTokenCount ?? estimateTokens(messagesToText(opts.messages)),
        outputTokens: usage.candidatesTokenCount ?? estimateTokens(text),
      },
      model: this.family,
      finishReason: normaliseFinish(candidate?.finishReason),
      raw: json,
    };
  }
}

function toGeminiContents(messages: Message[]) {
  let systemInstruction: { parts: { text: string }[] } | undefined;
  const contents: { role: "user" | "model"; parts: any[] }[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const text = typeof msg.content === "string" ? msg.content : messageToParts(msg.content).text;
      systemInstruction = { parts: [{ text }] };
      continue;
    }
    const role = msg.role === "assistant" ? "model" : "user";
    const parts =
      typeof msg.content === "string"
        ? [{ text: msg.content }]
        : msg.content.map(partToGemini);
    contents.push({ role, parts });
  }
  return { systemInstruction, contents };
}

function partToGemini(part: ContentPart) {
  if (part.type === "text") return { text: part.text };
  return { inlineData: { mimeType: part.mimeType, data: part.dataBase64 } };
}

function messageToParts(parts: ContentPart[]): { text: string } {
  return { text: parts.map((p) => (p.type === "text" ? p.text : "")).join("\n") };
}

function normaliseFinish(reason: string | undefined): GenerateResult["finishReason"] {
  switch (reason) {
    case "STOP":
      return "stop";
    case "MAX_TOKENS":
      return "length";
    case "SAFETY":
    case "RECITATION":
      return "content_filter";
    default:
      return reason ? "unknown" : "stop";
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
