/**
 * map-generator.ts — Procedural map generation for MVP-02Y + MVP-03.
 *
 * Pure function: given seed, dimensions, and terrain definitions,
 * produces a tile grid and resource node placements.
 *
 * Guarantees:
 * - A continuous north-south river dividing map into LEFT and RIGHT banks
 * - 1-2 shallow fords (only crossing points)
 * - LEFT bank: spawn zone, moderate resources (scarcity pressure)
 * - RIGHT bank: richer resources (discovery reward)
 * - Zone painting NEVER overwrites river/bank tiles
 * - Deterministic: same seed → same map
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

/** Terrain types that form the river barrier — never overwritten by zone painting. */
const RIVER_TERRAIN = new Set(["river", "riverbank", "shallow_river"]);

// ── Main Generator ─────────────────────────────────────────────

export function generateMap(
  seed: number,
  width: number,
  height: number
): GeneratedMap {
  const rng = createRNG(seed);
  const tiles: Record<string, GeneratedTile> = {};
  const resourceNodes: GeneratedResourceNode[] = [];

  // Helper: set tile (unconditional)
  const setTile = (x: number, y: number, terrain: string) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      tiles[`${x},${y}`] = { terrain, biome: "temperate" };
    }
  };

  // Helper: set tile only if NOT a protected river tile
  const setTileSafe = (x: number, y: number, terrain: string) => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      const key = `${x},${y}`;
      const existing = tiles[key];
      if (existing && RIVER_TERRAIN.has(existing.terrain)) return; // PROTECT river
      tiles[key] = { terrain, biome: "temperate" };
    }
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

  // ── Step 2: Carve a CONTINUOUS river ─────────────────────────
  // River runs full north-to-south with very limited wobble
  // to guarantee an unbroken barrier.

  const RIVER_WIDTH = 2; // 2 tiles wide for visual clarity
  // Place river clearly in the middle band
  const riverCenterX = rng.nextInt(
    Math.floor(width * 0.40),
    Math.floor(width * 0.55)
  );

  // Track river X per row for bank boundary calculations
  const riverXPerRow: number[] = [];
  let currentRiverX = riverCenterX;

  // Pick ford positions
  const fordY1 = rng.nextInt(Math.floor(height * 0.25), Math.floor(height * 0.45));
  const fordY2 = rng.chance(0.5)
    ? rng.nextInt(Math.floor(height * 0.60), Math.floor(height * 0.85))
    : -1;

  for (let y = 0; y < height; y++) {
    // Very limited wobble: 20% chance, clamped tightly
    if (rng.chance(0.2)) {
      currentRiverX += rng.chance(0.5) ? 1 : -1;
      currentRiverX = Math.max(
        Math.floor(width * 0.30),
        Math.min(Math.floor(width * 0.60), currentRiverX)
      );
    }
    riverXPerRow[y] = currentRiverX;

    const isFord = y === fordY1 || y === fordY2;

    // Paint river tiles
    for (let dx = 0; dx < RIVER_WIDTH; dx++) {
      const rx = currentRiverX + dx;
      setTile(rx, y, isFord ? "shallow_river" : "river");
    }

    // Riverbanks on both sides
    setTile(currentRiverX - 1, y, "riverbank");
    setTile(currentRiverX + RIVER_WIDTH, y, "riverbank");
  }

  // Compute stable bank boundaries
  const riverMinX = Math.min(...riverXPerRow);
  const riverMaxX = Math.max(...riverXPerRow) + RIVER_WIDTH;
  const leftBankMaxX = riverMinX - 2;  // safe left boundary
  const rightBankMinX = riverMaxX + 1; // safe right boundary

  // ── Step 3: Paint zone clusters (SAFE — won't overwrite river) ──

  // --- LEFT BANK zones ---

  // Spawn zone: grassland
  const spawnCenterX = Math.max(2, Math.min(leftBankMaxX - 1,
    rng.nextInt(2, Math.max(3, leftBankMaxX))
  ));
  const spawnCenterY = rng.nextInt(Math.floor(height * 0.3), Math.floor(height * 0.6));
  paintZoneSafe(spawnCenterX, spawnCenterY, 3, "grass", setTileSafe, width, height);

  // Forest zone
  const forestX = Math.max(1, Math.min(leftBankMaxX - 1,
    rng.nextInt(1, Math.max(2, leftBankMaxX))
  ));
  const forestY = rng.nextInt(1, height - 4);
  paintZoneSafe(forestX, forestY, rng.nextInt(2, 3), "forest", setTileSafe, width, height);

  // Stone ridge (small)
  const stoneX = Math.max(1, Math.min(leftBankMaxX,
    rng.nextInt(1, Math.max(2, leftBankMaxX + 1))
  ));
  const stoneY = rng.nextInt(2, height - 3);
  paintZoneSafe(stoneX, stoneY, 1, "rock", setTileSafe, width, height);

  // Swamp (small)
  const swampX = Math.max(0, Math.min(leftBankMaxX,
    rng.nextInt(0, Math.max(1, leftBankMaxX + 1))
  ));
  const swampY = rng.nextInt(0, height - 2);
  paintZoneSafe(swampX, swampY, 1, "swamp", setTileSafe, width, height);

  // --- RIGHT BANK zones ---

  // Large forest (richer)
  const forest2X = Math.max(rightBankMinX + 1, Math.min(width - 3,
    rng.nextInt(rightBankMinX, width - 2)
  ));
  const forest2Y = rng.nextInt(1, height - 4);
  paintZoneSafe(forest2X, forest2Y, rng.nextInt(3, 4), "forest", setTileSafe, width, height);

  // Extra grassland for far-bank berry
  const rightGrassX = Math.max(rightBankMinX, Math.min(width - 3,
    rng.nextInt(rightBankMinX, width - 2)
  ));
  const rightGrassY = rng.nextInt(Math.floor(height * 0.2), Math.floor(height * 0.7));
  paintZoneSafe(rightGrassX, rightGrassY, 2, "grass", setTileSafe, width, height);

  // ── Step 4: Place resource nodes on correct banks ─────────

  // === LEFT BANK: moderate resources ===

  const leftBerryPos = findTerrainOnBank(tiles, "grass", width, height, 0, leftBankMaxX, spawnCenterX, spawnCenterY, 8);
  for (let i = 0; i < Math.min(leftBerryPos.length, 3); i++) {
    resourceNodes.push({
      position: leftBerryPos[i],
      resourceType: "berry",
      quantity: 7,
      maxQuantity: 7,
      regenPerTick: 0.10,
    });
  }

  // Water on left riverbank
  const leftWaterPos = findTerrainOnBank(tiles, "riverbank", width, height, 0, riverMinX, riverMinX - 1, Math.floor(height / 2), 12);
  for (let i = 0; i < Math.min(leftWaterPos.length, 3); i++) {
    resourceNodes.push({
      position: leftWaterPos[i],
      resourceType: "water",
      quantity: 999,
      maxQuantity: -1,
      regenPerTick: 0,
    });
  }

  // Wood on left bank
  const leftWoodPos = findTerrainOnBank(tiles, "forest", width, height, 0, leftBankMaxX, forestX, forestY, 8);
  for (let i = 0; i < Math.min(leftWoodPos.length, 2); i++) {
    resourceNodes.push({
      position: leftWoodPos[i],
      resourceType: "wood",
      quantity: 6,
      maxQuantity: 6,
      regenPerTick: 0.04,
    });
  }

  // Stone on left bank
  const leftStonePos = findTerrainOnBank(tiles, "rock", width, height, 0, leftBankMaxX, stoneX, stoneY, 8);
  for (let i = 0; i < Math.min(leftStonePos.length, 2); i++) {
    resourceNodes.push({
      position: leftStonePos[i],
      resourceType: "stone",
      quantity: 5,
      maxQuantity: 5,
      regenPerTick: 0,
    });
  }

  // Grass material on left bank
  const leftGrassPos = findTerrainOnBank(tiles, "grass", width, height, 0, leftBankMaxX, spawnCenterX + 2, spawnCenterY + 2, 8);
  for (let i = 0; i < Math.min(leftGrassPos.length, 2); i++) {
    resourceNodes.push({
      position: leftGrassPos[i],
      resourceType: "grass",
      quantity: 12,
      maxQuantity: 12,
      regenPerTick: 0.15,
    });
  }

  // === RIGHT BANK: richer resources (reward) ===

  const rightBerryPos = findTerrainOnBank(tiles, "grass", width, height, rightBankMinX, width - 1, rightGrassX, rightGrassY, 12);
  for (let i = 0; i < Math.min(rightBerryPos.length, 3); i++) {
    resourceNodes.push({
      position: rightBerryPos[i],
      resourceType: "berry",
      quantity: 15,
      maxQuantity: 15,
      regenPerTick: 0.18,
    });
  }

  // Water on right riverbank
  const rightWaterPos = findTerrainOnBank(tiles, "riverbank", width, height, riverMaxX, width - 1, riverMaxX, Math.floor(height / 2), 12);
  for (let i = 0; i < Math.min(rightWaterPos.length, 2); i++) {
    resourceNodes.push({
      position: rightWaterPos[i],
      resourceType: "water",
      quantity: 999,
      maxQuantity: -1,
      regenPerTick: 0,
    });
  }

  // Wood on right bank
  const rightWoodPos = findTerrainOnBank(tiles, "forest", width, height, rightBankMinX, width - 1, forest2X, forest2Y, 10);
  for (let i = 0; i < Math.min(rightWoodPos.length, 3); i++) {
    resourceNodes.push({
      position: rightWoodPos[i],
      resourceType: "wood",
      quantity: 12,
      maxQuantity: 12,
      regenPerTick: 0.08,
    });
  }

  // Stone on right bank
  const rightStonePos = findTerrainOnBank(tiles, "rock", width, height, rightBankMinX, width - 1, rightBankMinX + 2, Math.floor(height * 0.3), 10);
  for (let i = 0; i < Math.min(rightStonePos.length, 1); i++) {
    resourceNodes.push({
      position: rightStonePos[i],
      resourceType: "stone",
      quantity: 8,
      maxQuantity: 8,
      regenPerTick: 0,
    });
  }

  // Grass material on right bank
  const rightGrassMat = findTerrainOnBank(tiles, "grass", width, height, rightBankMinX, width - 1, rightGrassX + 1, rightGrassY + 1, 8);
  for (let i = 0; i < Math.min(rightGrassMat.length, 2); i++) {
    resourceNodes.push({
      position: rightGrassMat[i],
      resourceType: "grass",
      quantity: 15,
      maxQuantity: 15,
      regenPerTick: 0.20,
    });
  }

  return {
    tiles,
    resourceNodes,
    spawnCenter: { x: spawnCenterX, y: spawnCenterY },
  };
}

// ── Helper: Paint a zone (safe: skips river tiles) ──────────────

function paintZoneSafe(
  cx: number,
  cy: number,
  radius: number,
  terrain: string,
  setTileSafe: (x: number, y: number, t: string) => void,
  width: number,
  height: number
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= radius + 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < width && y >= 0 && y < height) {
          setTileSafe(x, y, terrain);
        }
      }
    }
  }
}

// ── Helper: Find terrain positions restricted to a bank ─────────

function findTerrainOnBank(
  tiles: Record<string, GeneratedTile>,
  terrain: string,
  width: number,
  height: number,
  bankMinX: number,
  bankMaxX: number,
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
      if (x < bankMinX || x > bankMaxX) continue; // Bank constraint
      const tile = tiles[`${x},${y}`];
      if (tile?.terrain === terrain) {
        results.push({ x, y });
      }
    }
  }
  results.sort((a, b) => {
    const da = Math.abs(a.x - nearX) + Math.abs(a.y - nearY);
    const db = Math.abs(b.x - nearX) + Math.abs(b.y - nearY);
    return da - db;
  });
  return results;
}
