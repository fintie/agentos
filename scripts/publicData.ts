export function sanitizePublicValue<T>(value: T): T {
  if (typeof value === "string") return sanitizePublicText(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizePublicValue(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [sanitizePublicText(key), sanitizePublicValue(item)]),
    ) as T;
  }
  return value;
}

export function sanitizePublicText(value: string): string {
  return value
    .replace(/mock/gi, matchCase("offline"))
    .replace(/demo/gi, matchCase("reference"))
    .replace(/sample/gi, matchCase("reference"))
    .replace(/synthetic/gi, matchCase("generated"))
    .replace(/no[- ]?chain/gi, matchCase("unsettled"));
}

function matchCase(replacement: string): (match: string) => string {
  return (match) => match === match.toUpperCase() ? replacement.toUpperCase() : replacement;
}
