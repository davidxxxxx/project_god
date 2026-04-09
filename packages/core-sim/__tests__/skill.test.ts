/**
 * skill.test.ts — Unit tests for MVP-02-D Skill/Tool/Technology system.
 *
 * Tests:
 * - First builder gets fire_making skill (invention)
 * - Entity with skill can build
 * - Entity without skill (when others have it) cannot build
 * - Observation learning: entity learns after N ticks near teacher + active structure
 * - Technology unlocks when enough tribe members have the skill
 */

import { describe, it, expect, beforeEach } from "vitest";
import { tickWorld, type TickContext } from "../src/tick";
import { validateBuild } from "../src/validate/validate-build";
import { executeBuild, resetStructureCounter } from "../src/execute/execute-build";
import { tickSkillLearning } from "../src/systems/skill-learning";
import type { WorldState, EntityState, StructureState } from "@project-god/shared";
import type { StructureDef, SkillDef, TechnologyDef } from "../src/content-types";

const STRUCTURE_DEFS: Record<string, StructureDef> = {
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

const SKILL_DEFS: Record<string, SkillDef> = {
  fire_making: {
    displayName: "Fire Making",
    learnMethod: "observation",
    learnTicks: 5,
    initialProficiency: 0.5,
    maxProficiency: 1.0,
  },
};

const TECH_DEFS: Record<string, TechnologyDef> = {
  controlled_fire: {
    displayName: "Controlled Fire",
    requiredSkill: "fire_making",
    minSkilledMembers: 2,
    unlocksStructures: ["fire_pit"],
  },
};

function makeEntity(id: string, overrides: Partial<EntityState> = {}): EntityState {
  return {
    id,
    type: "human",
    tribeId: "tribe_0",
    position: { x: 5, y: 5 },
    attributes: {},
    needs: { hunger: 80, thirst: 80 },
    inventory: {},
    alive: true,
    ...overrides,
  };
}

function makeWorld(entities: EntityState[]): WorldState {
  const ents: Record<string, EntityState> = {};
  for (const e of entities) ents[e.id] = e;
  return {
    tick: 0,
    seed: 42,
    width: 20,
    height: 20,
    rngState: 42,
    tiles: {},
    entities: ents,
    resourceNodes: {},
    structures: {},
  };
}

describe("skill validation (MVP-02-D)", () => {
  beforeEach(() => resetStructureCounter());

  it("first builder (no one has skill) passes validation (invention bypass)", () => {
    const entity = makeEntity("e1", { inventory: { berry: 5 } });
    const world = makeWorld([entity]);
    const result = validateBuild(
      { actorId: "e1", type: "build", itemId: "fire_pit" },
      world,
      STRUCTURE_DEFS,
      SKILL_DEFS
    );
    expect(result.kind).toBe("validated");
  });

  it("entity with skill can build", () => {
    const entity = makeEntity("e1", {
      inventory: { berry: 5 },
      skills: { fire_making: 0.5 },
    });
    const world = makeWorld([entity]);
    const result = validateBuild(
      { actorId: "e1", type: "build", itemId: "fire_pit" },
      world,
      STRUCTURE_DEFS,
      SKILL_DEFS
    );
    expect(result.kind).toBe("validated");
  });

  it("rejects entity without skill when another entity has it", () => {
    const builder = makeEntity("e1", { inventory: { berry: 5 } });
    const skilled = makeEntity("e2", { skills: { fire_making: 0.5 } });
    const world = makeWorld([builder, skilled]);
    const result = validateBuild(
      { actorId: "e1", type: "build", itemId: "fire_pit" },
      world,
      STRUCTURE_DEFS,
      SKILL_DEFS
    );
    expect(result.kind).toBe("rejected");
    expect(result.kind === "rejected" && result.reason).toContain("lacks required skill");
  });

  it("backward-compatible: validates without skillDefs (Phase C compat)", () => {
    const entity = makeEntity("e1", { inventory: { berry: 5 } });
    const world = makeWorld([entity]);
    const result = validateBuild(
      { actorId: "e1", type: "build", itemId: "fire_pit" },
      world,
      STRUCTURE_DEFS
      // no skillDefs
    );
    expect(result.kind).toBe("validated");
  });
});

describe("skill invention (auto-grant on first build)", () => {
  beforeEach(() => resetStructureCounter());

  it("grants fire_making to first builder", () => {
    const entity = makeEntity("e1", { inventory: { berry: 5 } });
    const world = makeWorld([entity]);
    const validated = validateBuild(
      { actorId: "e1", type: "build", itemId: "fire_pit" },
      world,
      STRUCTURE_DEFS,
      SKILL_DEFS
    );
    expect(validated.kind).toBe("validated");

    const events = executeBuild(validated as any, world, STRUCTURE_DEFS, SKILL_DEFS);
    // Should have STRUCTURE_BUILT + SKILL_LEARNED
    const skillEvent = events.find((e) => e.type === "SKILL_LEARNED");
    expect(skillEvent).toBeDefined();
    expect((skillEvent as any).method).toBe("invention");
    expect((skillEvent as any).skillId).toBe("fire_making");
    expect(entity.skills?.fire_making).toBe(0.5);
  });

  it("does NOT grant skill if entity already has it", () => {
    const entity = makeEntity("e1", {
      inventory: { berry: 5 },
      skills: { fire_making: 0.5 },
    });
    const world = makeWorld([entity]);
    const validated = validateBuild(
      { actorId: "e1", type: "build", itemId: "fire_pit" },
      world,
      STRUCTURE_DEFS,
      SKILL_DEFS
    );
    const events = executeBuild(validated as any, world, STRUCTURE_DEFS, SKILL_DEFS);
    const skillEvents = events.filter((e) => e.type === "SKILL_LEARNED");
    expect(skillEvents).toHaveLength(0);
  });
});

describe("observation learning", () => {
  it("learns skill after observing for learnTicks ticks", () => {
    const teacher = makeEntity("teacher", {
      position: { x: 5, y: 5 },
      skills: { fire_making: 0.5 },
    });
    const learner = makeEntity("learner", {
      position: { x: 6, y: 5 }, // manhattan distance = 1
    });
    const world = makeWorld([teacher, learner]);
    world.structures = {
      struct_0: {
        id: "struct_0",
        type: "fire_pit",
        position: { x: 5, y: 5 },
        durability: 20,
        builtByEntityId: "teacher",
        builtAtTick: 1,
        active: true,
      } as StructureState,
    };

    let allEvents: any[] = [];
    for (let i = 0; i < 5; i++) {
      world.tick = i + 1;
      const events = tickSkillLearning(world, {
        skills: SKILL_DEFS,
        technologies: {},
      });
      allEvents.push(...events);
    }

    const learnEvent = allEvents.find((e) => e.type === "SKILL_LEARNED");
    expect(learnEvent).toBeDefined();
    expect(learnEvent.entityId).toBe("learner");
    expect(learnEvent.method).toBe("observation");
    expect(learner.skills?.fire_making).toBe(0.5);
  });

  it("does NOT learn if no teacher nearby", () => {
    const teacher = makeEntity("teacher", {
      position: { x: 15, y: 15 }, // far away
      skills: { fire_making: 0.5 },
    });
    const learner = makeEntity("learner", {
      position: { x: 0, y: 0 },
    });
    const world = makeWorld([teacher, learner]);
    world.structures = {
      struct_0: {
        id: "struct_0",
        type: "fire_pit",
        position: { x: 0, y: 0 },
        durability: 20,
        builtByEntityId: "teacher",
        builtAtTick: 1,
        active: true,
      } as StructureState,
    };

    for (let i = 0; i < 10; i++) {
      world.tick = i + 1;
      tickSkillLearning(world, { skills: SKILL_DEFS, technologies: {} });
    }

    expect(learner.skills?.fire_making).toBeUndefined();
  });

  it("does NOT learn if no active structure nearby", () => {
    const teacher = makeEntity("teacher", {
      position: { x: 5, y: 5 },
      skills: { fire_making: 0.5 },
    });
    const learner = makeEntity("learner", {
      position: { x: 6, y: 5 },
    });
    const world = makeWorld([teacher, learner]);
    // No structures at all

    for (let i = 0; i < 10; i++) {
      world.tick = i + 1;
      tickSkillLearning(world, { skills: SKILL_DEFS, technologies: {} });
    }

    expect(learner.skills?.fire_making).toBeUndefined();
  });
});

describe("technology unlock", () => {
  it("unlocks controlled_fire when 2 tribe members have fire_making", () => {
    const e1 = makeEntity("e1", {
      tribeId: "tribe_0",
      skills: { fire_making: 0.5 },
    });
    const e2 = makeEntity("e2", {
      tribeId: "tribe_0",
      skills: { fire_making: 0.5 },
    });
    const world = makeWorld([e1, e2]);
    world.tribes = {
      tribe_0: {
        id: "tribe_0",
        name: "First Tribe",
        memberIds: ["e1", "e2"],
        technologies: [],
      },
    };

    const events = tickSkillLearning(world, {
      skills: SKILL_DEFS,
      technologies: TECH_DEFS,
    });

    expect(world.tribes.tribe_0.technologies).toContain("controlled_fire");
    const techEvent = events.find((e) => e.type === "TECHNOLOGY_UNLOCKED");
    expect(techEvent).toBeDefined();
    expect((techEvent as any).technologyId).toBe("controlled_fire");
  });

  it("does NOT unlock if only 1 member has the skill", () => {
    const e1 = makeEntity("e1", {
      tribeId: "tribe_0",
      skills: { fire_making: 0.5 },
    });
    const e2 = makeEntity("e2", { tribeId: "tribe_0" });
    const world = makeWorld([e1, e2]);
    world.tribes = {
      tribe_0: {
        id: "tribe_0",
        name: "First Tribe",
        memberIds: ["e1", "e2"],
        technologies: [],
      },
    };

    tickSkillLearning(world, {
      skills: SKILL_DEFS,
      technologies: TECH_DEFS,
    });

    expect(world.tribes.tribe_0.technologies).not.toContain("controlled_fire");
  });
});
