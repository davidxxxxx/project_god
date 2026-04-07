/**
 * perception.ts — Builds an agent's view of the world.
 * Patch 2: simple radius scan. No occlusion, no memory.
 */

import { EntityState, ResourceNodeState, WorldState, manhattan } from "@project-god/shared";

export interface AgentSnapshot {
  self: EntityState;
  nearbyResources: ResourceNodeState[];
}

const PERCEPTION_RADIUS = 10;

export function perceive(
  entityId: string,
  world: WorldState,
  radius: number = PERCEPTION_RADIUS
): AgentSnapshot {
  const self = world.entities[entityId];

  const nearbyResources = Object.values(world.resourceNodes).filter(
    (node: ResourceNodeState) => node.quantity > 0 && manhattan(self.position, node.position) <= radius
  );

  return { self, nearbyResources };
}
