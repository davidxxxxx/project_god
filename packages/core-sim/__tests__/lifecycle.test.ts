/**
 * lifecycle.test.ts — MVP-04 life cycle system tests.
 *
 * Tests:
 *   - Age increments every TICKS_PER_YEAR ticks
 *   - Life stage transitions (child → adult → elder)
 *   - Natural death at maxAge
 *   - Status tags reflect life stage
 *   - Pair bonding (opposite sex + adult + proximity + trust)
 *   - Birth (paired adults + cooldown + hunger)
 *   - Child behavior (half hunger decay, follow parent)
 */

import { describe, it, expect } from "vitest";
import { createWorld, type WorldConfig } from "../src/create-world";
import { tickWorld, type TickContext } from "../src/tick";
import { tickLifecycle, getLifeStage } from "../src/systems/lifecycle-tick";
import { decayNeeds } from "../src/systems/decay-needs";
import type { EntityState, WorldState, TribeState } from "@project-god/shared";
import type { EntityId, TribeId } from "@project-god/shared";
import type { LifecycleDef } from "../src/content-types";

// ── Test Constants ──────────────────────────────────────────

const TEST_LIFECYCLE: LifecycleDef = {
  TICKS_PER_YEAR: 10,  // faster for testing (10 ticks = 1 year)
  ADULTHOOD_AGE: 15,
  ELDER_AGE_RATIO: 0.75,
  DEFAULT_MAX_AGE: 70,
  MAX_AGE_VARIANCE: 10,
  BIRTH_COOLDOWN_YEARS: 4,
  MIN_BIRTH_HUNGER: 40,
  CHILD_FOLLOW_RADIUS: 2,
  PAIRING_MIN_TRUST: 0.5,
  PAIRING_MIN_AGE: 16,
  ATTRIBUTE_MUTATION_RANGE: 2,
};

const BASIC_NEEDS = {
  hunger:  { max: 100, initial: 80, decayPerTick: 1, deathThreshold: 0, criticalThreshold: 25 },
  thirst:  { max: 100, initial: 80, decayPerTick: 2, deathThreshold: 0, criticalThreshold: 25 },
};

function makeEntity(id: string, overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: id as EntityId,
    type: "human",
    tribeId: "tribe_0" as TribeId,
    position: { x: 5, y: 5 },
    attributes: { intelligence: 5, body: 5, faith: 0 },
    needs: { hunger: 80, thirst: 80 },
    inventory: {},
    alive: true,
    age: 25,
    sex: "male",
    maxAge: 70,
    bornAtTick: -250, // age 25 at tick 0 with TICKS_PER_YEAR=10
    ...overrides,
  };
}

function makeWorld(entities: EntityState[], tick: number = 0): WorldState {
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
        memberIds: entities.map((e) => e.id),
        technologies: [],
      },
    },
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("lifecycle system", () => {

  describe("getLifeStage", () => {
    it("returns child for age < ADULTHOOD_AGE", () => {
      expect(getLifeStage(0, 70, TEST_LIFECYCLE)).toBe("child");
      expect(getLifeStage(14, 70, TEST_LIFECYCLE)).toBe("child");
    });

    it("returns adult for age >= ADULTHOOD_AGE and < elder", () => {
      expect(getLifeStage(15, 70, TEST_LIFECYCLE)).toBe("adult");
      expect(getLifeStage(40, 70, TEST_LIFECYCLE)).toBe("adult");
      expect(getLifeStage(52, 70, TEST_LIFECYCLE)).toBe("adult");
    });

    it("returns elder for age >= maxAge * ELDER_AGE_RATIO", () => {
      // 70 * 0.75 = 52.5, so age 53 is elder
      expect(getLifeStage(53, 70, TEST_LIFECYCLE)).toBe("elder");
      expect(getLifeStage(70, 70, TEST_LIFECYCLE)).toBe("elder");
    });
  });

  describe("aging", () => {
    it("increments age every TICKS_PER_YEAR ticks", () => {
      const entity = makeEntity("e1", { age: 25, bornAtTick: -250 });
      const world = makeWorld([entity], 0);

      // After 10 ticks (1 year), age should become 26
      world.tick = 10;
      const events = tickLifecycle(world, TEST_LIFECYCLE);
      expect(entity.age).toBe(26);
    });

    it("does not increment age for partial years", () => {
      const entity = makeEntity("e1", { age: 25, bornAtTick: -250 });
      const world = makeWorld([entity], 0);

      world.tick = 5; // half a year
      tickLifecycle(world, TEST_LIFECYCLE);
      expect(entity.age).toBe(25); // unchanged
    });
  });

  describe("natural death", () => {
    it("kills entity when age reaches maxAge", () => {
      const entity = makeEntity("e1", { age: 69, maxAge: 70, bornAtTick: -690 });
      const world = makeWorld([entity], 0);

      // Advance to tick 10 → age becomes 70 = maxAge
      world.tick = 10;
      const events = tickLifecycle(world, TEST_LIFECYCLE);

      expect(entity.alive).toBe(false);
      const deathEvent = events.find((e) => e.type === "ENTITY_DIED");
      expect(deathEvent).toBeDefined();
      expect((deathEvent as any).cause).toBe("old_age");
    });

    it("does NOT kill entity before maxAge", () => {
      const entity = makeEntity("e1", { age: 68, maxAge: 70, bornAtTick: -680 });
      const world = makeWorld([entity], 0);

      world.tick = 10;
      tickLifecycle(world, TEST_LIFECYCLE);

      expect(entity.alive).toBe(true);
      expect(entity.age).toBe(69);
    });
  });

  describe("life stage transitions", () => {
    it("emits ENTITY_AGED when transitioning child → adult", () => {
      const entity = makeEntity("e1", { age: 14, maxAge: 70, bornAtTick: -140, sex: "female", statuses: ["child"] });
      const world = makeWorld([entity], 0);

      world.tick = 10; // age becomes 15 = ADULTHOOD_AGE
      const events = tickLifecycle(world, TEST_LIFECYCLE);

      const aged = events.find((e) => e.type === "ENTITY_AGED");
      expect(aged).toBeDefined();
      expect((aged as any).newStage).toBe("adult");
      expect(entity.statuses).not.toContain("child");
    });

    it("adds elder status when transitioning adult → elder", () => {
      // maxAge 70, elder at 70 * 0.75 = 52.5 → age 53 triggers
      const entity = makeEntity("e1", { age: 52, maxAge: 70, bornAtTick: -520 });
      const world = makeWorld([entity], 0);

      world.tick = 10;
      const events = tickLifecycle(world, TEST_LIFECYCLE);

      expect(entity.statuses).toContain("elder");
      const aged = events.find((e) => e.type === "ENTITY_AGED");
      expect(aged).toBeDefined();
      expect((aged as any).newStage).toBe("elder");
    });
  });

  describe("pair bonding", () => {
    it("pairs two opposite-sex adults with sufficient trust", () => {
      const male = makeEntity("m1", {
        sex: "male", age: 20, position: { x: 5, y: 5 },
        socialMemory: { f1: { entityId: "f1", trust: 0.6, lastSeenTick: 0 } },
      });
      const female = makeEntity("f1", {
        id: "f1" as EntityId,
        sex: "female", age: 20, position: { x: 5, y: 6 }, // adjacent
        socialMemory: { m1: { entityId: "m1", trust: 0.6, lastSeenTick: 0 } },
      });
      const world = makeWorld([male, female], 0);

      const events = tickLifecycle(world, TEST_LIFECYCLE);

      expect(male.spouseId).toBe("f1");
      expect(female.spouseId).toBe("m1");
      const bondEvent = events.find((e) => e.type === "PAIR_BONDED");
      expect(bondEvent).toBeDefined();
    });

    it("does NOT pair same-sex entities", () => {
      const m1 = makeEntity("m1", {
        sex: "male", age: 20, position: { x: 5, y: 5 },
        socialMemory: { m2: { entityId: "m2", trust: 0.8, lastSeenTick: 0 } },
      });
      const m2 = makeEntity("m2", {
        id: "m2" as EntityId,
        sex: "male", age: 20, position: { x: 5, y: 6 },
        socialMemory: { m1: { entityId: "m1", trust: 0.8, lastSeenTick: 0 } },
      });
      const world = makeWorld([m1, m2], 0);

      tickLifecycle(world, TEST_LIFECYCLE);

      expect(m1.spouseId).toBeUndefined();
      expect(m2.spouseId).toBeUndefined();
    });

    it("does NOT pair entities with low trust", () => {
      const male = makeEntity("m1", {
        sex: "male", age: 20, position: { x: 5, y: 5 },
        socialMemory: { f1: { entityId: "f1", trust: 0.2, lastSeenTick: 0 } },
      });
      const female = makeEntity("f1", {
        id: "f1" as EntityId,
        sex: "female", age: 20, position: { x: 5, y: 6 },
        socialMemory: { m1: { entityId: "m1", trust: 0.2, lastSeenTick: 0 } },
      });
      const world = makeWorld([male, female], 0);

      tickLifecycle(world, TEST_LIFECYCLE);

      expect(male.spouseId).toBeUndefined();
    });

    it("does NOT pair children", () => {
      const male = makeEntity("m1", {
        sex: "male", age: 10, bornAtTick: -100, position: { x: 5, y: 5 },
        statuses: ["child"],
        socialMemory: { f1: { entityId: "f1", trust: 0.8, lastSeenTick: 0 } },
      });
      const female = makeEntity("f1", {
        id: "f1" as EntityId,
        sex: "female", age: 20, position: { x: 5, y: 6 },
        socialMemory: { m1: { entityId: "m1", trust: 0.8, lastSeenTick: 0 } },
      });
      const world = makeWorld([male, female], 0);

      tickLifecycle(world, TEST_LIFECYCLE);

      expect(male.spouseId).toBeUndefined();
    });
  });

  describe("birth", () => {
    it("creates a child when paired adults are at same position with sufficient hunger", () => {
      const mother = makeEntity("mom", {
        sex: "female", age: 25, position: { x: 5, y: 5 },
        spouseId: "dad" as EntityId,
        needs: { hunger: 80, thirst: 80 },
        lastBirthTick: -9999, // long ago
      });
      const father = makeEntity("dad", {
        id: "dad" as EntityId,
        sex: "male", age: 25, position: { x: 5, y: 5 }, // same position
        spouseId: "mom" as EntityId,
        needs: { hunger: 80, thirst: 80 },
        lastBirthTick: -9999,
      });
      const world = makeWorld([mother, father], 100);

      const events = tickLifecycle(world, TEST_LIFECYCLE);

      const bornEvent = events.find((e) => e.type === "ENTITY_BORN");
      expect(bornEvent).toBeDefined();

      // A new entity should exist
      const allEntities = Object.values(world.entities) as EntityState[];
      expect(allEntities.length).toBe(3); // mom + dad + child
      const child = allEntities.find((e) => e.id !== "mom" && e.id !== "dad");
      expect(child).toBeDefined();
      expect(child!.age).toBe(0);
      expect(child!.statuses).toContain("child");
      expect(child!.parentIds).toEqual(["mom", "dad"]);

      // Parents should have the child in their childIds
      expect(mother.childIds).toContain(child!.id);
      expect(father.childIds).toContain(child!.id);
    });

    it("respects birth cooldown", () => {
      const tick = 100;
      const mother = makeEntity("mom", {
        sex: "female", age: 25, position: { x: 5, y: 5 },
        spouseId: "dad" as EntityId,
        needs: { hunger: 80, thirst: 80 },
        lastBirthTick: tick - 10, // only 10 ticks ago, cooldown is 40
      });
      const father = makeEntity("dad", {
        id: "dad" as EntityId,
        sex: "male", age: 25, position: { x: 5, y: 5 },
        spouseId: "mom" as EntityId,
        needs: { hunger: 80, thirst: 80 },
        lastBirthTick: tick - 10,
      });
      const world = makeWorld([mother, father], tick);

      const events = tickLifecycle(world, TEST_LIFECYCLE);
      const bornEvent = events.find((e) => e.type === "ENTITY_BORN");
      expect(bornEvent).toBeUndefined(); // no birth — too soon
    });

    it("does NOT birth if parents are at different positions", () => {
      const mother = makeEntity("mom", {
        sex: "female", age: 25, position: { x: 5, y: 5 },
        spouseId: "dad" as EntityId,
        lastBirthTick: -9999,
      });
      const father = makeEntity("dad", {
        id: "dad" as EntityId,
        sex: "male", age: 25, position: { x: 7, y: 7 }, // different position
        spouseId: "mom" as EntityId,
        lastBirthTick: -9999,
      });
      const world = makeWorld([mother, father], 100);

      const events = tickLifecycle(world, TEST_LIFECYCLE);
      const bornEvent = events.find((e) => e.type === "ENTITY_BORN");
      expect(bornEvent).toBeUndefined();
    });

    it("does NOT birth if hunger is too low", () => {
      const mother = makeEntity("mom", {
        sex: "female", age: 25, position: { x: 5, y: 5 },
        spouseId: "dad" as EntityId,
        needs: { hunger: 20, thirst: 80 }, // hungry!
        lastBirthTick: -9999,
      });
      const father = makeEntity("dad", {
        id: "dad" as EntityId,
        sex: "male", age: 25, position: { x: 5, y: 5 },
        spouseId: "mom" as EntityId,
        needs: { hunger: 80, thirst: 80 },
        lastBirthTick: -9999,
      });
      const world = makeWorld([mother, father], 100);

      const events = tickLifecycle(world, TEST_LIFECYCLE);
      const bornEvent = events.find((e) => e.type === "ENTITY_BORN");
      expect(bornEvent).toBeUndefined();
    });

    it("adds newborn to tribe memberIds", () => {
      const mother = makeEntity("mom", {
        sex: "female", age: 25, position: { x: 5, y: 5 },
        spouseId: "dad" as EntityId,
        lastBirthTick: -9999,
      });
      const father = makeEntity("dad", {
        id: "dad" as EntityId,
        sex: "male", age: 25, position: { x: 5, y: 5 },
        spouseId: "mom" as EntityId,
        lastBirthTick: -9999,
      });
      const world = makeWorld([mother, father], 100);

      tickLifecycle(world, TEST_LIFECYCLE);

      const tribe = world.tribes!["tribe_0"] as TribeState;
      expect(tribe.memberIds.length).toBe(3);
    });
  });

  describe("child half-decay", () => {
    it("children lose hunger at half rate", () => {
      const child = makeEntity("c1", {
        age: 5, bornAtTick: -50,
        statuses: ["child"],
        needs: { hunger: 80, thirst: 80 },
      });
      const world = makeWorld([child], 0);

      world.tick = 1;
      decayNeeds(world, BASIC_NEEDS);

      // Adult decays 1 per tick, child should decay 0.5
      expect(child.needs.hunger).toBe(79.5);
      expect(child.needs.thirst).toBe(79); // thirst: 2 * 0.5 = 1
    });
  });

  describe("spouse cleanup on death", () => {
    it("clears spouse reference when partner dies of old age", () => {
      const dying = makeEntity("old", {
        sex: "male", age: 69, maxAge: 70, bornAtTick: -690,
        spouseId: "spouse" as EntityId,
      });
      const spouse = makeEntity("spouse", {
        id: "spouse" as EntityId,
        sex: "female", age: 30, maxAge: 70, bornAtTick: -300,
        spouseId: "old" as EntityId,
      });
      const world = makeWorld([dying, spouse], 0);

      world.tick = 10;
      tickLifecycle(world, TEST_LIFECYCLE);

      expect(dying.alive).toBe(false);
      expect(spouse.spouseId).toBeUndefined();
    });
  });
});
