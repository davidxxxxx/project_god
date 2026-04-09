/**
 * build-scenario.test.ts — MVP-02 Phase C integration test.
 *
 * Verifies that memory-aware agents can build fire pits
 * in a bootstrapped scenario with structure support.
 */

import { describe, it, expect } from "vitest";
import {
  ScenarioRunner,
  defaultMemoryDecision,
  defaultPostTickMemoryHook,
  bootstrapWorld,
} from "../src";
import type { EntityState, StructureState } from "@project-god/shared";
import { resetStructureCounter } from "../src/execute/execute-build";

const NEEDS = {
  hunger:  { max: 100, initial: 80, decayPerTick: 1, deathThreshold: 0, criticalThreshold: 25 },
  thirst:  { max: 100, initial: 80, decayPerTick: 2, deathThreshold: 0, criticalThreshold: 25 },
  fatigue: { max: 100, initial: 0,  decayPerTick: 0, deathThreshold: -1, criticalThreshold: 20 },
};

const RESOURCES = {
  berry: { displayName: "Berry", gatherAmount: 1, restoresNeed: { hunger: 20 }, maxQuantity: 10, regenPerTick: 0.1 },
  water: { displayName: "Water", gatherAmount: 1, restoresNeed: { thirst: 30 }, maxQuantity: -1, regenPerTick: 0 },
};

const ACTIONS = {
  idle: { range: 0 }, move: { range: 1 }, gather: { range: 1 },
  eat: { requiresInventory: "berry" }, drink: { requiresInventory: "water" },
  build: { range: 0 },
};

const TERRAIN = {
  grass: { displayName: "Grass", moveCostMultiplier: 1, passable: true, fertility: 0.5 },
  forest: { displayName: "Forest", moveCostMultiplier: 1.5, passable: true, fertility: 0.3 },
  water: { displayName: "Water", moveCostMultiplier: 99, passable: false, fertility: 0 },
  swamp: { displayName: "Swamp", moveCostMultiplier: 3, passable: true, fertility: 0.1 },
};

const STRUCTURES = {
  fire_pit: {
    displayName: "Fire Pit",
    requiredItems: { berry: 3 },
    buildRange: 0,
    initialDurability: 30,
    fuelPerTick: 1,
    effectRadius: 2,
    effects: ["warming"],
  },
};

const NEEDS_CONFIG = {
  hunger: { max: NEEDS.hunger.max, criticalThreshold: NEEDS.hunger.criticalThreshold },
  thirst: { max: NEEDS.thirst.max, criticalThreshold: NEEDS.thirst.criticalThreshold },
};

function bootstrap(seed: number, entityCount: number = 5) {
  return bootstrapWorld({
    seed,
    entityCount,
    needs: NEEDS,
    resources: RESOURCES,
    actions: ACTIONS,
    terrain: TERRAIN,
    structures: STRUCTURES,
  });
}

describe("build scenario", () => {
  it("runs 100 ticks with structures enabled without crash", () => {
    resetStructureCounter();
    const { worldConfig, tickContext } = bootstrap(42);

    const runner = new ScenarioRunner({
      id: "build-test",
      worldConfig,
      tickContext,
      decideFn: defaultMemoryDecision(NEEDS_CONFIG),
      postTickHook: defaultPostTickMemoryHook(),
    });

    const summary = runner.runUntilDone(100);
    expect(summary.totalTicks).toBeGreaterThan(0);
  });

  it("agents build at least one fire pit in 200 ticks", () => {
    resetStructureCounter();
    const { worldConfig, tickContext } = bootstrap(1337, 5);

    const runner = new ScenarioRunner({
      id: "build-fire-pit",
      worldConfig,
      tickContext,
      decideFn: defaultMemoryDecision(NEEDS_CONFIG),
      postTickHook: defaultPostTickMemoryHook(),
    });

    runner.runUntilDone(200);

    const world = runner.getWorld();
    const structures = world.structures
      ? (Object.values(world.structures) as StructureState[])
      : [];

    const firePits = structures.filter((s) => s.type === "fire_pit");
    console.log(`[Build Scenario] seed=1337: ${firePits.length} fire pits built (${firePits.filter(s => s.active).length} active)`);

    // At least one fire pit should have been built during the simulation
    expect(firePits.length).toBeGreaterThanOrEqual(1);
  });

  it("fire pits expire after durability reaches 0", () => {
    resetStructureCounter();
    const { worldConfig, tickContext } = bootstrap(42, 3);

    const runner = new ScenarioRunner({
      id: "build-expire",
      worldConfig,
      tickContext,
      decideFn: defaultMemoryDecision(NEEDS_CONFIG),
      postTickHook: defaultPostTickMemoryHook(),
    });

    // Run for long enough that fire pits would expire (durability 30 → 30 ticks)
    runner.runUntilDone(200);

    const world = runner.getWorld();
    const structures = world.structures
      ? (Object.values(world.structures) as StructureState[])
      : [];

    const expired = structures.filter((s) => !s.active && s.durability === 0);
    if (structures.length > 0) {
      console.log(`[Build Scenario] ${expired.length}/${structures.length} structures expired`);
      // If any structures were built, at least one should have expired
      // (30 tick durability, 200 tick run)
      expect(expired.length).toBeGreaterThanOrEqual(1);
    }
  });
});
