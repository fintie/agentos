import { z } from "zod";

/**
 * Minimal Zod → JSON Schema converter covering the constructs used by AgentOS
 * schemas (object, string, number, boolean, enum, array, optional, default,
 * nullable). Kept dependency-free and intentionally small; extend as schemas
 * grow. Output is the plain-object schema adapters pass to providers.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return convert(schema);
}

function convert(schema: z.ZodTypeAny): Record<string, unknown> {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return convert(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return convert(schema._def.innerType);
  }
  if (schema instanceof z.ZodEffects) {
    return convert(schema._def.schema);
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convert(value);
      if (!isOptional(value)) required.push(key);
    }
    return { type: "object", properties, required, additionalProperties: false };
  }
  if (schema instanceof z.ZodArray) {
    return { type: "array", items: convert(schema.element) };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema.options };
  }
  if (schema instanceof z.ZodString) return { type: "string" };
  if (schema instanceof z.ZodNumber) return { type: "number" };
  if (schema instanceof z.ZodBoolean) return { type: "boolean" };

  // Fallback: permissive.
  return {};
}

function isOptional(schema: z.ZodTypeAny): boolean {
  return (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodNullable
  );
}
