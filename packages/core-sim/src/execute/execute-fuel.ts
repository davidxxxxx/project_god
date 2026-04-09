/**
 * execute-fuel.ts — MVP-02X: Add wood to a fire pit to extend its durability.
 *
 * Consumes 1 wood from inventory, restores +20 durability to nearest fire_pit.
 */

import {
  WorldState, SimEvent, ValidatedAction,
  EntityState, StructureState,
  FuelAddedEvent, manhattan,
} from "@project-god/shared";

/** Durability restored per wood added. */
const FUEL_DURABILITY_RESTORE = 20;

export function executeFuel(
  world: WorldState,
  va: ValidatedAction
): SimEvent[] {
  const events: SimEvent[] = [];
  const entity = world.entities[va.intent.actorId] as EntityState;
  if (!entity?.alive) return events;

  // Find nearest active fire_pit
  const structures = Object.values(world.structures ?? {}) as StructureState[];
  const nearestFire = structures
    .filter((s) => s.active && s.type === "fire_pit" && manhattan(entity.position, s.position) <= 1)
    .sort((a, b) => manhattan(entity.position, a.position) - manhattan(entity.position, b.position))[0];

  if (!nearestFire) return events;

  // Consume wood
  const woodCount = entity.inventory["wood"] ?? 0;
  if (woodCount <= 0) return events;
  entity.inventory["wood"] = woodCount - 1;
  if (entity.inventory["wood"] <= 0) delete entity.inventory["wood"];

  // Restore durability
  nearestFire.durability += FUEL_DURABILITY_RESTORE;

  events.push({
    type: "FUEL_ADDED",
    tick: world.tick,
    entityId: entity.id,
    structureId: nearestFire.id,
    durabilityRestored: FUEL_DURABILITY_RESTORE,
  } as FuelAddedEvent);

  return events;
}
