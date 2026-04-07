import { WorldState, EntityState, NeedDecayedEvent, EntityDiedEvent, SimEvent } from "@project-god/shared";
import type { NeedDef } from "../content-types";

export function decayNeeds(
  world: WorldState,
  needsDefs: Record<string, NeedDef>
): SimEvent[] {
  const events: SimEvent[] = [];

  for (const entity of Object.values(world.entities)) {
    if (!entity.alive) continue;

    for (const [needKey, def] of Object.entries(needsDefs)) {
      if (def.decayPerTick <= 0) continue;

      const oldValue = entity.needs[needKey] ?? def.initial;
      const newValue = Math.max(0, oldValue - def.decayPerTick);
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
