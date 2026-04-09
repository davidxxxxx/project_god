/**
 * world-bootstrap.ts — "Give me a playable opening" entry point.
 *
 * Wraps createWorld with procedural resource placement to produce
 * a reasonable starting world from just a seed and entity count.
 * Does NOT replace createWorld — golden scenarios still use it directly.
 */

import { createRNG, type Vec2 } from "@project-god/shared";
import type { WorldConfig } from "./create-world";
import type { TickContext } from "./tick";
import type { NeedDef, ResourceDef, ActionDef, TerrainDef, StructureDef, SkillDef, TechnologyDef } from "./content-types";

// ── Tuning constants ────────────────────────────────────────

/** Minimum number of berry resource nodes to place. */
const MIN_BERRY_NODES = 2;
/** Maximum number of berry resource nodes to place. */
const MAX_BERRY_NODES = 4;
/** Minimum number of water resource nodes to place. */
const MIN_WATER_NODES = 1;
/** Maximum number of water resource nodes to place. */
const MAX_WATER_NODES = 2;
/** Starting quantity per berry node. */
const BERRY_NODE_QUANTITY = 20;
/** Berry node regen per tick. */
const BERRY_REGEN_PER_TICK = 0.1;
/** Water node quantity (effectively infinite). */
const WATER_NODE_QUANTITY = 999;
/** Default map width. */
const DEFAULT_WIDTH = 20;
/** Default map height. */
const DEFAULT_HEIGHT = 20;
/** Minimum entity count. */
const MIN_ENTITIES = 3;
/** Maximum entity count. */
const MAX_ENTITIES = 10;

export interface BootstrapConfig {
  seed: number;
  entityCount?: number;
  width?: number;
  height?: number;
  needs: Record<string, NeedDef>;
  resources: Record<string, ResourceDef>;
  actions: Record<string, ActionDef>;
  terrain: Record<string, TerrainDef>;
  /** Optional structure definitions for building. */
  structures?: Record<string, StructureDef>;
  /** Optional skill definitions for learning system. */
  skills?: Record<string, SkillDef>;
  /** Optional technology definitions for tribe unlock. */
  technologies?: Record<string, TechnologyDef>;
}

export interface BootstrapResult {
  worldConfig: WorldConfig;
  tickContext: TickContext;
}

/**
 * Generate a playable world configuration from a seed.
 * Resource nodes are procedurally scattered on passable tiles
 * with minimum spacing to avoid clustering.
 */
export function bootstrapWorld(config: BootstrapConfig): BootstrapResult {
  const {
    seed,
    needs,
    resources,
    actions,
    terrain,
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
  } = config;

  const entityCount = clamp(
    config.entityCount ?? MIN_ENTITIES,
    MIN_ENTITIES,
    MAX_ENTITIES
  );

  const rng = createRNG(seed);

  // ── Identify passable tiles ───────────────────────────────
  const terrainKeys = Object.keys(terrain);
  const passableTerrain = terrainKeys.filter((k) => terrain[k].passable);

  // Generate a lightweight terrain grid to pick passable positions
  const passablePositions: Vec2[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = rng.pick(terrainKeys);
      if (terrain[t].passable) {
        passablePositions.push({ x, y });
      }
    }
  }

  // ── Place resource nodes ──────────────────────────────────
  // Scale node counts to entityCount so the map isn't resource-starved.
  // Berry nodes: at least as many as entities, capped at reasonable density.
  // Water nodes: at least 2 to ensure reachability.
  const berryCount = Math.max(MIN_BERRY_NODES, entityCount);
  const waterCount = Math.max(MIN_WATER_NODES, Math.ceil(entityCount / 3));

  const usedPositions = new Set<string>();
  const posKey = (p: Vec2) => `${p.x},${p.y}`;

  /** Pick a position with minimum spacing from already-used positions. */
  function pickSpacedPosition(minSpacing: number): Vec2 {
    // Try up to 50 times to find a well-spaced position
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = rng.pick(passablePositions);
      const key = posKey(candidate);
      if (usedPositions.has(key)) continue;

      let tooClose = false;
      for (const usedKey of usedPositions) {
        const [ux, uy] = usedKey.split(",").map(Number);
        const dist = Math.abs(candidate.x - ux) + Math.abs(candidate.y - uy);
        if (dist < minSpacing) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        usedPositions.add(key);
        return candidate;
      }
    }

    // Fallback: just pick any unused passable position
    const fallback = rng.pick(passablePositions);
    usedPositions.add(posKey(fallback));
    return fallback;
  }

  const resourceNodes: WorldConfig["resourceNodes"] = [];

  // Place berry nodes (quantity = 20 per node to sustain longer survival)
  for (let i = 0; i < berryCount; i++) {
    const pos = pickSpacedPosition(3);
    resourceNodes.push({
      position: pos,
      resourceType: "berry",
      quantity: BERRY_NODE_QUANTITY,
      maxQuantity: resources.berry?.maxQuantity ?? BERRY_NODE_QUANTITY,
      regenPerTick: BERRY_REGEN_PER_TICK,
    });
  }

  // Place water nodes
  for (let i = 0; i < waterCount; i++) {
    const pos = pickSpacedPosition(3);
    resourceNodes.push({
      position: pos,
      resourceType: "water",
      quantity: WATER_NODE_QUANTITY,
      maxQuantity: resources.water?.maxQuantity ?? -1,
      regenPerTick: 0,
    });
  }

  // ── Assemble WorldConfig ──────────────────────────────────
  const worldConfig: WorldConfig = {
    seed,
    width,
    height,
    entityCount,
    terrain,
    needs,
    resourceNodes,
    // No entityOverrides — let createWorld place them randomly on passable tiles
  };

  const tickContext: TickContext = {
    needs, resources, actions, terrain,
    structures: config.structures,
    skills: config.skills,
    technologies: config.technologies,
  };

  return { worldConfig, tickContext };
}

// ── Utility ─────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
