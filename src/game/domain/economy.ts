import { RESOURCE_TYPES, type ResourceCounts } from "./types";

export type PurchaseKind = "road" | "settlement" | "city" | "developmentCard";

export const BUILD_COSTS: Record<PurchaseKind, Partial<ResourceCounts>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  developmentCard: { wool: 1, grain: 1, ore: 1 },
};

export function canAfford(resources: ResourceCounts, cost: Partial<ResourceCounts>): boolean {
  return RESOURCE_TYPES.every((resource) => resources[resource] >= (cost[resource] ?? 0));
}

export function payCost(resources: ResourceCounts, cost: Partial<ResourceCounts>): ResourceCounts {
  if (!canAfford(resources, cost)) {
    throw new Error("Insufficient resources");
  }

  return RESOURCE_TYPES.reduce<ResourceCounts>(
    (next, resource) => ({ ...next, [resource]: resources[resource] - (cost[resource] ?? 0) }),
    { ...resources },
  );
}

export function addResources(resources: ResourceCounts, delta: Partial<ResourceCounts>): ResourceCounts {
  return RESOURCE_TYPES.reduce<ResourceCounts>(
    (next, resource) => ({ ...next, [resource]: resources[resource] + (delta[resource] ?? 0) }),
    { ...resources },
  );
}

export function totalResources(resources: ResourceCounts): number {
  return RESOURCE_TYPES.reduce((total, resource) => total + resources[resource], 0);
}
