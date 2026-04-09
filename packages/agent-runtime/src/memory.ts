/**
 * memory.ts — Agent memory system (MVP-02 Phase B).
 *
 * Two memory types:
 *   - Working memory: current task tracking ("I'm going to get water at (5,3)")
 *   - Episodic memory: past events ("I found berries at (3,3) on tick 30")
 *
 * Memory lives on EntityState (serialized with save/load).
 * This module provides pure functions to update it.
 */

import {
  EntityState, SimEvent, Vec2,
  TaskMemory, EpisodicEntry, MAX_EPISODIC_MEMORY,
} from "@project-god/shared";

// ── Working Memory ──────────────────────────────────────────

/**
 * Set the entity's current task.
 * Called when the agent commits to a goal (e.g. "seek_water").
 */
export function setTask(
  entity: EntityState,
  goal: string,
  tick: number,
  targetPosition?: Vec2,
  targetId?: string
): void {
  entity.currentTask = { goal, startedAtTick: tick, targetPosition, targetId };
}

/**
 * Clear the entity's current task (goal completed or abandoned).
 */
export function clearTask(entity: EntityState): void {
  entity.currentTask = null;
}

/**
 * Check if the entity's current task is stale (no progress for maxAge ticks).
 */
export function isTaskStale(entity: EntityState, currentTick: number, maxAge: number = 15): boolean {
  if (!entity.currentTask) return false;
  return (currentTick - entity.currentTask.startedAtTick) >= maxAge;
}

// ── Episodic Memory ─────────────────────────────────────────

/**
 * Record an episode into the entity's episodic memory.
 * Automatically enforces FIFO eviction at MAX_EPISODIC_MEMORY.
 */
export function recordEpisode(
  entity: EntityState,
  entry: EpisodicEntry
): void {
  if (!entity.episodicMemory) {
    entity.episodicMemory = [];
  }
  entity.episodicMemory.push(entry);
  // FIFO eviction
  while (entity.episodicMemory.length > MAX_EPISODIC_MEMORY) {
    entity.episodicMemory.shift();
  }
}

/**
 * Recall memorized resource locations of a given type.
 * Returns positions sorted by recency (newest first).
 */
export function recallResourcePositions(
  entity: EntityState,
  resourceType: string
): Vec2[] {
  if (!entity.episodicMemory) return [];

  const relevant = entity.episodicMemory
    .filter((e) => e.type === "found_resource" && e.resourceType === resourceType)
    .sort((a, b) => b.tick - a.tick); // newest first

  // Deduplicate by position
  const seen = new Set<string>();
  const positions: Vec2[] = [];
  for (const entry of relevant) {
    const key = `${entry.position.x},${entry.position.y}`;
    if (!seen.has(key)) {
      seen.add(key);
      positions.push(entry.position);
    }
  }
  return positions;
}

/**
 * Check if a position is remembered as depleted.
 * Used to avoid revisiting exhausted resource nodes.
 */
export function isRememberedDepleted(
  entity: EntityState,
  position: Vec2
): boolean {
  if (!entity.episodicMemory) return false;
  const key = `${position.x},${position.y}`;

  // Look for the most recent event at this position
  for (let i = (entity.episodicMemory.length - 1); i >= 0; i--) {
    const e = entity.episodicMemory[i];
    if (`${e.position.x},${e.position.y}` === key) {
      return e.type === "resource_depleted";
    }
  }
  return false;
}

// ── Event-to-Memory Conversion ──────────────────────────────

/**
 * Process tick events for a specific entity and update their episodic memory.
 * Called after each tick by the simulation loop.
 */
export function updateMemoryFromEvents(
  entity: EntityState,
  events: SimEvent[],
  tick: number
): void {
  for (const event of events) {
    switch (event.type) {
      case "RESOURCE_GATHERED": {
        if (event.entityId !== entity.id) break;
        // Remember where we successfully gathered
        recordEpisode(entity, {
          tick,
          type: "found_resource",
          position: { ...getNodePosition(event) },
          resourceType: event.resourceType,
          detail: `gathered ${event.quantity}`,
        });
        break;
      }
      case "ACTION_REJECTED": {
        if (event.entityId !== entity.id) break;
        // If gather was rejected because resource depleted, remember it
        if (event.intent.type === "gather" && event.reason.includes("depleted")) {
          const node = event.intent.targetId;
          if (event.intent.position) {
            recordEpisode(entity, {
              tick,
              type: "resource_depleted",
              position: { ...event.intent.position },
              detail: `node ${node} depleted`,
            });
          }
        }
        break;
      }
      // Future: ENTITY_DIED nearby → danger_zone memory
    }
  }
}

/**
 * Extract position from a RESOURCE_GATHERED event.
 * The event doesn't carry position directly, so we return
 * a placeholder — the caller should enrich this from world state.
 */
function getNodePosition(event: { nodeId?: string }): Vec2 {
  // Position is embedded in the event pipeline by the enricher below
  return (event as any)._position ?? { x: 0, y: 0 };
}

/**
 * Enrich events with resource node positions before memory processing.
 * This bridges the gap between event data (nodeId) and memory data (position).
 */
export function enrichEventsWithPositions(
  events: SimEvent[],
  resourceNodes: Record<string, { position: Vec2 }>
): SimEvent[] {
  return events.map((e) => {
    if (e.type === "RESOURCE_GATHERED" && e.nodeId) {
      const node = resourceNodes[e.nodeId as string];
      if (node) {
        return { ...e, _position: { ...node.position } } as any;
      }
    }
    return e;
  });
}

// ── Social Memory (MVP-02-E) ─────────────────────────────────

/** Same-tribe trust increment per encounter. */
const SAME_TRIBE_TRUST_INCREMENT = 0.05;
/** Maximum trust from encounters alone. */
const MAX_ENCOUNTER_TRUST = 0.8;
/** Initial trust for first encounter. */
const INITIAL_TRUST = 0.3;

/**
 * Update social memory based on currently visible nearby entities.
 * Called once per tick for each alive entity.
 */
export function updateSocialMemory(
  entity: EntityState,
  nearbyEntities: { entityId: string; tribeId: string; position: Vec2 }[],
  tick: number
): void {
  if (!entity.socialMemory) {
    entity.socialMemory = {};
  }

  for (const ne of nearbyEntities) {
    const existing = entity.socialMemory[ne.entityId];
    const sameTribe = ne.tribeId === entity.tribeId;

    if (!existing) {
      // First encounter
      entity.socialMemory[ne.entityId] = {
        entityId: ne.entityId,
        trust: sameTribe ? INITIAL_TRUST : 0,
        lastSeenTick: tick,
        lastSeenPosition: { ...ne.position },
      };
    } else {
      // Update existing impression
      existing.lastSeenTick = tick;
      existing.lastSeenPosition = { ...ne.position };
      if (sameTribe && existing.trust < MAX_ENCOUNTER_TRUST) {
        existing.trust = Math.min(
          MAX_ENCOUNTER_TRUST,
          existing.trust + SAME_TRIBE_TRUST_INCREMENT
        );
      }
    }
  }
}

// ── Semantic Memory — Distillation (MVP-03-B) ────────────────

import {
  SemanticEntry, SemanticFactType,
  MAX_SEMANTIC_MEMORY, DISTILL_THRESHOLD,
  SEMANTIC_DECAY_INTERVAL, SEMANTIC_DECAY_AMOUNT,
  CulturalEntry, MAX_CULTURAL_MEMORY,
  TEACH_CONFIDENCE_THRESHOLD,
  CULTURAL_DECAY_INTERVAL, CULTURAL_DECAY_AMOUNT,
  TribeState,
} from "@project-god/shared";

/**
 * Distill semantic facts from an entity's episodic memory.
 * Scans for repeated same-type, same-location experiences and forms
 * generalized knowledge when count >= DISTILL_THRESHOLD.
 *
 * Returns an array of SimEvents for newly formed semantic facts.
 */
export function distillSemanticMemory(
  entity: EntityState,
  tick: number
): SimEvent[] {
  if (!entity.semanticMemory) entity.semanticMemory = [];

  const events: SimEvent[] = [];

  // ── Resource location distillation (requires episodic memory) ──
  if (entity.episodicMemory && entity.episodicMemory.length > 0) {
    // Count occurrences by (type, position) key
    const counts = new Map<string, { count: number; resourceType?: string; position: Vec2 }>();
    for (const ep of entity.episodicMemory) {
      if (ep.type !== "found_resource") continue;
      const key = `${ep.resourceType ?? "?"}@${ep.position.x},${ep.position.y}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, {
          count: 1,
          resourceType: ep.resourceType,
          position: { ...ep.position },
        });
      }
    }

    // Distill facts that meet the threshold
    for (const [_key, data] of counts) {
      if (data.count < DISTILL_THRESHOLD) continue;

      const factType: SemanticFactType =
        data.resourceType === "water" ? "water_location" : "resource_location";

      // Check if already known
      const existing = entity.semanticMemory.find(
        (s) =>
          s.fact === factType &&
          s.position?.x === data.position.x &&
          s.position?.y === data.position.y
      );

      if (existing) {
        // Reinforce existing
        existing.confidence = Math.min(1.0, existing.confidence + 0.1);
        existing.lastReinforcedTick = tick;
      } else if (entity.semanticMemory.length < MAX_SEMANTIC_MEMORY) {
        // Form new semantic fact
        const entry: SemanticEntry = {
          fact: factType,
          position: { ...data.position },
          subject: data.resourceType,
          confidence: 0.8,
          formedAtTick: tick,
          lastReinforcedTick: tick,
        };
        entity.semanticMemory.push(entry);
        events.push({
          type: "SEMANTIC_FORMED",
          tick,
          entityId: entity.id,
          fact: factType,
          subject: data.resourceType,
          position: { ...data.position },
          confidence: 0.8,
        } as SimEvent);
      }
    }
  } // end if (entity.episodicMemory)

  // ── Status-based knowledge (always checked) ──
  const statuses = entity.statuses ?? [];
  if (statuses.includes("warming")) {
    const hasWarmingFact = entity.semanticMemory.some((s) => s.fact === "warming_benefit");
    if (!hasWarmingFact && entity.semanticMemory.length < MAX_SEMANTIC_MEMORY) {
      const entry: SemanticEntry = {
        fact: "warming_benefit",
        subject: "fire_pit",
        confidence: 0.9,
        formedAtTick: tick,
        lastReinforcedTick: tick,
      };
      entity.semanticMemory.push(entry);
      events.push({
        type: "SEMANTIC_FORMED",
        tick,
        entityId: entity.id,
        fact: "warming_benefit",
        subject: "fire_pit",
        confidence: 0.9,
      } as SimEvent);
    } else {
      const existing = entity.semanticMemory.find((s) => s.fact === "warming_benefit");
      if (existing) {
        existing.confidence = Math.min(1.0, existing.confidence + 0.05);
        existing.lastReinforcedTick = tick;
      }
    }
  }

  if (statuses.includes("sheltered")) {
    const hasShelterFact = entity.semanticMemory.some((s) => s.fact === "shelter_benefit");
    if (!hasShelterFact && entity.semanticMemory.length < MAX_SEMANTIC_MEMORY) {
      const entry: SemanticEntry = {
        fact: "shelter_benefit",
        subject: "lean_to",
        confidence: 0.9,
        formedAtTick: tick,
        lastReinforcedTick: tick,
      };
      entity.semanticMemory.push(entry);
      events.push({
        type: "SEMANTIC_FORMED",
        tick,
        entityId: entity.id,
        fact: "shelter_benefit",
        subject: "lean_to",
        confidence: 0.9,
      } as SimEvent);
    } else {
      const existing = entity.semanticMemory.find((s) => s.fact === "shelter_benefit");
      if (existing) {
        existing.confidence = Math.min(1.0, existing.confidence + 0.05);
        existing.lastReinforcedTick = tick;
      }
    }
  }

  return events;
}

/**
 * Decay semantic memory confidence over time.
 * Entries that go to 0 confidence are forgotten (removed).
 */
export function decaySemanticMemory(entity: EntityState, tick: number): void {
  if (!entity.semanticMemory) return;

  entity.semanticMemory = entity.semanticMemory.filter((entry) => {
    const elapsed = tick - entry.lastReinforcedTick;
    if (elapsed >= SEMANTIC_DECAY_INTERVAL) {
      const decaySteps = Math.floor(elapsed / SEMANTIC_DECAY_INTERVAL);
      entry.confidence -= SEMANTIC_DECAY_AMOUNT * decaySteps;
      // Reset timer so we don't double-decay
      entry.lastReinforcedTick = tick;
    }
    return entry.confidence > 0;
  });
}

// ── Cultural Memory — Teach / Inherit (MVP-03-B) ─────────────

/**
 * An entity with high-confidence semantic knowledge teaches it to their tribe.
 * Requires the entity to have at least 1 nearby same-tribe member.
 *
 * Returns events for any newly taught knowledge.
 */
export function teachToCulturalMemory(
  entity: EntityState,
  tribe: TribeState,
  hasNearbyTribeMember: boolean,
  tick: number
): SimEvent[] {
  if (!entity.semanticMemory || entity.semanticMemory.length === 0) return [];
  if (!hasNearbyTribeMember) return [];
  if (!tribe.culturalMemory) tribe.culturalMemory = [];

  const events: SimEvent[] = [];

  for (const sem of entity.semanticMemory) {
    if (sem.confidence < TEACH_CONFIDENCE_THRESHOLD) continue;

    // Find matching cultural entry
    const existing = tribe.culturalMemory.find(
      (c) =>
        c.fact === sem.fact &&
        c.position?.x === sem.position?.x &&
        c.position?.y === sem.position?.y &&
        c.subject === sem.subject
    );

    if (existing) {
      // Reinforce and add contributor
      existing.confidence = Math.max(existing.confidence, sem.confidence * 0.8);
      existing.lastReinforcedTick = tick;
      if (!existing.contributorIds.includes(entity.id)) {
        existing.contributorIds.push(entity.id);
      }
    } else if (tribe.culturalMemory.length < MAX_CULTURAL_MEMORY) {
      // New cultural entry
      const cultural: CulturalEntry = {
        fact: sem.fact,
        position: sem.position ? { ...sem.position } : undefined,
        subject: sem.subject,
        confidence: sem.confidence * 0.8,
        contributorIds: [entity.id],
        addedAtTick: tick,
        lastReinforcedTick: tick,
      };
      tribe.culturalMemory.push(cultural);
      events.push({
        type: "KNOWLEDGE_TAUGHT",
        tick,
        entityId: entity.id,
        tribeId: tribe.id,
        fact: sem.fact,
        subject: sem.subject,
        confidence: cultural.confidence,
      } as SimEvent);
    }
  }

  return events;
}

/**
 * An entity inherits knowledge from their tribe's cultural memory.
 * Only inherits facts the entity doesn't already have.
 * Requires the entity to have at least 1 nearby same-tribe member.
 *
 * Returns events for inherited knowledge.
 */
export function inheritFromCulturalMemory(
  entity: EntityState,
  tribe: TribeState,
  hasNearbyTribeMember: boolean,
  tick: number
): SimEvent[] {
  if (!hasNearbyTribeMember) return [];
  if (!tribe.culturalMemory || tribe.culturalMemory.length === 0) return [];
  if (!entity.semanticMemory) entity.semanticMemory = [];

  const events: SimEvent[] = [];

  for (const cultural of tribe.culturalMemory) {
    if (cultural.confidence <= 0) continue;

    // Check if entity already knows this
    const alreadyKnown = entity.semanticMemory.some(
      (s) =>
        s.fact === cultural.fact &&
        s.position?.x === cultural.position?.x &&
        s.position?.y === cultural.position?.y &&
        s.subject === cultural.subject
    );

    if (alreadyKnown) continue;
    if (entity.semanticMemory.length >= MAX_SEMANTIC_MEMORY) break;

    // Inherit at reduced confidence
    const inheritedConfidence = cultural.confidence * 0.7;
    if (inheritedConfidence < 0.1) continue; // too faint to inherit

    const inherited: SemanticEntry = {
      fact: cultural.fact,
      position: cultural.position ? { ...cultural.position } : undefined,
      subject: cultural.subject,
      confidence: inheritedConfidence,
      formedAtTick: tick,
      lastReinforcedTick: tick,
    };
    entity.semanticMemory.push(inherited);
    events.push({
      type: "KNOWLEDGE_INHERITED",
      tick,
      entityId: entity.id,
      tribeId: tribe.id,
      fact: cultural.fact,
      subject: cultural.subject,
      confidence: inheritedConfidence,
    } as SimEvent);
  }

  return events;
}

/**
 * Decay cultural memory confidence over time.
 * Entries that go to 0 confidence are forgotten (removed).
 */
export function decayCulturalMemory(tribe: TribeState, tick: number): void {
  if (!tribe.culturalMemory) return;

  tribe.culturalMemory = tribe.culturalMemory.filter((entry) => {
    const elapsed = tick - entry.lastReinforcedTick;
    if (elapsed >= CULTURAL_DECAY_INTERVAL) {
      const decaySteps = Math.floor(elapsed / CULTURAL_DECAY_INTERVAL);
      entry.confidence -= CULTURAL_DECAY_AMOUNT * decaySteps;
      entry.lastReinforcedTick = tick;
    }
    return entry.confidence > 0;
  });
}
