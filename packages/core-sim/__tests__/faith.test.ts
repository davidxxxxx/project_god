/**
 * faith.test.ts — MVP-05 Faith/Prayer/Miracle system tests.
 *
 * Tests:
 *   - Faith yearly decay
 *   - Pray action validation (cooldown, faith, child, already praying)
 *   - Prayer timeout → faith loss
 *   - Divine points regeneration from active prayers
 *   - Miracle effects (bless, heal, rain, bounty)
 *   - Divine points cost + insufficient points
 *   - Faith gain on miracle + witness propagation
 */

import { describe, it, expect } from "vitest";
import { tickFaith, performMiracle, startPrayer, completePrayer } from "../src/systems/faith-tick";
import { validatePray } from "../src/validate/validate-pray";
import { executePray } from "../src/execute/execute-pray";
import type { EntityState, WorldState, SimEvent } from "@project-god/shared";
import type { EntityId, TribeId } from "@project-god/shared";
import type { FaithDef } from "../src/content-types";

// ── Test Constants ──────────────────────────────────────────

const TEST_FAITH: FaithDef = {
  INITIAL_FAITH: 10,
  MIN_PRAYER_FAITH: 5,
  PRAYER_COOLDOWN: 20,
  PRAYER_DURATION: 3,
  PRAYER_RESPONSE_WINDOW: 10,
  FAITH_GAIN_ON_MIRACLE: 15,
  FAITH_GAIN_WITNESS: 5,
  FAITH_DECAY_UNANSWERED: 5,
  FAITH_DECAY_PER_YEAR: 1,
  DIVINE_POINTS_INITIAL: 5,
  DIVINE_POINTS_MAX: 20,
  DIVINE_REGEN_PER_PRAYER: 0.5,
  BLESS_COST: 1,
  HEAL_COST: 1,
  RAIN_COST: 3,
  BOUNTY_COST: 3,
  BLESS_HUNGER_RESTORE: 30,
  BLESS_THIRST_RESTORE: 30,
  RAIN_WATER_RESTORE: 50,
  BOUNTY_BERRY_RESTORE: 20,
};

const TICKS_PER_YEAR = 40;

function makeEntity(id: string, overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: id as EntityId,
    type: "human",
    tribeId: "tribe_0" as TribeId,
    position: { x: 5, y: 5 },
    attributes: { intelligence: 5, body: 5, faith: 10 },
    needs: { hunger: 80, thirst: 80, exposure: 100 },
    inventory: {},
    alive: true,
    age: 25,
    sex: "male",
    maxAge: 70,
    bornAtTick: -1000,
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
    resourceNodes: {
      water_1: {
        id: "water_1" as any,
        position: { x: 3, y: 3 },
        resourceType: "water",
        quantity: 50,
        maxQuantity: -1,
        regenPerTick: 0,
      },
      berry_1: {
        id: "berry_1" as any,
        position: { x: 7, y: 7 },
        resourceType: "berry",
        quantity: 10,
        maxQuantity: 20,
        regenPerTick: 0.1,
      },
    },
    tribes: {
      tribe_0: {
        id: "tribe_0" as TribeId,
        name: "Test Tribe",
        memberIds: entities.map((e) => e.id),
        technologies: [],
      },
    },
    divinePoints: 5,
    maxDivinePoints: 20,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe("faith system", () => {

  describe("yearly faith decay", () => {
    it("decays faith by FAITH_DECAY_PER_YEAR every TICKS_PER_YEAR", () => {
      const entity = makeEntity("e1", { attributes: { intelligence: 5, body: 5, faith: 10 } });
      const world = makeWorld([entity], TICKS_PER_YEAR); // exactly 1 year

      const events = tickFaith(world, TEST_FAITH, TICKS_PER_YEAR);

      expect(entity.attributes.faith).toBe(9);
      const changed = events.find((e) => e.type === "FAITH_CHANGED");
      expect(changed).toBeDefined();
      expect((changed as any).reason).toBe("yearly_decay");
    });

    it("does NOT decay at non-year boundaries", () => {
      const entity = makeEntity("e1", { attributes: { intelligence: 5, body: 5, faith: 10 } });
      const world = makeWorld([entity], 15);

      tickFaith(world, TEST_FAITH, TICKS_PER_YEAR);
      expect(entity.attributes.faith).toBe(10);
    });

    it("does NOT decay below 0", () => {
      const entity = makeEntity("e1", { attributes: { intelligence: 5, body: 5, faith: 0 } });
      const world = makeWorld([entity], TICKS_PER_YEAR);

      tickFaith(world, TEST_FAITH, TICKS_PER_YEAR);
      expect(entity.attributes.faith).toBe(0);
    });
  });

  describe("prayer validation", () => {
    it("validates prayer for adult with sufficient faith", () => {
      const entity = makeEntity("e1");
      const world = makeWorld([entity], 50);
      const intent = { actorId: "e1" as EntityId, type: "pray" as const };

      const result = validatePray(intent, world, TEST_FAITH);
      expect(result.kind).toBe("validated");
    });

    it("rejects prayer for child", () => {
      const entity = makeEntity("e1", { statuses: ["child"] });
      const world = makeWorld([entity], 50);
      const intent = { actorId: "e1" as EntityId, type: "pray" as const };

      const result = validatePray(intent, world, TEST_FAITH);
      expect(result.kind).toBe("rejected");
      expect((result as any).reason).toContain("Children");
    });

    it("rejects prayer when faith too low", () => {
      const entity = makeEntity("e1", { attributes: { intelligence: 5, body: 5, faith: 2 } });
      const world = makeWorld([entity], 50);
      const intent = { actorId: "e1" as EntityId, type: "pray" as const };

      const result = validatePray(intent, world, TEST_FAITH);
      expect(result.kind).toBe("rejected");
      expect((result as any).reason).toContain("Faith too low");
    });

    it("rejects prayer on cooldown", () => {
      const entity = makeEntity("e1", { lastPrayerTick: 40 });
      const world = makeWorld([entity], 50); // only 10 ticks since last prayer

      const intent = { actorId: "e1" as EntityId, type: "pray" as const };
      const result = validatePray(intent, world, TEST_FAITH);
      expect(result.kind).toBe("rejected");
      expect((result as any).reason).toContain("cooldown");
    });

    it("rejects prayer when already praying", () => {
      const entity = makeEntity("e1", { isPraying: true });
      const world = makeWorld([entity], 50);
      const intent = { actorId: "e1" as EntityId, type: "pray" as const };

      const result = validatePray(intent, world, TEST_FAITH);
      expect(result.kind).toBe("rejected");
    });
  });

  describe("prayer execution", () => {
    it("emits PRAYER_STARTED and PRAYER_COMPLETED", () => {
      const entity = makeEntity("e1");
      const world = makeWorld([entity], 50);
      const action = {
        kind: "validated" as const,
        intent: { actorId: "e1" as EntityId, type: "pray" as const },
        energyCost: 0,
        timeCost: 3,
      };

      const events = executePray(action, world, TEST_FAITH);

      const started = events.find((e) => e.type === "PRAYER_STARTED");
      const completed = events.find((e) => e.type === "PRAYER_COMPLETED");
      expect(started).toBeDefined();
      expect(completed).toBeDefined();
      expect(entity.prayerCompletedTick).toBe(50);
    });
  });

  describe("prayer timeout", () => {
    it("loses faith when prayer goes unanswered", () => {
      const entity = makeEntity("e1", {
        prayerCompletedTick: 40,
        isPraying: false,
        attributes: { intelligence: 5, body: 5, faith: 20 },
      });
      const world = makeWorld([entity], 50); // 10 ticks since completion = PRAYER_RESPONSE_WINDOW

      const events = tickFaith(world, TEST_FAITH, TICKS_PER_YEAR);

      expect(entity.attributes.faith).toBe(15); // 20 - 5
      expect(entity.prayerCompletedTick).toBeUndefined();
      const unanswered = events.find((e) => e.type === "PRAYER_UNANSWERED");
      expect(unanswered).toBeDefined();
    });

    it("does NOT timeout before response window", () => {
      const entity = makeEntity("e1", {
        prayerCompletedTick: 45,
        isPraying: false,
        attributes: { intelligence: 5, body: 5, faith: 20 },
      });
      const world = makeWorld([entity], 50); // only 5 ticks

      tickFaith(world, TEST_FAITH, TICKS_PER_YEAR);
      expect(entity.attributes.faith).toBe(20); // unchanged
    });
  });

  describe("divine points regeneration", () => {
    it("regenerates divine points from praying entities", () => {
      const e1 = makeEntity("e1", { isPraying: true });
      const e2 = makeEntity("e2", { id: "e2" as EntityId, isPraying: true });
      const world = makeWorld([e1, e2], 10);
      world.divinePoints = 5;

      tickFaith(world, TEST_FAITH, TICKS_PER_YEAR);

      // 2 praying × 0.5 = 1.0 regen
      expect(world.divinePoints).toBe(6);
    });

    it("caps divine points at max", () => {
      const entity = makeEntity("e1", { isPraying: true });
      const world = makeWorld([entity], 10);
      world.divinePoints = 19.8;

      tickFaith(world, TEST_FAITH, TICKS_PER_YEAR);
      expect(world.divinePoints).toBe(20); // capped at max
    });
  });

  describe("miracles", () => {
    describe("bless", () => {
      it("restores hunger and thirst", () => {
        const entity = makeEntity("e1", {
          needs: { hunger: 30, thirst: 20, exposure: 100 },
        });
        const world = makeWorld([entity], 50);

        const result = performMiracle({ type: "bless", targetId: "e1" }, world, TEST_FAITH);

        expect(result.success).toBe(true);
        expect(entity.needs.hunger).toBe(60); // 30 + 30
        expect(entity.needs.thirst).toBe(50); // 20 + 30
        expect(world.divinePoints).toBe(4); // 5 - 1
      });

      it("caps needs at 100", () => {
        const entity = makeEntity("e1", {
          needs: { hunger: 90, thirst: 90, exposure: 100 },
        });
        const world = makeWorld([entity], 50);

        performMiracle({ type: "bless", targetId: "e1" }, world, TEST_FAITH);

        expect(entity.needs.hunger).toBe(100);
        expect(entity.needs.thirst).toBe(100);
      });

      it("increases target faith", () => {
        const entity = makeEntity("e1", {
          attributes: { intelligence: 5, body: 5, faith: 10 },
        });
        const world = makeWorld([entity], 50);

        performMiracle({ type: "bless", targetId: "e1" }, world, TEST_FAITH);
        expect(entity.attributes.faith).toBe(25); // 10 + 15
      });
    });

    describe("heal", () => {
      it("restores exposure to 100", () => {
        const entity = makeEntity("e1", {
          needs: { hunger: 50, thirst: 50, exposure: 30 },
        });
        const world = makeWorld([entity], 50);

        performMiracle({ type: "heal", targetId: "e1" }, world, TEST_FAITH);
        expect(entity.needs.exposure).toBe(100);
      });
    });

    describe("rain", () => {
      it("adds water to all water nodes", () => {
        const world = makeWorld(
          [makeEntity("e1")], 50
        );

        const result = performMiracle({ type: "rain" }, world, TEST_FAITH);

        expect(result.success).toBe(true);
        expect(world.divinePoints).toBe(2); // 5 - 3
        const waterNode = Object.values(world.resourceNodes).find((n) => n.resourceType === "water");
        expect(waterNode!.quantity).toBe(100); // 50 + 50
      });

      it("gives all alive entities witness faith", () => {
        const e1 = makeEntity("e1", { attributes: { intelligence: 5, body: 5, faith: 10 } });
        const e2 = makeEntity("e2", { id: "e2" as EntityId, attributes: { intelligence: 5, body: 5, faith: 10 } });
        const world = makeWorld([e1, e2], 50);

        performMiracle({ type: "rain" }, world, TEST_FAITH);

        expect(e1.attributes.faith).toBe(15); // 10 + 5
        expect(e2.attributes.faith).toBe(15);
      });
    });

    describe("bounty", () => {
      it("adds berries to all berry nodes", () => {
        const world = makeWorld([makeEntity("e1")], 50);

        performMiracle({ type: "bounty" }, world, TEST_FAITH);

        expect(world.divinePoints).toBe(2); // 5 - 3
        const berryNode = Object.values(world.resourceNodes).find((n) => n.resourceType === "berry");
        expect(berryNode!.quantity).toBe(20); // 10 + 20, capped at maxQuantity=20
      });
    });

    describe("insufficient points", () => {
      it("fails if divine points insufficient", () => {
        const world = makeWorld([makeEntity("e1")], 50);
        world.divinePoints = 0;

        const result = performMiracle({ type: "bless", targetId: "e1" }, world, TEST_FAITH);
        expect(result.success).toBe(false);
        expect(world.divinePoints).toBe(0);
      });
    });

    describe("witness propagation", () => {
      it("nearby entities gain witness faith from individual miracle", () => {
        const target = makeEntity("target", { position: { x: 5, y: 5 }, attributes: { intelligence: 5, body: 5, faith: 10 } });
        const nearby = makeEntity("nearby", { id: "nearby" as EntityId, position: { x: 6, y: 5 }, attributes: { intelligence: 5, body: 5, faith: 10 } });
        const far = makeEntity("far", { id: "far" as EntityId, position: { x: 20, y: 20 }, attributes: { intelligence: 5, body: 5, faith: 10 } });
        const world = makeWorld([target, nearby, far], 50);

        performMiracle({ type: "bless", targetId: "target" }, world, TEST_FAITH);

        expect(target.attributes.faith).toBe(25); // direct: +15
        expect(nearby.attributes.faith).toBe(15); // witness: +5
        expect(far.attributes.faith).toBe(10);    // too far: no change
      });
    });

    describe("clears prayer wait", () => {
      it("miracle clears prayerCompletedTick on target", () => {
        const entity = makeEntity("e1", { prayerCompletedTick: 40 });
        const world = makeWorld([entity], 50);

        performMiracle({ type: "bless", targetId: "e1" }, world, TEST_FAITH);

        expect(entity.prayerCompletedTick).toBeUndefined();
      });
    });
  });
});
