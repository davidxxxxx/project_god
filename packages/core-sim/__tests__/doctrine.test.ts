/**
 * doctrine.test.ts — MVP-07B Doctrine system tests.
 */

import { describe, it, expect } from "vitest";
import { tickDoctrine } from "../src/systems/doctrine-tick";
import type { WorldState, EntityState, TribeState, SimEvent } from "@project-god/shared";
import type { EntityId, TribeId } from "@project-god/shared";

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

const TICKS_PER_YEAR = 40;

// ── Tests ────────────────────────────────────────────────────

describe("doctrine system (MVP-07B)", () => {

  describe("doctrine formation", () => {
    it("forms fire_sacred when STRUCTURE_BUILT fire_pit and faith >= 8", () => {
      const e1 = makeEntity("e1", 10);
      const world = makeWorld([e1]);

      const triggerEvents: SimEvent[] = [
        { type: "STRUCTURE_BUILT", tick: 10, entityId: "e1" as EntityId, structureId: "s1", structureType: "fire_pit", position: { x: 5, y: 5 } } as any,
      ];

      const events = tickDoctrine(world, triggerEvents, TICKS_PER_YEAR);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];

      expect(tribe.doctrines).toBeDefined();
      expect(tribe.doctrines!.length).toBe(1);
      expect(tribe.doctrines![0].id).toBe("fire_sacred");
      expect(tribe.doctrines![0].type).toBe("taboo");
      expect(tribe.doctrines![0].strength).toBe(50);

      const formed = events.find(e => e.type === "DOCTRINE_FORMED");
      expect(formed).toBeDefined();
    });

    it("forms honor_the_dead when ENTITY_DIED and faith >= 5", () => {
      const e1 = makeEntity("e1", 8);
      const world = makeWorld([e1]);

      const triggerEvents: SimEvent[] = [
        { type: "ENTITY_DIED", tick: 10, entityId: "e2" as EntityId, cause: "starvation" } as any,
      ];

      const events = tickDoctrine(world, triggerEvents, TICKS_PER_YEAR);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];

      expect(tribe.doctrines!.some(d => d.id === "honor_the_dead")).toBe(true);
    });

    it("forms divine_bounty when MIRACLE_PERFORMED and faith >= 8", () => {
      const e1 = makeEntity("e1", 12);
      const world = makeWorld([e1]);

      const triggerEvents: SimEvent[] = [
        { type: "MIRACLE_PERFORMED", tick: 10, miracleType: "rain", cost: 3 } as any,
      ];

      const events = tickDoctrine(world, triggerEvents, TICKS_PER_YEAR);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];

      expect(tribe.doctrines!.some(d => d.id === "divine_bounty")).toBe(true);
    });

    it("does NOT form doctrine if tribe average faith too low", () => {
      const e1 = makeEntity("e1", 3); // faith 3 < fire_sacred threshold 8
      const world = makeWorld([e1]);

      const triggerEvents: SimEvent[] = [
        { type: "STRUCTURE_BUILT", tick: 10, entityId: "e1" as EntityId, structureId: "s1", structureType: "fire_pit", position: { x: 5, y: 5 } } as any,
      ];

      const events = tickDoctrine(world, triggerEvents, TICKS_PER_YEAR);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];

      expect(tribe.doctrines!.length).toBe(0);
    });

    it("does NOT form duplicate doctrines", () => {
      const e1 = makeEntity("e1", 15);
      const world = makeWorld([e1]);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      tribe.doctrines = [{
        id: "fire_sacred", type: "taboo",
        description: "test", strength: 50,
        formedAtTick: 5, formedReason: "STRUCTURE_BUILT",
      }];

      const triggerEvents: SimEvent[] = [
        { type: "STRUCTURE_BUILT", tick: 10, entityId: "e1" as EntityId, structureId: "s2", structureType: "fire_pit", position: { x: 5, y: 5 } } as any,
      ];

      tickDoctrine(world, triggerEvents, TICKS_PER_YEAR);

      // Should still be 1 (reinforced, not duplicated)
      expect(tribe.doctrines!.filter(d => d.id === "fire_sacred").length).toBe(1);
    });
  });

  describe("doctrine violation", () => {
    it("applying faith penalty when fire_pit expires (fire_sacred violation)", () => {
      const e1 = makeEntity("e1", 20);
      const world = makeWorld([e1]);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      tribe.doctrines = [{
        id: "fire_sacred", type: "taboo",
        description: "test", strength: 50,
        formedAtTick: 5, formedReason: "STRUCTURE_BUILT",
      }];

      const violationEvents: SimEvent[] = [
        { type: "STRUCTURE_EXPIRED", tick: 10, structureId: "s1", structureType: "fire_pit", position: { x: 5, y: 5 } } as any,
      ];

      const events = tickDoctrine(world, violationEvents, TICKS_PER_YEAR);

      // Faith should decrease by 3
      expect(e1.attributes.faith).toBe(17); // 20 - 3
      const violated = events.find(e => e.type === "DOCTRINE_VIOLATED");
      expect(violated).toBeDefined();
    });

    it("does NOT trigger violation for non-fire_pit structure expiry", () => {
      const e1 = makeEntity("e1", 20);
      const world = makeWorld([e1]);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      tribe.doctrines = [{
        id: "fire_sacred", type: "taboo",
        description: "test", strength: 50,
        formedAtTick: 5, formedReason: "STRUCTURE_BUILT",
      }];

      const violationEvents: SimEvent[] = [
        { type: "STRUCTURE_EXPIRED", tick: 10, structureId: "s1", structureType: "lean_to", position: { x: 5, y: 5 } } as any,
      ];

      tickDoctrine(world, violationEvents, TICKS_PER_YEAR);

      expect(e1.attributes.faith).toBe(20); // unchanged
    });
  });

  describe("doctrine reinforcement", () => {
    it("increases strength when trigger event recurs", () => {
      const e1 = makeEntity("e1", 15);
      const world = makeWorld([e1], 20);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      tribe.doctrines = [{
        id: "fire_sacred", type: "taboo",
        description: "test", strength: 50,
        formedAtTick: 5, formedReason: "STRUCTURE_BUILT",
      }];

      const triggerEvents: SimEvent[] = [
        { type: "STRUCTURE_BUILT", tick: 20, entityId: "e1" as EntityId, structureId: "s2", structureType: "fire_pit", position: { x: 5, y: 5 } } as any,
      ];

      const events = tickDoctrine(world, triggerEvents, TICKS_PER_YEAR);

      expect(tribe.doctrines![0].strength).toBe(52); // 50 + 2
      const reinforced = events.find(e => e.type === "DOCTRINE_REINFORCED");
      expect(reinforced).toBeDefined();
    });

    it("caps strength at 100", () => {
      const e1 = makeEntity("e1", 15);
      const world = makeWorld([e1], 20);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      tribe.doctrines = [{
        id: "fire_sacred", type: "taboo",
        description: "test", strength: 99,
        formedAtTick: 5, formedReason: "STRUCTURE_BUILT",
      }];

      const triggerEvents: SimEvent[] = [
        { type: "STRUCTURE_BUILT", tick: 20, entityId: "e1" as EntityId, structureId: "s2", structureType: "fire_pit", position: { x: 5, y: 5 } } as any,
      ];

      tickDoctrine(world, triggerEvents, TICKS_PER_YEAR);

      expect(tribe.doctrines![0].strength).toBe(100);
    });
  });

  describe("yearly decay", () => {
    it("decays doctrine strength by 1 per year", () => {
      const e1 = makeEntity("e1", 15);
      const world = makeWorld([e1], 40); // tick 40 = 1 year
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      tribe.doctrines = [{
        id: "fire_sacred", type: "taboo",
        description: "test", strength: 50,
        formedAtTick: 5, formedReason: "STRUCTURE_BUILT",
      }];

      tickDoctrine(world, [], TICKS_PER_YEAR);

      expect(tribe.doctrines![0].strength).toBe(49);
    });

    it("removes doctrines at strength 0", () => {
      const e1 = makeEntity("e1", 15);
      const world = makeWorld([e1], 40);
      const tribe = (Object.values(world.tribes!) as TribeState[])[0];
      tribe.doctrines = [{
        id: "fire_sacred", type: "taboo",
        description: "test", strength: 1,
        formedAtTick: 5, formedReason: "STRUCTURE_BUILT",
      }];

      tickDoctrine(world, [], TICKS_PER_YEAR);

      expect(tribe.doctrines!.length).toBe(0);
    });
  });
});
