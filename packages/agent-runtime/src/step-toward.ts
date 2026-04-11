/**
 * step-toward.ts — Terrain-aware single-step pathfinding utility.
 *
 * Computes the best adjacent tile to move toward a distant goal.
 * Used by both the rule-based policy and the LLM plan translator
 * to decompose far-distance goals into valid single-tile moves.
 *
 * Algorithm: evaluates all 8 neighbors, filters out impassable tiles,
 * picks the one minimizing: manhattan(candidate, goal) + terrainCostPenalty.
 */

import type { Vec2, WorldState } from "@project-god/shared";
import { manhattan, samePos } from "@project-god/shared";

/** How much terrain cost matters vs straight-line distance. */
const TERRAIN_COST_WEIGHT = 1.5;

/**
 * Compute the best adjacent tile to step toward a goal position.
 *
 * @param from Current entity position
 * @param to   Goal position (may be far away)
 * @param tiles World tiles for terrain lookup (optional)
 * @param terrainDefs Terrain definition map (optional)
 * @returns Adjacent tile that brings the entity closer to the goal
 */
export function stepToward(
  from: Vec2,
  to: Vec2,
  tiles?: Record<string, { terrain: string }>,
  terrainDefs?: Record<string, { moveCostMultiplier: number; passable: boolean }>,
): Vec2 {
  // Already there
  if (samePos(from, to)) return from;

  // Fast path: no terrain data, use simple sign-based step
  if (!tiles || !terrainDefs) {
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    return { x: from.x + dx, y: from.y + dy };
  }

  // Generate all 8 adjacent candidates
  const candidates: { pos: Vec2; score: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const cx = from.x + dx;
      const cy = from.y + dy;
      const key = `${cx},${cy}`;
      const tile = tiles[key];
      if (!tile) continue; // out of bounds

      const tDef = terrainDefs[tile.terrain];
      if (!tDef || !tDef.passable) continue; // impassable

      const distToTarget = manhattan({ x: cx, y: cy }, to);
      const terrainPenalty = (tDef.moveCostMultiplier - 1) * TERRAIN_COST_WEIGHT;
      candidates.push({
        pos: { x: cx, y: cy },
        score: distToTarget + terrainPenalty,
      });
    }
  }

  if (candidates.length === 0) return from; // stuck — no passable neighbor

  // Pick lowest score (closest to goal with least terrain cost)
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0].pos;
}

/**
 * Overload that extracts tiles/terrain from a WorldState.
 * Convenience for the plan translator in decide.ts.
 */
export function stepTowardWorld(
  from: Vec2,
  to: Vec2,
  world: WorldState,
  terrainDefs?: Record<string, { moveCostMultiplier: number; passable: boolean }>,
): Vec2 {
  return stepToward(from, to, world.tiles as any, terrainDefs);
}
