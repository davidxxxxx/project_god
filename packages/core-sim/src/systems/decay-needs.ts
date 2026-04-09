import { WorldState, EntityState, NeedDecayedEvent, EntityDiedEvent, SimEvent, ExposureWarningEvent } from "@project-god/shared";
import type { NeedDef } from "../content-types";
import { COLD_THRESHOLD } from "./environment-tick";

/** How fast exposure drops when cold without any shelter. */
const EXPOSURE_COLD_DECAY = 2;
/** How fast exposure drops with warming (fire pit) but no shelter. */
const EXPOSURE_WARMING_DECAY = 1;
/** How fast exposure recovers when temperature is comfortable. */
const EXPOSURE_REGEN = 1;

export function decayNeeds(
  world: WorldState,
  needsDefs: Record<string, NeedDef>
): SimEvent[] {
  const events: SimEvent[] = [];
  const temperature = world.environment?.temperature ?? 60; // default warm if no environment

  for (const entity of Object.values(world.entities)) {
    if (!entity.alive) continue;

    for (const [needKey, def] of Object.entries(needsDefs)) {
      // ── Special handling: exposure (MVP-03-A) ─────────────
      if (needKey === "exposure") {
        const oldValue = entity.needs[needKey] ?? def.initial;
        let newValue = oldValue;

        const hasSheltered = entity.statuses?.includes("sheltered") ?? false;
        const hasWarming = entity.statuses?.includes("warming") ?? false;
        const isCold = temperature < COLD_THRESHOLD;

        if (hasSheltered) {
          // Fully sheltered: no decay, but also no regen in cold
          // Do nothing (no change)
        } else if (isCold) {
          // Cold and unprotected
          const decay = hasWarming ? EXPOSURE_WARMING_DECAY : EXPOSURE_COLD_DECAY;
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

    for (const [needKey, def] of Object.entries(needsDefs)) {
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
