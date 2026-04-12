import { ValidatedAction, WorldState, SimEvent, ResourceGatheredEvent } from "@project-god/shared";
import type { ResourceDef } from "../content-types";

export function executeGather(
  action: ValidatedAction,
  world: WorldState,
  resources: Record<string, ResourceDef>
): SimEvent[] {
  const entity = world.entities[action.intent.actorId];
  if (!entity || !entity.alive) return [];

  const node = world.resourceNodes[action.intent.targetId!];
  if (!node || node.quantity <= 0) return [];

  const resDef = resources[node.resourceType];
  const baseGatherAmount = resDef?.gatherAmount ?? 1;
  // P0: Tool bonus — stone_tool in inventory grants +50% gather
  const hasToolBonus = (entity.inventory["stone_tool"] ?? 0) > 0;
  const gatherAmount = hasToolBonus ? Math.ceil(baseGatherAmount * 1.5) : baseGatherAmount;
  // Clamp to both node supply and remaining inventory capacity
  const capacity = entity.inventoryCapacity ?? 10;
  const currentTotal = Object.values(entity.inventory).reduce((sum, qty) => sum + qty, 0);
  const remainingCapacity = Math.max(0, capacity - currentTotal);
  const actual = Math.min(gatherAmount, node.quantity, remainingCapacity);
  if (actual <= 0) return [];

  node.quantity -= actual;
  entity.inventory[node.resourceType] = (entity.inventory[node.resourceType] ?? 0) + actual;

  return [{
    type: "RESOURCE_GATHERED",
    tick: world.tick,
    entityId: entity.id,
    nodeId: node.id,
    resourceType: node.resourceType,
    quantity: actual,
  } as ResourceGatheredEvent];
}
