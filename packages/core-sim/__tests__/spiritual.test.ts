/**
 * spiritual.test.ts — MVP-07A Spiritual system tests.
 */

import { describe, it, expect } from "vitest";
import { tickSpiritual } from "../src/systems/spiritual-tick";
import type { WorldState, EntityState, TribeState, SimEvent } from "@project-god/shared";
import type { EntityId, TribeId, StructureId } from "@project-god/shared";

// ── Helpers ──────────────────────────────────────────────────

function makeEntity(id: string, faith: number = 10, overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: id as EntityId,
    type: "human",
    tribeId: "tribe_0" as TribeId,
    position: { x: 5, y: 5 },
    attributes: { intelligence: 5, body: 5, faith },
    needs: { hunger: 80, thirst: 80, exposure: 100 },
    inventory: {},
    alive: true,
    age: 25,
    sex: "male",
    maxAge: 70,
    bornAtTick: 0,
    ...overrides,
  };
}

function makeWorld(entities: EntityState[], tick: number = 10): WorldState {
  const entMap: Record<string, EntityState> = {};
  for (const e of entities) entMap[e.id] = e;

  return {
    tick,
    seed: 12345,
    width: 20,
    height: 20,
    rngState: 42,
    tiles: {},
    entities: entMap,
    resourceNodes: {},
    tribes: {
      tribe_0: {
        id: "tribe_0" as TribeId,
        name: "Test Tribe",
        memberIds: entities.map(e => e.id),
        technologies: [],
      },
    },
    divinePoints: 5,
    maxDivinePoints: 20,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("spiritual system (MVP-07A)", () => {

  describe("spiritual_awareness skill", () => {
    it("grants spiritual_awareness at faith >= 12", () => {
      const e1 = makeEntity("e1", 12);
      const world = makeWorld([e1]);

      const events = tickSpiritual(world);

      expect(e1.skills?.["spiritual_awareness"]).toBe(0.5);
      const learned = events.find(e => e.type === "SKILL_LEARNED");
      expect(learned).toBeDefined();
    });

    it("does NOT grant spiritual_awareness at faith < 12", () => {
      const e1 = makeEntity("e1", 11);
      const world = makeWorld([e1]);

      tickSpiritual(world);

      expect(e1.skills?.["spiritual_awareness"]).toBeUndefined();
    });

    it("does NOT grant to children", () => {
      const e1 = makeEntity("e1", 15, { statuses: ["child"] });
      const world = makeWorld([e1]);

      tickSpiritual(world);

      expect(e1.skills?.["spiritual_awareness"]).toBeUndefined();
    });

    it("does NOT double-grant if already has skill", () => {
      const e1 = makeEntity("e1", 15, { skills: { spiritual_awareness: 0.5 } });
      const world = makeWorld([e1]);

      const events = tickSpiritual(world);

      const learned = events.find(e => e.type === "SKILL_LEARNED" && (e as any).skillId === "spiritual_awareness");
      expect(learned).toBeUndefined();
    });
  });

  describe("priest election", () => {
    it("elects highest-faith adult as priest at faith >= 15", () => {
      const e1 = makeEntity("e1", 15);
      const e2 = makeEntity("e2", 20, { id: "e2" as EntityId });
      const world = makeWorld([e1, e2]);

      const events = tickSpiritual(world);

      expect(e2.role).toBe("priest");
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      expect(tribe.priestId).toBe("e2");

      const roleEvent = events.find(e => e.type === "ROLE_ASSIGNED");
      expect(roleEvent).toBeDefined();
    });

    it("does NOT elect priest if no one has faith >= 15", () => {
      const e1 = makeEntity("e1", 14);
      const world = makeWorld([e1]);

      tickSpiritual(world);

      expect(e1.role).toBeUndefined();
    });

    it("replaces priest when current priest dies", () => {
      const e1 = makeEntity("e1", 20, { role: "priest" });
      const e2 = makeEntity("e2", 18, { id: "e2" as EntityId });
      const world = makeWorld([e1, e2]);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      tribe.priestId = "e1" as EntityId;

      // Kill the priest
      e1.alive = false;
      const events = tickSpiritual(world);

      // e2 should become priest
      expect(e2.role).toBe("priest");
      expect(tribe.priestId).toBe("e2");
    });
  });

  describe("shrine linking", () => {
    it("links tribe to shrine when one exists", () => {
      const e1 = makeEntity("e1", 15);
      const world = makeWorld([e1]);
      world.structures = {
        shrine_1: {
          id: "shrine_1" as StructureId,
          type: "shrine",
          position: { x: 5, y: 5 },
          durability: 1000,
          builtByEntityId: "e1" as EntityId,
          builtAtTick: 5,
          active: true,
        },
      };

      tickSpiritual(world);

      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      expect(tribe.spiritualCenterId).toBe("shrine_1");
    });

    it("unlinks tribe when shrine becomes inactive", () => {
      const e1 = makeEntity("e1", 15);
      const world = makeWorld([e1]);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      tribe.spiritualCenterId = "shrine_1";
      world.structures = {
        shrine_1: {
          id: "shrine_1" as StructureId,
          type: "shrine",
          position: { x: 5, y: 5 },
          durability: 0,
          builtByEntityId: "e1" as EntityId,
          builtAtTick: 5,
          active: false,
        },
      };

      tickSpiritual(world);

      expect(tribe.spiritualCenterId).toBeUndefined();
    });
  });
});
