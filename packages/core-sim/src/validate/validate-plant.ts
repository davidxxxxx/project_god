/**
 * validate-plant.ts — MVP-02Y: Validates a plant action.
 *
 * Requirements:
 * - Entity has "planting" skill
 * - Entity has ≥1 berry in inventory
 * - Current tile has fertility > 0.3
 * - No existing resource node at this position
 */

import { ActionIntent, RejectedAction, ValidatedAction, WorldState, ResourceNodeState } from "@project-god/shared";
import type { TerrainDef } from "../content-types";

export function validatePlant(
  intent: ActionIntent,
  world: WorldState,
  terrain: Record<string, TerrainDef>
): ValidatedAction | RejectedAction {
  const entity = world.entities[intent.actorId];

  // Requires planting skill
  if (!entity.skills || (entity.skills["planting"] ?? 0) <= 0) {
    return { kind: "rejected", intent, reason: "Requires planting skill" };
  }

  // Requires berry in inventory
  if ((entity.inventory["berry"] ?? 0) < 1) {
    return { kind: "rejected", intent, reason: "Requires berry to plant" };
  }

  // Check tile fertility
  const tileKey = `${entity.position.x},${entity.position.y}`;
  const tile = world.tiles[tileKey];
  if (!tile) {
    return { kind: "rejected", intent, reason: "No tile at current position" };
  }

  const terrainDef = terrain[tile.terrain];
  if (!terrainDef || terrainDef.fertility <= 0.3) {
    return { kind: "rejected", intent, reason: `Terrain '${tile.terrain}' has insufficient fertility (${terrainDef?.fertility ?? 0})` };
  }

  // No existing resource node at this position
  const existingNode = Object.values(world.resourceNodes).find(
    (n: any) => n.position.x === entity.position.x && n.position.y === entity.position.y
  );
  if (existingNode) {
    return { kind: "rejected", intent, reason: "Resource node already exists at this position" };
  }

  return { kind: "validated", intent, energyCost: 10, timeCost: 1 };
}
