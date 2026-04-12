/**
 * diplomacy-tick.ts — P3: Cross-Tribe Diplomacy System
 *
 * Runs once per tick after social-dynamics-tick to:
 * 1. Detect inter-tribe encounters (entities from different tribes in proximity)
 * 2. Update tribe diplomatic relations based on encounters
 * 3. Compute territory claims (centroid of tribe structures)
 * 4. Detect territory overlap → increase tension between tribes
 * 5. Decay hostility over time (tribes forget old grudges)
 *
 * Diplomacy status thresholds:
 *   hostility < -0.5 → "allied"
 *   hostility < -0.2 → "friendly"
 *   hostility < 0.2  → "neutral"
 *   hostility < 0.5  → "hostile"
 *   hostility >= 0.5  → "war"
 */

import {
  WorldState, SimEvent, EntityState, TribeState, StructureState,
  TribeDiplomacy, manhattan,
} from "@project-god/shared";
import type { GenericGameEvent } from "@project-god/shared";

// ── Configuration ────────────────────────────────────────────

/** Max distance for inter-tribe encounter detection. */
const ENCOUNTER_RADIUS = 3;

/** How often to run full diplomacy calculations (every N ticks). */
const DIPLOMACY_TICK_INTERVAL = 5;

/** Hostility change per positive encounter (trade, gift). */
const HOSTILITY_TRADE_DELTA = -0.05;

/** Hostility change per neutral encounter (just proximity). */
const HOSTILITY_ENCOUNTER_DELTA = -0.01;

/** Hostility increase when territories overlap. */
const HOSTILITY_TERRITORY_OVERLAP = 0.03;

/** Hostility increase when one tribe's member is starving near another tribe's territory. */
const HOSTILITY_SCARCITY_NEAR_OTHER = 0.02;

/** Natural hostility decay per tick (tribes slowly forget). */
const HOSTILITY_DECAY_RATE = 0.002;

/** Base territory radius for a tribe (scales with structure count). */
const BASE_TERRITORY_RADIUS = 5;

/** Territory radius growth per additional structure. */
const TERRITORY_RADIUS_PER_STRUCTURE = 1;

/** Max territory radius. */
const MAX_TERRITORY_RADIUS = 15;

// ── Status thresholds ────────────────────────────────────────

function computeStatus(hostility: number): TribeDiplomacy["status"] {
  if (hostility <= -0.5) return "allied";
  if (hostility <= -0.2) return "friendly";
  if (hostility < 0.2) return "neutral";
  if (hostility < 0.5) return "hostile";
  return "war";
}

// ── Main System ──────────────────────────────────────────────

export function diplomacyTick(world: WorldState): SimEvent[] {
  if (!world.tribes) return [];

  const tribes = Object.values(world.tribes) as TribeState[];
  if (tribes.length < 2) return []; // No diplomacy with only one tribe

  const events: SimEvent[] = [];

  // ── 1. Update territory claims ─────────────────────────────
  updateTerritories(world, tribes);

  // Only do full diplomacy calculations periodically
  if (world.tick % DIPLOMACY_TICK_INTERVAL !== 0) return events;

  // ── 2. Detect inter-tribe encounters ───────────────────────
  for (let i = 0; i < tribes.length; i++) {
    for (let j = i + 1; j < tribes.length; j++) {
      const tribeA = tribes[i];
      const tribeB = tribes[j];

      const encounterEvents = processTribalEncounter(world, tribeA, tribeB);
      events.push(...encounterEvents);
    }
  }

  // ── 3. Territory overlap tension ───────────────────────────
  for (let i = 0; i < tribes.length; i++) {
    for (let j = i + 1; j < tribes.length; j++) {
      const tribeA = tribes[i];
      const tribeB = tribes[j];

      if (tribeA.territoryCenter && tribeB.territoryCenter) {
        const dist = manhattan(tribeA.territoryCenter, tribeB.territoryCenter);
        const overlapThreshold = (tribeA.territoryRadius ?? BASE_TERRITORY_RADIUS)
          + (tribeB.territoryRadius ?? BASE_TERRITORY_RADIUS);

        if (dist < overlapThreshold) {
          // Territories overlap → increase hostility
          adjustHostility(tribeA, tribeB.id, HOSTILITY_TERRITORY_OVERLAP, world.tick);
          adjustHostility(tribeB, tribeA.id, HOSTILITY_TERRITORY_OVERLAP, world.tick);
        }
      }
    }
  }

  // ── 4. Natural hostility decay ──────────────────────────────
  for (const tribe of tribes) {
    if (!tribe.diplomacy) continue;
    for (const rel of Object.values(tribe.diplomacy)) {
      if (rel.hostility > 0) {
        rel.hostility = Math.max(0, rel.hostility - HOSTILITY_DECAY_RATE);
      } else if (rel.hostility < 0) {
        rel.hostility = Math.min(0, rel.hostility + HOSTILITY_DECAY_RATE);
      }
      // Update status
      const newStatus = computeStatus(rel.hostility);
      if (newStatus !== rel.status) {
        const oldStatus = rel.status;
        rel.status = newStatus;
        events.push({
          type: "SOCIAL_INTERACTION",
          tick: world.tick,
          entityId: "",
          message: `Diplomatic relations between ${tribe.name} and tribe ${rel.tribeId} changed: ${oldStatus} → ${newStatus} (hostility: ${rel.hostility.toFixed(2)})`,
          detail: "diplomacy_changed",
        } as GenericGameEvent);
      }
    }
  }

  // ── 5. Scarcity near other tribe's territory ───────────────
  for (const tribe of tribes) {
    const aliveMembers = tribe.memberIds
      .map((id) => world.entities[id])
      .filter((e): e is EntityState => !!e && e.alive);

    for (const member of aliveMembers) {
      if (member.needs.hunger > 30) continue; // Only hungry agents trigger this

      for (const otherTribe of tribes) {
        if (otherTribe.id === tribe.id) continue;
        if (!otherTribe.territoryCenter) continue;

        const dist = manhattan(member.position, otherTribe.territoryCenter);
        if (dist <= (otherTribe.territoryRadius ?? BASE_TERRITORY_RADIUS)) {
          // Starving near another tribe's territory → resentment
          adjustHostility(tribe, otherTribe.id, HOSTILITY_SCARCITY_NEAR_OTHER, world.tick);
        }
      }
    }
  }

  return events;
}

// ── Helper Functions ─────────────────────────────────────────

/**
 * Process encounters between two tribes.
 * Counts how many pairs of entities from different tribes are near each other.
 */
function processTribalEncounter(
  world: WorldState,
  tribeA: TribeState,
  tribeB: TribeState
): SimEvent[] {
  const events: SimEvent[] = [];

  const membersA = tribeA.memberIds
    .map((id) => world.entities[id])
    .filter((e): e is EntityState => !!e && e.alive);
  const membersB = tribeB.memberIds
    .map((id) => world.entities[id])
    .filter((e): e is EntityState => !!e && e.alive);

  let encounterCount = 0;
  let firstEncounterA: EntityState | null = null;
  let firstEncounterB: EntityState | null = null;

  for (const a of membersA) {
    for (const b of membersB) {
      if (manhattan(a.position, b.position) <= ENCOUNTER_RADIUS) {
        encounterCount++;
        if (!firstEncounterA) {
          firstEncounterA = a;
          firstEncounterB = b;
        }
      }
    }
  }

  if (encounterCount > 0) {
    // Peaceful encounter → slightly reduce hostility
    adjustHostility(tribeA, tribeB.id, HOSTILITY_ENCOUNTER_DELTA * encounterCount, world.tick);
    adjustHostility(tribeB, tribeA.id, HOSTILITY_ENCOUNTER_DELTA * encounterCount, world.tick);

    // First contact event (if tribes haven't met before)
    const relA = tribeA.diplomacy?.[tribeB.id];
    if (!relA || relA.status === "unknown") {
      events.push({
        type: "SOCIAL_INTERACTION",
        tick: world.tick,
        entityId: firstEncounterA?.id ?? "",
        message: `${firstEncounterA?.name ?? "A member"} of ${tribeA.name} encounters ${firstEncounterB?.name ?? "a member"} of ${tribeB.name} — first contact between tribes!`,
        detail: "first_contact",
      } as GenericGameEvent);
    }

    // Cross-tribe social memory: both entities remember meeting an outsider
    if (firstEncounterA && firstEncounterB) {
      if (!firstEncounterA.socialMemory) firstEncounterA.socialMemory = {};
      if (!firstEncounterB.socialMemory) firstEncounterB.socialMemory = {};

      firstEncounterA.socialMemory[firstEncounterB.id] = {
        entityId: firstEncounterB.id,
        trust: firstEncounterA.socialMemory[firstEncounterB.id]?.trust ?? 0.1,
        lastSeenTick: world.tick,
        lastSeenPosition: { ...firstEncounterB.position },
        interactionCount: (firstEncounterA.socialMemory[firstEncounterB.id]?.interactionCount ?? 0) + 1,
        lastTopic: "encounter",
      };
      firstEncounterB.socialMemory[firstEncounterA.id] = {
        entityId: firstEncounterA.id,
        trust: firstEncounterB.socialMemory[firstEncounterA.id]?.trust ?? 0.1,
        lastSeenTick: world.tick,
        lastSeenPosition: { ...firstEncounterA.position },
        interactionCount: (firstEncounterB.socialMemory[firstEncounterA.id]?.interactionCount ?? 0) + 1,
        lastTopic: "encounter",
      };
    }
  }

  return events;
}

/**
 * Update territory claims based on structure positions.
 * Territory center = centroid of all tribe-owned structures.
 * Territory radius = BASE + N * PER_STRUCTURE, capped.
 */
function updateTerritories(world: WorldState, tribes: TribeState[]): void {
  if (!world.structures) return;

  const allStructures = Object.values(world.structures) as StructureState[];

  for (const tribe of tribes) {
    // Find structures owned by this tribe
    const tribeStructures = allStructures.filter(
      (s) => s.active && s.tribeId === tribe.id
    );

    if (tribeStructures.length === 0) {
      // Fallback: use member centroid
      const aliveMembers = tribe.memberIds
        .map((id) => world.entities[id])
        .filter((e): e is EntityState => !!e && e.alive);

      if (aliveMembers.length > 0) {
        const cx = Math.round(aliveMembers.reduce((s, e) => s + e.position.x, 0) / aliveMembers.length);
        const cy = Math.round(aliveMembers.reduce((s, e) => s + e.position.y, 0) / aliveMembers.length);
        tribe.territoryCenter = { x: cx, y: cy };
        tribe.territoryRadius = BASE_TERRITORY_RADIUS;
      }
      continue;
    }

    // Centroid of structures
    const cx = Math.round(tribeStructures.reduce((s, st) => s + st.position.x, 0) / tribeStructures.length);
    const cy = Math.round(tribeStructures.reduce((s, st) => s + st.position.y, 0) / tribeStructures.length);
    tribe.territoryCenter = { x: cx, y: cy };
    tribe.territoryRadius = Math.min(
      MAX_TERRITORY_RADIUS,
      BASE_TERRITORY_RADIUS + tribeStructures.length * TERRITORY_RADIUS_PER_STRUCTURE
    );
  }
}

/**
 * Adjust hostility between two tribes, ensuring diplomacy record exists.
 * Hostility is clamped to [-1.0, +1.0].
 */
function adjustHostility(
  tribe: TribeState,
  otherTribeId: string,
  delta: number,
  tick: number
): void {
  if (!tribe.diplomacy) tribe.diplomacy = {};
  if (!tribe.diplomacy[otherTribeId]) {
    tribe.diplomacy[otherTribeId] = {
      tribeId: otherTribeId,
      hostility: 0,
      tradeCount: 0,
      conflictCount: 0,
      status: "unknown",
      lastInteractionTick: tick,
    };
  }

  const rel = tribe.diplomacy[otherTribeId];
  rel.hostility = Math.max(-1.0, Math.min(1.0, rel.hostility + delta));
  rel.lastInteractionTick = tick;
  rel.status = computeStatus(rel.hostility);
}
