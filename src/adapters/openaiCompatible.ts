import type { ProviderConfig } from "../config.js";
import type { ContentPart, GenerateOptions, GenerateResult, Message } from "../types.js";
import { BaseAdapter, estimateTokens, messagesToText } from "./base.js";

/**
 * Base for OpenAI-compatible chat-completions providers (Kimi / Moonshot and
 * DeepSeek both expose this shape). Concrete subclasses only set `family`.
 */
export abstract class OpenAICompatibleAdapter extends BaseAdapter {
  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: this.cfg.model,
      messages: opts.messages.map(toOpenAIMessage),
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 2048,
    };
    if (opts.responseJsonSchema) {
      // OpenAI-style structured output.
      body.response_format = {
        type: "json_schema",
        json_schema: { name: "agentos_output", schema: opts.responseJsonSchema, strict: true },
      };
    }

    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.cfg.apiKey ?? ""}`,
      },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    if (!res.ok) {
      const detail = await safeText(res);
      throw new Error(`${this.family} request failed (${res.status}): ${detail}`);
    }

    const json: any = await res.json();
    const choice = json.choices?.[0];
    const text: string = choice?.message?.content ?? "";
    const usage = json.usage ?? {};
    return {
      text,
      usage: {
        inputTokens: usage.prompt_tokens ?? estimateTokens(messagesToText(opts.messages)),
        outputTokens: usage.completion_tokens ?? estimateTokens(text),
      },
      model: this.family,
      finishReason: normaliseFinish(choice?.finish_reason),
      raw: json,
    };
  }

  override async *stream(opts: GenerateOptions): AsyncGenerator<string> {
    const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.cfg.apiKey ?? ""}`,
      },
      body: JSON.stringify({
        model: this.cfg.model,
        messages: opts.messages.map(toOpenAIMessage),
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 2048,
        stream: true,
      }),
      signal: opts.signal,
    });
    if (!res.ok || !res.body) {
      const detail = await safeText(res);
      throw new Error(`${this.family} stream failed (${res.status}): ${detail}`);
    }
    for await (const chunk of parseSSE(res.body)) {
      const delta = chunk?.choices?.[0]?.delta?.content;
      if (delta) yield delta as string;
    }
  }
}

function toOpenAIMessage(msg: Message) {
  if (typeof msg.content === "string") return { role: msg.role, content: msg.content };
  // Map multimodal parts to OpenAI content-array form.
  return {
    role: msg.role,
    content: msg.content.map((p: ContentPart) =>
      p.type === "text"
        ? { type: "text", text: p.text }
        : {
            type: "image_url",
            image_url: { url: `data:${p.mimeType};base64,${p.dataBase64}` },
          },
    ),
  };
}

function normaliseFinish(reason: string | undefined): GenerateResult["finishReason"] {
  switch (reason) {
    case "stop":
    case "length":
      return reason;
    case "content_filter":
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

/** Minimal Server-Sent-Events parser for streamed chat completions. */
async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        yield JSON.parse(payload);
      } catch {
        /* ignore keepalive / partial frames */
      }
    }
  }
}

export type { ProviderConfig };
