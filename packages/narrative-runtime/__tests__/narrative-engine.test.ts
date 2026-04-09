import { describe, it, expect, beforeEach } from "vitest";
import { NarrativeEngine } from "../src/narrative-engine";
import type { SimEvent } from "@project-god/shared";

describe("NarrativeEngine", () => {
  let engine: NarrativeEngine;

  beforeEach(() => {
    engine = new NarrativeEngine(); // No LLM for tests
  });

  it("should ignore non-narrative events", () => {
    const events: SimEvent[] = [
      { type: "TIME_TICKED", tick: 1 },
      { type: "ENTITY_MOVED", tick: 1, entityId: "a", from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
    ];
    engine.processEvents(events, 1);
    expect(engine.getChronicle().length).toBe(0);
  });

  it("should generate a narrative entry for ENTITY_BORN", () => {
    const events: SimEvent[] = [
      {
        type: "ENTITY_BORN",
        tick: 40,
        entityId: "child_1",
        parentIds: ["dad", "mom"],
        sex: "female",
        position: { x: 0, y: 0 },
      },
    ];
    engine.processEvents(events, 40, { tribeName: "Ash Tribe" });

    const chronicle = engine.getChronicle();
    expect(chronicle.length).toBe(1);
    const entry = chronicle[0]!;
    expect(entry.eventType).toBe("ENTITY_BORN");
    expect(entry.importance).toBe("major");
    expect(entry.title).toContain("girl");
    expect(entry.focusEntityId).toBe("child_1");
    expect(entry.focusTribeId).toBe("Ash Tribe");
    expect(entry.tags).toContain("birth");
    expect(entry.year).toBe(1); // tick 40 = year 1

    // Check life events
    const childEvents = engine.getAgentLifeEvents("child_1");
    expect(childEvents.length).toBe(1);
    expect(childEvents[0]!.type).toBe("ENTITY_BORN");

    const momEvents = engine.getAgentLifeEvents("mom");
    expect(momEvents.length).toBe(1);
  });

  it("should correctly deduplicate multiple processEvents calls for the same tick", () => {
    const events: SimEvent[] = [
      {
        type: "ENTITY_DIED",
        tick: 10,
        entityId: "elder_1",
        cause: "exposure",
      },
    ];
    
    engine.processEvents(events, 10);
    expect(engine.getChronicle().length).toBe(1);

    // Calling again for tick 10 should be ignored
    engine.processEvents(events, 10);
    expect(engine.getChronicle().length).toBe(1);

    // Calling for next tick should work
    engine.processEvents(events, 11);
    expect(engine.getChronicle().length).toBe(2);
  });

  it("should respect MAX_CHRONICLE_SIZE", () => {
    const event: SimEvent = {
        type: "PRAYER_STARTED",
        tick: 0,
        entityId: "agent",
        position: { x: 0, y: 0 },
        faith: 50,
    };
    
    for (let i = 1; i <= 210; i++) {
      engine.processEvents([{ ...event, tick: i }], i);
    }

    const chronicle = engine.getChronicle();
    expect(chronicle.length).toBe(200); // MAX_CHRONICLE_SIZE is 200
    // The newest should be tick 210
    expect(chronicle[0]!.tick).toBe(210);
  });
});
