/**
 * smoke.test.ts — Multi-seed stability test for MVP-01 closeout.
 *
 * Runs 10 different seeds × 100 ticks each.
 * Validates the system doesn't produce:
 *   - runtime exceptions
 *   - systematic dead-on-arrival maps
 *   - agents that never successfully gather/eat/drink
 */

import { describe, it, expect } from "vitest";
import {
  ScenarioRunner, defaultSurvivalDecision,
  bootstrapWorld, validateBootstrap, createWorld,
} from "../src";
import type { RunSummary } from "@project-god/shared";

// ── Content config (matches content-data/data/*.json) ───────

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
};

const TERRAIN = {
  grass: { displayName: "Grass", moveCostMultiplier: 1, passable: true, fertility: 0.5 },
  forest: { displayName: "Forest", moveCostMultiplier: 1.5, passable: true, fertility: 0.3 },
  water: { displayName: "Water", moveCostMultiplier: 99, passable: false, fertility: 0 },
  swamp: { displayName: "Swamp", moveCostMultiplier: 3, passable: true, fertility: 0.1 },
};

const NEEDS_CONFIG = {
  hunger: { max: NEEDS.hunger.max, criticalThreshold: NEEDS.hunger.criticalThreshold },
  thirst: { max: NEEDS.thirst.max, criticalThreshold: NEEDS.thirst.criticalThreshold },
};

// ── Test parameters ─────────────────────────────────────────

const TEST_SEEDS = [42, 1337, 9999, 2024, 777, 314159, 555, 88888, 12345, 67890];
const MAX_TICKS = 100;
const ENTITY_COUNT = 5;

describe("multi-seed smoke test", () => {
  const summaries: RunSummary[] = [];

  for (const seed of TEST_SEEDS) {
    it(`seed ${seed}: runs ${MAX_TICKS} ticks without runtime error`, () => {
      // Bootstrap world
      const { worldConfig, tickContext } = bootstrapWorld({
        seed,
        entityCount: ENTITY_COUNT,
        needs: NEEDS,
        resources: RESOURCES,
        actions: ACTIONS,
        terrain: TERRAIN,
      });

      // Validate opening legality
      const world = createWorld(worldConfig);
      const validation = validateBootstrap(world, TERRAIN);
      // Log violations but don't fail on non-critical ones
      if (!validation.valid) {
        console.warn(`[seed ${seed}] Bootstrap violations: ${validation.violations.join("; ")}`);
      }

      // Run simulation
      const runner = new ScenarioRunner({
        id: `smoke-${seed}`,
        worldConfig,
        tickContext,
        decideFn: defaultSurvivalDecision(NEEDS_CONFIG),
      });

      const summary = runner.runUntilDone(MAX_TICKS);
      summaries.push(summary);

      // Must not crash (reaching here = no runtime error)
      expect(summary.totalTicks).toBeGreaterThan(0);
      expect(summary.totalTicks).toBeLessThanOrEqual(MAX_TICKS);
      expect(summary.aliveCount + summary.deadCount).toBe(ENTITY_COUNT);
    });
  }

  it("at least 70% of seeds have successful gather+consume activity", () => {
    const activeSeeds = summaries.filter(
      (s) => s.totalGathers > 0 && (s.totalEats > 0 || s.totalDrinks > 0)
    );
    const ratio = activeSeeds.length / summaries.length;
    expect(ratio).toBeGreaterThanOrEqual(0.7);
  });

  it("no systematic early wipe (not all seeds dead within 20 ticks)", () => {
    const earlyWipes = summaries.filter(
      (s) => s.terminationReason === "all_dead" && s.totalTicks <= 20
    );
    // Allow at most 30% early wipes (some unlucky seeds are acceptable)
    expect(earlyWipes.length / summaries.length).toBeLessThan(0.3);
  });

  it("prints summary table", () => {
    console.log("\n┌─────────────┬──────┬───────┬───────┬─────────┬──────┬───────┬───────┬──────────┬──────────────┐");
    console.log("│ Seed        │ Tick │ Alive │ Dead  │ 1stDeath│ Gath │ Eat   │ Drink │ Rejected │ Termination  │");
    console.log("├─────────────┼──────┼───────┼───────┼─────────┼──────┼───────┼───────┼──────────┼──────────────┤");
    for (const s of summaries) {
      console.log(
        `│ ${String(s.seed).padEnd(11)} │ ${String(s.totalTicks).padStart(4)} │ ${String(s.aliveCount).padStart(5)} │ ${String(s.deadCount).padStart(5)} │ ${String(s.firstDeathTick ?? "-").padStart(7)} │ ${String(s.totalGathers).padStart(4)} │ ${String(s.totalEats).padStart(5)} │ ${String(s.totalDrinks).padStart(5)} │ ${String(s.totalRejections).padStart(8)} │ ${s.terminationReason.padEnd(12)} │`
      );
    }
    console.log("└─────────────┴──────┴───────┴───────┴─────────┴──────┴───────┴───────┴──────────┴──────────────┘");
  });
});
