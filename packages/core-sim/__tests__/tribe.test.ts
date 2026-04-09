/**
 * tribe.test.ts — Unit tests for MVP-02-E Tribe system.
 *
 * Tests:
 * - TribeState auto-initialization in createWorld
 * - Gather point (centroid) calculation
 * - Dead member removal
 * - Social memory updates
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createWorld, type WorldConfig } from "../src/create-world";
import { tickTribes } from "../src/systems/tribe-tick";
import { updateSocialMemory } from "@project-god/agent-runtime";
import type { WorldState, EntityState, TribeState, Vec2 } from "@project-god/shared";

const BASE_CONFIG: WorldConfig = {
  seed: 42,
  width: 20,
  height: 20,
  entityCount: 3,
  terrain: { grass: { passable: true } },
  needs: { hunger: { initial: 100, min: 0, max: 100, decayPerTick: 1 }, thirst: { initial: 100, min: 0, max: 100, decayPerTick: 2 } },
};

describe("tribe initialization (MVP-02-E)", () => {
  it("createWorld auto-creates tribe_0 with all entities as members", () => {
    const world = createWorld(BASE_CONFIG);
    expect(world.tribes).toBeDefined();
    expect(world.tribes!["tribe_0"]).toBeDefined();

    const tribe = world.tribes!["tribe_0"] as TribeState;
    expect(tribe.name).toBe("First Tribe");
    expect(tribe.memberIds).toHaveLength(3);
    expect(tribe.technologies).toEqual([]);
  });

  it("all entities reference tribe_0 as their tribeId", () => {
    const world = createWorld(BASE_CONFIG);
    for (const entity of Object.values(world.entities) as EntityState[]) {
      expect(entity.tribeId).toBe("tribe_0");
    }
  });
});

describe("tribe tick system", () => {
  function makeWorld(entities: EntityState[]): WorldState {
    const ents: Record<string, EntityState> = {};
    for (const e of entities) ents[e.id] = e;
    return {
      tick: 1,
      seed: 42,
      width: 20,
      height: 20,
      rngState: 42,
      tiles: {},
      entities: ents,
      resourceNodes: {},
      tribes: {
        tribe_0: {
          id: "tribe_0",
          name: "First Tribe",
          memberIds: entities.map((e) => e.id),
          technologies: [],
        } as TribeState,
      },
    };
  }

  function makeEntity(id: string, pos: Vec2, alive = true): EntityState {
    return {
      id, type: "human", tribeId: "tribe_0",
      position: pos,
      attributes: {}, needs: { hunger: 80, thirst: 80 },
      inventory: {}, alive,
    };
  }

  it("calculates gatherPoint as centroid of alive members", () => {
    const world = makeWorld([
      makeEntity("e0", { x: 0, y: 0 }),
      makeEntity("e1", { x: 10, y: 0 }),
      makeEntity("e2", { x: 0, y: 10 }),
    ]);

    tickTribes(world);
    const tribe = world.tribes!["tribe_0"] as TribeState;
    // Centroid of (0,0), (10,0), (0,10) = (3,3) rounded
    expect(tribe.gatherPoint).toEqual({ x: 3, y: 3 });
  });

  it("removes dead members from memberIds", () => {
    const world = makeWorld([
      makeEntity("e0", { x: 5, y: 5 }, true),
      makeEntity("e1", { x: 5, y: 5 }, false), // dead
    ]);

    tickTribes(world);
    const tribe = world.tribes!["tribe_0"] as TribeState;
    expect(tribe.memberIds).toEqual(["e0"]);
  });

  it("sets gatherPoint to undefined when all members dead", () => {
    const world = makeWorld([
      makeEntity("e0", { x: 5, y: 5 }, false),
      makeEntity("e1", { x: 5, y: 5 }, false),
    ]);

    tickTribes(world);
    const tribe = world.tribes!["tribe_0"] as TribeState;
    expect(tribe.memberIds).toHaveLength(0);
    expect(tribe.gatherPoint).toBeUndefined();
  });

  it("emits TRIBE_GATHER_POINT_UPDATED event when point changes", () => {
    const world = makeWorld([
      makeEntity("e0", { x: 5, y: 5 }),
      makeEntity("e1", { x: 15, y: 15 }),
    ]);

    const events = tickTribes(world);
    const gpEvent = events.find((e) => e.type === "TRIBE_GATHER_POINT_UPDATED");
    expect(gpEvent).toBeDefined();
    expect((gpEvent as any).position).toEqual({ x: 10, y: 10 });
    expect((gpEvent as any).memberCount).toBe(2);
  });
});

describe("social memory (MVP-02-E)", () => {
  function makeEntity(id: string, tribeId = "tribe_0"): EntityState {
    return {
      id, type: "human", tribeId,
      position: { x: 5, y: 5 },
      attributes: {}, needs: { hunger: 80, thirst: 80 },
      inventory: {}, alive: true,
    };
  }

  it("creates new social impression on first encounter", () => {
    const entity = makeEntity("e0");
    const nearby = [{ entityId: "e1", tribeId: "tribe_0", position: { x: 6, y: 5 } }];

    updateSocialMemory(entity, nearby, 10);

    expect(entity.socialMemory).toBeDefined();
    expect(entity.socialMemory!["e1"]).toBeDefined();
    expect(entity.socialMemory!["e1"].trust).toBe(0.3);
    expect(entity.socialMemory!["e1"].lastSeenTick).toBe(10);
  });

  it("increments trust for same-tribe on repeated encounters", () => {
    const entity = makeEntity("e0");
    const nearby = [{ entityId: "e1", tribeId: "tribe_0", position: { x: 6, y: 5 } }];

    updateSocialMemory(entity, nearby, 10);
    updateSocialMemory(entity, nearby, 11);
    updateSocialMemory(entity, nearby, 12);

    expect(entity.socialMemory!["e1"].trust).toBeCloseTo(0.3 + 0.05 * 2);
    expect(entity.socialMemory!["e1"].lastSeenTick).toBe(12);
  });

  it("caps trust at 0.8", () => {
    const entity = makeEntity("e0");
    const nearby = [{ entityId: "e1", tribeId: "tribe_0", position: { x: 6, y: 5 } }];

    for (let i = 0; i < 30; i++) {
      updateSocialMemory(entity, nearby, i);
    }

    expect(entity.socialMemory!["e1"].trust).toBe(0.8);
  });

  it("sets zero trust for different tribe entity", () => {
    const entity = makeEntity("e0", "tribe_0");
    const nearby = [{ entityId: "stranger", tribeId: "tribe_1", position: { x: 6, y: 5 } }];

    updateSocialMemory(entity, nearby, 10);

    expect(entity.socialMemory!["stranger"].trust).toBe(0);
  });
});
