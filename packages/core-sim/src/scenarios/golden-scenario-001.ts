import type { WorldConfig } from "../create-world";
import type { TickContext } from "../tick";

const TERRAIN = {
  grass: { displayName: "Grass", moveCostMultiplier: 1, passable: true, fertility: 0.5 },
  forest: { displayName: "Forest", moveCostMultiplier: 1.5, passable: true, fertility: 0.3 },
  rock: { displayName: "Rocky Ground", moveCostMultiplier: 1.2, passable: true, fertility: 0 },
  swamp: { displayName: "Swamp", moveCostMultiplier: 3, passable: true, fertility: 0.1 },
  // MVP-02Y: River terrain
  river: { displayName: "River", moveCostMultiplier: 99, passable: false, fertility: 0 },
  riverbank: { displayName: "Riverbank", moveCostMultiplier: 1.3, passable: true, fertility: 0.7 },
  // MVP-03: Shallow river — passable but slow and risky
  shallow_river: { displayName: "Shallow Water", moveCostMultiplier: 4.0, passable: true, fertility: 0 },
};

const NEEDS = {
  hunger:  { max: 100, initial: 80, decayPerTick: 1, deathThreshold: 0, criticalThreshold: 25 },
  thirst:  { max: 100, initial: 80, decayPerTick: 1.5, deathThreshold: 0, criticalThreshold: 25 },
  fatigue: { max: 100, initial: 0, decayPerTick: 0, deathThreshold: -1, criticalThreshold: 20 },
  // exposure: conditional decay driven by temperature (decayPerTick=0, handled in decayNeeds)
  exposure: { max: 100, initial: 100, decayPerTick: 0, deathThreshold: 0, criticalThreshold: 30 },
};

const RESOURCES = {
  berry:   { displayName: "Berry", gatherAmount: 1, restoresNeed: { hunger: 20 }, maxQuantity: 10, regenPerTick: 0.1, category: "food" },
  water:   { displayName: "Water", gatherAmount: 1, restoresNeed: { thirst: 30 }, maxQuantity: -1, regenPerTick: 0, category: "drink" },
  wood:    { displayName: "Wood", gatherAmount: 1, restoresNeed: {}, maxQuantity: 8, regenPerTick: 0.05, category: "material", harvestAction: "harvest" },
  stone:   { displayName: "Stone", gatherAmount: 1, restoresNeed: {}, maxQuantity: 6, regenPerTick: 0, category: "material", harvestAction: "harvest" },
  grass:   { displayName: "Grass", gatherAmount: 2, restoresNeed: {}, maxQuantity: 12, regenPerTick: 0.15, category: "material", harvestAction: "harvest" },
  fiber:   { displayName: "Fiber", gatherAmount: 1, restoresNeed: {}, maxQuantity: 8, regenPerTick: 0.08, category: "material", harvestAction: "harvest" },
  roast_berry: { displayName: "Roast Berry", gatherAmount: 0, restoresNeed: { hunger: 40 }, maxQuantity: 0, regenPerTick: 0, category: "food" },
  boiled_water: { displayName: "Boiled Water", gatherAmount: 0, restoresNeed: { thirst: 50 }, maxQuantity: 0, regenPerTick: 0, category: "drink" },
  dry_berry: { displayName: "Dried Berry", gatherAmount: 0, restoresNeed: { hunger: 25 }, maxQuantity: 0, regenPerTick: 0, category: "food" },
};

const ACTIONS = {
  idle: { range: 0 }, move: { range: 1 }, gather: { range: 1 }, harvest: { range: 1 },
  eat: { requiresInventory: "berry" }, drink: { requiresInventory: "water" },
  cook: { range: 1, requiresNearby: "fire_pit" },
  add_fuel: { range: 1, requiresInventory: "wood", requiresNearby: "fire_pit" },
  build: { range: 0 }, drop: { range: 0 }, pray: { range: 0 },
  perform_ritual: { range: 1 }, participate_ritual: { range: 3 },
  plant: { range: 0 }, // MVP-02Y: Plant berry bush
  wade: { range: 1 },  // MVP-03: Attempt river crossing
};

const STRUCTURES = {
  fire_pit: {
    displayName: "Fire Pit",
    requiredItems: { stone: 2, wood: 1 },
    buildRange: 0, initialDurability: 150, fuelPerTick: 0.5, effectRadius: 2,
    effects: ["warming"], decayPerTick: 0,
  },
  lean_to: {
    displayName: "Lean-To Shelter",
    requiredItems: { wood: 3, grass: 2 },
    buildRange: 0, initialDurability: 120, fuelPerTick: 0, effectRadius: 1,
    effects: ["sheltered"], decayPerTick: 1,
  },
  hut: {
    displayName: "Family Hut",
    requiredItems: { wood: 6, grass: 3, stone: 2 },
    buildRange: 0, initialDurability: 500, fuelPerTick: 0, effectRadius: 2,
    effects: ["sheltered", "home"], decayPerTick: 0.05,
    requiresSkill: "shelter_building",
  },
  shrine: {
    displayName: "Tribal Shrine",
    requiredItems: { stone: 4, wood: 2 },
    buildRange: 0, initialDurability: 1000, fuelPerTick: 0, effectRadius: 3,
    effects: ["spiritual_focus"], decayPerTick: 0,
    isSpiritualCenter: true,
    faithCondition: 15,
  },
};

export const GOLDEN_WORLD_CONFIG: WorldConfig = {
  seed: 123456789, width: 20, height: 20, entityCount: 5,
  terrain: TERRAIN, needs: NEEDS,
  useProceduralMap: true, // MVP-02Y: Use procedural map generator
  resourceNodes: [
    // Berry bushes (food) — clustered near spawn
    { position: { x: 4, y: 3 },  resourceType: "berry", quantity: 10, maxQuantity: 10, regenPerTick: 0.12 },
    { position: { x: 8, y: 7 },  resourceType: "berry", quantity: 10, maxQuantity: 10, regenPerTick: 0.12 },
    { position: { x: 12, y: 10 }, resourceType: "berry", quantity: 8,  maxQuantity: 10, regenPerTick: 0.10 },
    { position: { x: 15, y: 15 }, resourceType: "berry", quantity: 8,  maxQuantity: 10, regenPerTick: 0.10 },
    // Water sources — near spawn so agents don't die of thirst
    { position: { x: 7, y: 4 },  resourceType: "water", quantity: 999, maxQuantity: -1, regenPerTick: 0 },
    { position: { x: 7, y: 5 },  resourceType: "water", quantity: 999, maxQuantity: -1, regenPerTick: 0 },
    { position: { x: 13, y: 11 }, resourceType: "water", quantity: 999, maxQuantity: -1, regenPerTick: 0 },
    // Trees (wood) — reachable from spawn area
    { position: { x: 3, y: 6 },  resourceType: "wood", quantity: 8, maxQuantity: 8, regenPerTick: 0.05 },
    { position: { x: 9, y: 3 },  resourceType: "wood", quantity: 8, maxQuantity: 8, regenPerTick: 0.05 },
    { position: { x: 14, y: 8 }, resourceType: "wood", quantity: 8, maxQuantity: 8, regenPerTick: 0.05 },
    // Stone deposits — one near spawn, one distant
    { position: { x: 5, y: 5 },  resourceType: "stone", quantity: 6, maxQuantity: 6, regenPerTick: 0 },
    { position: { x: 16, y: 9 }, resourceType: "stone", quantity: 6, maxQuantity: 6, regenPerTick: 0 },
    // Grass patches — plentiful and near spawn
    { position: { x: 6, y: 3 },  resourceType: "grass", quantity: 12, maxQuantity: 12, regenPerTick: 0.15 },
    { position: { x: 10, y: 8 }, resourceType: "grass", quantity: 12, maxQuantity: 12, regenPerTick: 0.15 },
  ],
  entityOverrides: [
    // Start agents clustered between berry/water/wood/stone/grass nodes
    // MVP-02Z: entity_0 = "fire keeper + cook", entity_1 = "shelter builder" (breaks skill deadlocks)
    { index: 0, needsOverride: { hunger: 80, thirst: 80 }, positionOverride: { x: 6, y: 4 },
      skillsOverride: { fire_making: 0.5, cooking: 0.3 } },
    { index: 1, needsOverride: { hunger: 80, thirst: 80 }, positionOverride: { x: 5, y: 4 },
      skillsOverride: { shelter_building: 0.5 } },
    { index: 2, needsOverride: { hunger: 80, thirst: 80 }, positionOverride: { x: 7, y: 3 } },
    { index: 3, needsOverride: { hunger: 80, thirst: 80 }, positionOverride: { x: 6, y: 5 } },
    { index: 4, needsOverride: { hunger: 80, thirst: 80 }, positionOverride: { x: 8, y: 5 } },
  ],
};

const SKILLS = {
  fire_making: { displayName: "Fire Making", learnMethod: "observation" as const, learnTicks: 5, initialProficiency: 0.5, maxProficiency: 1.0 },
  cooking: { displayName: "Cooking", learnMethod: "observation" as const, learnTicks: 3, initialProficiency: 0.5, maxProficiency: 1.0 },
  shelter_building: { displayName: "Shelter Building", learnMethod: "observation" as const, learnTicks: 5, initialProficiency: 0.5, maxProficiency: 1.0 },
  planting: { displayName: "Planting", learnMethod: "discovery" as const, learnTicks: 10, initialProficiency: 0.3, maxProficiency: 1.0 },
  // MVP-03: Discovered by surviving a crossing, not observation
  water_crossing: { displayName: "Water Crossing", learnMethod: "discovery" as const, learnTicks: 1, initialProficiency: 0.3, maxProficiency: 1.0 },
};

const TECHNOLOGIES = {
  controlled_fire: {
    displayName: "Controlled Fire",
    requiredSkill: "fire_making", minSkilledMembers: 2,
    unlocksStructures: ["fire_pit"],
  },
};

const RECIPES = {
  roast_berry: {
    displayName: "Roast Berry",
    inputs: { berry: 1 }, outputs: { roast_berry: 1 },
    requiresNearby: "fire_pit", requiredSkill: "cooking",
    skillGainOnCraft: 0.05, description: "Roasting doubles nutrition.",
  },
  boiled_water: {
    displayName: "Boiled Water",
    inputs: { water: 1 }, outputs: { boiled_water: 1 },
    requiresNearby: "fire_pit", requiredSkill: null as any,
    skillGainOnCraft: 0, description: "Purified water.",
  },
  dry_berry: {
    displayName: "Dried Berry",
    inputs: { berry: 2 }, outputs: { dry_berry: 1 },
    requiresNearby: "fire_pit", requiredSkill: "cooking",
    skillGainOnCraft: 0.03, description: "Dried for storage. Lower nutrition but lasts longer.",
  },
};

// MVP-04: Lifecycle configuration
import type { LifecycleDef, FaithDef, FaunaDef } from "../content-types";
import faunaData from "../../../content-data/data/fauna.json";
const LIFECYCLE: LifecycleDef = {
  TICKS_PER_YEAR: 800, ADULTHOOD_AGE: 13, ELDER_AGE_RATIO: 0.75,
  DEFAULT_MAX_AGE: 50, MAX_AGE_VARIANCE: 10, BIRTH_COOLDOWN_YEARS: 4,
  MIN_BIRTH_HUNGER: 40, CHILD_FOLLOW_RADIUS: 2, PAIRING_MIN_TRUST: 0.5,
  PAIRING_MIN_AGE: 16, ATTRIBUTE_MUTATION_RANGE: 2,
};

// MVP-05: Faith configuration
const FAITH: FaithDef = {
  INITIAL_FAITH: 10, MIN_PRAYER_FAITH: 5, PRAYER_COOLDOWN: 20,
  PRAYER_DURATION: 3, PRAYER_RESPONSE_WINDOW: 10,
  FAITH_GAIN_ON_MIRACLE: 15, FAITH_GAIN_WITNESS: 5,
  FAITH_DECAY_UNANSWERED: 1, FAITH_DECAY_PER_YEAR: 1, // MVP-02Z: unanswered 5→1 to not bankrupt faith
  DIVINE_POINTS_INITIAL: 5, DIVINE_POINTS_MAX: 20,
  DIVINE_REGEN_PER_PRAYER: 0.5,
  BLESS_COST: 1, HEAL_COST: 1, RAIN_COST: 3, BOUNTY_COST: 3,
  BLESS_HUNGER_RESTORE: 30, BLESS_THIRST_RESTORE: 30,
  RAIN_WATER_RESTORE: 50, BOUNTY_BERRY_RESTORE: 20,
};

// P2: Fauna definitions (filter out meta keys starting with _)
const FAUNA: Record<string, FaunaDef> = Object.fromEntries(
  Object.entries(faunaData).filter(([k]) => !k.startsWith("_"))
) as any;

export const GOLDEN_TICK_CONTEXT: TickContext = {
  needs: NEEDS, resources: RESOURCES, actions: ACTIONS, terrain: TERRAIN,
  structures: STRUCTURES, skills: SKILLS, technologies: TECHNOLOGIES,
  lifecycle: LIFECYCLE, faith: FAITH, recipes: RECIPES, fauna: FAUNA,
};

export const GOLDEN_NEEDS_CONFIG = {
  hunger: { max: NEEDS.hunger.max, criticalThreshold: NEEDS.hunger.criticalThreshold },
  thirst: { max: NEEDS.thirst.max, criticalThreshold: NEEDS.thirst.criticalThreshold },
  exposure: { max: NEEDS.exposure.max, criticalThreshold: NEEDS.exposure.criticalThreshold },
};
