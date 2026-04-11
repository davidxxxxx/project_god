/**
 * fog-of-war.ts — Dota-style fog of war computation.
 *
 * Each tick, computes the union of all alive agents' vision circles.
 * Tiles within any agent's vision are "visible".
 * Tiles previously visible but not now are "explored" (dimmed).
 * Tiles never seen are "unexplored" (black).
 *
 * The player (god) sees ONLY what their agents can see,
 * creating a mutual dependency: losing agents = losing vision.
 */

import { WorldState, EntityState, TimeOfDay, chebyshev } from "@project-god/shared";
import { VISION_RADIUS } from "./environment-tick";

// ── Public Types ────────────────────────────────────────────

/** Per-tick fog computation result. */
export interface FogState {
  /** Set of tileKeys currently visible by any alive agent. */
  visibleTiles: Set<string>;
  /** Vision radius used this tick (based on time of day). */
  currentVisionRadius: number;
}

// ── Computation ─────────────────────────────────────────────

/**
 * Compute fog of war for the current tick.
 *
 * Algorithm:
 * 1. Determine vision radius from time of day
 * 2. For each alive agent, mark all tiles within chebyshev(pos, radius) as visible
 * 3. Mark newly visible tiles as "explored" in world.exploredTiles (persistent)
 *
 * @returns FogState with the set of currently visible tiles
 */
export function computeFogOfWar(world: WorldState): FogState {
  const timeOfDay: TimeOfDay = world.environment?.timeOfDay ?? "day";
  const radius = VISION_RADIUS[timeOfDay];
  const visibleTiles = new Set<string>();

  // Ensure exploredTiles exists
  if (!world.exploredTiles) {
    world.exploredTiles = {};
  }

  // Union of all alive agents' vision circles
  for (const entity of Object.values(world.entities) as EntityState[]) {
    if (!entity.alive) continue;

    const cx = entity.position.x;
    const cy = entity.position.y;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        // Use chebyshev distance (square vision, like king moves in chess)
        if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;

        const tx = cx + dx;
        const ty = cy + dy;

        // Bounds check
        if (tx < 0 || ty < 0 || tx >= world.width || ty >= world.height) continue;

        const key = `${tx},${ty}`;
        visibleTiles.add(key);

        // Permanently mark as explored
        world.exploredTiles[key] = true;
      }
    }
  }

  return { visibleTiles, currentVisionRadius: radius };
}
