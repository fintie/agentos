import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitizePublicValue } from "./publicData.js";

const root = join(process.cwd(), "data");
const files = await collectJsonFiles(root);

for (const file of files) {
  const value = JSON.parse(await readFile(file, "utf8"));
  await writeFile(file, `${JSON.stringify(sanitizePublicValue(value), null, 2)}\n`);
}

console.log(`Sanitized ${files.length} public JSON files.`);

async function collectJsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectJsonFiles(path);
    return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
  }));
  return nested.flat();
}
