import { EntityId, TileId, TribeId, ResourceNodeId, StructureId } from "./ids";

// ─── Life Stage (derived from age, not stored) ───────────────

export type LifeStage = "child" | "adult" | "elder";
export type Sex = "male" | "female";
/** Types of divine intervention the player can perform. MVP-05. */
export type MiracleType = "bless" | "heal" | "rain" | "bounty";
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

// ─── Structure (MVP-02: human-built world objects) ───────────

export interface StructureState {
  readonly id: StructureId;
  readonly type: string;
  position: Vec2;
  durability: number;
  readonly builtByEntityId: EntityId;
  readonly builtAtTick: number;
  active: boolean;
}

// ─── Task Memory (working memory) ────────────────────────────

export interface TaskMemory {
  /** Current goal identifier, e.g. "seek_water", "gather_berry". */
  goal: string;
  targetPosition?: Vec2;
  targetId?: string;
  startedAtTick: number;
}

// ─── Episodic Memory ─────────────────────────────────────────

export interface EpisodicEntry {
  tick: number;
  /** Event category, e.g. "found_resource", "danger_zone", "gathered". */
  type: string;
  position: Vec2;
  resourceType?: string;
  detail?: string;
}

/** Maximum episodic memory entries per entity. FIFO eviction. */
export const MAX_EPISODIC_MEMORY = 20;

// ─── Semantic Memory (MVP-03-B: distilled knowledge) ─────────

/**
 * Categories of distilled knowledge an agent can form.
 * Each fact represents a generalized understanding derived from
 * repeated episodic experiences.
 */
export type SemanticFactType =
  | "resource_location"   // "berries reliably appear at (x,y)"
  | "water_location"      // "water source at (x,y)"
  | "shelter_location"    // "lean-to shelter at (x,y)"
  | "fire_location"       // "fire pit at (x,y)"
  | "warming_benefit"     // "fire pits provide warmth"
  | "shelter_benefit"     // "lean-to provides shelter from cold"
  ;

/**
 * A single piece of distilled knowledge.
 * Formed by repeated episodic experiences (≥ DISTILL_THRESHOLD same-location events).
 * Confidence decays if not reinforced and increases with reinforcement.
 */
export interface SemanticEntry {
  /** Fact category. */
  fact: SemanticFactType;
  /** Spatial anchor — where this knowledge is about. */
  position?: Vec2;
  /** Subject identifier (e.g. resource type, structure type). */
  subject?: string;
  /** Confidence 0–1. Decays over time without reinforcement. */
  confidence: number;
  /** Tick when first formed. */
  formedAtTick: number;
  /** Tick when last reinforced by supporting evidence. */
  lastReinforcedTick: number;
}

/** Maximum semantic memory entries per entity. */
export const MAX_SEMANTIC_MEMORY = 10;

/** Minimum episodic repetitions at same location to trigger distillation. */
export const DISTILL_THRESHOLD = 3;

/** Ticks without reinforcement before confidence decays. */
export const SEMANTIC_DECAY_INTERVAL = 50;

/** Confidence lost per decay interval. */
export const SEMANTIC_DECAY_AMOUNT = 0.1;

// ─── Cultural Memory (MVP-03-B: tribe-level knowledge) ───────

/**
 * A piece of shared tribal knowledge.
 * Persists beyond individual agent death.
 * Formed when a high-confidence individual teaches their tribe.
 */
export interface CulturalEntry {
  /** Same taxonomy as SemanticEntry. */
  fact: SemanticFactType;
  position?: Vec2;
  subject?: string;
  /** Collective confidence — reinforced by multiple contributors. */
  confidence: number;
  /** Entity IDs who contributed this knowledge. */
  contributorIds: string[];
  /** Tick when first added to tribe memory. */
  addedAtTick: number;
  /** Tick when last reinforced. */
  lastReinforcedTick: number;
}

/** Maximum cultural memory entries per tribe. */
export const MAX_CULTURAL_MEMORY = 20;

/** Minimum individual confidence to be eligible for teaching. */
export const TEACH_CONFIDENCE_THRESHOLD = 0.7;

/** Ticks without reinforcement before cultural confidence decays. */
export const CULTURAL_DECAY_INTERVAL = 100;

/** Confidence lost per cultural decay interval. */
export const CULTURAL_DECAY_AMOUNT = 0.05;

// ─── Social Memory ───────────────────────────────────────────

export interface SocialImpression {
  entityId: string;
  /** Trust level: -1 (hostile) to 1 (fully trusted). */
  trust: number;
  lastSeenTick: number;
  lastSeenPosition?: Vec2;
}

// ─── Entity (Agent) ──────────────────────────────────────────

export interface EntityNeeds {
  hunger: number;
  thirst: number;
  /** Hit points. Death at 0. Damage from starvation/dehydration/exposure. MVP-02X. */
  hp: number;
  [key: string]: number; // future: fatigue, safetyPressure…
}

export interface EntityState {
  readonly id: EntityId;
  readonly type: string;
  tribeId: TribeId;
  position: Vec2;
  attributes: Record<string, number>;
  needs: EntityNeeds;
  /** key = item type (e.g. "berry"), value = quantity */
  inventory: Record<string, number>;
  alive: boolean;

  // ── MVP-02 additions (all optional for backward compat) ───

  /** Inventory capacity limit. Default from content-data. */
  inventoryCapacity?: number;
  /** Skills this entity has learned. key = skill id, value = proficiency 0–1. */
  skills?: Record<string, number>;
  /** Working memory: current task context. */
  currentTask?: TaskMemory | null;
  /** Episodic memory: past experiences. Capped at MAX_EPISODIC_MEMORY. */
  episodicMemory?: EpisodicEntry[];
  /** Semantic memory: distilled knowledge from repeated experiences. MVP-03-B. */
  semanticMemory?: SemanticEntry[];
  /** Social memory: impressions of other entities. */
  socialMemory?: Record<string, SocialImpression>;
  /** Temporary status effects, e.g. "warming", "injured", "child", "elder". */
  statuses?: string[];
  /** MVP-07A: Entity role, e.g., 'priest'. */
  role?: string;

  // ── MVP-04 additions: Lifecycle + Kinship ──────────────────

  /** Current age in life-years. Increments every TICKS_PER_YEAR ticks. */
  age?: number;
  /** Biological sex. Determines reproduction role. */
  sex?: Sex;
  /** Maximum natural lifespan in life-years. */
  maxAge?: number;
  /** World tick when this entity was born (or first appeared for Gen0). */
  bornAtTick?: number;
  /** Parent entity IDs: [motherId, fatherId]. undefined for Gen0. */
  parentIds?: [EntityId, EntityId];
  /** IDs of children born to this entity. */
  childIds?: EntityId[];
  /** Current spouse entity ID. undefined if unpaired. */
  spouseId?: EntityId;
  /** Tick when last child was born. For birth cooldown. */
  lastBirthTick?: number;

  // ── MVP-05: Faith / Prayer ──────────────────────────────────

  /** Tick when last prayer action was started. For cooldown. */
  lastPrayerTick?: number;
  /** Tick when current prayer was completed. For response window. */
  prayerCompletedTick?: number;
  /** Whether entity is currently in prayer state. */
  isPraying?: boolean;

  // ── MVP-02X: Survival Intelligence ─────────────────────────

  /** Family unit ID. Married pairs + children share a household. */
  householdId?: string;
  /** Remembered home base position (fire pit / hut location). */
  campPosition?: Vec2;
  /** Structure ID of claimed home (hut). */
  homeStructureId?: StructureId;

  /** Recipes this entity has learned. key = recipe id, value = times crafted. */
  knownRecipes?: Record<string, number>;
  /** Observation progress toward learning recipes. key = recipe id, value = ticks observed. */
  recipeObservationProgress?: Record<string, number>;
  /** Experience-based decision preferences. key = category, value = weight (-1..1). */
  preferences?: Record<string, number>;

  // ── MVP-02Y: Terrain Movement ──────────────────────────────

  /** Tick when entity can next perform a move action. Terrain cost sets this. */
  moveCooldownUntil?: number;

  // ── MVP-07B: Doctrine alignment ────────────────────────────

  /** How well this entity follows each doctrine (-100 to 100). */
  doctrineAlignment?: Record<string, number>;
}

// ─── Tribe State (MVP-02-E: group-level data) ────────────────

export interface TribeState {
  readonly id: TribeId;
  name: string;
  memberIds: EntityId[];
  /** Technologies unlocked at tribe level. */
  technologies: string[];
  /** Shared gathering/meeting point (centroid of members). */
  gatherPoint?: Vec2;
  /** Cultural memory: tribe-level shared knowledge. MVP-03-B. */
  culturalMemory?: CulturalEntry[];
  /** MVP-07A: Entity ID of the tribe's priest. */
  priestId?: EntityId;
  /** MVP-07A: Structure ID of the tribe's altar/shrine. */
  spiritualCenterId?: string;

  // ── MVP-07B: Doctrines ─────────────────────────────────────

  /** Active doctrines held by this tribe. */
  doctrines?: DoctrineEntry[];
}

// ─── Doctrine (MVP-07B: tribal beliefs and taboos) ───────────

export type DoctrineType = "commandment" | "taboo" | "tradition";

export interface DoctrineEntry {
  /** Unique doctrine identifier, e.g. "fire_sacred". */
  readonly id: string;
  /** Category of belief. */
  readonly type: DoctrineType;
  /** Human-readable description. */
  readonly description: string;
  /** How strongly the tribe holds this belief (0-100). */
  strength: number;
  /** Tick when this doctrine was first formed. */
  readonly formedAtTick: number;
  /** What event or action caused formation. */
  readonly formedReason: string;
}

// ─── Environment State (MVP-03-A: temperature + day/night) ───

export type TimeOfDay = "day" | "dusk" | "night";

export interface EnvironmentState {
  /** Current world temperature 0-100 (50 = comfortable, <40 = cold). */
  temperature: number;
  /** Whether it is currently day or night. */
  timeOfDay: TimeOfDay;
  /** Total ticks per full day+night cycle. */
  readonly dayLength: number;
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

  // ── MVP-02 additions ──────────────────────────────────────

  /** Structures placed by entities (fire pits, etc.). */
  structures?: Record<string, StructureState>;
  /** Per-tribe shared knowledge and state. */
  tribes?: Record<string, TribeState>;

  // ── MVP-03-A additions ────────────────────────────────────

  /** World environment (temperature, day/night). Optional for backward compat. */
  environment?: EnvironmentState;

  // ── MVP-05: Divine economy ─────────────────────────────────

  /** Current divine resource points available to the player (god). */
  divinePoints?: number;
  /** Maximum divine points cap. */
  maxDivinePoints?: number;
}
