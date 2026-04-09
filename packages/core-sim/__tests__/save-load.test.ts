import { describe, it, expect } from "vitest";
import { createWorld } from "../src";
import { saveWorld, loadWorld, saveToString, loadFromString, SaveLoadError, SAVE_VERSION } from "../src/save-load";
import { EntityId, EntityState } from "@project-god/shared";

const TERRAIN = {
  grass: { displayName: "Grass", moveCostMultiplier: 1, passable: true, fertility: 0.5 },
};
const NEEDS = {
  hunger: { max: 100, initial: 80, decayPerTick: 1, deathThreshold: 0, criticalThreshold: 25 },
  thirst: { max: 100, initial: 80, decayPerTick: 2, deathThreshold: 0, criticalThreshold: 25 },
};

function makeWorld() {
  return createWorld({
    seed: 42, width: 5, height: 5, entityCount: 2,
    terrain: TERRAIN, needs: NEEDS,
    resourceNodes: [
      { position: { x: 1, y: 1 }, resourceType: "berry", quantity: 5, maxQuantity: 10, regenPerTick: 0 },
    ],
  });
}

describe("save/load v1", () => {
  it("round-trip preserves world state", () => {
    const world = makeWorld();
    const entity = world.entities["entity_0" as EntityId] as EntityState;
    entity.inventory["berry"] = 3;
    entity.needs.hunger = 42;

    const saved = saveWorld(world);
    expect(saved.version).toBe(SAVE_VERSION);
    expect(saved.seed).toBe(42);
    expect(saved.gameTime).toBe(0);

    const loaded = loadWorld(saved);
    const loadedEntity = loaded.entities["entity_0" as EntityId] as EntityState;
    expect(loadedEntity.inventory["berry"]).toBe(3);
    expect(loadedEntity.needs.hunger).toBe(42);
    expect(loaded.tick).toBe(world.tick);
    expect(loaded.seed).toBe(world.seed);
  });

  it("string round-trip works", () => {
    const world = makeWorld();
    const json = saveToString(world);
    const loaded = loadFromString(json);
    expect(loaded.seed).toBe(world.seed);
    expect(Object.keys(loaded.entities).length).toBe(2);
  });

  it("save produces a deep clone (no reference leak)", () => {
    const world = makeWorld();
    const saved = saveWorld(world);
    const loaded = loadWorld(saved);

    // Mutate loaded — original should not change
    const loadedEntity = loaded.entities["entity_0" as EntityId] as EntityState;
    loadedEntity.needs.hunger = 999;
    const originalEntity = world.entities["entity_0" as EntityId] as EntityState;
    expect(originalEntity.needs.hunger).not.toBe(999);
  });

  it("rejects mismatched version", () => {
    const saved = saveWorld(makeWorld());
    (saved as any).version = "99.0.0";
    expect(() => loadWorld(saved)).toThrow(SaveLoadError);
  });

  it("rejects missing worldState", () => {
    expect(() => loadWorld({ version: SAVE_VERSION })).toThrow(SaveLoadError);
  });

  it("rejects non-object input", () => {
    expect(() => loadWorld(null)).toThrow(SaveLoadError);
    expect(() => loadWorld("string")).toThrow(SaveLoadError);
  });

  it("rejects invalid JSON string", () => {
    expect(() => loadFromString("not json!!!")).toThrow(SaveLoadError);
  });

  it("round-trip preserves MVP-02 additions (tribes, structures, skills, socialMemory)", () => {
    const world = makeWorld();

    // Add MVP-02 data
    const entity = world.entities["entity_0" as EntityId] as EntityState;
    entity.skills = { fire_making: 1 };
    entity.socialMemory = {
      entity_1: { entityId: "entity_1", trust: 0.5, lastSeenTick: 10, lastSeenPosition: { x: 3, y: 3 } },
    };
    entity.episodicMemory = [
      { tick: 5, type: "found_resource", position: { x: 1, y: 1 }, resourceType: "berry", detail: "gathered 2" },
    ];

    // Tribes are auto-created by createWorld, verify they exist
    expect(world.tribes).toBeDefined();
    expect(world.tribes!["tribe_0"]).toBeDefined();

    const saved = saveWorld(world);
    const loaded = loadWorld(saved);

    // Verify tribes survived
    expect(loaded.tribes).toBeDefined();
    expect(loaded.tribes!["tribe_0"].name).toBe("First Tribe");
    expect(loaded.tribes!["tribe_0"].memberIds.length).toBe(2);

    // Verify skills survived
    const loadedEntity = loaded.entities["entity_0" as EntityId] as EntityState;
    expect(loadedEntity.skills?.fire_making).toBe(1);

    // Verify social memory survived
    expect(loadedEntity.socialMemory?.entity_1?.trust).toBe(0.5);

    // Verify episodic memory survived
    expect(loadedEntity.episodicMemory).toHaveLength(1);
    expect(loadedEntity.episodicMemory![0].resourceType).toBe("berry");
  });
});
