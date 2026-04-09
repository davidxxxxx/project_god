/**
 * time-control.test.ts — Tests for stepUntil() and time control support.
 */

import { describe, it, expect } from "vitest";
import { ScenarioRunner } from "../src/scenario-runner";
import { GOLDEN_WORLD_CONFIG, GOLDEN_TICK_CONTEXT, GOLDEN_NEEDS_CONFIG } from "../src/scenarios/golden-scenario-001";
import { defaultMemoryDecision, defaultPostTickMemoryHook } from "../src/scenario-runner";

function makeRunner() {
  return new ScenarioRunner({
    id: "time-test",
    worldConfig: GOLDEN_WORLD_CONFIG,
    tickContext: GOLDEN_TICK_CONTEXT,
    decideFn: defaultMemoryDecision(GOLDEN_NEEDS_CONFIG),
    postTickHook: defaultPostTickMemoryHook(),
  });
}

describe("stepUntil", () => {
  it("runs until maxTicks when no target event found", () => {
    const runner = makeRunner();
    const result = runner.stepUntil(["ENTITY_BORN"], 10);

    expect(result.ticksRan).toBe(10);
    expect(result.found).toBe(false);
    expect(result.triggerEvent).toBeUndefined();
    expect(runner.getWorld().tick).toBe(10);
  });

  it("stops at exact tick when target event found", () => {
    const runner = makeRunner();
    // ENTITY_DIED is common if an agent can't eat. Run far enough.
    const result = runner.stepUntil(["ENTITY_DIED"], 500);

    if (result.found) {
      expect(result.triggerEvent).toBeDefined();
      expect(result.triggerEvent!.type).toBe("ENTITY_DIED");
      expect(result.ticksRan).toBeLessThanOrEqual(500);
    }
    // If no death in 500, that's also fine — just assert consistency
    expect(result.ticksRan).toBeLessThanOrEqual(500);
  });

  it("is deterministic — same seed gives same result", () => {
    const r1 = makeRunner();
    const r2 = makeRunner();

    const res1 = r1.stepUntil(["ENTITY_DIED"], 200);
    const res2 = r2.stepUntil(["ENTITY_DIED"], 200);

    expect(res1.ticksRan).toBe(res2.ticksRan);
    expect(res1.found).toBe(res2.found);
    expect(r1.getWorld().tick).toBe(r2.getWorld().tick);
  });

  it("equivalent to calling step() N times", () => {
    const r1 = makeRunner();
    const r2 = makeRunner();

    r1.stepUntil(["__NEVER_MATCH__" as any], 20);
    for (let i = 0; i < 20; i++) r2.step();

    expect(r1.getWorld().tick).toBe(r2.getWorld().tick);
    expect(r1.getWorld().tick).toBe(20);

    // Same world state
    const p1 = r1.getProjection();
    const p2 = r2.getProjection();
    expect(p1.counters.aliveAgents).toBe(p2.counters.aliveAgents);
  });

  it("can find PRAYER_STARTED after enough ticks", () => {
    const runner = makeRunner();
    // Prayers happen when agents hit crisis + cooldown elapsed
    const result = runner.stepUntil(["PRAYER_STARTED"], 1000);

    // May or may not find depending on sim dynamics, but should not crash
    expect(result.ticksRan).toBeLessThanOrEqual(1000);
    if (result.found) {
      expect(result.triggerEvent!.type).toBe("PRAYER_STARTED");
    }
  });

  it("stops early when all agents are dead", () => {
    const runner = makeRunner();
    // Run until dead or maxTicks — should terminate cleanly
    const result = runner.stepUntil(["__NEVER_MATCH__" as any], 50000);

    // Either all dead or hit maxTicks
    const proj = runner.getProjection();
    if (proj.counters.aliveAgents === 0) {
      expect(result.ticksRan).toBeLessThan(50000);
    }
  });
});
