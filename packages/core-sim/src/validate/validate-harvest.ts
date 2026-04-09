/**
 * validate-harvest.ts — MVP-02X: Validate harvest action.
 *
 * Checks: resource node exists, has quantity, is within range,
 * and resourceType is a harvestable material (not berry/water).
 */

import {
  ActionIntent, ActionOutcome, ValidatedAction, RejectedAction,
  WorldState, EntityState, ResourceNodeState, manhattan,
} from "@project-god/shared";
import type { ResourceDef } from "../content-types";

export function validateHarvest(
  intent: ActionIntent,
  world: WorldState,
  resourceDefs: Record<string, ResourceDef>
): ActionOutcome {
  const entity = world.entities[intent.actorId] as EntityState;
  if (!entity?.alive) {
    return { kind: "rejected", intent, reason: "entity not alive" } as RejectedAction;
  }

  if (!intent.targetId) {
    return { kind: "rejected", intent, reason: "no target resource node" } as RejectedAction;
  }

  const node = world.resourceNodes[intent.targetId] as ResourceNodeState | undefined;
  if (!node) {
    return { kind: "rejected", intent, reason: "resource node not found" } as RejectedAction;
  }

  if (node.quantity <= 0) {
    return { kind: "rejected", intent, reason: "resource node depleted" } as RejectedAction;
  }

  // Check range
  if (manhattan(entity.position, node.position) > 1) {
    return { kind: "rejected", intent, reason: "resource node out of range" } as RejectedAction;
  }

  // Check that this is a harvestable resource
  const def = resourceDefs[node.resourceType];
  if (!def) {
    return { kind: "rejected", intent, reason: `unknown resource type: ${node.resourceType}` } as RejectedAction;
  }
  if (!def.harvestAction) {
    return { kind: "rejected", intent, reason: `${node.resourceType} is not harvestable, use gather` } as RejectedAction;
  }

  // Check inventory capacity
  const totalItems = Object.values(entity.inventory).reduce((sum, v) => sum + v, 0);
  const capacity = entity.inventoryCapacity ?? 10;
  if (totalItems >= capacity) {
    return { kind: "rejected", intent, reason: "inventory full" } as RejectedAction;
  }

  return { kind: "validated", intent, energyCost: 1, timeCost: 1 } as ValidatedAction;
}
