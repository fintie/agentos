import type { X402ResourceManifest } from "./types.js";
import { get as httpsGet } from "node:https";

export interface X402MetricPoint {
  period: string;
  value: number;
}

export interface X402EcosystemStats {
  sourceLabel: string;
  sourceUrl: string;
  period: string;
  totals: { transactions: number; volume: number; buyers: number; sellers: number };
  transactions: X402MetricPoint[];
  volume: X402MetricPoint[];
  buyers: X402MetricPoint[];
  sellers: X402MetricPoint[];
  latestBlockTimestamp: string;
}

export interface X402SystemData {
  generatedAt: string;
  dataMode: "live" | "snapshot";
  resources: X402ResourceManifest[];
  stats: X402EcosystemStats;
  protocol: {
    version: "x402-v2";
    networks: string[];
    settlementAsset: "USDC";
    stages: Array<{ title: string; description: string; status: string }>;
  };
}

const SOURCE_URL = "https://www.x402scan.com";
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { expiresAt: number; value: X402SystemData } | undefined;

export const X402_PUBLIC_RESOURCES: X402ResourceManifest[] = [
  resource({
    id: "x402scan-resource-index",
    name: "x402scan Resource Index",
    description: "Search the public x402 resource directory.",
    baseUrl: "https://www.x402scan.com",
    provider: "x402scan",
    category: "data",
    capabilities: ["resource-search", "discovery"],
    method: "GET",
    path: "/api/x402/resources",
    amount: 0.01,
    sourceUrl: "https://www.x402scan.com/server/a50f19f7-56a9-4fb9-adea-ff0707b9ca1f",
  }),
  resource({
    id: "x402scan-facilitator-stats",
    name: "x402scan Facilitator Stats",
    description: "Read aggregate activity for indexed x402 facilitators.",
    baseUrl: "https://www.x402scan.com",
    provider: "x402scan",
    category: "data",
    capabilities: ["facilitator-stats", "analytics"],
    method: "GET",
    path: "/api/x402/facilitators/stats",
    amount: 0.01,
    sourceUrl: "https://www.x402scan.com/server/a50f19f7-56a9-4fb9-adea-ff0707b9ca1f",
  }),
  resource({
    id: "purch-product-search",
    name: "Purch Product Search",
    description: "Search products and purchasable digital resources through x402.",
    baseUrl: "https://api.purch.xyz",
    provider: "Purch",
    category: "tool",
    capabilities: ["product-search", "commerce"],
    method: "GET",
    path: "/x402/search",
    amount: 0.01,
    sourceUrl: "https://www.x402scan.com/server/ad1c686d-5f67-4160-ad50-72175071d9a7",
  }),
  resource({
    id: "claw-hunter-research",
    name: "Claw Hunter Research",
    description: "Research Pump.fun projects using an indexed x402 endpoint.",
    baseUrl: "https://clawhunter.xyz",
    provider: "Claw Hunter",
    category: "tool",
    capabilities: ["project-research", "crypto"],
    method: "GET",
    path: "/api/v1/projects/{mint}/research",
    amount: 0.03,
    sourceUrl: "https://www.x402scan.com/server/fca76b3b-e1f6-44e7-b0a6-6e769b2a4868",
  }),
];

export async function getX402SystemData(options: { forceRefresh?: boolean; fetchImpl?: typeof fetch } = {}): Promise<X402SystemData> {
  const now = Date.now();
  if (!options.forceRefresh && cached && cached.expiresAt > now) return cached.value;

  try {
    const html = options.fetchImpl
      ? await fetchWith(options.fetchImpl)
      : await getPublicPage(SOURCE_URL);
    const stats = parseX402ScanPage(html);
    const value = buildSystemData(stats, "live", new Date().toISOString());
    cached = { expiresAt: now + CACHE_TTL_MS, value };
    return value;
  } catch {
    const value = buildSystemData(snapshotStats(), "snapshot", "2026-06-23T22:55:21.000Z");
    cached = { expiresAt: now + 30_000, value };
    return value;
  }
}

async function fetchWith(fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(SOURCE_URL, {
    headers: { "user-agent": "AgentOS/0.1 x402 ecosystem sync" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`x402scan returned HTTP ${response.status}`);
  return response.text();
}

function getPublicPage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpsGet(url, { headers: { "user-agent": "AgentOS/0.1 x402 ecosystem sync", "accept-encoding": "identity" } }, (response) => {
      if ((response.statusCode ?? 500) >= 300 && response.headers.location) {
        response.resume();
        getPublicPage(new URL(response.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`x402scan returned HTTP ${response.statusCode}`));
        return;
      }
      response.setEncoding("utf8");
      let body = "";
      response.on("data", (chunk: string) => { body += chunk; });
      response.on("end", () => resolve(body));
    });
    request.setTimeout(20_000, () => request.destroy(new Error("x402scan sync timed out")));
    request.on("error", reject);
  });
}

export function parseX402ScanPage(html: string): X402EcosystemStats {
  type Overview = {
    total_transactions: number;
    total_amount: number;
    unique_buyers: number;
    unique_sellers: number;
    latest_block_timestamp: string;
  };
  type Activity = Array<{
    bucket_start: string;
    total_transactions: number;
    total_amount: number;
    unique_buyers: number;
    unique_sellers: number;
  }>;
  const payloads = extractRscPayloads(html);
  const overview = payloads.find((value): value is Overview => isObject(value) &&
    typeof value.total_transactions === "number" && typeof value.unique_buyers === "number" &&
    typeof value.unique_sellers === "number" && typeof value.latest_block_timestamp === "string");
  const activity = payloads.find((value): value is Activity => Array.isArray(value) && value.length > 0 &&
    isObject(value[0]) && typeof value[0].bucket_start === "string" && typeof value[0].total_transactions === "number");
  if (!overview || !activity?.length) throw new Error("x402scan activity payload was not found");

  const points = activity.slice(-48);
  return {
    sourceLabel: "x402scan public network index",
    sourceUrl: SOURCE_URL,
    period: "Past 30 days",
    totals: {
      transactions: overview.total_transactions,
      volume: fromAtomicUsdc(overview.total_amount),
      buyers: overview.unique_buyers,
      sellers: overview.unique_sellers,
    },
    transactions: series(points, "total_transactions", (value) => value),
    volume: series(points, "total_amount", fromAtomicUsdc),
    buyers: series(points, "unique_buyers", (value) => value),
    sellers: series(points, "unique_sellers", (value) => value),
    latestBlockTimestamp: overview.latest_block_timestamp,
  };
}

function buildSystemData(stats: X402EcosystemStats, dataMode: X402SystemData["dataMode"], generatedAt: string): X402SystemData {
  return {
    generatedAt,
    dataMode,
    resources: X402_PUBLIC_RESOURCES,
    stats,
    protocol: {
      version: "x402-v2",
      networks: ["Base", "Solana"],
      settlementAsset: "USDC",
      stages: [
        { title: "Discover", description: "Select a resource from its published contract and runtime 402 challenge.", status: "indexed" },
        { title: "Quote", description: "Read price, network, asset, expiry and payment requirements.", status: "ready" },
        { title: "Authorize", description: "Apply the agent budget policy before signing a payment payload.", status: "policy" },
        { title: "Execute + Prove", description: "Bind the response to execution, output and evaluation receipts.", status: "verified" },
        { title: "Settle", description: "Verify and settle through an x402-compatible facilitator.", status: "facilitated" },
      ],
    },
  };
}

function extractRscPayloads(html: string): unknown[] {
  const values: unknown[] = [];
  const scripts = html.matchAll(/self\.__next_f\.push\((\[1,"(?:\\.|[^"\\])*"\])\)<\/script>/g);
  for (const match of scripts) {
    const payload = JSON.parse(match[1]!) as [number, string];
    const separator = payload[1].indexOf(":");
    if (separator < 0 || payload[1][separator + 1] !== "{") continue;
    try {
      const record = JSON.parse(payload[1].slice(separator + 1)) as { json?: unknown };
      if (record.json !== undefined) values.push(record.json);
    } catch {
      // Other React Server Component records are not standalone JSON payloads.
    }
  }
  return values;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function series<T extends Record<string, string | number>>(points: T[], key: keyof T, convert: (value: number) => number): X402MetricPoint[] {
  return points.map((point) => ({
    period: new Date(String(point.bucket_start)).toLocaleDateString("en-AU", { day: "2-digit", month: "short", timeZone: "UTC" }),
    value: convert(Number(point[key])),
  }));
}

function fromAtomicUsdc(value: number): number {
  return Number((value / 1_000_000).toFixed(2));
}

function snapshotStats(): X402EcosystemStats {
  const values = [
    [120517,32634.48,3797,2881],[125540,18495.73,6931,4291],[127929,20284.68,4459,6670],[356983,23275.49,4079,2132],
    [418861,22156.53,4909,6961],[313194,23445.59,4203,4435],[240946,15818.63,7294,2147],[167345,12450.69,5957,4657],
    [95551,15181.52,4493,2530],[88522,21105.08,4208,2293],[88276,19196.4,4882,2386],[110871,15215.97,4199,1723],
    [129630,18151.78,6974,1868],[155811,17223.32,4374,2160],[679319,20263.36,4694,1380],[562034,22772.7,4574,1983],
    [639028,34333.06,3997,994],[541455,19191.52,4489,1166],[378027,13700.28,3975,843],[421067,20360.34,4728,656],
    [266986,20167.26,4639,1063],[258638,15779.25,4494,959],[294774,14957.6,4692,669],[337712,77719.98,4520,1071],
    [446419,18581.93,4358,896],[272014,16322.84,5478,1057],[77057,5354.68,2527,316],
  ];
  const points = values.map((value, index) => ({ period: `P${index + 1}`, transactions: value[0]!, volume: value[1]!, buyers: value[2]!, sellers: value[3]! }));
  return {
    sourceLabel: "x402scan public network index",
    sourceUrl: SOURCE_URL,
    period: "Past 30 days",
    totals: { transactions: 9_442_968, volume: 1_109_608.06, buyers: 117_724, sellers: 38_387 },
    transactions: points.map((point) => ({ period: point.period, value: point.transactions })),
    volume: points.map((point) => ({ period: point.period, value: point.volume })),
    buyers: points.map((point) => ({ period: point.period, value: point.buyers })),
    sellers: points.map((point) => ({ period: point.period, value: point.sellers })),
    latestBlockTimestamp: "2026-06-23T22:55:21.000Z",
  };
}

function resource(input: {
  id: string; name: string; description: string; baseUrl: string; provider: string;
  category: X402ResourceManifest["category"]; capabilities: string[]; method: "GET" | "POST";
  path: string; amount: number; sourceUrl: string;
}): X402ResourceManifest {
  return {
    resourceId: input.id,
    name: input.name,
    description: input.description,
    category: input.category,
    baseUrl: input.baseUrl,
    discoveryPath: "/.well-known/x402",
    providerName: input.provider,
    capabilities: input.capabilities,
    healthStatus: "healthy",
    reliabilityScore: 1,
    proofRequirements: [],
    sourceUrl: input.sourceUrl,
    endpoints: [{
      endpointId: `${input.id}-endpoint`, method: input.method, path: input.path,
      description: input.description, inputSchema: { type: "object" }, outputSchema: { type: "object" },
      pricing: { unit: "request", unitAmount: input.amount, currency: "USDC" },
    }],
  };
}
