/**
 * execute-move.ts — Moves entity to target tile.
 *
 * MVP-02Y: Sets moveCooldownUntil based on destination terrain cost.
 * grass(1) = no delay, forest(1.5) = 1 tick, swamp(3) = 2 ticks.
 */

import {
  ValidatedAction, WorldState, SimEvent, EntityMovedEvent,
  tileKey,
} from "@project-god/shared";
import type { TerrainDef } from "../content-types";

export function executeMove(
  action: ValidatedAction,
  world: WorldState,
  terrainDefs?: Record<string, TerrainDef>
): SimEvent[] {
  const entity = world.entities[action.intent.actorId];
  if (!entity || !entity.alive) return [];

  const from = { ...entity.position };
  const to = action.intent.position!;
  entity.position = { ...to };

  // MVP-02Y: Apply terrain-based movement cooldown
  if (terrainDefs) {
    const destKey = tileKey(to.x, to.y);
    const destTile = world.tiles[destKey];
    if (destTile) {
      const moveCost = terrainDefs[destTile.terrain]?.moveCostMultiplier ?? 1;
      // Cooldown ticks = floor(moveCost) - 1 (grass=0, forest=0, rock=0, swamp=2)
      // For fractional costs: forest(1.5) → 1 tick, riverbank(1.3) → 1 tick
      const cooldownTicks = Math.max(0, Math.ceil(moveCost) - 1);
      if (cooldownTicks > 0) {
        entity.moveCooldownUntil = world.tick + cooldownTicks;
      } else {
        entity.moveCooldownUntil = undefined;
      }
    }
  }

  return [{
    type: "ENTITY_MOVED",
    tick: world.tick,
    entityId: entity.id,
    from,
    to,
  } as EntityMovedEvent];
}
