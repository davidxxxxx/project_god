import { describe, it, expect } from "vitest";
import { createWorld, tickWorld } from "../src";
import type { TickContext, WorldConfig } from "../src";
import { ActionIntent, EntityId, EntityState, ResourceNodeId, SimEvent } from "@project-god/shared";

const NEEDS = {
  hunger:  { max: 100, initial: 80, decayPerTick: 1, deathThreshold: 0, criticalThreshold: 25 },
  thirst:  { max: 100, initial: 80, decayPerTick: 2, deathThreshold: 0, criticalThreshold: 25 },
};

const TERRAIN = {
  grass: { displayName: "Grass", moveCostMultiplier: 1, passable: true, fertility: 0.5 },
};

const RESOURCES = {
  berry: { displayName: "Berry", gatherAmount: 1, restoresNeed: { hunger: 20 }, maxQuantity: 10, regenPerTick: 0 },
  water: { displayName: "Water", gatherAmount: 1, restoresNeed: { thirst: 30 }, maxQuantity: -1, regenPerTick: 0 },
};

const ACTIONS = {
  idle:   { range: 0 },
  move:   { range: 1 },
  gather: { range: 1 },
  eat:    { requiresInventory: "berry" },
  drink:  { requiresInventory: "water" },
};

const ctx: TickContext = { needs: NEEDS, resources: RESOURCES, actions: ACTIONS, terrain: TERRAIN };

function makeWorld(overrides?: Partial<WorldConfig>) {
  return createWorld({ seed: 42, width: 5, height: 5, entityCount: 1, terrain: TERRAIN, needs: NEEDS, ...overrides });
}

function getEntity(world: { entities: Record<string, EntityState> }): EntityState {
  return (Object.values(world.entities) as EntityState[])[0];
}

describe("need decay", () => {
  it("reduces hunger by 1 and thirst by 2 per tick", () => {
    const world = makeWorld();
    const e = getEntity(world);
    const h0 = e.needs.hunger;
    const t0 = e.needs.thirst;
    const result = tickWorld(world, [], ctx);
    const updated = getEntity(result.world);
    expect(updated.needs.hunger).toBe(h0 - 1);
    expect(updated.needs.thirst).toBe(t0 - 2);
  });
});

describe("move", () => {
  it("updates entity position when valid", () => {
    const world = makeWorld();
    const e = getEntity(world);
    e.position = { x: 2, y: 2 };
    const target = { x: 3, y: 2 };
    const intent: ActionIntent = { actorId: e.id, type: "move", position: target };
    const result = tickWorld(world, [intent], ctx);
    const updated = getEntity(result.world);
    expect(updated.position).toEqual(target);
    expect(result.events.some((ev: SimEvent) => ev.type === "ENTITY_MOVED")).toBe(true);
  });
});

describe("gather", () => {
  it("fails when target is out of range", () => {
    const world = makeWorld({
      resourceNodes: [{ position: { x: 4, y: 4 }, resourceType: "berry", quantity: 5, maxQuantity: 10, regenPerTick: 0 }],
    });
    const e = getEntity(world);
    e.position = { x: 0, y: 0 };
    const intent: ActionIntent = { actorId: e.id, type: "gather", targetId: "rnode_0" as ResourceNodeId };
    const result = tickWorld(world, [intent], ctx);
    expect(result.rejections.length).toBe(1);
    expect(result.rejections[0].reason).toContain("too far");
  });

  it("reduces resource quantity and adds to inventory", () => {
    const world = makeWorld({
      resourceNodes: [{ position: { x: 1, y: 0 }, resourceType: "berry", quantity: 5, maxQuantity: 10, regenPerTick: 0 }],
    });
    const e = getEntity(world);
    e.position = { x: 0, y: 0 };
    const intent: ActionIntent = { actorId: e.id, type: "gather", targetId: "rnode_0" as ResourceNodeId };
    const result = tickWorld(world, [intent], ctx);
    expect(result.rejections.length).toBe(0);
    expect(result.events.some((ev: SimEvent) => ev.type === "RESOURCE_GATHERED")).toBe(true);
    const updated = getEntity(result.world);
    expect(updated.inventory["berry"]).toBe(1);
    expect(result.world.resourceNodes["rnode_0"].quantity).toBe(4);
  });
});

describe("eat", () => {
  it("fails with no berry in inventory", () => {
    const world = makeWorld();
    const e = getEntity(world);
    e.inventory = {};
    const intent: ActionIntent = { actorId: e.id, type: "eat" };
    const result = tickWorld(world, [intent], ctx);
    expect(result.rejections.length).toBe(1);
    expect(result.rejections[0].reason).toContain("No berry");
  });
});

describe("drink", () => {
  it("restores thirst and clamps to max", () => {
    const world = makeWorld();
    const e = getEntity(world);
    e.needs.thirst = 85;
    e.inventory = { water: 1 };
    const intent: ActionIntent = { actorId: e.id, type: "drink" };
    const result = tickWorld(world, [intent], ctx);
    const updated = getEntity(result.world);
    // 85 -2 decay = 83, +30 restore = 113, clamp to 100
    expect(updated.needs.thirst).toBe(100);
    expect(updated.inventory["water"]).toBeUndefined();
    expect(result.events.some((ev: SimEvent) => ev.type === "WATER_DRUNK")).toBe(true);
  });
});

describe("death", () => {
  it("kills entity when hunger reaches 0", () => {
    const world = makeWorld({ entityOverrides: [{ index: 0, needsOverride: { hunger: 1, thirst: 99 } }] });
    const result = tickWorld(world, [], ctx);
    const e = getEntity(result.world);
    expect(e.alive).toBe(false);
    expect(result.events.some((ev: SimEvent) => ev.type === "ENTITY_DIED")).toBe(true);
  });
});

describe("determinism", () => {
  it("same seed + same inputs → identical results", () => {
    const r1 = tickWorld(makeWorld(), [], ctx);
    const r2 = tickWorld(makeWorld(), [], ctx);
    expect(r1.events.length).toBe(r2.events.length);
    const e1 = getEntity(r1.world);
    const e2 = getEntity(r2.world);
    expect(e1.needs.hunger).toBe(e2.needs.hunger);
    expect(e1.needs.thirst).toBe(e2.needs.thirst);
  });
});
