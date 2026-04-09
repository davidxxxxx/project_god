/**
 * memory.test.ts — MVP-02 Phase B: Memory system tests.
 */

import { describe, it, expect } from "vitest";
import {
  recordEpisode, recallResourcePositions, isRememberedDepleted,
  setTask, clearTask, isTaskStale,
  updateMemoryFromEvents, enrichEventsWithPositions,
} from "../src/memory";
import type {
  EntityState, EntityId, TribeId,
  EpisodicEntry, ResourceGatheredEvent, ActionRejectedEvent,
  ResourceNodeId,
} from "@project-god/shared";
import { MAX_EPISODIC_MEMORY } from "@project-god/shared";

function makeEntity(overrides?: Partial<EntityState>): EntityState {
  return {
    id: "entity_0" as EntityId,
    type: "human",
    tribeId: "tribe_0" as TribeId,
    position: { x: 5, y: 5 },
    attributes: {},
    needs: { hunger: 80, thirst: 80 },
    inventory: {},
    alive: true,
    episodicMemory: [],
    currentTask: null,
    ...overrides,
  };
}

describe("working memory", () => {
  it("setTask assigns current task", () => {
    const entity = makeEntity();
    setTask(entity, "seek_water", 10, { x: 3, y: 3 });
    expect(entity.currentTask).toEqual({
      goal: "seek_water",
      startedAtTick: 10,
      targetPosition: { x: 3, y: 3 },
      targetId: undefined,
    });
  });

  it("clearTask removes current task", () => {
    const entity = makeEntity();
    setTask(entity, "seek_berry", 5);
    clearTask(entity);
    expect(entity.currentTask).toBeNull();
  });

  it("isTaskStale detects stale tasks", () => {
    const entity = makeEntity();
    setTask(entity, "seek_water", 10);
    expect(isTaskStale(entity, 20)).toBe(false);
    expect(isTaskStale(entity, 25)).toBe(true); // 15 ticks = stale
    expect(isTaskStale(entity, 30)).toBe(true);
  });

  it("isTaskStale returns false when no task", () => {
    const entity = makeEntity();
    expect(isTaskStale(entity, 100)).toBe(false);
  });
});

describe("episodic memory", () => {
  it("recordEpisode stores entries", () => {
    const entity = makeEntity();
    recordEpisode(entity, {
      tick: 5, type: "found_resource", position: { x: 3, y: 3 }, resourceType: "berry",
    });
    expect(entity.episodicMemory!.length).toBe(1);
    expect(entity.episodicMemory![0].resourceType).toBe("berry");
  });

  it("FIFO eviction at MAX_EPISODIC_MEMORY", () => {
    const entity = makeEntity();
    for (let i = 0; i < MAX_EPISODIC_MEMORY + 5; i++) {
      recordEpisode(entity, {
        tick: i, type: "found_resource", position: { x: i, y: 0 }, resourceType: "berry",
      });
    }
    expect(entity.episodicMemory!.length).toBe(MAX_EPISODIC_MEMORY);
    // Oldest entries should have been evicted
    expect(entity.episodicMemory![0].tick).toBe(5);
  });

  it("recallResourcePositions returns deduplicated positions", () => {
    const entity = makeEntity();
    recordEpisode(entity, { tick: 1, type: "found_resource", position: { x: 3, y: 3 }, resourceType: "berry" });
    recordEpisode(entity, { tick: 5, type: "found_resource", position: { x: 3, y: 3 }, resourceType: "berry" }); // duplicate
    recordEpisode(entity, { tick: 3, type: "found_resource", position: { x: 7, y: 7 }, resourceType: "berry" });
    recordEpisode(entity, { tick: 2, type: "found_resource", position: { x: 1, y: 1 }, resourceType: "water" }); // different type

    const berryPositions = recallResourcePositions(entity, "berry");
    expect(berryPositions.length).toBe(2); // (3,3) and (7,7)
    // Newest first
    expect(berryPositions[0]).toEqual({ x: 3, y: 3 }); // tick 5 is newest

    const waterPositions = recallResourcePositions(entity, "water");
    expect(waterPositions.length).toBe(1);
  });

  it("isRememberedDepleted checks latest event at position", () => {
    const entity = makeEntity();
    recordEpisode(entity, { tick: 1, type: "found_resource", position: { x: 3, y: 3 }, resourceType: "berry" });
    expect(isRememberedDepleted(entity, { x: 3, y: 3 })).toBe(false);

    recordEpisode(entity, { tick: 5, type: "resource_depleted", position: { x: 3, y: 3 } });
    expect(isRememberedDepleted(entity, { x: 3, y: 3 })).toBe(true);

    // A later found_resource should override
    recordEpisode(entity, { tick: 10, type: "found_resource", position: { x: 3, y: 3 }, resourceType: "berry" });
    expect(isRememberedDepleted(entity, { x: 3, y: 3 })).toBe(false);
  });
});

describe("event-to-memory conversion", () => {
  it("RESOURCE_GATHERED events create found_resource memories", () => {
    const entity = makeEntity();
    const events = enrichEventsWithPositions(
      [{
        type: "RESOURCE_GATHERED",
        tick: 10,
        entityId: "entity_0" as EntityId,
        nodeId: "rnode_0" as ResourceNodeId,
        resourceType: "berry",
        quantity: 1,
      } as ResourceGatheredEvent],
      { "rnode_0": { position: { x: 3, y: 3 } } }
    );

    updateMemoryFromEvents(entity, events, 10);
    expect(entity.episodicMemory!.length).toBe(1);
    expect(entity.episodicMemory![0].type).toBe("found_resource");
    expect(entity.episodicMemory![0].position).toEqual({ x: 3, y: 3 });
    expect(entity.episodicMemory![0].resourceType).toBe("berry");
  });

  it("ignores events from other entities", () => {
    const entity = makeEntity();
    const events = enrichEventsWithPositions(
      [{
        type: "RESOURCE_GATHERED",
        tick: 10,
        entityId: "entity_99" as EntityId,
        nodeId: "rnode_0" as ResourceNodeId,
        resourceType: "berry",
        quantity: 1,
      } as ResourceGatheredEvent],
      { "rnode_0": { position: { x: 3, y: 3 } } }
    );

    updateMemoryFromEvents(entity, events, 10);
    expect(entity.episodicMemory!.length).toBe(0);
  });
});
