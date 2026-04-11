/**
 * validate-wade.ts — Validates a wade action intent (MVP-03).
 *
 * Wade = attempting to cross shallow_river terrain.
 * Validation rules:
 *   - Entity must be alive, adult, HP > 20
 *   - Must be on riverbank, shallow_river, or adjacent passable land
 *   - Target must be shallow_river, riverbank, or adjacent passable tile
 *   - Cannot wade at night (too dangerous)
 *   - Movement cooldown must have expired
 */

import { ActionIntent, RejectedAction, ValidatedAction, WorldState, chebyshev, tileKey } from "@project-god/shared";
import type { TerrainDef } from "../content-types";

/** Minimum HP required to attempt wading. */
const MIN_WADE_HP = 20;

/** Terrain types that are part of the crossing zone. */
const CROSSING_TERRAIN = new Set(["shallow_river", "riverbank"]);

export function validateWade(
  intent: ActionIntent,
  world: WorldState,
  terrain: Record<string, TerrainDef>
): ValidatedAction | RejectedAction {
  const entity = world.entities[intent.actorId];

  if (!entity || !entity.alive) {
    return { kind: "rejected", intent, reason: "Entity not found or dead" };
  }

  if (!intent.position) {
    return { kind: "rejected", intent, reason: "Wade requires target position" };
  }

  // Must be adjacent (1 tile)
  if (chebyshev(entity.position, intent.position) !== 1) {
    return { kind: "rejected", intent, reason: "Wade target must be exactly 1 tile away" };
  }

  // Movement cooldown check
  if (entity.moveCooldownUntil && entity.moveCooldownUntil > world.tick) {
    return {
      kind: "rejected",
      intent,
      reason: `movement cooldown (${entity.moveCooldownUntil - world.tick} ticks remaining)`,
    };
  }

  // HP gate
  if ((entity.needs.hp ?? 100) <= MIN_WADE_HP) {
    return { kind: "rejected", intent, reason: `HP too low to wade (${entity.needs.hp} ≤ ${MIN_WADE_HP})` };
  }

  // Child gate: children cannot wade (too dangerous)
  if (entity.statuses?.includes("child")) {
    return { kind: "rejected", intent, reason: "Children cannot wade" };
  }

  // Night gate
  const timeOfDay = world.environment?.timeOfDay ?? "day";
  if (timeOfDay === "night") {
    return { kind: "rejected", intent, reason: "Too dangerous to wade at night" };
  }

  // Source tile: must be riverbank, shallow_river, or adjacent passable
  const srcKey = tileKey(entity.position.x, entity.position.y);
  const srcTile = world.tiles[srcKey];
  const srcTerrain = srcTile?.terrain ?? "";

  // Target tile: must exist and be shallow_river OR passable land on the far side
  const dstKey = tileKey(intent.position.x, intent.position.y);
  const dstTile = world.tiles[dstKey];
  if (!dstTile) {
    return { kind: "rejected", intent, reason: "Wade target outside map bounds" };
  }

  const dstTerrain = dstTile.terrain;
  const dstDef = terrain[dstTerrain];

  // Target must be shallow_river, riverbank, or any passable terrain
  // (to allow stepping OUT of shallow_river onto the far bank)
  if (!dstDef || (!dstDef.passable && !CROSSING_TERRAIN.has(dstTerrain))) {
    return { kind: "rejected", intent, reason: `Cannot wade to '${dstTerrain}'` };
  }

  // At least one of src/dst must be shallow_river (can't "wade" between two dry tiles)
  if (!CROSSING_TERRAIN.has(srcTerrain) && !CROSSING_TERRAIN.has(dstTerrain)) {
    return { kind: "rejected", intent, reason: "Wade requires being near water (riverbank or shallow_river)" };
  }

  return {
    kind: "validated",
    intent,
    energyCost: 15,
    timeCost: 3,
  };
}
