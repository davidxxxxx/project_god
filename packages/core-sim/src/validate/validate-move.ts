import { ActionIntent, RejectedAction, ValidatedAction, WorldState, chebyshev, tileKey } from "@project-god/shared";
import type { TerrainDef } from "../content-types";

export function validateMove(
  intent: ActionIntent,
  world: WorldState,
  terrain: Record<string, TerrainDef>
): ValidatedAction | RejectedAction {
  const entity = world.entities[intent.actorId];

  if (!intent.position) {
    return { kind: "rejected", intent, reason: "Move requires target position" };
  }

  if (chebyshev(entity.position, intent.position) !== 1) {
    return { kind: "rejected", intent, reason: "Move target must be exactly 1 tile away" };
  }

  const key = tileKey(intent.position.x, intent.position.y);
  const tile = world.tiles[key];
  if (!tile) {
    return { kind: "rejected", intent, reason: "Move target outside map bounds" };
  }

  const terrainDef = terrain[tile.terrain];
  if (!terrainDef || !terrainDef.passable) {
    return { kind: "rejected", intent, reason: `Terrain '${tile.terrain}' is impassable` };
  }

  return { kind: "validated", intent, energyCost: 5 * terrainDef.moveCostMultiplier, timeCost: 1 };
}
