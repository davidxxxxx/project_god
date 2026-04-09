import { ActionIntent, RejectedAction, ValidatedAction, WorldState, chebyshev, tileKey } from "@project-god/shared";
import type { TerrainDef } from "../content-types";

/**
 * validate-move.ts — Validates a move action intent.
 *
 * MVP-02Y: Checks terrain-based movement cooldown.
 * If the entity recently moved onto costly terrain, they must wait.
 */
export function validateMove(
  intent: ActionIntent,
  world: WorldState,
  terrain: Record<string, TerrainDef>
): ValidatedAction | RejectedAction {
  const entity = world.entities[intent.actorId];

  if (!intent.position) {
    return { kind: "rejected", intent, reason: "Move requires target position" };
  }

  // MVP-02Y: Terrain movement cooldown — entity must wait after moving onto costly terrain
  if (entity.moveCooldownUntil && entity.moveCooldownUntil > world.tick) {
    return {
      kind: "rejected",
      intent,
      reason: `movement cooldown (${entity.moveCooldownUntil - world.tick} ticks remaining)`,
    };
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

  return {
    kind: "validated",
    intent,
    energyCost: 5 * terrainDef.moveCostMultiplier,
    timeCost: Math.ceil(terrainDef.moveCostMultiplier),
  };
}
