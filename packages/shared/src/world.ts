import { EntityId, TileId, TribeId, ResourceNodeId } from "./ids";
import { Vec2 } from "./geometry";

// ─── Tile ────────────────────────────────────────────────────

export interface TileState {
  readonly id: TileId;
  readonly position: Vec2;
  readonly terrain: string;
  readonly biome: string;
}

// ─── Resource Node ───────────────────────────────────────────

export interface ResourceNodeState {
  readonly id: ResourceNodeId;
  readonly position: Vec2;
  readonly resourceType: string;
  quantity: number;
  readonly maxQuantity: number;
  readonly regenPerTick: number;
}

// ─── Entity (Agent) ──────────────────────────────────────────

export interface EntityNeeds {
  hunger: number;
  thirst: number;
  [key: string]: number; // future: fatigue, safetyPressure…
}

export interface EntityState {
  readonly id: EntityId;
  readonly type: string;
  readonly tribeId: TribeId;
  position: Vec2;
  attributes: Record<string, number>;
  needs: EntityNeeds;
  /** key = item type (e.g. "berry"), value = quantity */
  inventory: Record<string, number>;
  alive: boolean;
}

// ─── World State ─────────────────────────────────────────────

export interface WorldState {
  tick: number;
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  rngState: number;
  tiles: Record<string, TileState>;
  entities: Record<string, EntityState>;
  resourceNodes: Record<string, ResourceNodeState>;
}
