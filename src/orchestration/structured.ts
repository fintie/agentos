import { z } from "zod";
import type { ModelAdapter } from "../adapters/types.js";
import type { GenerateResult, Message } from "../types.js";
import { zodToJsonSchema } from "./zodToJsonSchema.js";

export interface StructuredRequest<T> {
  adapter: ModelAdapter;
  messages: Message[];
  schema: z.ZodType<T, z.ZodTypeDef, any>;
  schemaName: string;
  maxRetries?: number;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface StructuredResult<T> {
  /** Validated, parsed object. */
  parsed: T;
  /** Raw model text from the final (successful) attempt. */
  raw: string;
  attempts: number;
  usage: { inputTokens: number; outputTokens: number };
  model: ModelAdapter["family"];
}

export class StructuredOutputError extends Error {
  constructor(
    message: string,
    readonly lastRaw: string,
    readonly attempts: number,
  ) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

/**
 * Runs a generation constrained to a Zod schema, validating the result and
 * retrying with corrective feedback when validation fails. Both raw and parsed
 * output are returned so callers can persist both (per the evaluation spec).
 */
export async function runStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const maxRetries = req.maxRetries ?? 2;
  const jsonSchema = zodToJsonSchema(req.schema as unknown as z.ZodTypeAny);
  let messages = [...req.messages];
  let lastRaw = "";
  let totalInput = 0;
  let totalOutput = 0;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const result: GenerateResult = await req.adapter.generateStructured({
      messages,
      jsonSchema,
      temperature: req.temperature,
      maxTokens: req.maxTokens,
      signal: req.signal,
    });
    lastRaw = result.text;
    totalInput += result.usage.inputTokens;
    totalOutput += result.usage.outputTokens;

    const candidate = extractJson(result.text);
    const validation = req.schema.safeParse(candidate);
    if (validation.success) {
      return {
        parsed: validation.data,
        raw: result.text,
        attempts: attempt,
        usage: { inputTokens: totalInput, outputTokens: totalOutput },
        model: req.adapter.family,
      };
    }

    // Feed the validation error back for a corrective retry.
    const issues = validation.error.issues
      .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    messages = [
      ...req.messages,
      { role: "assistant", content: result.text },
      {
        role: "user",
        content:
          `Your previous output did not match the required "${req.schemaName}" schema.\n` +
          `Validation errors:\n${issues}\n\n` +
          `Return ONLY a corrected JSON object that satisfies the schema. No prose, no code fences.`,
      },
    ];
  }

  throw new StructuredOutputError(
    `Failed to produce valid "${req.schemaName}" output after ${maxRetries + 1} attempts.`,
    lastRaw,
    maxRetries + 1,
  );
}

/** Extract a JSON object from model text (tolerates code fences / stray prose). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip ```json fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1]!.trim() : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    // Last resort: grab the outermost {...}.
    const first = body.indexOf("{");
    const last = body.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(body.slice(first, last + 1));
      } catch {
        /* fall through */
      }
    }
    return undefined;
  }
}
