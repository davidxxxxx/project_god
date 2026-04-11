import {
  WorldState, TileState, EntityState, ResourceNodeState, TribeState, EnvironmentState,
  EntityId, TileId, ResourceNodeId, TribeId, Vec2, Personality, EmotionType,
  tileKey, createRNG,
} from "@project-god/shared";
import { calculateTemperature, calculateTimeOfDay, calculateLightLevel, DEFAULT_DAY_LENGTH } from "./systems/environment-tick";
import type { NeedDef, TerrainDef } from "./content-types";
import { generateMap } from "./map-generator";
import namePool from "../../content-data/data/names.json";

export interface WorldConfig {
  seed: number;
  width: number;
  height: number;
  entityCount: number;
  terrain: Record<string, TerrainDef>;
  needs: Record<string, NeedDef>;
  /** If true, use procedural map generation. MVP-02Y. */
  useProceduralMap?: boolean;
  resourceNodes?: Array<{
    position: Vec2;
    resourceType: string;
    quantity: number;
    maxQuantity: number;
    regenPerTick: number;
  }>;
  entityOverrides?: Array<{
    index: number;
    needsOverride: Partial<Record<string, number>>;
    positionOverride?: Vec2;
    /** MVP-02Z: Starting skills for this entity. */
    skillsOverride?: Record<string, number>;
  }>;
}

export function createWorld(config: WorldConfig): WorldState {
  const rng = createRNG(config.seed);

  // ── Build tile grid ──────────────────────────────────────
  const tiles: Record<string, TileState> = {};
  let proceduralSpawnCenter: Vec2 | undefined;
  let proceduralResourceNodes: Array<{
    position: Vec2;
    resourceType: string;
    quantity: number;
    maxQuantity: number;
    regenPerTick: number;
  }> | undefined;

  if (config.useProceduralMap) {
    // MVP-02Y: Procedural map generation
    const generated = generateMap(config.seed, config.width, config.height);
    for (const [key, genTile] of Object.entries(generated.tiles)) {
      const [xStr, yStr] = key.split(",");
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);
      tiles[key] = {
        id: key as TileId,
        position: { x, y },
        terrain: genTile.terrain,
        biome: genTile.biome,
      };
    }
    proceduralSpawnCenter = generated.spawnCenter;
    proceduralResourceNodes = generated.resourceNodes;
  } else {
    // Legacy: random terrain per tile
    const terrainKeys = Object.keys(config.terrain);
    for (let y = 0; y < config.height; y++) {
      for (let x = 0; x < config.width; x++) {
        const id = tileKey(x, y);
        tiles[id] = { id, position: { x, y }, terrain: rng.pick(terrainKeys), biome: "temperate" };
      }
    }
  }

  // ── Place entities ───────────────────────────────────────
  const passableTiles = Object.values(tiles).filter(
    (t: TileState) => config.terrain[t.terrain]?.passable !== false
  );
  const entities: Record<string, EntityState> = {};

  for (let i = 0; i < config.entityCount; i++) {
    const tile = rng.pick(passableTiles);
    const id = `entity_${i}` as EntityId;

    const needs: Record<string, number> = {};
    for (const [needKey, def] of Object.entries(config.needs)) {
      needs[needKey] = def.initial;
    }
    // MVP-02X: Initialize HP
    needs.hp = 100;

    const override = config.entityOverrides?.find((o: { index: number }) => o.index === i);
    if (override) {
      for (const [key, val] of Object.entries(override.needsOverride)) {
        if (val !== undefined) needs[key] = val;
      }
    }

    // MVP-02Y: If procedural map, cluster entities near spawn center
    let pos: Vec2;
    if (override?.positionOverride) {
      pos = override.positionOverride;
    } else if (proceduralSpawnCenter) {
      // Scatter around spawn center (±2 tiles)
      const sx = proceduralSpawnCenter.x + rng.nextInt(-2, 2);
      const sy = proceduralSpawnCenter.y + rng.nextInt(-2, 2);
      // Ensure passable
      const spawnKey = tileKey(sx, sy);
      const spawnTile = tiles[spawnKey];
      if (spawnTile && config.terrain[spawnTile.terrain]?.passable !== false) {
        pos = { x: sx, y: sy };
      } else {
        pos = { ...proceduralSpawnCenter };
      }
    } else {
      pos = { ...tile.position };
    }

    // ── MVP-04: Lifecycle fields for Gen0 ──────────────────
    const sex = rng.next() < 0.5 ? "male" : "female";
    const maxAge = rng.nextInt(60, 80);
    const startAge = rng.nextInt(20, 30);
    // bornAtTick is negative (entity "existed before" world started)
    const bornAtTick = -(startAge * 40); // 40 = DEFAULT_DAY_LENGTH = TICKS_PER_YEAR

    // Phase 1: Generate random MBTI personality for Gen0 entities
    const personality: Personality = {
      ei: rng.next() * 2 - 1,
      sn: rng.next() * 2 - 1,
      tf: rng.next() * 2 - 1,
      jp: rng.next() * 2 - 1,
    };

    // LLM Cognition: Assign name from pool
    const nameList = sex === "male" ? namePool.male : namePool.female;
    const name = nameList[rng.nextInt(0, nameList.length - 1)];

    entities[id] = {
      id, type: "human", tribeId: "tribe_0" as TribeId,
      position: pos,
      attributes: { intelligence: 5, body: 5, faith: 10 },
      needs: needs as any,
      inventory: {},
      alive: true,
      age: startAge,
      sex: sex as any,
      maxAge,
      bornAtTick,
      // MVP-02Z: Apply starting skills from overrides
      skills: override?.skillsOverride ? { ...override.skillsOverride } : undefined,
      // Phase 1: MBTI personality
      personality,
      // LLM Cognition: Agent identity
      name,
      emotion: "calm" as EmotionType,
      innerThought: "",
      personalGoal: "survive and thrive",
    };
  }

  // ── Place resource nodes ─────────────────────────────────
  const resourceNodes: Record<string, ResourceNodeState> = {};
  const nodeSources = proceduralResourceNodes ?? config.resourceNodes ?? [];
  nodeSources.forEach((rn, i) => {
    const id = `rnode_${i}` as ResourceNodeId;
    resourceNodes[id] = {
      id,
      position: rn.position,
      resourceType: rn.resourceType,
      quantity: rn.quantity,
      maxQuantity: rn.maxQuantity,
      regenPerTick: rn.regenPerTick,
    };
  });

  // ── Create default tribe (MVP-02-E) ─────────────────────
  const memberIds = Object.keys(entities) as EntityId[];
  const tribes: Record<string, TribeState> = {
    tribe_0: {
      id: "tribe_0" as TribeId,
      name: "First Tribe",
      memberIds,
      technologies: [],
    },
  };

  // ── Initialize environment state (MVP-03-A) ──────────────
  const environment: EnvironmentState = {
    dayLength: DEFAULT_DAY_LENGTH,
    temperature: calculateTemperature(0, DEFAULT_DAY_LENGTH),
    timeOfDay: calculateTimeOfDay(0, DEFAULT_DAY_LENGTH),
    lightLevel: calculateLightLevel(0, DEFAULT_DAY_LENGTH),
  };

  return {
    tick: 0, seed: config.seed, width: config.width, height: config.height,
    rngState: rng.state, tiles, entities, resourceNodes, tribes, environment,
    // MVP-05: Divine economy
    divinePoints: 5,
    maxDivinePoints: 20,
    // Fog of war: no tiles explored at start
    exploredTiles: {},
  };
}
