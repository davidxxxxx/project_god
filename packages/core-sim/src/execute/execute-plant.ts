/**
 * execute-plant.ts — MVP-02Y: Plant a berry bush.
 *
 * Removes 1 berry from inventory, creates a new resource node at entity position.
 * The new bush starts with low quantity and regenerates naturally.
 */

import {
  ValidatedAction, WorldState, SimEvent,
  ResourceNodeId, ResourceNodeState,
} from "@project-god/shared";

export function executePlant(
  action: ValidatedAction,
  world: WorldState
): SimEvent[] {
  const entity = world.entities[action.intent.actorId];
  if (!entity || !entity.alive) return [];

  // Remove 1 berry from inventory
  entity.inventory["berry"] = (entity.inventory["berry"] ?? 0) - 1;
  if (entity.inventory["berry"] <= 0) {
    delete entity.inventory["berry"];
  }

  // Create new resource node
  const existingCount = Object.keys(world.resourceNodes).length;
  const newId = `rnode_planted_${existingCount}` as ResourceNodeId;
  const newNode: ResourceNodeState = {
    id: newId,
    position: { ...entity.position },
    resourceType: "berry",
    quantity: 3,       // Starts with fewer berries than natural
    maxQuantity: 8,    // Smaller max than wild bushes (10)
    regenPerTick: 0.08, // Slower regen than wild (0.12)
  };

  world.resourceNodes[newId] = newNode;

  // Skill gain
  if (!entity.skills) entity.skills = {};
  const current = entity.skills["planting"] ?? 0;
  entity.skills["planting"] = Math.min(1.0, current + 0.05);

  return [{
    type: "RESOURCE_PLANTED",
    tick: world.tick,
    entityId: entity.id,
    nodeId: newId,
    resourceType: "berry",
    position: { ...entity.position },
  } as unknown as SimEvent];
}
