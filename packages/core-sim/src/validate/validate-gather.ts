import { ActionIntent, RejectedAction, ValidatedAction, WorldState, manhattan } from "@project-god/shared";

/** Default inventory capacity if not set on entity. */
const DEFAULT_INVENTORY_CAPACITY = 10;

export function validateGather(
  intent: ActionIntent,
  world: WorldState,
  gatherRange: number
): ValidatedAction | RejectedAction {
  const entity = world.entities[intent.actorId];

  if (!intent.targetId) {
    return { kind: "rejected", intent, reason: "Gather requires targetId (resource node)" };
  }

  const node = world.resourceNodes[intent.targetId];
  if (!node) {
    return { kind: "rejected", intent, reason: `Resource node ${intent.targetId} not found` };
  }

  if (node.quantity <= 0) {
    return { kind: "rejected", intent, reason: `Resource node ${intent.targetId} is depleted` };
  }

  if (manhattan(entity.position, node.position) > gatherRange) {
    return { kind: "rejected", intent, reason: "Entity is too far from resource node to gather" };
  }

  // ── Inventory capacity check (MVP-02) ─────────────────────
  const capacity = entity.inventoryCapacity ?? DEFAULT_INVENTORY_CAPACITY;
  const currentTotal = Object.values(entity.inventory).reduce((sum, qty) => sum + qty, 0);
  if (currentTotal >= capacity) {
    return { kind: "rejected", intent, reason: "Inventory is full" };
  }

  return { kind: "validated", intent, energyCost: 10, timeCost: 2 };
}
