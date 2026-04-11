import { WorldState, EntityState, NeedDecayedEvent, EntityDiedEvent, SimEvent, ExposureWarningEvent, HpChangedEvent } from "@project-god/shared";
import type { NeedDef } from "../content-types";
import { COLD_THRESHOLD } from "./environment-tick";

/** How fast exposure drops when cold without any shelter. */
const EXPOSURE_COLD_DECAY = 2;
/** How fast exposure drops with warming (fire pit) but no shelter. */
const EXPOSURE_WARMING_DECAY = 1;
/** How fast exposure recovers when temperature is comfortable. */
const EXPOSURE_REGEN = 1;

// ── HP System Constants (MVP-02X) ────────────────────────────
/** HP damage per tick when hunger = 0. */
const HP_DAMAGE_STARVATION = 2;
/** HP damage per tick when thirst = 0. */
const HP_DAMAGE_DEHYDRATION = 3;
/** HP damage per tick when exposure = 0. */
const HP_DAMAGE_EXPOSURE = 1;
/** default HP value for entities. */
const DEFAULT_HP = 100;
/** Maximum HP value. */
const MAX_HP = 100;
/** Hunger threshold for safe HP regen. MVP-02Z: lowered from 70→45 for viable recovery. */
const HP_REGEN_HUNGER_THRESHOLD = 45;
/** HP regen rate when safe+fed: +1 HP per N ticks. */
const HP_SAFE_REGEN_INTERVAL = 6;
/** HP regen rate when in hut/resting: +1 HP per N ticks. */
const HP_REST_REGEN_INTERVAL = 3;

export function decayNeeds(
  world: WorldState,
  needsDefs: Record<string, NeedDef>
): SimEvent[] {
  const events: SimEvent[] = [];
  const temperature = world.environment?.temperature ?? 60; // default warm if no environment

  for (const entity of Object.values(world.entities)) {
    if (!entity.alive) continue;

    // Initialize hp if missing (backward compat)
    if (entity.needs.hp === undefined || entity.needs.hp === null) {
      entity.needs.hp = DEFAULT_HP;
    }

    // MVP-03: Clear expired wet status
    if (entity.statuses?.includes("wet")) {
      const wetUntil = entity.attributes?.["wet_until"] ?? 0;
      if (world.tick >= wetUntil) {
        entity.statuses = entity.statuses.filter((s) => s !== "wet");
        delete entity.attributes["wet_until"];
      }
    }

    for (const [needKey, def] of Object.entries(needsDefs)) {
      // ── Special handling: exposure (MVP-03-A) ─────────────
      if (needKey === "exposure") {
        const oldValue = entity.needs[needKey] ?? def.initial;
        let newValue = oldValue;

        const hasSheltered = entity.statuses?.includes("sheltered") ?? false;
        const hasWarming = entity.statuses?.includes("warming") ?? false;
        const hasHome = entity.statuses?.includes("home") ?? false;
        const isCold = temperature < COLD_THRESHOLD;

        if (hasSheltered || hasHome) {
          // Fully sheltered: no decay, slow regen
          newValue = Math.min(def.max, oldValue + EXPOSURE_REGEN * 0.5);
        } else if (isCold) {
          // Cold and unprotected
          let decay = hasWarming ? EXPOSURE_WARMING_DECAY : EXPOSURE_COLD_DECAY;
          // MVP-03: Being wet increases cold exposure decay by 50%
          const isWet = entity.statuses?.includes("wet") ?? false;
          if (isWet) decay *= 1.5;
          newValue = Math.max(0, oldValue - decay);
        } else {
          // Warm enough: slowly recover
          newValue = Math.min(def.max, oldValue + EXPOSURE_REGEN);
        }

        if (Math.abs(oldValue - newValue) >= 0.5) {
          entity.needs[needKey] = newValue;
          events.push({
            type: "NEED_DECAYED",
            tick: world.tick,
            entityId: entity.id,
            need: needKey,
            oldValue: Math.round(oldValue),
            newValue: Math.round(newValue),
          } as NeedDecayedEvent);
        } else if (newValue !== oldValue) {
          entity.needs[needKey] = newValue;
        }

        // Emit warning when entering critical zone
        if (oldValue > def.criticalThreshold && newValue <= def.criticalThreshold) {
          events.push({
            type: "EXPOSURE_WARNING",
            tick: world.tick,
            entityId: entity.id,
            exposure: newValue,
          } as ExposureWarningEvent);
        }
        continue;
      }

      // ── Standard need decay ───────────────────────────────
      if (def.decayPerTick <= 0) continue;

      const oldValue = entity.needs[needKey] ?? def.initial;

      // MVP-04: Children decay hunger/thirst at half rate
      const isChild = entity.statuses?.includes("child") ?? false;
      const decay = (isChild && (needKey === "hunger" || needKey === "thirst"))
        ? def.decayPerTick * 0.5
        : def.decayPerTick;

      const newValue = Math.max(0, oldValue - decay);
      entity.needs[needKey] = newValue;

      if (oldValue !== newValue) {
        events.push({
          type: "NEED_DECAYED",
          tick: world.tick,
          entityId: entity.id,
          need: needKey,
          oldValue,
          newValue,
        } as NeedDecayedEvent);
      }
    }

    // ── HP damage from critical needs (MVP-02X) ───────────────
    const hpEvents = applyHpDamageAndRegen(entity, world.tick);
    events.push(...hpEvents);
  }

  return events;
}

/**
 * Apply HP damage from starvation/dehydration/exposure,
 * and HP regen when safe+fed or resting in hut.
 */
function applyHpDamageAndRegen(entity: EntityState, tick: number): SimEvent[] {
  const events: SimEvent[] = [];
  const oldHp = entity.needs.hp ?? DEFAULT_HP;
  let newHp = oldHp;

  // ── Damage phase ────────────────────────────────────────────
  const hunger = entity.needs.hunger ?? 100;
  const thirst = entity.needs.thirst ?? 100;
  const exposure = entity.needs.exposure ?? 100;

  if (hunger <= 0) {
    newHp -= HP_DAMAGE_STARVATION;
  }
  if (thirst <= 0) {
    newHp -= HP_DAMAGE_DEHYDRATION;
  }
  if (exposure <= 0) {
    newHp -= HP_DAMAGE_EXPOSURE;
  }

  // ── Regen phase ─────────────────────────────────────────────
  const isTakingDamage = hunger <= 0 || thirst <= 0 || exposure <= 0;
  const hasHome = entity.statuses?.includes("home") ?? false;
  const hasSheltered = entity.statuses?.includes("sheltered") ?? false;
  const isResting = entity.statuses?.includes("resting") ?? false;

  if (!isTakingDamage && newHp < MAX_HP) {
    const isSafeFed = hunger >= HP_REGEN_HUNGER_THRESHOLD;
    const isInShelter = hasHome || hasSheltered || isResting;

    if (isSafeFed) {
      const regenInterval = isInShelter ? HP_REST_REGEN_INTERVAL : HP_SAFE_REGEN_INTERVAL;
      if (tick % regenInterval === 0) {
        newHp += 1;
      }
    }
  }

  // Clamp HP
  newHp = Math.max(0, Math.min(MAX_HP, newHp));

  if (newHp !== oldHp) {
    entity.needs.hp = newHp;
    const cause = newHp < oldHp
      ? (hunger <= 0 ? "starvation" : thirst <= 0 ? "dehydration" : "exposure")
      : (hasHome ? "rest_in_hut" : hasSheltered ? "rest_in_shelter" : "natural_regen");

    events.push({
      type: "HP_CHANGED",
      tick,
      entityId: entity.id,
      oldHp,
      newHp,
      cause,
    } as HpChangedEvent);
  }

  return events;
}

export function checkDeaths(
  world: WorldState,
  needsDefs: Record<string, NeedDef>
): SimEvent[] {
  const events: SimEvent[] = [];

  for (const entity of Object.values(world.entities)) {
    if (!entity.alive) continue;

    // MVP-02X: Death is now HP-based, not need-based
    const hp = entity.needs.hp ?? DEFAULT_HP;
    if (hp <= 0) {
      entity.alive = false;
      // Determine primary cause of death
      const hunger = entity.needs.hunger ?? 100;
      const thirst = entity.needs.thirst ?? 100;
      const exposure = entity.needs.exposure ?? 100;
      const cause = thirst <= 0 ? "dehydration"
        : hunger <= 0 ? "starvation"
        : exposure <= 0 ? "exposure"
        : "hp depleted";

      events.push({
        type: "ENTITY_DIED",
        tick: world.tick,
        entityId: entity.id,
        cause,
      } as EntityDiedEvent);
      continue;
    }

    // Backward compat: still check old death thresholds for needs without HP
    for (const [needKey, def] of Object.entries(needsDefs)) {
      if (needKey === "hunger" || needKey === "thirst" || needKey === "exposure") continue; // HP handles these
      if (def.deathThreshold < 0) continue; // -1 = cannot die from this
      if (entity.needs[needKey] <= def.deathThreshold) {
        entity.alive = false;
        events.push({
          type: "ENTITY_DIED",
          tick: world.tick,
          entityId: entity.id,
          cause: `${needKey} reached death threshold`,
        } as EntityDiedEvent);
        break;
      }
    }
  }

  return events;
}
