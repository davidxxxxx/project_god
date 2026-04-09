/**
 * balance-check.ts — Headless balance audit for MVP-02Y.
 * Runs 1000 ticks across 3 seeds, prints survival metrics.
 *
 * Usage: npx tsx packages/core-sim/__tests__/balance-check.ts
 */

import { ScenarioRunner, defaultMemoryDecision, defaultPostTickMemoryHook } from "../src/scenario-runner";
import { GOLDEN_WORLD_CONFIG, GOLDEN_TICK_CONTEXT, GOLDEN_NEEDS_CONFIG } from "../src/scenarios/golden-scenario-001";
import type { EntityState, SimEvent } from "@project-god/shared";

const TICKS = 1000;
const SEEDS = [123456789, 987654321, 555555555];

interface SeedResult {
  seed: number;
  aliveAtEnd: number;
  totalDeaths: number;
  firstDeathTick: number | null;
  deathCauses: Record<string, number>;
  totalGathers: number;
  totalEats: number;
  totalDrinks: number;
  totalBuilds: number;
  totalCooks: number;
  totalMoveRejections: number;
  totalRejections: number;
  totalPlants: number;
  skillsLearned: number;
  recipesLearned: number;
  avgSurvivalTicks: number;
  /** Per-agent hunger at tick 200 */
  hungerAt200: number[];
  /** Action distribution */
  actionCounts: Record<string, number>;
}

function runSeed(seed: number): SeedResult {
  const config = {
    ...GOLDEN_WORLD_CONFIG,
    seed,
  };

  const runner = new ScenarioRunner({
    id: `balance-${seed}`,
    worldConfig: config,
    tickContext: GOLDEN_TICK_CONTEXT,
    decideFn: defaultMemoryDecision(GOLDEN_NEEDS_CONFIG, GOLDEN_TICK_CONTEXT.terrain),
    postTickHook: defaultPostTickMemoryHook(),
  });

  let firstDeathTick: number | null = null;
  const deathCauses: Record<string, number> = {};
  let totalGathers = 0;
  let totalEats = 0;
  let totalDrinks = 0;
  let totalBuilds = 0;
  let totalCooks = 0;
  let totalMoveRejections = 0;
  let totalRejections = 0;
  let totalPlants = 0;
  let skillsLearned = 0;
  let recipesLearned = 0;
  const actionCounts: Record<string, number> = {};
  let hungerAt200: number[] = [];
  const deathTicks: Record<string, number> = {};

  for (let t = 0; t < TICKS; t++) {
    const result = runner.step();

    // Count actions
    for (const a of result.accepted) {
      const type = a.intent.type;
      actionCounts[type] = (actionCounts[type] ?? 0) + 1;
    }
    for (const r of result.rejections) {
      totalRejections++;
      if (r.intent.type === "move") totalMoveRejections++;
    }

    // Count events
    for (const ev of result.events) {
      const e = ev as any;
      switch (ev.type) {
        case "RESOURCE_GATHERED": totalGathers++; break;
        case "FOOD_EATEN": totalEats++; break;
        case "WATER_DRUNK": totalDrinks++; break;
        case "STRUCTURE_BUILT": totalBuilds++; break;
        case "RESOURCE_COOKED": totalCooks++; break;
        case "RESOURCE_PLANTED": totalPlants++; break;
        case "SKILL_LEARNED": skillsLearned++; break;
        case "RECIPE_LEARNED": recipesLearned++; break;
        case "ENTITY_DIED": {
          if (firstDeathTick === null) firstDeathTick = t;
          const cause = e.cause ?? "unknown";
          deathCauses[cause] = (deathCauses[cause] ?? 0) + 1;
          deathTicks[e.entityId] = t;
          break;
        }
      }
    }

    // Snapshot at tick 200
    if (t === 200) {
      const world = runner.getWorld();
      hungerAt200 = Object.values(world.entities)
        .filter((e: any) => e.alive)
        .map((e: any) => e.needs?.hunger ?? 0);
    }
  }

  const world = runner.getWorld();
  const entities = Object.values(world.entities) as EntityState[];
  const alive = entities.filter(e => e.alive);
  const dead = entities.filter(e => !e.alive);

  // Calculate avg survival
  let totalSurvival = 0;
  for (const e of entities) {
    const dt = deathTicks[e.id];
    totalSurvival += dt !== undefined ? dt : TICKS;
  }
  const avgSurvival = totalSurvival / entities.length;

  return {
    seed,
    aliveAtEnd: alive.length,
    totalDeaths: dead.length,
    firstDeathTick,
    deathCauses,
    totalGathers,
    totalEats,
    totalDrinks,
    totalBuilds,
    totalCooks,
    totalMoveRejections,
    totalRejections,
    totalPlants,
    skillsLearned,
    recipesLearned,
    avgSurvivalTicks: Math.round(avgSurvival),
    hungerAt200,
    actionCounts,
  };
}

// ── Run all seeds ────────────────────────────────────────────

console.log(`\n=== BALANCE AUDIT: MVP-02Y Living World Patch ===`);
console.log(`Ticks: ${TICKS} | Seeds: ${SEEDS.join(", ")}\n`);

const results: SeedResult[] = [];

for (const seed of SEEDS) {
  console.log(`Running seed ${seed}...`);
  const t0 = Date.now();
  const r = runSeed(seed);
  const elapsed = Date.now() - t0;
  results.push(r);
  console.log(`  Done in ${elapsed}ms — Alive: ${r.aliveAtEnd}/5, Deaths: ${r.totalDeaths}, First death: tick ${r.firstDeathTick ?? "none"}`);
}

// ── Summary ────────────────────────────────────────────────────

console.log(`\n${"─".repeat(60)}`);
console.log("SURVIVAL SUMMARY");
console.log(`${"─".repeat(60)}`);

for (const r of results) {
  console.log(`\nSeed ${r.seed}:`);
  console.log(`  Alive at ${TICKS}: ${r.aliveAtEnd}/5`);
  console.log(`  Deaths: ${r.totalDeaths}  First: tick ${r.firstDeathTick ?? "none"}`);
  console.log(`  Avg survival: ${r.avgSurvivalTicks} ticks`);
  console.log(`  Death causes: ${JSON.stringify(r.deathCauses)}`);
  console.log(`  Hunger at tick 200: [${r.hungerAt200.map(h => Math.round(h)).join(", ")}]`);
}

console.log(`\n${"─".repeat(60)}`);
console.log("ACTION DISTRIBUTION (avg across seeds)");
console.log(`${"─".repeat(60)}`);

const avgActions: Record<string, number> = {};
for (const r of results) {
  for (const [k, v] of Object.entries(r.actionCounts)) {
    avgActions[k] = (avgActions[k] ?? 0) + v / results.length;
  }
}
const sortedActions = Object.entries(avgActions).sort((a, b) => b[1] - a[1]);
for (const [action, count] of sortedActions) {
  const pct = ((count / TICKS) * 100 / 5).toFixed(1);
  console.log(`  ${action.padEnd(20)} ${Math.round(count).toString().padStart(6)}  (${pct}% of agent-ticks)`);
}

console.log(`\n${"─".repeat(60)}`);
console.log("ECONOMY METRICS (avg)");
console.log(`${"─".repeat(60)}`);

const avg = (field: keyof SeedResult) =>
  Math.round(results.reduce((s, r) => s + (r[field] as number), 0) / results.length);

console.log(`  Gathers:         ${avg("totalGathers")}`);
console.log(`  Eats:            ${avg("totalEats")}`);
console.log(`  Drinks:          ${avg("totalDrinks")}`);
console.log(`  Builds:          ${avg("totalBuilds")}`);
console.log(`  Cooks:           ${avg("totalCooks")}`);
console.log(`  Plants:          ${avg("totalPlants")}`);
console.log(`  Skills learned:  ${avg("skillsLearned")}`);
console.log(`  Recipes learned: ${avg("recipesLearned")}`);
console.log(`  Move rejections: ${avg("totalMoveRejections")}`);
console.log(`  Total rejections:${avg("totalRejections")}`);

console.log(`\n${"─".repeat(60)}`);
console.log("BALANCE INDICATORS");
console.log(`${"─".repeat(60)}`);

const avgAlive = results.reduce((s, r) => s + r.aliveAtEnd, 0) / results.length;
const avgDeaths = results.reduce((s, r) => s + r.totalDeaths, 0) / results.length;
const avgFirstDeath = results
  .filter(r => r.firstDeathTick !== null)
  .reduce((s, r) => s + (r.firstDeathTick ?? 0), 0) /
  Math.max(1, results.filter(r => r.firstDeathTick !== null).length);
const survivalRate = (avgAlive / 5 * 100).toFixed(0);
const gatherEatRatio = avg("totalGathers") / Math.max(1, avg("totalEats"));
const starvationDeaths = results.reduce((s, r) => s + (r.deathCauses["hunger"] ?? r.deathCauses["starvation"] ?? 0), 0);
const exposureDeaths = results.reduce((s, r) => s + (r.deathCauses["exposure"] ?? r.deathCauses["cold"] ?? 0), 0);

console.log(`  1000-tick survival rate:  ${survivalRate}% (${avgAlive.toFixed(1)}/5)`);
console.log(`  Avg first death tick:     ${avgFirstDeath > 0 ? Math.round(avgFirstDeath) : "none"}`);
console.log(`  Gather:Eat ratio:         ${gatherEatRatio.toFixed(1)}:1`);
console.log(`  Starvation deaths total:  ${starvationDeaths}`);
console.log(`  Exposure deaths total:    ${exposureDeaths}`);
console.log(`  Avg move rejections:      ${avg("totalMoveRejections")} (terrain cooldown working?)`);

console.log(`\n=== END BALANCE AUDIT ===\n`);
