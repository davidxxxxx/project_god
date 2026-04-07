import type { WorldConfig } from "../create-world";
import type { TickContext } from "../tick";

const TERRAIN = {
  grass: { displayName: "Grass", moveCostMultiplier: 1, passable: true, fertility: 0.5 },
  swamp: { displayName: "Swamp", moveCostMultiplier: 3, passable: true, fertility: 0.1 },
};

const NEEDS = {
  hunger:  { max: 100, initial: 80, decayPerTick: 1, deathThreshold: 0, criticalThreshold: 25 },
  thirst:  { max: 100, initial: 80, decayPerTick: 2, deathThreshold: 0, criticalThreshold: 25 },
  fatigue: { max: 100, initial: 0, decayPerTick: 0, deathThreshold: -1, criticalThreshold: 20 },
};

const RESOURCES = {
  berry: { displayName: "Berry", gatherAmount: 1, restoresNeed: { hunger: 20 }, maxQuantity: 10, regenPerTick: 0.1 },
  water: { displayName: "Water", gatherAmount: 1, restoresNeed: { thirst: 30 }, maxQuantity: -1, regenPerTick: 0 },
};

const ACTIONS = {
  idle: { range: 0 }, move: { range: 1 }, gather: { range: 1 },
  eat: { requiresInventory: "berry" }, drink: { requiresInventory: "water" },
};

export const GOLDEN_WORLD_CONFIG: WorldConfig = {
  seed: 123456789, width: 20, height: 20, entityCount: 5,
  terrain: TERRAIN, needs: NEEDS,
  resourceNodes: [
    { position: { x: 3, y: 3 }, resourceType: "berry", quantity: 10, maxQuantity: 10, regenPerTick: 0.1 },
    { position: { x: 15, y: 15 }, resourceType: "berry", quantity: 10, maxQuantity: 10, regenPerTick: 0.1 },
    { position: { x: 10, y: 5 }, resourceType: "water", quantity: 999, maxQuantity: -1, regenPerTick: 0 },
  ],
  entityOverrides: [
    { index: 0, needsOverride: { thirst: 10 }, positionOverride: { x: 8, y: 5 } },
    { index: 1, needsOverride: { hunger: 15 }, positionOverride: { x: 5, y: 3 } },
    { index: 2, needsOverride: {} },
    { index: 3, needsOverride: {}, positionOverride: { x: 3, y: 2 } },
    { index: 4, needsOverride: {}, positionOverride: { x: 10, y: 4 } },
  ],
};

export const GOLDEN_TICK_CONTEXT: TickContext = {
  needs: NEEDS, resources: RESOURCES, actions: ACTIONS, terrain: TERRAIN,
};

export const GOLDEN_NEEDS_CONFIG = {
  hunger: { max: NEEDS.hunger.max, criticalThreshold: NEEDS.hunger.criticalThreshold },
  thirst: { max: NEEDS.thirst.max, criticalThreshold: NEEDS.thirst.criticalThreshold },
};
