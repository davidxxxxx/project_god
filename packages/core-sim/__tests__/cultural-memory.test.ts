/**
 * cultural-memory.test.ts — Tests for cultural memory teaching, inheritance, and decay.
 *
 * MVP-03-B: Tribe-level knowledge that persists beyond individual death.
 */

import { describe, it, expect } from "vitest";
import type { EntityState, TribeState, SemanticEntry } from "@project-god/shared";
import {
  TEACH_CONFIDENCE_THRESHOLD,
  MAX_CULTURAL_MEMORY,
  CULTURAL_DECAY_INTERVAL,
} from "@project-god/shared";
import {
  teachToCulturalMemory,
  inheritFromCulturalMemory,
  decayCulturalMemory,
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

function makeTribe(overrides: Partial<TribeState> = {}): TribeState {
  return {
    id: "tribe_0",
    name: "Test Tribe",
    memberIds: ["e0", "e1"],
    technologies: [],
    culturalMemory: [],
    ...overrides,
  };
}

function makeSemanticEntry(overrides: Partial<SemanticEntry> = {}): SemanticEntry {
  return {
    fact: "resource_location",
    position: { x: 3, y: 3 },
    subject: "berry",
    confidence: 0.8,
    formedAtTick: 10,
    lastReinforcedTick: 10,
    ...overrides,
  };
}

// ── Teaching Tests ──────────────────────────────────────────

describe("cultural memory — teaching", () => {
  it("teaches high-confidence fact to tribe", () => {
    const entity = makeEntity({
      semanticMemory: [makeSemanticEntry({ confidence: TEACH_CONFIDENCE_THRESHOLD })],
    });
    const tribe = makeTribe();
    const events = teachToCulturalMemory(entity, tribe, true, 20);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("KNOWLEDGE_TAUGHT");
    expect(tribe.culturalMemory).toHaveLength(1);
    expect(tribe.culturalMemory![0].fact).toBe("resource_location");
    expect(tribe.culturalMemory![0].contributorIds).toContain("e0");
  });

  it("does NOT teach below confidence threshold", () => {
    const entity = makeEntity({
      semanticMemory: [makeSemanticEntry({ confidence: TEACH_CONFIDENCE_THRESHOLD - 0.01 })],
    });
    const tribe = makeTribe();
    const events = teachToCulturalMemory(entity, tribe, true, 20);
    expect(events).toHaveLength(0);
    expect(tribe.culturalMemory).toHaveLength(0);
  });

  it("does NOT teach without nearby tribe member", () => {
    const entity = makeEntity({
      semanticMemory: [makeSemanticEntry({ confidence: 0.9 })],
    });
    const tribe = makeTribe();
    const events = teachToCulturalMemory(entity, tribe, false, 20);
    expect(events).toHaveLength(0);
  });

  it("reinforces existing cultural entry and adds contributor", () => {
    const entity = makeEntity({
      id: "e1",
      semanticMemory: [makeSemanticEntry({ confidence: 0.9 })],
    });
    const tribe = makeTribe({
      culturalMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.5,
        contributorIds: ["e0"],
        addedAtTick: 5,
        lastReinforcedTick: 5,
      }],
    });
    teachToCulturalMemory(entity, tribe, true, 20);
    expect(tribe.culturalMemory).toHaveLength(1);
    expect(tribe.culturalMemory![0].confidence).toBeCloseTo(0.72, 2); // max(0.5, 0.9*0.8)
    expect(tribe.culturalMemory![0].contributorIds).toContain("e0");
    expect(tribe.culturalMemory![0].contributorIds).toContain("e1");
  });

  it("respects MAX_CULTURAL_MEMORY limit", () => {
    const existing = Array.from({ length: MAX_CULTURAL_MEMORY }, (_, i) => ({
      fact: "resource_location" as const,
      position: { x: 100 + i, y: 100 + i },
      subject: "berry",
      confidence: 0.5,
      contributorIds: ["e0"],
      addedAtTick: 1,
      lastReinforcedTick: 1,
    }));
    const entity = makeEntity({
      semanticMemory: [makeSemanticEntry({ confidence: 0.9, position: { x: 99, y: 99 } })],
    });
    const tribe = makeTribe({ culturalMemory: existing });
    const events = teachToCulturalMemory(entity, tribe, true, 20);
    expect(events).toHaveLength(0);
    expect(tribe.culturalMemory).toHaveLength(MAX_CULTURAL_MEMORY);
  });
});

// ── Inheritance Tests ───────────────────────────────────────

describe("cultural memory — inheritance", () => {
  it("inherits unknown cultural fact", () => {
    const entity = makeEntity({ semanticMemory: [] });
    const tribe = makeTribe({
      culturalMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.8,
        contributorIds: ["e1"],
        addedAtTick: 5,
        lastReinforcedTick: 5,
      }],
    });
    const events = inheritFromCulturalMemory(entity, tribe, true, 20);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("KNOWLEDGE_INHERITED");
    expect(entity.semanticMemory).toHaveLength(1);
    expect(entity.semanticMemory![0].confidence).toBeCloseTo(0.56, 2); // 0.8 * 0.7
  });

  it("does NOT inherit already-known facts", () => {
    const entity = makeEntity({
      semanticMemory: [makeSemanticEntry()],
    });
    const tribe = makeTribe({
      culturalMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.8,
        contributorIds: ["e1"],
        addedAtTick: 5,
        lastReinforcedTick: 5,
      }],
    });
    const events = inheritFromCulturalMemory(entity, tribe, true, 20);
    expect(events).toHaveLength(0);
  });

  it("does NOT inherit without nearby tribe member", () => {
    const entity = makeEntity({ semanticMemory: [] });
    const tribe = makeTribe({
      culturalMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.8,
        contributorIds: ["e1"],
        addedAtTick: 5,
        lastReinforcedTick: 5,
      }],
    });
    const events = inheritFromCulturalMemory(entity, tribe, false, 20);
    expect(events).toHaveLength(0);
  });

  it("skips cultural entries with too-low confidence", () => {
    const entity = makeEntity({ semanticMemory: [] });
    const tribe = makeTribe({
      culturalMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.1, // 0.1 * 0.7 = 0.07, below 0.1 threshold
        contributorIds: ["e1"],
        addedAtTick: 5,
        lastReinforcedTick: 5,
      }],
    });
    const events = inheritFromCulturalMemory(entity, tribe, true, 20);
    expect(events).toHaveLength(0);
  });
});

// ── Cultural Decay Tests ────────────────────────────────────

describe("cultural memory — decay", () => {
  it("does not decay before interval", () => {
    const tribe = makeTribe({
      culturalMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.8,
        contributorIds: ["e0"],
        addedAtTick: 10,
        lastReinforcedTick: 10,
      }],
    });
    decayCulturalMemory(tribe, 10 + CULTURAL_DECAY_INTERVAL - 1);
    expect(tribe.culturalMemory).toHaveLength(1);
    expect(tribe.culturalMemory![0].confidence).toBe(0.8);
  });

  it("decays after interval", () => {
    const tribe = makeTribe({
      culturalMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.8,
        contributorIds: ["e0"],
        addedAtTick: 10,
        lastReinforcedTick: 10,
      }],
    });
    decayCulturalMemory(tribe, 10 + CULTURAL_DECAY_INTERVAL);
    expect(tribe.culturalMemory).toHaveLength(1);
    expect(tribe.culturalMemory![0].confidence).toBeCloseTo(0.75, 2);
  });

  it("removes entry when confidence reaches 0", () => {
    const tribe = makeTribe({
      culturalMemory: [{
        fact: "resource_location",
        position: { x: 3, y: 3 },
        subject: "berry",
        confidence: 0.05,
        contributorIds: ["e0"],
        addedAtTick: 10,
        lastReinforcedTick: 10,
      }],
    });
    decayCulturalMemory(tribe, 10 + CULTURAL_DECAY_INTERVAL);
    expect(tribe.culturalMemory).toHaveLength(0);
  });
});

// ── Integration: Knowledge Persistence After Death ──────────

describe("cultural memory — persistence after death", () => {
  it("cultural memory survives individual death", () => {
    // Entity teaches, then dies — tribe retains knowledge
    const entity = makeEntity({
      semanticMemory: [makeSemanticEntry({ confidence: 0.9 })],
    });
    const tribe = makeTribe();

    teachToCulturalMemory(entity, tribe, true, 20);
    expect(tribe.culturalMemory).toHaveLength(1);

    // Simulate entity death
    entity.alive = false;

    // New entity inherits
    const newEntity = makeEntity({ id: "e_new", semanticMemory: [] });
    const events = inheritFromCulturalMemory(newEntity, tribe, true, 30);
    expect(events).toHaveLength(1);
    expect(newEntity.semanticMemory).toHaveLength(1);
    expect(newEntity.semanticMemory![0].fact).toBe("resource_location");
  });
});
