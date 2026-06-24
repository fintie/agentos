import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sanitizePublicText } from "../scripts/publicData.js";

const blocked = /\b(demo|mock|sample|synthetic)\b|no.?chain/i;

describe("public frontend copy", () => {
  it("normalizes internal fallback terminology", () => {
    expect(sanitizePublicText("Mock demo sample synthetic no-chain")).toBe(
      "offline reference reference generated unsettled",
    );
  });

  it("keeps blocked terminology out of published assets", () => {
    const files = [
      "index.html", "docs.html", "trading.js", "shard.js", "x402.js",
      ...collectJsonFiles(join(process.cwd(), "data")),
    ];
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(blocked);
    }
  });
});

function collectJsonFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectJsonFiles(path);
    return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
  });
}
