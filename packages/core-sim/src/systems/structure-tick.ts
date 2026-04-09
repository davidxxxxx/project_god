/**
 * structure-tick.ts — Per-tick system for active structures.
 *
 * Runs after need decay, before agent actions.
 * For each active structure:
 *   1. Consume fuel (reduce durability)
 *   2. If durability <= 0, deactivate and emit STRUCTURE_EXPIRED
 *   3. Apply area effects (warming, sheltered) to nearby entities
 */

import {
  WorldState, SimEvent, EntityState,
  StructureState, StructureExpiredEvent, WarmingAppliedEvent,
  manhattan,
} from "@project-god/shared";
import type { StructureDef } from "../content-types";

export function tickStructures(
  world: WorldState,
  structureDefs: Record<string, StructureDef>
): SimEvent[] {
  if (!world.structures) return [];

  const events: SimEvent[] = [];
  const structures = Object.values(world.structures) as StructureState[];

  for (const structure of structures) {
    if (!structure.active) continue;

    const def = structureDefs[structure.type];
    if (!def) continue;

    // ── 1. Consume fuel + natural decay ────────────────────────
    const fuelDecay = def.fuelPerTick ?? 0;
    const naturalDecay = def.decayPerTick ?? 0;
    structure.durability -= (fuelDecay + naturalDecay);

    // ── 2. Check expiry ─────────────────────────────────────
    if (structure.durability <= 0) {
      structure.durability = 0;
      structure.active = false;
      events.push({
        type: "STRUCTURE_EXPIRED",
        tick: world.tick,
        structureId: structure.id,
        structureType: structure.type,
        position: { ...structure.position },
      } as StructureExpiredEvent);
      continue; // No effects from expired structures
    }

    // ── 3. Apply area effects ───────────────────────────────
    for (const entity of Object.values(world.entities) as EntityState[]) {
      if (!entity.alive) continue;
      if (manhattan(entity.position, structure.position) > def.effectRadius) continue;

      if (!entity.statuses) entity.statuses = [];

      if (def.effects.includes("warming")) {
        if (!entity.statuses.includes("warming")) {
          entity.statuses.push("warming");
        }
        events.push({
          type: "WARMING_APPLIED",
          tick: world.tick,
          entityId: entity.id,
          structureId: structure.id,
        } as WarmingAppliedEvent);
      }

      if (def.effects.includes("sheltered")) {
        if (!entity.statuses.includes("sheltered")) {
          entity.statuses.push("sheltered");
        }
        events.push({
          type: "SHELTERED_APPLIED",
          tick: world.tick,
          entityId: entity.id,
          structureId: structure.id,
        } as any);
      }

      // MVP-02X: 'home' effect — huts provide accelerated HP regen
      if (def.effects.includes("home")) {
        if (!entity.statuses.includes("home")) {
          entity.statuses.push("home");
        }
      }
    }
  }

  // ── Clear warming from entities NOT near any active warming structure
  for (const entity of Object.values(world.entities) as EntityState[]) {
    if (!entity.alive || !entity.statuses) continue;

    const nearActiveWarming = structures.some((s) => {
      if (!s.active) return false;
      const def = structureDefs[s.type];
      return def?.effects.includes("warming") && manhattan(entity.position, s.position) <= def.effectRadius;
    });
    if (!nearActiveWarming) {
      entity.statuses = entity.statuses.filter((st) => st !== "warming");
    }

    // ── Clear sheltered similarly
    const nearActiveShelter = structures.some((s) => {
      if (!s.active) return false;
      const def = structureDefs[s.type];
      return def?.effects.includes("sheltered") && manhattan(entity.position, s.position) <= def.effectRadius;
    });
    if (!nearActiveShelter) {
      entity.statuses = entity.statuses.filter((st) => st !== "sheltered");
    }

    // ── Clear home when not near hut (MVP-02X)
    const nearActiveHome = structures.some((s) => {
      if (!s.active) return false;
      const def = structureDefs[s.type];
      return def?.effects.includes("home") && manhattan(entity.position, s.position) <= def.effectRadius;
    });
    if (!nearActiveHome) {
      entity.statuses = entity.statuses.filter((st) => st !== "home");
    }
  }

  return events;
}
