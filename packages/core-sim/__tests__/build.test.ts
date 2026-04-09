/**
 * build.test.ts — MVP-02 Phase C: Fire Pit unit tests.
 *
 * Covers:
 *   - Build validation (materials, unknown type)
 *   - Build execution (material deduction, structure creation, event)
 *   - Structure tick (fuel decay, expiry, warming)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  tickWorld, type TickContext,
} from "../src";
import { validateBuild } from "../src/validate/validate-build";
import { executeBuild, resetStructureCounter } from "../src/execute/execute-build";
import { tickStructures } from "../src/systems/structure-tick";
import type {
  EntityState, WorldState, ActionIntent, ValidatedAction,
  StructureState, EntityId, TileId, TribeId, StructureId,
} from "@project-god/shared";
import type { StructureDef } from "../src/content-types";

const FIRE_PIT_DEF: Record<string, StructureDef> = {
  fire_pit: {
    displayName: "Fire Pit",
    requiredItems: { berry: 3 },
    buildRange: 0,
    initialDurability: 30,
    fuelPerTick: 1,
    effectRadius: 2,
    effects: ["warming"],
  },
};

function makeWorld(): WorldState {
  return {
    tick: 0,
    seed: 42,
    width: 10,
    height: 10,
    rngState: 42,
    tiles: {},
    entities: {
      e0: {
        id: "e0" as EntityId,
        type: "human",
        tribeId: "t0" as TribeId,
        position: { x: 5, y: 5 },
        attributes: {},
        needs: { hunger: 80, thirst: 80 },
        inventory: { berry: 5 },
        alive: true,
      },
    },
    resourceNodes: {},
  };
}

describe("build validation", () => {
  it("rejects when no itemId specified", () => {
    const world = makeWorld();
    const intent: ActionIntent = { actorId: "e0" as EntityId, type: "build" };
    const result = validateBuild(intent, world, FIRE_PIT_DEF);
    expect(result.kind).toBe("rejected");
  });

  it("rejects unknown structure type", () => {
    const world = makeWorld();
    const intent: ActionIntent = { actorId: "e0" as EntityId, type: "build", itemId: "castle" };
    const result = validateBuild(intent, world, FIRE_PIT_DEF);
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.reason).toContain("unknown structure type");
    }
  });

  it("rejects when materials insufficient", () => {
    const world = makeWorld();
    world.entities["e0"].inventory = { berry: 2 }; // need 3
    const intent: ActionIntent = { actorId: "e0" as EntityId, type: "build", itemId: "fire_pit" };
    const result = validateBuild(intent, world, FIRE_PIT_DEF);
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.reason).toContain("insufficient berry");
    }
  });

  it("validates when materials are sufficient", () => {
    const world = makeWorld();
    const intent: ActionIntent = { actorId: "e0" as EntityId, type: "build", itemId: "fire_pit" };
    const result = validateBuild(intent, world, FIRE_PIT_DEF);
    expect(result.kind).toBe("validated");
  });
});

describe("build execution", () => {
  beforeEach(() => resetStructureCounter());

  it("deducts materials and creates structure", () => {
    const world = makeWorld();
    const validated: ValidatedAction = {
      kind: "validated",
      intent: { actorId: "e0" as EntityId, type: "build", itemId: "fire_pit" },
      energyCost: 0,
      timeCost: 1,
    };

    const events = executeBuild(validated, world, FIRE_PIT_DEF);
    const entity = world.entities["e0"];

    // Materials deducted: had 5 berry, used 3, should have 2
    expect(entity.inventory["berry"]).toBe(2);

    // Structure created
    expect(world.structures).toBeDefined();
    const structures = Object.values(world.structures!) as StructureState[];
    expect(structures.length).toBe(1);
    expect(structures[0].type).toBe("fire_pit");
    expect(structures[0].active).toBe(true);
    expect(structures[0].durability).toBe(30);
    expect(structures[0].position).toEqual({ x: 5, y: 5 });
    expect(structures[0].builtByEntityId).toBe("e0");

    // Event emitted
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("STRUCTURE_BUILT");
  });
});

describe("structure tick", () => {
  beforeEach(() => resetStructureCounter());

  it("reduces durability each tick", () => {
    const world = makeWorld();
    world.tick = 1;
    world.structures = {
      s0: {
        id: "s0" as StructureId,
        type: "fire_pit",
        position: { x: 5, y: 5 },
        durability: 10,
        builtByEntityId: "e0" as EntityId,
        builtAtTick: 0,
        active: true,
      },
    };

    tickStructures(world, FIRE_PIT_DEF);
    expect(world.structures["s0"].durability).toBe(9);
    expect(world.structures["s0"].active).toBe(true);
  });

  it("deactivates and emits STRUCTURE_EXPIRED when fuel runs out", () => {
    const world = makeWorld();
    world.tick = 10;
    world.structures = {
      s0: {
        id: "s0" as StructureId,
        type: "fire_pit",
        position: { x: 5, y: 5 },
        durability: 1, // will reach 0 this tick
        builtByEntityId: "e0" as EntityId,
        builtAtTick: 0,
        active: true,
      },
    };

    const events = tickStructures(world, FIRE_PIT_DEF);
    expect(world.structures["s0"].active).toBe(false);
    expect(world.structures["s0"].durability).toBe(0);

    const expired = events.find((e) => e.type === "STRUCTURE_EXPIRED");
    expect(expired).toBeDefined();
  });

  it("applies warming status to nearby entities", () => {
    const world = makeWorld();
    world.tick = 1;
    // Entity at (5,5), fire pit at (5,5) → distance 0, within radius 2
    world.structures = {
      s0: {
        id: "s0" as StructureId,
        type: "fire_pit",
        position: { x: 5, y: 5 },
        durability: 20,
        builtByEntityId: "e0" as EntityId,
        builtAtTick: 0,
        active: true,
      },
    };

    const events = tickStructures(world, FIRE_PIT_DEF);
    const entity = world.entities["e0"];
    expect(entity.statuses).toContain("warming");

    const warmEvents = events.filter((e) => e.type === "WARMING_APPLIED");
    expect(warmEvents.length).toBe(1);
  });

  it("removes warming status when entity moves away", () => {
    const world = makeWorld();
    world.tick = 1;
    world.entities["e0"].statuses = ["warming"];
    world.entities["e0"].position = { x: 0, y: 0 }; // far from fire pit at (5,5)
    world.structures = {
      s0: {
        id: "s0" as StructureId,
        type: "fire_pit",
        position: { x: 5, y: 5 },
        durability: 20,
        builtByEntityId: "e0" as EntityId,
        builtAtTick: 0,
        active: true,
      },
    };

    tickStructures(world, FIRE_PIT_DEF);
    const entity = world.entities["e0"];
    expect(entity.statuses).not.toContain("warming");
  });
});
