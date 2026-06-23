import type { X402ResourceManifest } from "./types.js";

export class X402ResourceRegistry {
  private readonly resources = new Map<string, X402ResourceManifest>();

  constructor(initial: X402ResourceManifest[] = []) { initial.forEach((resource) => this.register(resource)); }

  register(resource: X402ResourceManifest): void {
    validateManifest(resource);
    this.resources.set(resource.resourceId, structuredClone(resource));
  }

  get(resourceId: string): X402ResourceManifest {
    const resource = this.resources.get(resourceId);
    if (!resource) throw new Error(`Unknown x402 resource "${resourceId}".`);
    return structuredClone(resource);
  }

  list(): X402ResourceManifest[] { return [...this.resources.values()].map((resource) => structuredClone(resource)); }

  discover(query: { capability?: string; category?: X402ResourceManifest["category"]; healthyOnly?: boolean } = {}): X402ResourceManifest[] {
    return this.list().filter((resource) =>
      (!query.capability || resource.capabilities.includes(query.capability)) &&
      (!query.category || resource.category === query.category) &&
      (!query.healthyOnly || resource.healthStatus === "healthy"),
    ).sort((a, b) => b.reliabilityScore - a.reliabilityScore || a.name.localeCompare(b.name));
  }
}

function validateManifest(resource: X402ResourceManifest): void {
  if (!resource.resourceId || !resource.name || !resource.baseUrl) throw new Error("x402 resource identity and baseUrl are required.");
  if (resource.discoveryPath !== "/.well-known/x402") throw new Error("x402 discovery path must be /.well-known/x402.");
  if (resource.reliabilityScore < 0 || resource.reliabilityScore > 1) throw new Error("x402 reliability must be between 0 and 1.");
  if (!resource.endpoints.length) throw new Error("x402 resource requires at least one endpoint.");
  const endpointIds = new Set<string>();
  for (const endpoint of resource.endpoints) {
    if (endpointIds.has(endpoint.endpointId)) throw new Error(`Duplicate endpoint ${endpoint.endpointId}.`);
    endpointIds.add(endpoint.endpointId);
    if (endpoint.pricing.unitAmount < 0 || (endpoint.pricing.maximumAmount ?? 0) < 0) throw new Error("x402 prices cannot be negative.");
  }
}
