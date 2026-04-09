import {
  WorldState, TileState, EntityState, ResourceNodeState, TribeState, EnvironmentState,
  EntityId, TileId, ResourceNodeId, TribeId, Vec2,
  tileKey, createRNG,
} from "@project-god/shared";
import { calculateTemperature, calculateTimeOfDay, DEFAULT_DAY_LENGTH } from "./systems/environment-tick";
import type { NeedDef, TerrainDef } from "./content-types";

export interface WorldConfig {
  seed: number;
  width: number;
  height: number;
  entityCount: number;
  terrain: Record<string, TerrainDef>;
  needs: Record<string, NeedDef>;
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
  }>;
}

export function createWorld(config: WorldConfig): WorldState {
  const rng = createRNG(config.seed);

  // ── Build tile grid ──────────────────────────────────────
  const tiles: Record<string, TileState> = {};
  const terrainKeys = Object.keys(config.terrain);

  for (let y = 0; y < config.height; y++) {
    for (let x = 0; x < config.width; x++) {
      const id = tileKey(x, y);
      tiles[id] = { id, position: { x, y }, terrain: rng.pick(terrainKeys), biome: "temperate" };
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

    const override = config.entityOverrides?.find((o: { index: number }) => o.index === i);
    if (override) {
      for (const [key, val] of Object.entries(override.needsOverride)) {
        if (val !== undefined) needs[key] = val;
      }
    }

    const pos = override?.positionOverride ?? { ...tile.position };

    // ── MVP-04: Lifecycle fields for Gen0 ──────────────────
    const sex = rng.next() < 0.5 ? "male" : "female";
    const maxAge = rng.nextInt(60, 80);
    const startAge = rng.nextInt(20, 30);
    // bornAtTick is negative (entity "existed before" world started)
    const bornAtTick = -(startAge * 40); // 40 = DEFAULT_DAY_LENGTH = TICKS_PER_YEAR

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
    };
  }

  // ── Place resource nodes ─────────────────────────────────
  const resourceNodes: Record<string, ResourceNodeState> = {};
  if (config.resourceNodes) {
    config.resourceNodes.forEach((rn, i) => {
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
  }
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
  };

  return {
    tick: 0, seed: config.seed, width: config.width, height: config.height,
    rngState: rng.state, tiles, entities, resourceNodes, tribes, environment,
    // MVP-05: Divine economy
    divinePoints: 5,
    maxDivinePoints: 20,
  };
}
