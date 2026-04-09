export interface NeedDef {
  max: number;
  initial: number;
  decayPerTick: number;
  deathThreshold: number;
  criticalThreshold: number;
}

export interface ResourceDef {
  displayName: string;
  gatherAmount: number;
  restoresNeed: Record<string, number>;
  maxQuantity: number;
  regenPerTick: number;
  /** Resource category: food, drink, material. MVP-02X. */
  category?: string;
  /** If set, this resource requires 'harvest' action instead of 'gather'. */
  harvestAction?: string;
}

export interface ActionDef {
  range?: number;
  requiresInventory?: string;
}

export interface TerrainDef {
  displayName: string;
  moveCostMultiplier: number;
  passable: boolean;
  fertility: number;
}

export interface StructureDef {
  displayName: string;
  requiredItems: Record<string, number>;
  buildRange: number;
  initialDurability: number;
  fuelPerTick: number;
  effectRadius: number;
  effects: string[];
  /** Natural durability decay per tick (no fuel). MVP-02X. */
  decayPerTick?: number;
  /** Skill required to build this structure. MVP-02X. */
  requiresSkill?: string;
  description?: string;
  /** Whether this is a spiritual center. MVP-07A. */
  isSpiritualCenter?: boolean;
  /** Minimum faith required to build this structure. MVP-02X. */
  faithCondition?: number;
}

export interface SkillDef {
  displayName: string;
  /** How this skill is acquired: observation, practice, innate, or discovery. */
  learnMethod: "observation" | "practice" | "innate" | "discovery";
  /** Ticks of observation/practice needed to learn. */
  learnTicks: number;
  /** Proficiency level when first learned (0–1). */
  initialProficiency: number;
  /** Maximum proficiency (0–1). */
  maxProficiency: number;
}

/** Recipe definition for crafting/cooking. MVP-02X. */
export interface RecipeDef {
  displayName: string;
  /** Input items consumed (type → quantity). */
  inputs: Record<string, number>;
  /** Output items produced (type → quantity). */
  outputs: Record<string, number>;
  /** Must be near this structure type to craft. */
  requiresNearby: string;
  /** Skill required (null = no skill needed). */
  requiredSkill: string | null;
  /** Skill proficiency gain per craft. */
  skillGainOnCraft: number;
  description: string;
}

export interface TechnologyDef {
  displayName: string;
  /** Skill id that tribe members need to contribute. */
  requiredSkill: string;
  /** Minimum number of skilled members to unlock. */
  minSkilledMembers: number;
  /** Structures that become buildable once unlocked. */
  unlocksStructures: string[];
}

/** Lifecycle balance constants (MVP-04). Loaded from lifecycle.json. */
export interface LifecycleDef {
  /** Ticks per life-year. Default: 40 (= 1 day/night cycle). */
  TICKS_PER_YEAR: number;
  /** Age in years when entity becomes adult. */
  ADULTHOOD_AGE: number;
  /** Fraction of maxAge when entity becomes elder. */
  ELDER_AGE_RATIO: number;
  /** Default maximum age in years. */
  DEFAULT_MAX_AGE: number;
  /** Random variance around DEFAULT_MAX_AGE. */
  MAX_AGE_VARIANCE: number;
  /** Minimum years between births for same couple. */
  BIRTH_COOLDOWN_YEARS: number;
  /** Minimum hunger for both parents to attempt birth. */
  MIN_BIRTH_HUNGER: number;
  /** Max distance child will follow parent. */
  CHILD_FOLLOW_RADIUS: number;
  /** Minimum trust in socialMemory for pairing. */
  PAIRING_MIN_TRUST: number;
  /** Minimum age for pairing. */
  PAIRING_MIN_AGE: number;
  /** Random mutation range for child attributes. */
  ATTRIBUTE_MUTATION_RANGE: number;
}

/** Faith/Prayer/Miracle balance constants (MVP-05). Loaded from faith.json. */
export interface FaithDef {
  INITIAL_FAITH: number;
  MIN_PRAYER_FAITH: number;
  PRAYER_COOLDOWN: number;
  PRAYER_DURATION: number;
  PRAYER_RESPONSE_WINDOW: number;
  FAITH_GAIN_ON_MIRACLE: number;
  FAITH_GAIN_WITNESS: number;
  FAITH_DECAY_UNANSWERED: number;
  FAITH_DECAY_PER_YEAR: number;
  DIVINE_POINTS_INITIAL: number;
  DIVINE_POINTS_MAX: number;
  DIVINE_REGEN_PER_PRAYER: number;
  BLESS_COST: number;
  HEAL_COST: number;
  RAIN_COST: number;
  BOUNTY_COST: number;
  BLESS_HUNGER_RESTORE: number;
  BLESS_THIRST_RESTORE: number;
  RAIN_WATER_RESTORE: number;
  BOUNTY_BERRY_RESTORE: number;
}
