/**
 * semantic-memory.test.ts — Tests for semantic memory distillation + decay.
 *
 * MVP-03-B: Agents form generalized knowledge from repeated experiences.
 */

import { describe, it, expect } from "vitest";
import type { EntityState, EpisodicEntry, Vec2 } from "@project-god/shared";
import { DISTILL_THRESHOLD, MAX_SEMANTIC_MEMORY, SEMANTIC_DECAY_INTERVAL } from "@project-god/shared";
import {
  distillSemanticMemory,
  decaySemanticMemory,
} from "@project-god/agent-runtime";

// ── Helpers ─────────────────────────────────────────────────

function makeEntity(overrides: Partial<EntityState> = {}): EntityState {
  return {
    id: "e0",
    type: "human",
    tribeId: "tribe_0",
    position: { x: 5, y: 5 },
    attributes: {},
    needs: { hunger: 80, thirst: 80, exposure: 100 },
    inventory: {},
    alive: true,
    episodicMemory: [],
    semanticMemory: [],
    ...overrides,
  };
}

function makeEpisodicBerry(pos: Vec2, tick: number): EpisodicEntry {
  return { tick, type: "found_resource", position: pos, resourceType: "berry", detail: "gathered 1" };
}

function makeEpisodicWater(pos: Vec2, tick: number): EpisodicEntry {
  return { tick, type: "found_resource", position: pos, resourceType: "water", detail: "gathered 1" };
}

// ── Distillation Tests ──────────────────────────────────────

describe("semantic memory — distillation", () => {
  it("does NOT form fact below threshold", () => {
    const entity = makeEntity({
      episodicMemory: [
        makeEpisodicBerry({ x: 3, y: 3 }, 1),
        makeEpisodicBerry({ x: 3, y: 3 }, 5),
        // Only 2 — below DISTILL_THRESHOLD (3)
      ],
    });
    const events = distillSemanticMemory(entity, 10);
    expect(events).toHaveLength(0);
    expect(entity.semanticMemory).toHaveLength(0);
  });

  it("forms resource_location at threshold", () => {
    const entity = makeEntity({
      episodicMemory: [
        makeEpisodicBerry({ x: 3, y: 3 }, 1),
        makeEpisodicBerry({ x: 3, y: 3 }, 5),
        makeEpisodicBerry({ x: 3, y: 3 }, 10),
      ],
    });
    const events = distillSemanticMemory(entity, 15);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("SEMANTIC_FORMED");
    expect(entity.semanticMemory).toHaveLength(1);
    expect(entity.semanticMemory![0].fact).toBe("resource_location");
    expect(entity.semanticMemory![0].position).toEqual({ x: 3, y: 3 });
    expect(entity.semanticMemory![0].subject).toBe("berry");
    expect(entity.semanticMemory![0].confidence).toBe(0.8);
  });

  it("forms water_location for water resources", () => {
    const entity = makeEntity({
      episodicMemory: [
        makeEpisodicWater({ x: 8, y: 7 }, 1),
        makeEpisodicWater({ x: 8, y: 7 }, 5),
        makeEpisodicWater({ x: 8, y: 7 }, 10),
      ],
    });
    distillSemanticMemory(entity, 15);
    expect(entity.semanticMemory).toHaveLength(1);
    expect(entity.semanticMemory![0].fact).toBe("water_location");
  });

  it("reinforces existing semantic fact", () => {
    const entity = makeEntity({
      episodicMemory: [
        makeEpisodicBerry({ x: 3, y: 3 }, 1),
        makeEpisodicBerry({ x: 3, y: 3 }, 5),
        makeEpisodicBerry({ x: 3, y: 3 }, 10),
      ],
      semanticMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.8,
        formedAtTick: 5,
        lastReinforcedTick: 5,
      }],
    });
    distillSemanticMemory(entity, 20);
    expect(entity.semanticMemory).toHaveLength(1);
    expect(entity.semanticMemory![0].confidence).toBe(0.9); // reinforced +0.1
    expect(entity.semanticMemory![0].lastReinforcedTick).toBe(20);
  });

  it("forms multiple facts from different positions", () => {
    const entity = makeEntity({
      episodicMemory: [
        makeEpisodicBerry({ x: 3, y: 3 }, 1),
        makeEpisodicBerry({ x: 3, y: 3 }, 5),
        makeEpisodicBerry({ x: 3, y: 3 }, 10),
        makeEpisodicWater({ x: 8, y: 7 }, 2),
        makeEpisodicWater({ x: 8, y: 7 }, 6),
        makeEpisodicWater({ x: 8, y: 7 }, 11),
      ],
    });
    const events = distillSemanticMemory(entity, 15);
    expect(events).toHaveLength(2);
    expect(entity.semanticMemory).toHaveLength(2);
  });

  it("respects MAX_SEMANTIC_MEMORY limit", () => {
    // Fill with MAX_SEMANTIC_MEMORY existing entries
    const existing = Array.from({ length: MAX_SEMANTIC_MEMORY }, (_, i) => ({
      fact: "resource_location" as const,
      position: { x: 100 + i, y: 100 + i },
      subject: "berry",
      confidence: 0.5,
      formedAtTick: 1,
      lastReinforcedTick: 1,
    }));
    const entity = makeEntity({
      episodicMemory: [
        makeEpisodicBerry({ x: 3, y: 3 }, 1),
        makeEpisodicBerry({ x: 3, y: 3 }, 5),
        makeEpisodicBerry({ x: 3, y: 3 }, 10),
      ],
      semanticMemory: existing,
    });
    const events = distillSemanticMemory(entity, 15);
    expect(events).toHaveLength(0);
    expect(entity.semanticMemory).toHaveLength(MAX_SEMANTIC_MEMORY);
  });

  it("forms warming_benefit from warming status", () => {
    const entity = makeEntity({
      statuses: ["warming"],
    });
    const events = distillSemanticMemory(entity, 10);
    expect(events).toHaveLength(1);
    expect(entity.semanticMemory![0].fact).toBe("warming_benefit");
    expect(entity.semanticMemory![0].confidence).toBe(0.9);
  });

  it("forms shelter_benefit from sheltered status", () => {
    const entity = makeEntity({
      statuses: ["sheltered"],
    });
    distillSemanticMemory(entity, 10);
    expect(entity.semanticMemory![0].fact).toBe("shelter_benefit");
  });

  it("returns empty for entity with no episodic memory", () => {
    const entity = makeEntity({ episodicMemory: undefined });
    const events = distillSemanticMemory(entity, 10);
    expect(events).toHaveLength(0);
  });
});

// ── Decay Tests ─────────────────────────────────────────────

describe("semantic memory — decay", () => {
  it("does not decay before interval", () => {
    const entity = makeEntity({
      semanticMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.8,
        formedAtTick: 10,
        lastReinforcedTick: 10,
      }],
    });
    decaySemanticMemory(entity, 10 + SEMANTIC_DECAY_INTERVAL - 1);
    expect(entity.semanticMemory).toHaveLength(1);
    expect(entity.semanticMemory![0].confidence).toBe(0.8);
  });

  it("decays confidence after interval", () => {
    const entity = makeEntity({
      semanticMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.8,
        formedAtTick: 10,
        lastReinforcedTick: 10,
      }],
    });
    decaySemanticMemory(entity, 10 + SEMANTIC_DECAY_INTERVAL);
    expect(entity.semanticMemory).toHaveLength(1);
    expect(entity.semanticMemory![0].confidence).toBeCloseTo(0.7, 5);
  });

  it("removes entry when confidence reaches 0", () => {
    const entity = makeEntity({
      semanticMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.1,
        formedAtTick: 10,
        lastReinforcedTick: 10,
      }],
    });
    decaySemanticMemory(entity, 10 + SEMANTIC_DECAY_INTERVAL);
    expect(entity.semanticMemory).toHaveLength(0);
  });
});
