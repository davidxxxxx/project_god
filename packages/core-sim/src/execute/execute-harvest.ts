/**
 * execute-harvest.ts — MVP-02X: Labor extraction action.
 *
 * Used for: wood (from tree), stone (from rock), grass/fiber (from grassland).
 * Distinguished from 'gather' which is instant pickup (berry, water).
 */

import {
  WorldState, ActionIntent, SimEvent, ValidatedAction,
  ResourceNodeState, EntityState,
  ResourceHarvestedEvent,
} from "@project-god/shared";
import type { ResourceDef } from "../content-types";

export function executeHarvest(
  world: WorldState,
  va: ValidatedAction,
  resourceDefs: Record<string, ResourceDef>
): SimEvent[] {
  const events: SimEvent[] = [];
  const entity = world.entities[va.intent.actorId] as EntityState;
  if (!entity?.alive) return events;

  const nodeId = va.intent.targetId;
  if (!nodeId) return events;

  const node = world.resourceNodes[nodeId] as ResourceNodeState | undefined;
  if (!node || node.quantity <= 0) return events;

  const def = resourceDefs[node.resourceType];
  if (!def) return events;

  const amount = Math.min(def.gatherAmount, node.quantity);
  node.quantity -= amount;

  // Add to inventory
  if (!entity.inventory) entity.inventory = {};
  entity.inventory[node.resourceType] = (entity.inventory[node.resourceType] ?? 0) + amount;

  events.push({
    type: "RESOURCE_HARVESTED",
    tick: world.tick,
    entityId: entity.id,
    resourceType: node.resourceType,
    amount,
    position: { ...node.position },
  } as ResourceHarvestedEvent);

  return events;
}
