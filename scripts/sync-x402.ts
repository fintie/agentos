import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getX402SystemData } from "../src/x402/ecosystemData.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = await getX402SystemData({ forceRefresh: true });
await writeFile(join(root, "data", "x402.json"), `${JSON.stringify(data, null, 2)}\n`);

console.log(
  `Synced x402 ${data.dataMode} data: ${data.stats.totals.transactions.toLocaleString()} transactions, ` +
  `${data.stats.totals.buyers.toLocaleString()} buyers, ${data.stats.totals.sellers.toLocaleString()} sellers.`,
);
