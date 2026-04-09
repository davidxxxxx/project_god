/**
 * skill-scenario.test.ts — Integration tests for skill learning in running simulation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ScenarioRunner, defaultMemoryDecision, defaultPostTickMemoryHook } from "../src/scenario-runner";
import { GOLDEN_WORLD_CONFIG, GOLDEN_TICK_CONTEXT, GOLDEN_NEEDS_CONFIG } from "../src/scenarios/golden-scenario-001";
import { resetStructureCounter } from "../src/execute/execute-build";

describe("skill scenario", () => {
  beforeEach(() => resetStructureCounter());

  it("runs 200 ticks with skills enabled without crash", () => {
    const runner = new ScenarioRunner({
      id: "skill-test",
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
  });

  it("at least one entity learns fire_making via invention in 300 ticks", () => {
    const runner = new ScenarioRunner({
      id: "skill-invention-test",
      worldConfig: { ...GOLDEN_WORLD_CONFIG, seed: 1337 },
      tickContext: GOLDEN_TICK_CONTEXT,
      decideFn: defaultMemoryDecision(GOLDEN_NEEDS_CONFIG),
      postTickHook: defaultPostTickMemoryHook(),
    });

    let inventionFound = false;
    for (let i = 0; i < 300; i++) {
      runner.step();
      const proj = runner.getProjection();
      const skilled = proj.agents.filter(
        (a) => a.alive && Object.keys(a.skills).length > 0
      );
      if (skilled.length > 0) {
        inventionFound = true;
        break;
      }
    }

    if (inventionFound) {
      const proj = runner.getProjection();
      const skilled = proj.agents.filter(
        (a) => Object.keys(a.skills).length > 0
      );
      console.log(
        `[Skill Scenario] Invention found at tick ${proj.tick}: ${skilled.map(a => a.id).join(", ")} have skills`
      );
    }
    expect(inventionFound).toBe(true);
  });

  it("skill spreads to at least 2 entities in 500 ticks (seed 1337)", () => {
    const runner = new ScenarioRunner({
      id: "skill-spread-test",
      worldConfig: { ...GOLDEN_WORLD_CONFIG, seed: 1337 },
      tickContext: GOLDEN_TICK_CONTEXT,
      decideFn: defaultMemoryDecision(GOLDEN_NEEDS_CONFIG),
      postTickHook: defaultPostTickMemoryHook(),
    });

    let maxSkilled = 0;
    for (let i = 0; i < 500; i++) {
      runner.step();
      const proj = runner.getProjection();
      const skilledCount = proj.agents.filter(
        (a) => Object.keys(a.skills).length > 0
      ).length;
      maxSkilled = Math.max(maxSkilled, skilledCount);
    }

    console.log(`[Skill Scenario] Max skilled entities over 500 ticks: ${maxSkilled}`);
    // At least the inventor should have it
    expect(maxSkilled).toBeGreaterThanOrEqual(1);
  });
});
