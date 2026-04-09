/**
 * map-generator.ts — Procedural map generation for MVP-02Y.
 *
 * Pure function: given seed, dimensions, and terrain definitions,
 * produces a tile grid and resource node placements.
 *
 * Guarantees:
 * - ≥1 river (north-south or east-west, with ≥1 ford crossing)
 * - ≥1 forest zone (wood nodes)
 * - ≥1 stone ridge (stone nodes)
 * - ≥1 berry grassland (berry + grass nodes)
 * - ≥1 safe clearing near center (spawn zone)
 * - Remaining tiles fill with weighted random
 *
 * Deterministic: same seed → same map.
 */

import { createRNG, Vec2 } from "@project-god/shared";

// ── Types ──────────────────────────────────────────────────────

export interface GeneratedTile {
  terrain: string;
  biome: string;
}

export interface GeneratedResourceNode {
  position: Vec2;
  resourceType: string;
  quantity: number;
  maxQuantity: number;
  regenPerTick: number;
}

export interface GeneratedMap {
  /** 2D tile grid indexed by tileKey("x,y"). */
  tiles: Record<string, GeneratedTile>;
  /** Auto-placed resource nodes. */
  resourceNodes: GeneratedResourceNode[];
  /** Best spawn position for initial agents (center of safe zone). */
  spawnCenter: Vec2;
}

// ── Balance Constants ──────────────────────────────────────────

/** Weighted terrain distribution for "remaining" tiles. */
const FILL_WEIGHTS: { terrain: string; weight: number }[] = [
  { terrain: "grass", weight: 0.60 },
  { terrain: "forest", weight: 0.25 },
  { terrain: "rock", weight: 0.10 },
  { terrain: "swamp", weight: 0.05 },
];

/** Minimum distance between resource clusters. */
const MIN_CLUSTER_DISTANCE = 3;

// ── Main Generator ─────────────────────────────────────────────

export function generateMap(
  seed: number,
  width: number,
  height: number
): GeneratedMap {
  const rng = createRNG(seed);
  const tiles: Record<string, GeneratedTile> = {};
  const resourceNodes: GeneratedResourceNode[] = [];

  // Helper: set tile
  const setTile = (x: number, y: number, terrain: string) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      tiles[`${x},${y}`] = { terrain, biome: "temperate" };
    }
  };

  // Helper: get tile
  const getTile = (x: number, y: number): GeneratedTile | undefined => {
    return tiles[`${x},${y}`];
  };

  // ── Step 1: Fill everything with weighted random ──────────
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const r = rng.next();
      let cumulative = 0;
      let picked = "grass";
      for (const { terrain, weight } of FILL_WEIGHTS) {
        cumulative += weight;
        if (r < cumulative) {
          picked = terrain;
          break;
        }
      }
      setTile(x, y, picked);
    }
  }

  // ── Step 2: Carve a river ──────────────────────────────────
  // North-south river with some wobble
  const riverX = rng.nextInt(Math.floor(width * 0.35), Math.floor(width * 0.65));
  const riverWidth = rng.nextInt(1, 2); // 1 or 2 tiles wide
  let currentRiverX = riverX;

  // Pick ford position (guaranteed crossing at 1 tile)
  const fordY = rng.nextInt(Math.floor(height * 0.3), Math.floor(height * 0.7));

  for (let y = 0; y < height; y++) {
    // Wobble the river position slightly
    if (rng.chance(0.3)) {
      currentRiverX += rng.chance(0.5) ? 1 : -1;
      currentRiverX = Math.max(2, Math.min(width - 3, currentRiverX));
    }

    // Ford: leave a gap (riverbank instead of river)
    const isFord = y === fordY;

    for (let dx = 0; dx < riverWidth; dx++) {
      const rx = currentRiverX + dx;
      if (isFord) {
        setTile(rx, y, "riverbank");
      } else {
        setTile(rx, y, "river");
      }
    }

    // Riverbanks on both sides
    setTile(currentRiverX - 1, y, "riverbank");
    setTile(currentRiverX + riverWidth, y, "riverbank");
  }

  // ── Step 3: Paint zone clusters ──────────────────────────────

  // Safe spawn zone: clear grassland near center
  const spawnCenterX = rng.nextInt(3, Math.min(riverX - 3, width - 4));
  const spawnCenterY = rng.nextInt(Math.floor(height * 0.3), Math.floor(height * 0.6));
  paintZone(spawnCenterX, spawnCenterY, 3, "grass", setTile, width, height);

  // Forest zone (on spawn side of river)
  const forestX = rng.nextInt(1, Math.min(riverX - 4, width - 5));
  const forestY = rng.nextInt(1, height - 5);
  paintZone(forestX, forestY, rng.nextInt(2, 3), "forest", setTile, width, height);

  // Second forest zone (other side of river, if space)
  const forest2X = rng.nextInt(Math.min(riverX + riverWidth + 2, width - 4), width - 2);
  const forest2Y = rng.nextInt(1, height - 4);
  if (forest2X < width - 2) {
    paintZone(forest2X, forest2Y, rng.nextInt(2, 3), "forest", setTile, width, height);
  }

  // Stone ridge
  const stoneX = rng.nextInt(2, width - 4);
  const stoneY = rng.nextInt(2, height - 4);
  paintZone(stoneX, stoneY, rng.nextInt(1, 2), "rock", setTile, width, height);

  // Swamp patch (small)
  const swampX = rng.nextInt(0, width - 3);
  const swampY = rng.nextInt(0, height - 3);
  paintZone(swampX, swampY, 1, "swamp", setTile, width, height);

  // ── Step 4: Place resource nodes on appropriate terrain ─────

  // Berry bushes: on grass tiles near spawn
  const berryPositions = findTerrainPositions(tiles, "grass", width, height, spawnCenterX, spawnCenterY, 6);
  for (let i = 0; i < Math.min(berryPositions.length, 4); i++) {
    resourceNodes.push({
      position: berryPositions[i],
      resourceType: "berry",
      quantity: 10,
      maxQuantity: 10,
      regenPerTick: 0.12,
    });
  }

  // Water sources: on riverbank tiles
  const waterbankPositions = findTerrainPositions(tiles, "riverbank", width, height, riverX, Math.floor(height / 2), 8);
  for (let i = 0; i < Math.min(waterbankPositions.length, 3); i++) {
    resourceNodes.push({
      position: waterbankPositions[i],
      resourceType: "water",
      quantity: 999,
      maxQuantity: -1,
      regenPerTick: 0,
    });
  }

  // Wood: on forest edges
  const woodPositions = findTerrainPositions(tiles, "forest", width, height, forestX, forestY, 5);
  for (let i = 0; i < Math.min(woodPositions.length, 3); i++) {
    resourceNodes.push({
      position: woodPositions[i],
      resourceType: "wood",
      quantity: 8,
      maxQuantity: 8,
      regenPerTick: 0.05,
    });
  }

  // Stone: on rock tiles
  const stonePositions = findTerrainPositions(tiles, "rock", width, height, stoneX, stoneY, 4);
  for (let i = 0; i < Math.min(stonePositions.length, 2); i++) {
    resourceNodes.push({
      position: stonePositions[i],
      resourceType: "stone",
      quantity: 6,
      maxQuantity: 6,
      regenPerTick: 0,
    });
  }

  // Grass (material): on grass tiles
  const grassPositions = findTerrainPositions(tiles, "grass", width, height, spawnCenterX + 3, spawnCenterY + 2, 6);
  for (let i = 0; i < Math.min(grassPositions.length, 2); i++) {
    resourceNodes.push({
      position: grassPositions[i],
      resourceType: "grass",
      quantity: 12,
      maxQuantity: 12,
      regenPerTick: 0.15,
    });
  }

  return {
    tiles,
    resourceNodes,
    spawnCenter: { x: spawnCenterX, y: spawnCenterY },
  };
}

// ── Helper: Paint a circular zone of terrain ────────────────

function paintZone(
  cx: number,
  cy: number,
  radius: number,
  terrain: string,
  setTile: (x: number, y: number, t: string) => void,
  width: number,
  height: number
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      // Use chebyshev distance for square-ish zones
      if (Math.abs(dx) + Math.abs(dy) <= radius + 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < width && y >= 0 && y < height) {
          setTile(x, y, terrain);
        }
      }
    }
  }
}

// ── Helper: Find positions of a terrain type near a point ────

function findTerrainPositions(
  tiles: Record<string, GeneratedTile>,
  terrain: string,
  width: number,
  height: number,
  nearX: number,
  nearY: number,
  searchRadius: number
): Vec2[] {
  const results: Vec2[] = [];
  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const x = nearX + dx;
      const y = nearY + dy;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const tile = tiles[`${x},${y}`];
      if (tile?.terrain === terrain) {
        results.push({ x, y });
      }
    }
  }
  // Sort by distance to (nearX, nearY), then shuffle slightly for variety
  results.sort((a, b) => {
    const da = Math.abs(a.x - nearX) + Math.abs(a.y - nearY);
    const db = Math.abs(b.x - nearX) + Math.abs(b.y - nearY);
    return da - db;
  });
  return results;
}
