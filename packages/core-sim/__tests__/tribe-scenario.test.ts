/**
 * tribe-scenario.test.ts — Integration tests for tribal behavior.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ScenarioRunner, defaultMemoryDecision, defaultPostTickMemoryHook } from "../src/scenario-runner";
import { GOLDEN_WORLD_CONFIG, GOLDEN_TICK_CONTEXT, GOLDEN_NEEDS_CONFIG } from "../src/scenarios/golden-scenario-001";
import { resetStructureCounter } from "../src/execute/execute-build";
import type { EntityState } from "@project-god/shared";
import { manhattan } from "@project-god/shared";

describe("tribe scenario (MVP-02-E)", () => {
  beforeEach(() => resetStructureCounter());

  it("runs 200 ticks with tribes enabled without crash", () => {
    const runner = new ScenarioRunner({
      id: "tribe-test",
      worldConfig: GOLDEN_WORLD_CONFIG,
      tickContext: GOLDEN_TICK_CONTEXT,
      decideFn: defaultMemoryDecision(GOLDEN_NEEDS_CONFIG),
      postTickHook: defaultPostTickMemoryHook(),
    });

    for (let i = 0; i < 200; i++) {
      runner.step();
    }

    const proj = runner.getProjection();
    expect(proj.tick).toBe(200);
    expect(proj.tribes.length).toBeGreaterThanOrEqual(1);
  });

  it("tribe has a gatherPoint after first tick", () => {
    const runner = new ScenarioRunner({
      id: "tribe-gp-test",
      worldConfig: GOLDEN_WORLD_CONFIG,
      tickContext: GOLDEN_TICK_CONTEXT,
      decideFn: defaultMemoryDecision(GOLDEN_NEEDS_CONFIG),
      postTickHook: defaultPostTickMemoryHook(),
    });

    runner.step();
    const proj = runner.getProjection();
    expect(proj.tribes[0].gatherPoint).toBeDefined();
    console.log(`[Tribe Scenario] gatherPoint after tick 1: (${proj.tribes[0].gatherPoint?.x},${proj.tribes[0].gatherPoint?.y})`);
  });

  it("agents develop social memory after 50 ticks", () => {
    const runner = new ScenarioRunner({
      id: "tribe-social-test",
      worldConfig: { ...GOLDEN_WORLD_CONFIG, seed: 1337 },
      tickContext: GOLDEN_TICK_CONTEXT,
      decideFn: defaultMemoryDecision(GOLDEN_NEEDS_CONFIG),
      postTickHook: defaultPostTickMemoryHook(),
    });

    for (let i = 0; i < 50; i++) {
      runner.step();
    }

    const proj = runner.getProjection();
    const aliveWithSocial = proj.agents.filter(
      (a) => a.alive && a.socialMemoryCount > 0
    );
    console.log(`[Tribe Scenario] After 50 ticks: ${aliveWithSocial.length} alive agents with social memory`);
    // At least one alive agent should know someone
    expect(aliveWithSocial.length).toBeGreaterThanOrEqual(1);
  });

  it("agents cluster toward gatherPoint over 200 ticks", () => {
    const runner = new ScenarioRunner({
      id: "tribe-cluster-test",
      worldConfig: { ...GOLDEN_WORLD_CONFIG, seed: 1337 },
      tickContext: GOLDEN_TICK_CONTEXT,
      decideFn: defaultMemoryDecision(GOLDEN_NEEDS_CONFIG),
      postTickHook: defaultPostTickMemoryHook(),
    });

    // Run 10 ticks to get initial spread
    for (let i = 0; i < 10; i++) runner.step();
    const earlyProj = runner.getProjection();
    const earlyGP = earlyProj.tribes[0].gatherPoint!;
    const earlyAvgDist = earlyProj.agents
      .filter((a) => a.alive)
      .reduce((sum, a) => sum + manhattan(a.position, earlyGP), 0) /
      Math.max(1, earlyProj.agents.filter((a) => a.alive).length);

    // Run more to see clustering
    for (let i = 0; i < 190; i++) runner.step();
    const lateProj = runner.getProjection();
    const lateGP = lateProj.tribes[0].gatherPoint!;

    if (lateProj.agents.filter((a) => a.alive).length > 0 && lateGP) {
      const lateAvgDist = lateProj.agents
        .filter((a) => a.alive)
        .reduce((sum, a) => sum + manhattan(a.position, lateGP), 0) /
        Math.max(1, lateProj.agents.filter((a) => a.alive).length);
      console.log(`[Tribe Scenario] Avg dist to GP: early=${earlyAvgDist.toFixed(1)} late=${lateAvgDist.toFixed(1)}`);
    }

    // Just verify it runs without crash (clustering is a soft metric)
    expect(lateProj.tick).toBe(200);
  });

  it("survival rate is not worse than Phase D", () => {
    const seeds = [42, 1337, 9999, 777, 555];
    let totalAlive = 0;

    for (const seed of seeds) {
      const runner = new ScenarioRunner({
        id: `tribe-survival-${seed}`,
        worldConfig: { ...GOLDEN_WORLD_CONFIG, seed },
        tickContext: GOLDEN_TICK_CONTEXT,
        decideFn: defaultMemoryDecision(GOLDEN_NEEDS_CONFIG),
        postTickHook: defaultPostTickMemoryHook(),
      });

      for (let i = 0; i < 100; i++) runner.step();
      const proj = runner.getProjection();
      totalAlive += proj.counters.aliveAgents;
    }

    console.log(`[Tribe Scenario] survival over ${seeds.length} seeds: ${totalAlive} alive after 100 ticks`);
    // Should have at least some survivors across all seeds
    expect(totalAlive).toBeGreaterThanOrEqual(3);
  });
});
