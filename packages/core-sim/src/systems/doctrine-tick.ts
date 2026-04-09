/**
 * doctrine-tick.ts — MVP-07B Doctrine system tick.
 *
 * Runs once per world tick (after spiritual-tick) to:
 *   1. Form new doctrines when trigger events have occurred
 *   2. Detect doctrine violations based on recent events
 *   3. Reinforce doctrines when actions align
 *   4. Decay doctrine strength yearly
 */

import type {
  WorldState, EntityState, TribeState, SimEvent, DoctrineEntry, DoctrineType,
  DoctrineFormedEvent, DoctrineViolatedEvent, DoctrineReinforcedEvent
} from "@project-god/shared";

// ── Tunable constants ────────────────────────────────────────

/** Faith penalty for violating a doctrine. */
const VIOLATION_FAITH_PENALTY = 3;

/** Doctrine strength gain on reinforcement (per event). */
const REINFORCEMENT_GAIN = 2;

/** Doctrine strength decay per year (matches faith decay pattern). */
const DOCTRINE_DECAY_PER_YEAR = 1;

/** Maximum number of doctrines a tribe can hold. */
const MAX_DOCTRINES = 6;

// ── Doctrine definitions ─────────────────────────────────────

interface DoctrineDef {
  description: string;
  type: DoctrineType;
  triggeredBy: string;
  faithThreshold: number;
  initialStrength: number;
  violatedBy: string | null;
}

const DOCTRINE_DEFS: Record<string, DoctrineDef> = {
  fire_sacred: {
    description: "Fire is a sacred gift — letting it die is a transgression.",
    type: "taboo",
    triggeredBy: "STRUCTURE_BUILT",
    faithThreshold: 8,
    initialStrength: 50,
    violatedBy: "STRUCTURE_EXPIRED",
  },
  share_food: {
    description: "The hungry must be fed — hoarding food is shameful.",
    type: "commandment",
    triggeredBy: "ITEM_DROPPED",
    faithThreshold: 10,
    initialStrength: 40,
    violatedBy: null,
  },
  honor_the_dead: {
    description: "When a tribesman falls, the living must pause to remember.",
    type: "tradition",
    triggeredBy: "ENTITY_DIED",
    faithThreshold: 5,
    initialStrength: 45,
    violatedBy: null,
  },
  divine_bounty: {
    description: "The god provides — give thanks through prayer when blessed.",
    type: "commandment",
    triggeredBy: "MIRACLE_PERFORMED",
    faithThreshold: 8,
    initialStrength: 55,
    violatedBy: null,
  },
};

/**
 * Calculate the average faith of alive adult members of a tribe.
 */
function tribeFaithAverage(world: WorldState, tribe: TribeState): number {
  let total = 0;
  let count = 0;
  for (const memberId of tribe.memberIds) {
    const member = world.entities[memberId];
    if (!member || !member.alive) continue;
    if (member.statuses?.includes("child")) continue;
    total += member.attributes.faith ?? 0;
    count++;
  }
  return count > 0 ? total / count : 0;
}

export function tickDoctrine(
  world: WorldState,
  recentEvents: SimEvent[],
  ticksPerYear: number
): SimEvent[] {
  const events: SimEvent[] = [];
  const tick = world.tick;

  for (const tribe of Object.values(world.tribes ?? {}) as TribeState[]) {
    if (!tribe.doctrines) tribe.doctrines = [];

    const avgFaith = tribeFaithAverage(world, tribe);

    // ── 1. Doctrine formation ──────────────────────────────────
    for (const [docId, def] of Object.entries(DOCTRINE_DEFS)) {
      // Already has this doctrine?
      if (tribe.doctrines.some(d => d.id === docId)) continue;
      // Too many doctrines?
      if (tribe.doctrines.length >= MAX_DOCTRINES) continue;
      // Faith too low?
      if (avgFaith < def.faithThreshold) continue;

      // Check if trigger event happened this tick
      const triggerFound = recentEvents.some(e => {
        if (e.type !== def.triggeredBy) return false;
        // For STRUCTURE_BUILT, check if it's a fire_pit for fire_sacred
        if (docId === "fire_sacred" && e.type === "STRUCTURE_BUILT") {
          return (e as any).structureType === "fire_pit";
        }
        // For ITEM_DROPPED, check if it's a berry for share_food
        if (docId === "share_food" && e.type === "ITEM_DROPPED") {
          return (e as any).itemType === "berry";
        }
        return true;
      });

      if (triggerFound) {
        const newDoctrine: DoctrineEntry = {
          id: docId,
          type: def.type,
          description: def.description,
          strength: def.initialStrength,
          formedAtTick: tick,
          formedReason: def.triggeredBy,
        };
        tribe.doctrines.push(newDoctrine);

        events.push({
          type: "DOCTRINE_FORMED",
          tick,
          tribeId: tribe.id,
          doctrineId: docId,
          doctrineType: def.type,
          description: def.description,
          strength: def.initialStrength,
        } as SimEvent);
      }
    }

    // ── 2. Doctrine violation detection ─────────────────────────
    for (const doctrine of tribe.doctrines) {
      const def = DOCTRINE_DEFS[doctrine.id];
      if (!def || !def.violatedBy) continue;

      const violations = recentEvents.filter(e => {
        if (e.type !== def.violatedBy) return false;
        // fire_sacred: check if expired structure is fire_pit
        if (doctrine.id === "fire_sacred" && e.type === "STRUCTURE_EXPIRED") {
          return (e as any).structureType === "fire_pit";
        }
        return true;
      });

      for (const violation of violations) {
        // Apply faith penalty to all tribe members
        for (const memberId of tribe.memberIds) {
          const member = world.entities[memberId];
          if (!member || !member.alive) continue;

          const oldFaith = member.attributes.faith ?? 0;
          const newFaith = Math.max(0, oldFaith - VIOLATION_FAITH_PENALTY);
          if (oldFaith !== newFaith) {
            member.attributes.faith = newFaith;

            // Track violation count
            if (!member.doctrineAlignment) member.doctrineAlignment = {};
            member.doctrineAlignment[doctrine.id] =
              (member.doctrineAlignment[doctrine.id] ?? 0) - 1;
          }
        }

        events.push({
          type: "DOCTRINE_VIOLATED",
          tick,
          tribeId: tribe.id,
          doctrineId: doctrine.id,
          description: doctrine.description,
        } as SimEvent);
      }
    }

    // ── 3. Doctrine reinforcement ──────────────────────────────
    for (const doctrine of tribe.doctrines) {
      const def = DOCTRINE_DEFS[doctrine.id];
      if (!def) continue;

      // Check if trigger event happened again (reinforces belief)
      const reinforced = recentEvents.some(e => e.type === def.triggeredBy);
      if (reinforced && tick > doctrine.formedAtTick) {
        doctrine.strength = Math.min(100, doctrine.strength + REINFORCEMENT_GAIN);
        events.push({
          type: "DOCTRINE_REINFORCED",
          tick,
          tribeId: tribe.id,
          doctrineId: doctrine.id,
          newStrength: doctrine.strength,
        } as SimEvent);
      }
    }

    // ── 4. Yearly doctrine decay ───────────────────────────────
    if (tick > 0 && tick % ticksPerYear === 0) {
      for (const doctrine of tribe.doctrines) {
        doctrine.strength = Math.max(0, doctrine.strength - DOCTRINE_DECAY_PER_YEAR);
      }
      // Remove dead doctrines (strength 0)
      tribe.doctrines = tribe.doctrines.filter(d => d.strength > 0);
    }
  }

  return events;
}
