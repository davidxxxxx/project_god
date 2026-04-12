import { EntityId, ResourceNodeId } from "./ids";
import { Vec2 } from "./geometry";
import { ActionIntent } from "./actions";
import type { LifeStage, Sex } from "./world";

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
  | "FIRST_DISCOVERY_MADE"
  // MVP-02 additions
  | "INVENTORY_FULL"
  | "ITEM_DROPPED"
  // MVP-02-C: Structure events
  | "STRUCTURE_BUILT"
  | "STRUCTURE_EXPIRED"
  | "WARMING_APPLIED"
  // MVP-02-D: Skill/Technology events
  | "SKILL_LEARNED"
  | "SKILL_OBSERVED"
  | "TECHNOLOGY_UNLOCKED"
  // MVP-02-E: Tribe events
  | "TRIBE_GATHER_POINT_UPDATED"
  | "SOCIAL_MEMORY_UPDATED"
  // MVP-03-A: Environment events
  | "ENVIRONMENT_CHANGED"
  | "EXPOSURE_WARNING"
  | "SHELTERED_APPLIED"
  // MVP-03-B: Knowledge events
  | "SEMANTIC_FORMED"
  | "KNOWLEDGE_TAUGHT"
  | "KNOWLEDGE_INHERITED"
  // MVP-04: Lifecycle events
  | "ENTITY_BORN"
  | "PAIR_BONDED"
  | "ENTITY_AGED"
  // MVP-05: Faith/Prayer/Miracle events
  | "PRAYER_STARTED"
  | "PRAYER_COMPLETED"
  | "PRAYER_UNANSWERED"
  | "MIRACLE_PERFORMED"
  | "FAITH_CHANGED"
  // MVP-07A: Priest, Altar, Rituals
  | "ROLE_ASSIGNED"
  | "RITUAL_STARTED"
  | "RITUAL_COMPLETED"
  | "MIRACLE_INTERPRETED"
  // MVP-07B: Doctrine & Taboo
  | "DOCTRINE_FORMED"
  | "DOCTRINE_VIOLATED"
  | "DOCTRINE_REINFORCED"
  // MVP-02X: Survival Intelligence
  | "RESOURCE_HARVESTED"
  | "RESOURCE_COOKED"
  | "FUEL_ADDED"
  | "HOME_CLAIMED"
  | "HP_CHANGED"
  | "RECIPE_LEARNED"
  | "RESOURCE_PLANTED"
  | "CHILD_FED"
  // MVP-03: River crossing
  | "WADE_ATTEMPTED"
  | "FAR_BANK_SPOTTED"
  // Phase 3: Social/Production/Exploration/Creative
  | "SOCIAL_INTERACTION"
  | "ITEM_GIFTED"
  | "TRADE_COMPLETED"
  | "ITEM_CRAFTED"
  | "AREA_SCOUTED"
  | "EXPERIMENT_ATTEMPTED"
  // Phase 4: Emergent Invention
  | "INVENTION_CREATED"
  // SIMA-2: Hierarchical Planning + Divine Vision
  | "MILESTONE_COMPLETED"
  | "OBJECTIVE_CHANGED"
  | "DIVINE_VISION_RECEIVED";

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

// ─── MVP-02: Inventory Events ────────────────────────────────

export interface InventoryFullEvent {
  readonly type: "INVENTORY_FULL";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly attemptedItem: string;
}

export interface ItemDroppedEvent {
  readonly type: "ITEM_DROPPED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly item: string;
  readonly quantity: number;
  readonly position: Vec2;
}

// ─── MVP-02-C: Structure Events ──────────────────────────────

export interface StructureBuiltEvent {
  readonly type: "STRUCTURE_BUILT";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly structureId: string;
  readonly structureType: string;
  readonly position: Vec2;
}

export interface StructureExpiredEvent {
  readonly type: "STRUCTURE_EXPIRED";
  readonly tick: number;
  readonly structureId: string;
  readonly structureType: string;
  readonly position: Vec2;
}

export interface WarmingAppliedEvent {
  readonly type: "WARMING_APPLIED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly structureId: string;
}

// ─── MVP-02-D: Skill/Technology Events ───────────────────────

export interface SkillLearnedEvent {
  readonly type: "SKILL_LEARNED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly skillId: string;
  readonly proficiency: number;
  /** How the skill was acquired. */
  readonly method: "invention" | "observation";
}

export interface SkillObservedEvent {
  readonly type: "SKILL_OBSERVED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly skillId: string;
  /** Observation progress: ticks observed so far. */
  readonly observedTicks: number;
  readonly requiredTicks: number;
}

export interface TechnologyUnlockedEvent {
  readonly type: "TECHNOLOGY_UNLOCKED";
  readonly tick: number;
  readonly tribeId: string;
  readonly technologyId: string;
  readonly skilledMemberCount: number;
}

// ─── MVP-02-E: Tribe Events ─────────────────────────────────

export interface TribeGatherPointUpdatedEvent {
  readonly type: "TRIBE_GATHER_POINT_UPDATED";
  readonly tick: number;
  readonly tribeId: string;
  readonly position: Vec2;
  readonly memberCount: number;
}

export interface SocialMemoryUpdatedEvent {
  readonly type: "SOCIAL_MEMORY_UPDATED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly targetEntityId: EntityId;
  readonly trust: number;
}

// ─── MVP-03-A: Environment Events ────────────────────────────

export interface EnvironmentChangedEvent {
  readonly type: "ENVIRONMENT_CHANGED";
  readonly tick: number;
  readonly temperature: number;
  readonly timeOfDay: "dawn" | "day" | "dusk" | "night";
}

export interface ExposureWarningEvent {
  readonly type: "EXPOSURE_WARNING";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly exposure: number;
}

export interface ShelteredAppliedEvent {
  readonly type: "SHELTERED_APPLIED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly structureId: string;
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
  | FirstDiscoveryMadeEvent
  | InventoryFullEvent
  | ItemDroppedEvent
  | StructureBuiltEvent
  | StructureExpiredEvent
  | WarmingAppliedEvent
  | SkillLearnedEvent
  | SkillObservedEvent
  | TechnologyUnlockedEvent
  | TribeGatherPointUpdatedEvent
  | SocialMemoryUpdatedEvent
  | EnvironmentChangedEvent
  | ExposureWarningEvent
  | ShelteredAppliedEvent
  // MVP-03-B: Knowledge events
  | SemanticFormedEvent
  | KnowledgeTaughtEvent
  | KnowledgeInheritedEvent
  // MVP-04: Lifecycle events
  | EntityBornEvent
  | PairBondedEvent
  | EntityAgedEvent
  // MVP-05: Faith/Prayer/Miracle events
  | PrayerStartedEvent
  | PrayerCompletedEvent
  | PrayerUnansweredEvent
  | MiraclePerformedEvent
  | FaithChangedEvent
  // MVP-07A: Priest, Altar, Rituals
  | RoleAssignedEvent
  | RitualStartedEvent
  | RitualCompletedEvent
  | MiracleInterpretedEvent
  // MVP-07B: Doctrine & Taboo
  | DoctrineFormedEvent
  | DoctrineViolatedEvent
  | DoctrineReinforcedEvent
  // MVP-02X: Survival Intelligence
  | ResourceHarvestedEvent
  | ResourceCookedEvent
  | FuelAddedEvent
  // MVP-03: River crossing
  | WadeAttemptedEvent
  | FarBankSpottedEvent
  | HomeClaimedEvent
  | HpChangedEvent
  // Phase 3: Generic game events
  | GenericGameEvent;

// ─── MVP-03-B: Knowledge Events ─────────────────────────────

/** Emitted when an agent distills a semantic fact from episodic experiences. */
export interface SemanticFormedEvent {
  readonly type: "SEMANTIC_FORMED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly fact: string;
  readonly subject?: string;
  readonly position?: Vec2;
  readonly confidence: number;
}

/** Emitted when an agent teaches a high-confidence fact to the tribe. */
export interface KnowledgeTaughtEvent {
  readonly type: "KNOWLEDGE_TAUGHT";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly tribeId: string;
  readonly fact: string;
  readonly subject?: string;
  readonly confidence: number;
}

/** Emitted when an agent inherits knowledge from the tribe's cultural memory. */
export interface KnowledgeInheritedEvent {
  readonly type: "KNOWLEDGE_INHERITED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly tribeId: string;
  readonly fact: string;
  readonly subject?: string;
  readonly confidence: number;
}

// ─── MVP-04: Lifecycle Events ────────────────────────────────

/** Emitted when a new entity is born. */
export interface EntityBornEvent {
  readonly type: "ENTITY_BORN";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly parentIds: [EntityId, EntityId];
  readonly sex: Sex;
  readonly position: Vec2;
}

/** Emitted when two entities form a pair bond. */
export interface PairBondedEvent {
  readonly type: "PAIR_BONDED";
  readonly tick: number;
  readonly entity1Id: EntityId;
  readonly entity2Id: EntityId;
  readonly tribeId: string;
}

/** Emitted when an entity transitions to a new life stage. */
export interface EntityAgedEvent {
  readonly type: "ENTITY_AGED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly newStage: LifeStage;
  readonly age: number;
}

// ─── MVP-05: Faith/Prayer/Miracle Events ─────────────────────

/** Emitted when an entity begins praying. */
export interface PrayerStartedEvent {
  readonly type: "PRAYER_STARTED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly position: Vec2;
  readonly faith: number;
}

/** Emitted when an entity completes their prayer (awaiting divine response). */
export interface PrayerCompletedEvent {
  readonly type: "PRAYER_COMPLETED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly position: Vec2;
}

/** Emitted when a prayer goes unanswered (response window expired). */
export interface PrayerUnansweredEvent {
  readonly type: "PRAYER_UNANSWERED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly faithLost: number;
}

/** Emitted when the player (god) performs a miracle. */
export interface MiraclePerformedEvent {
  readonly type: "MIRACLE_PERFORMED";
  readonly tick: number;
  readonly miracleType: string;
  readonly targetId?: EntityId;
  readonly cost: number;
  readonly position?: Vec2;
}

/** Emitted when an entity's faith value changes. */
export interface FaithChangedEvent {
  readonly type: "FAITH_CHANGED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly oldFaith: number;
  readonly newFaith: number;
  readonly reason: string;
}

// ─── MVP-07A: Priest, Altar, Rituals ─────────────────────────

/** Emitted when someone is assigned a new role (e.g. priest). */
export interface RoleAssignedEvent {
  readonly type: "ROLE_ASSIGNED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly tribeId: string;
  readonly role: string;
}

/** Emitted when a priest begins a ritual at an altar. */
export interface RitualStartedEvent {
  readonly type: "RITUAL_STARTED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly tribeId: string;
  readonly structureId: string;
  readonly position: Vec2;
}

/** Emitted when a ritual is successfully completed, granting faith/rewards. */
export interface RitualCompletedEvent {
  readonly type: "RITUAL_COMPLETED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly tribeId: string;
  readonly structureId: string;
  readonly position: Vec2;
}

/** Emitted when a priest interprets a miracle that just occurred. */
export interface MiracleInterpretedEvent {
  readonly type: "MIRACLE_INTERPRETED";
  readonly tick: number;
  readonly priestId: EntityId;
  readonly tribeId: string;
  readonly miracleType: string;
  readonly interpretation: string;
}

// ─── MVP-07B: Doctrine & Taboo Events ────────────────────────

/** Emitted when a tribe forms a new doctrine. */
export interface DoctrineFormedEvent {
  readonly type: "DOCTRINE_FORMED";
  readonly tick: number;
  readonly tribeId: string;
  readonly doctrineId: string;
  readonly doctrineType: string;
  readonly description: string;
  readonly strength: number;
}

/** Emitted when a doctrine is violated by the tribe. */
export interface DoctrineViolatedEvent {
  readonly type: "DOCTRINE_VIOLATED";
  readonly tick: number;
  readonly tribeId: string;
  readonly doctrineId: string;
  readonly description: string;
}

/** Emitted when a doctrine is reinforced (strength increases). */
export interface DoctrineReinforcedEvent {
  readonly type: "DOCTRINE_REINFORCED";
  readonly tick: number;
  readonly tribeId: string;
  readonly doctrineId: string;
  readonly newStrength: number;
}

// ─── MVP-02X: Survival Intelligence Events ───────────────────

/** Emitted when an agent harvests a resource (wood, stone, grass). */
export interface ResourceHarvestedEvent {
  readonly type: "RESOURCE_HARVESTED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly resourceType: string;
  readonly amount: number;
  readonly position: Vec2;
}

/** Emitted when an agent cooks a recipe at a fire. */
export interface ResourceCookedEvent {
  readonly type: "RESOURCE_COOKED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly recipeId: string;
  readonly outputType: string;
  readonly amount: number;
}

/** Emitted when an agent adds wood to a fire pit. */
export interface FuelAddedEvent {
  readonly type: "FUEL_ADDED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly structureId: string;
  readonly durabilityRestored: number;
}

/** Emitted when an agent claims a hut as home. */
export interface HomeClaimedEvent {
  readonly type: "HOME_CLAIMED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly structureId: string;
  readonly householdId: string;
}

/** Emitted when an entity's HP changes (damage or regen). */
export interface HpChangedEvent {
  readonly type: "HP_CHANGED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly oldHp: number;
  readonly newHp: number;
  readonly cause: string;
}

// ─── MVP-03: River Crossing Events ───────────────────────────

/** Emitted when an agent attempts to wade across shallow water. */
export interface WadeAttemptedEvent {
  readonly type: "WADE_ATTEMPTED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly from: Vec2;
  readonly to: Vec2;
  readonly success: boolean;
  /** HP lost on failure. */
  readonly hpLost?: number;
  /** Item type dropped in river on failure. */
  readonly itemLost?: string;
  /** Success probability that was rolled against. */
  readonly successChance: number;
}

/** Emitted when an agent spots resources across the river. */
export interface FarBankSpottedEvent {
  readonly type: "FAR_BANK_SPOTTED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly resourceType: string;
  readonly position: Vec2;
}

// ─── Phase 3: Generic Game Events ────────────────────────────

/**
 * Flexible event type for Phase 3 actions (social, craft, scout, experiment).
 * Uses a message string for human-readable description.
 */
export interface GenericGameEvent {
  readonly type: "SOCIAL_INTERACTION" | "ITEM_GIFTED" | "TRADE_COMPLETED"
    | "ITEM_CRAFTED" | "AREA_SCOUTED" | "EXPERIMENT_ATTEMPTED"
    | "INVENTION_CREATED" | "SKILL_LEARNED"
    | "MILESTONE_COMPLETED" | "OBJECTIVE_CHANGED" | "DIVINE_VISION_RECEIVED";
  readonly tick: number;
  readonly entityId: EntityId;
  readonly message: string;
  readonly detail?: string;
}
