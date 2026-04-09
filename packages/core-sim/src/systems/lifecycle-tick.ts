/**
 * lifecycle-tick.ts — Per-tick lifecycle system (MVP-04).
 *
 * Handles:
 *   1. Age calculation (every TICKS_PER_YEAR ticks)
 *   2. Life stage transitions (child → adult → elder)
 *   3. Natural death (age >= maxAge)
 *   4. Pair bonding (adults + opposite sex + trust + proximity)
 *   5. Birth (paired adults + cooldown + hunger)
 *
 * Runs at step 1.6 in the tick loop, after environment tick.
 */

import {
  WorldState, EntityState, SimEvent, LifeStage, Sex,
  EntityId, TribeId, Vec2, manhattan, createRNG,
  EntityAgedEvent, PairBondedEvent, EntityBornEvent, EntityDiedEvent,
} from "@project-god/shared";
import type { LifecycleDef } from "../content-types";

// ── Life Stage helpers ────────────────────────────────────────

/**
 * Derive life stage from age and maxAge.
 * Not stored — computed on demand.
 */
export function getLifeStage(age: number, maxAge: number, cfg: LifecycleDef): LifeStage {
  if (age < cfg.ADULTHOOD_AGE) return "child";
  if (age >= maxAge * cfg.ELDER_AGE_RATIO) return "elder";
  return "adult";
}

/**
 * Calculate the current age in life-years from bornAtTick and current tick.
 */
function calculateAge(currentTick: number, bornAtTick: number, ticksPerYear: number): number {
  return Math.floor((currentTick - bornAtTick) / ticksPerYear);
}

// ── Main tick function ────────────────────────────────────────

export function tickLifecycle(world: WorldState, cfg: LifecycleDef): SimEvent[] {
  const events: SimEvent[] = [];

  for (const entity of Object.values(world.entities) as EntityState[]) {
    if (!entity.alive) continue;
    // Skip entities without lifecycle data (backward compat)
    if (entity.age === undefined || entity.maxAge === undefined || entity.bornAtTick === undefined) continue;

    // ── 1. Age Calculation ──────────────────────────────────
    const prevAge = entity.age;
    const newAge = calculateAge(world.tick, entity.bornAtTick, cfg.TICKS_PER_YEAR);

    if (newAge !== prevAge) {
      entity.age = newAge;

      // ── 2. Check life stage transition ────────────────────
      const prevStage = getLifeStage(prevAge, entity.maxAge, cfg);
      const newStage = getLifeStage(newAge, entity.maxAge, cfg);

      if (newStage !== prevStage) {
        // Update status tags
        const statuses = entity.statuses ?? [];
        const filtered = statuses.filter((s) => s !== "child" && s !== "elder");
        if (newStage === "child") filtered.push("child");
        if (newStage === "elder") filtered.push("elder");
        entity.statuses = filtered;

        events.push({
          type: "ENTITY_AGED",
          tick: world.tick,
          entityId: entity.id,
          newStage,
          age: newAge,
        } as EntityAgedEvent);
      }

      // ── 3. Natural death ──────────────────────────────────
      if (newAge >= entity.maxAge) {
        entity.alive = false;
        events.push({
          type: "ENTITY_DIED",
          tick: world.tick,
          entityId: entity.id,
          cause: "old_age",
        } as EntityDiedEvent);

        // If they had a spouse, clear the spouse's reference
        if (entity.spouseId) {
          const spouse = world.entities[entity.spouseId] as EntityState | undefined;
          if (spouse) {
            spouse.spouseId = undefined;
          }
        }
      }
    }
  }

  // ── 4. Pair Bonding ───────────────────────────────────────
  events.push(...tickPairing(world, cfg));

  // ── 5. Birth ──────────────────────────────────────────────
  events.push(...tickBirth(world, cfg));

  return events;
}

// ── Pair Bonding ──────────────────────────────────────────────

function tickPairing(world: WorldState, cfg: LifecycleDef): SimEvent[] {
  const events: SimEvent[] = [];
  const aliveAdults = (Object.values(world.entities) as EntityState[]).filter((e) => {
    if (!e.alive || e.spouseId) return false;
    if (e.age === undefined || e.maxAge === undefined) return false;
    const stage = getLifeStage(e.age, e.maxAge, cfg);
    return stage === "adult" && e.age >= cfg.PAIRING_MIN_AGE;
  });

  // Track who has already been paired this tick
  const pairedThisTick = new Set<string>();

  for (const candidate of aliveAdults) {
    if (pairedThisTick.has(candidate.id)) continue;

    // Find a suitable partner
    for (const partner of aliveAdults) {
      if (partner.id === candidate.id) continue;
      if (pairedThisTick.has(partner.id)) continue;
      if (partner.sex === candidate.sex) continue; // must be opposite sex
      if (partner.tribeId !== candidate.tribeId) continue; // same tribe
      if (manhattan(candidate.position, partner.position) > 1) continue; // adjacent

      // Check trust
      const impression = candidate.socialMemory?.[partner.id];
      if (!impression || impression.trust < cfg.PAIRING_MIN_TRUST) continue;

      // Pair them!
      candidate.spouseId = partner.id;
      partner.spouseId = candidate.id;
      pairedThisTick.add(candidate.id);
      pairedThisTick.add(partner.id);

      events.push({
        type: "PAIR_BONDED",
        tick: world.tick,
        entity1Id: candidate.id,
        entity2Id: partner.id,
        tribeId: candidate.tribeId,
      } as PairBondedEvent);

      break; // candidate is now paired, move on
    }
  }

  return events;
}

// ── Birth ─────────────────────────────────────────────────────

function tickBirth(world: WorldState, cfg: LifecycleDef): SimEvent[] {
  const events: SimEvent[] = [];
  const cooldownTicks = cfg.BIRTH_COOLDOWN_YEARS * cfg.TICKS_PER_YEAR;

  // Only check females with spouse (avoid double-processing by checking one sex)
  const mothers = (Object.values(world.entities) as EntityState[]).filter((e) => {
    if (!e.alive || e.sex !== "female" || !e.spouseId) return false;
    if (e.age === undefined || e.maxAge === undefined) return false;
    const stage = getLifeStage(e.age, e.maxAge, cfg);
    return stage === "adult";
  });

  for (const mother of mothers) {
    const father = world.entities[mother.spouseId!] as EntityState | undefined;
    if (!father || !father.alive) continue;
    if (father.age === undefined || father.maxAge === undefined) continue;

    const fatherStage = getLifeStage(father.age, father.maxAge, cfg);
    if (fatherStage !== "adult") continue;

    // Distance check — must be at same position
    if (mother.position.x !== father.position.x || mother.position.y !== father.position.y) continue;

    // Hunger check
    if ((mother.needs.hunger ?? 0) < cfg.MIN_BIRTH_HUNGER) continue;
    if ((father.needs.hunger ?? 0) < cfg.MIN_BIRTH_HUNGER) continue;

    // Cooldown check
    const lastBirth = Math.max(mother.lastBirthTick ?? 0, father.lastBirthTick ?? 0);
    if (world.tick - lastBirth < cooldownTicks) continue;

    // ── Create child ────────────────────────────────────────
    const rng = createRNG(world.rngState);
    world.rngState = rng.state;

    const childSex: Sex = rng.next() < 0.5 ? "male" : "female";
    const childId = `entity_${world.tick}_${rng.nextInt(0, 9999)}` as EntityId;

    const mutation = cfg.ATTRIBUTE_MUTATION_RANGE;
    const avgIntel = ((mother.attributes.intelligence ?? 5) + (father.attributes.intelligence ?? 5)) / 2;
    const avgBody = ((mother.attributes.body ?? 5) + (father.attributes.body ?? 5)) / 2;
    const avgMaxAge = ((mother.maxAge ?? cfg.DEFAULT_MAX_AGE) + (father.maxAge ?? cfg.DEFAULT_MAX_AGE)) / 2;

    const avgFaith = ((mother.attributes.faith ?? 0) + (father.attributes.faith ?? 0)) / 2;

    const childEntity: EntityState = {
      id: childId,
      type: "human",
      tribeId: mother.tribeId,
      position: { ...mother.position },
      attributes: {
        intelligence: Math.round(Math.max(1, Math.min(10, avgIntel + rng.nextInt(-mutation, mutation)))),
        body: Math.round(Math.max(1, Math.min(10, avgBody + rng.nextInt(-mutation, mutation)))),
        faith: Math.round(avgFaith * 0.5), // MVP-05: children inherit 50% of parents' avg faith
      },
      needs: { hunger: 80, thirst: 80, exposure: 100, hp: 100 },
      inventory: {},
      alive: true,
      age: 0,
      sex: childSex,
      maxAge: Math.round(Math.max(40, avgMaxAge + rng.nextInt(-5, 5))),
      bornAtTick: world.tick,
      parentIds: [mother.id, father.id],
      childIds: [],
      statuses: ["child"],
    };

    world.entities[childId] = childEntity;

    // Update parent records
    if (!mother.childIds) mother.childIds = [];
    mother.childIds.push(childId);
    mother.lastBirthTick = world.tick;

    if (!father.childIds) father.childIds = [];
    father.childIds.push(childId);
    father.lastBirthTick = world.tick;

    // Add to tribe
    if (world.tribes && mother.tribeId) {
      const tribe = world.tribes[mother.tribeId];
      if (tribe) {
        tribe.memberIds.push(childId);
      }
    }

    events.push({
      type: "ENTITY_BORN",
      tick: world.tick,
      entityId: childId,
      parentIds: [mother.id, father.id],
      sex: childSex,
      position: { ...mother.position },
    } as EntityBornEvent);
  }

  return events;
}
