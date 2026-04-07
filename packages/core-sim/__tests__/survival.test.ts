import { describe, it, expect } from "vitest";
import { createWorld, tickWorld } from "../src";
import { goldenScenarioConfig, GOLDEN_TICK_CONTEXT, GOLDEN_NEEDS_CONFIG } from "../__fixtures__/golden-scenario-001";
import {
  ActionIntent, EntityId, EntityState, WorldState, ResourceNodeState, SimEvent, manhattan
} from "@project-god/shared";

function stepToward(from: { x: number; y: number }, to: { x: number; y: number }) {
  return { x: from.x + Math.sign(to.x - from.x), y: from.y + Math.sign(to.y - from.y) };
}

function decideForTest(entityId: string, world: WorldState): ActionIntent {
  const self = world.entities[entityId];
  const actorId = self.id;
  const nearbyResources = (Object.values(world.resourceNodes) as ResourceNodeState[]).filter(
    (n) => n.quantity > 0 && manhattan(self.position, n.position) <= 10
  );
  const cfg = GOLDEN_NEEDS_CONFIG;
  const hungerP = cfg.hunger.max - (self.needs.hunger ?? cfg.hunger.max);
  const thirstP = cfg.thirst.max - (self.needs.thirst ?? cfg.thirst.max);

  if (self.needs.thirst <= cfg.thirst.criticalThreshold && (self.inventory["water"] ?? 0) > 0)
    return { actorId, type: "drink" };
  if (self.needs.hunger <= cfg.hunger.criticalThreshold && (self.inventory["berry"] ?? 0) > 0)
    return { actorId, type: "eat" };
  if (thirstP > hungerP && (self.inventory["water"] ?? 0) > 0)
    return { actorId, type: "drink" };
  if (hungerP > thirstP && (self.inventory["berry"] ?? 0) > 0)
    return { actorId, type: "eat" };

  const needType = thirstP >= hungerP ? "water" : "berry";
  const candidates = nearbyResources
    .filter((r) => r.resourceType === needType && r.quantity > 0)
    .sort((a, b) => manhattan(self.position, a.position) - manhattan(self.position, b.position));
  const nearest = candidates[0];

  if (nearest) {
    if (manhattan(self.position, nearest.position) <= 1)
      return { actorId, type: "gather", targetId: nearest.id };
    return { actorId, type: "move", position: stepToward(self.position, nearest.position) };
  }

  const altType = needType === "water" ? "berry" : "water";
  const altCandidates = nearbyResources
    .filter((r) => r.resourceType === altType && r.quantity > 0)
    .sort((a, b) => manhattan(self.position, a.position) - manhattan(self.position, b.position));
  const altNearest = altCandidates[0];
  if (altNearest) {
    if (manhattan(self.position, altNearest.position) <= 1)
      return { actorId, type: "gather", targetId: altNearest.id };
    return { actorId, type: "move", position: stepToward(self.position, altNearest.position) };
  }

  return { actorId, type: "idle" };
}

describe("integration: rule-based agent survival", () => {
  it("agent moves toward nearest needed resource", () => {
    const world = createWorld(goldenScenarioConfig);
    const agentA = world.entities["entity_0" as EntityId];
    expect(agentA.needs.thirst).toBe(10);

    const intent = decideForTest("entity_0", world);
    expect(intent.type).toBe("move");
    expect(intent.position!.x).toBeGreaterThan(agentA.position.x);
  });

  it("golden scenario survives 50 ticks without invalid consume loop", () => {
    let world = createWorld(goldenScenarioConfig);
    const allEvents: string[] = [];
    let invalidConsume = 0;

    for (let t = 0; t < 50; t++) {
      const intents: ActionIntent[] = [];
      for (const entityId of Object.keys(world.entities)) {
        const entity = world.entities[entityId] as EntityState;
        if (!entity.alive) continue;
        intents.push(decideForTest(entityId, world));
      }

      const result = tickWorld(world, intents, GOLDEN_TICK_CONTEXT);
      world = result.world;

      for (const ev of result.events) {
        allEvents.push(ev.type);
      }
      for (const rej of result.rejections) {
        if (rej.intent.type === "eat" || rej.intent.type === "drink") {
          invalidConsume++;
        }
      }
    }

    const aliveCount = (Object.values(world.entities) as EntityState[]).filter((e) => e.alive).length;
    expect(aliveCount).toBeGreaterThan(0);
    expect(allEvents).toContain("TIME_TICKED");
    expect(allEvents).toContain("NEED_DECAYED");
    expect(invalidConsume).toBe(0);

    console.log(`[Golden Scenario] After 50 ticks: ${aliveCount}/5 alive, ${allEvents.length} events, ${invalidConsume} invalid consumes`);
  });
});
