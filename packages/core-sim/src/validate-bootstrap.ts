/**
 * validate-bootstrap.ts — Opening legality check.
 *
 * Runs after bootstrapWorld / createWorld to verify the generated
 * world is not a dead-on-arrival configuration. If validation fails,
 * the caller should retry with a different seed.
 */

import {
  WorldState, EntityState, ResourceNodeState, manhattan,
} from "@project-god/shared";

// ── Tuning constants ────────────────────────────────────────

/** Max manhattan distance for a resource to be "reachable" at opening. */
const REACHABLE_RADIUS = 15;
/** Minimum total berry quantity across all nodes to avoid starvation. */
const MIN_BERRY_QUANTITY_PER_ENTITY = 15;
/** Minimum number of water nodes required. */
const MIN_WATER_NODES = 1;

export interface BootstrapValidation {
  valid: boolean;
  violations: string[];
}

/**
 * Validate a freshly created world for opening legality.
 * Returns `{ valid: true, violations: [] }` if the world is playable.
 */
export function validateBootstrap(
  world: WorldState,
  terrain: Record<string, { passable: boolean }>
): BootstrapValidation {
  const violations: string[] = [];
  const entities = Object.values(world.entities) as EntityState[];
  const resources = Object.values(world.resourceNodes) as ResourceNodeState[];

  // ── Check 1: Entities on passable tiles ───────────────────
  for (const entity of entities) {
    const tileId = `${entity.position.x},${entity.position.y}`;
    const tile = world.tiles[tileId];
    if (!tile) {
      violations.push(`${entity.id} spawned outside map bounds at (${entity.position.x},${entity.position.y})`);
      continue;
    }
    const terrainDef = terrain[tile.terrain];
    if (!terrainDef || !terrainDef.passable) {
      violations.push(`${entity.id} spawned on impassable terrain '${tile.terrain}' at (${entity.position.x},${entity.position.y})`);
    }
  }

  // ── Check 2: Resource reachability ────────────────────────
  // Each entity should have at least one berry OR water within REACHABLE_RADIUS
  for (const entity of entities) {
    const reachable = resources.filter(
      (r) => r.quantity > 0 && manhattan(entity.position, r.position) <= REACHABLE_RADIUS
    );
    if (reachable.length === 0) {
      violations.push(`${entity.id} has no reachable resources within ${REACHABLE_RADIUS} steps`);
    }
  }

  // ── Check 3: Sufficient berry supply ──────────────────────
  const totalBerry = resources
    .filter((r) => r.resourceType === "berry")
    .reduce((sum, r) => sum + r.quantity, 0);
  const requiredBerry = entities.length * MIN_BERRY_QUANTITY_PER_ENTITY;

  if (totalBerry < requiredBerry) {
    violations.push(
      `Insufficient berry supply: ${totalBerry} total, need at least ${requiredBerry} (${entities.length} entities × ${MIN_BERRY_QUANTITY_PER_ENTITY})`
    );
  }

  // ── Check 4: At least one water node exists ───────────────
  const waterNodes = resources.filter((r) => r.resourceType === "water");
  if (waterNodes.length < MIN_WATER_NODES) {
    violations.push(
      `Only ${waterNodes.length} water node(s), need at least ${MIN_WATER_NODES}`
    );
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
