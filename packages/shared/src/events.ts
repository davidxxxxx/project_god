import { EntityId, ResourceNodeId } from "./ids";
import { Vec2 } from "./geometry";
import { ActionIntent } from "./actions";

// ─── Event Type Enum ─────────────────────────────────────────
// Canonical list from docs/domain/event-taxonomy.md.
// Adding a new type here requires updating the taxonomy doc first.

export type SimEventType =
  | "TIME_TICKED"
  | "NEED_DECAYED"
  | "ENTITY_MOVED"
  | "RESOURCE_SPOTTED"
  | "RESOURCE_GATHERED"
  | "FOOD_EATEN"
  | "WATER_DRUNK"
  | "ACTION_REJECTED"
  | "ENTITY_DIED"
  | "FIRST_DISCOVERY_MADE";

// ─── Per-Type Payloads ───────────────────────────────────────

export interface TimeTickedEvent {
  readonly type: "TIME_TICKED";
  readonly tick: number;
}

export interface NeedDecayedEvent {
  readonly type: "NEED_DECAYED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly need: string;
  readonly oldValue: number;
  readonly newValue: number;
}

export interface EntityMovedEvent {
  readonly type: "ENTITY_MOVED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly from: Vec2;
  readonly to: Vec2;
}

export interface ResourceSpottedEvent {
  readonly type: "RESOURCE_SPOTTED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly nodeId: ResourceNodeId;
}

export interface ResourceGatheredEvent {
  readonly type: "RESOURCE_GATHERED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly nodeId: ResourceNodeId;
  readonly resourceType: string;
  readonly quantity: number;
}

export interface FoodEatenEvent {
  readonly type: "FOOD_EATEN";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly item: string;
  readonly hungerRestored: number;
}

export interface WaterDrunkEvent {
  readonly type: "WATER_DRUNK";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly thirstRestored: number;
}

export interface ActionRejectedEvent {
  readonly type: "ACTION_REJECTED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly intent: ActionIntent;
  readonly reason: string;
}

export interface EntityDiedEvent {
  readonly type: "ENTITY_DIED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly cause: string;
}

export interface FirstDiscoveryMadeEvent {
  readonly type: "FIRST_DISCOVERY_MADE";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly discovery: string;
}

// ─── Discriminated Union ─────────────────────────────────────

export type SimEvent =
  | TimeTickedEvent
  | NeedDecayedEvent
  | EntityMovedEvent
  | ResourceSpottedEvent
  | ResourceGatheredEvent
  | FoodEatenEvent
  | WaterDrunkEvent
  | ActionRejectedEvent
  | EntityDiedEvent
  | FirstDiscoveryMadeEvent;
