import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockModelAdapter } from "../src/adapters/mock.js";
import { runStructured, StructuredOutputError, extractJson } from "../src/orchestration/structured.js";

const Schema = z.object({
  title: z.string(),
  score: z.number(),
  confidence: z.number().min(0).max(1),
});

describe("runStructured", () => {
  it("parses valid structured output from the mock adapter", async () => {
    const adapter = new MockModelAdapter("mock");
    const result = await runStructured({
      adapter,
      messages: [{ role: "user", content: "make a title" }],
      schema: Schema,
      schemaName: "TestSchema",
    });
    expect(result.parsed.confidence).toBeGreaterThanOrEqual(0);
    expect(result.attempts).toBe(1);
    expect(result.raw.length).toBeGreaterThan(0);
  });

  it("retries on invalid output then succeeds", async () => {
    let call = 0;
    const adapter = new MockModelAdapter("mock", {}, {
      respond: () => {
        call++;
        return call === 1 ? "not json at all" : JSON.stringify({ title: "ok", score: 1, confidence: 0.7 });
      },
    });
    const result = await runStructured({
      adapter,
      messages: [{ role: "user", content: "x" }],
      schema: Schema,
      schemaName: "TestSchema",
      maxRetries: 2,
    });
    expect(result.attempts).toBe(2);
    expect(result.parsed.title).toBe("ok");
  });

  it("throws after exhausting retries", async () => {
    const adapter = new MockModelAdapter("mock", {}, { respond: () => "garbage" });
    await expect(
      runStructured({
        adapter,
        messages: [{ role: "user", content: "x" }],
        schema: Schema,
        schemaName: "TestSchema",
        maxRetries: 1,
      }),
    ).rejects.toBeInstanceOf(StructuredOutputError);
  });
});

describe("extractJson", () => {
  it("strips code fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("recovers an object embedded in prose", () => {
    expect(extractJson('Here you go: {"a": 2} thanks')).toEqual({ a: 2 });
  });
});
