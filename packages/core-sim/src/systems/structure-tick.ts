/**
 * structure-tick.ts — Per-tick system for active structures.
 *
 * Runs after need decay, before agent actions.
 * For each active structure:
 *   1. Consume fuel (reduce durability)
 *   2. If durability <= 0, deactivate and emit STRUCTURE_EXPIRED
 *   3. Apply area effects to nearby entities:
 *      - warming       → reduces exposure decay (via decay-needs)
 *      - sheltered      → prevents exposure entirely (via decay-needs)
 *      - home           → accelerated HP regen + inventory boost (+2)
 *      - communal       → trust boost flag for social ticks
 *      - vision_boost   → increased perception radius
 *      - learning_boost → doubled skill-learning observation rate
 *      - storage_boost  → increased inventory capacity (+5)
 *      - faith_boost    → amplified prayer effectiveness
 *      - water_source   → generates infinite water at structure position
 *      - food_preservation → (reserved for spoilage system)
 *      - knowledge_preservation → (reserved for cultural memory decay)
 *      - defense        → (reserved for conflict system)
 */

import {
  WorldState, SimEvent, EntityState,
  StructureState, StructureExpiredEvent, WarmingAppliedEvent,
  manhattan, ResourceNodeState,
} from "@project-god/shared";
import type { GenericGameEvent } from "@project-god/shared";
import type { StructureDef } from "../content-types";

// ── Effect Constants (data-driven where possible) ─────────────

/** Inventory capacity bonus from 'home' effect. */
const HOME_INVENTORY_BONUS = 2;

/** Inventory capacity bonus from 'storage_boost' (granary). */
const STORAGE_BOOST_INVENTORY_BONUS = 5;

/** Perception radius override from 'vision_boost' (watchtower). Default is 10 during day. */
const VISION_BOOST_RADIUS = 14;

/** Default inventory capacity (must match perception.ts). */
const DEFAULT_INVENTORY_CAPACITY = 10;

// ── All effect-based statuses that we manage ──────────────────
const MANAGED_STATUSES = [
  "warming", "sheltered", "home", "communal",
  "vision_boost", "learning_boost", "storage_boost", "faith_boost",
] as const;

export function tickStructures(
  world: WorldState,
  structureDefs: Record<string, StructureDef>
): SimEvent[] {
  if (!world.structures) return [];

  const events: SimEvent[] = [];
  const structures = Object.values(world.structures) as StructureState[];

  // ── Phase 1: Fuel, decay, and expiry ────────────────────────
  for (const structure of structures) {
    if (!structure.active) continue;

    const def = structureDefs[structure.type];
    if (!def) continue;

    // Consume fuel + natural decay
    const fuelDecay = def.fuelPerTick ?? 0;
    const naturalDecay = def.decayPerTick ?? 0;
    structure.durability -= (fuelDecay + naturalDecay);

    // Check expiry
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
      continue;
    }
  }

  // ── Phase 2: Determine per-entity effects ───────────────────
  // For each alive entity, compute which effect statuses apply

  for (const entity of Object.values(world.entities) as EntityState[]) {
    if (!entity.alive) continue;
    if (!entity.statuses) entity.statuses = [];

    // Collect all effects from nearby active structures
    const activeEffects = new Set<string>();

    for (const structure of structures) {
      if (!structure.active) continue;
      const def = structureDefs[structure.type];
      if (!def) continue;
      if (manhattan(entity.position, structure.position) > def.effectRadius) continue;

      for (const effect of def.effects) {
        activeEffects.add(effect);
      }
    }

    // ── Apply / clear each managed status ──────────────────

    for (const status of MANAGED_STATUSES) {
      const hasEffect = activeEffects.has(status);
      const hasStatus = entity.statuses.includes(status);

      if (hasEffect && !hasStatus) {
        entity.statuses.push(status);
      } else if (!hasEffect && hasStatus) {
        entity.statuses = entity.statuses.filter((s) => s !== status);
      }
    }

    // ── Emit standard events ──────────────────────────────

    if (activeEffects.has("warming")) {
      events.push({
        type: "WARMING_APPLIED",
        tick: world.tick,
        entityId: entity.id,
        structureId: "", // Multiple structures could apply
      } as WarmingAppliedEvent);
    }

    // ── Apply inventory capacity modifiers ─────────────────
    // Base capacity + home bonus + storage bonus
    const baseCapacity = DEFAULT_INVENTORY_CAPACITY;
    let bonusCapacity = 0;
    if (activeEffects.has("home")) bonusCapacity += HOME_INVENTORY_BONUS;
    if (activeEffects.has("storage_boost")) bonusCapacity += STORAGE_BOOST_INVENTORY_BONUS;
    entity.inventoryCapacity = baseCapacity + bonusCapacity;

    // ── Apply vision boost ────────────────────────────────
    // Store effective vision radius on entity for perception to read
    if (activeEffects.has("vision_boost")) {
      entity.attributes["vision_boost"] = VISION_BOOST_RADIUS;
    } else {
      delete entity.attributes["vision_boost"];
    }

    // ── Learning boost: stored as attribute multiplier ─────
    // skill-learning.ts reads this to double observation progress
    if (activeEffects.has("learning_boost")) {
      entity.attributes["learning_boost"] = 2; // 2x learning speed
    } else {
      delete entity.attributes["learning_boost"];
    }

    // ── Communal: trust interaction bonus ──────────────────
    // social-dynamics-tick reads this for trust growth modifier
    if (activeEffects.has("communal")) {
      entity.attributes["communal_bonus"] = 1; // Flag for social system
    } else {
      delete entity.attributes["communal_bonus"];
    }

    // ── Faith boost: stored as multiplier ─────────────────
    // faith-tick reads this to amplify prayer effectiveness
    if (activeEffects.has("faith_boost")) {
      entity.attributes["faith_multiplier"] = 2; // 2x faith from prayer
    } else {
      delete entity.attributes["faith_multiplier"];
    }
  }

  // ── Phase 3: Water source structures generate water nodes ───
  for (const structure of structures) {
    if (!structure.active) continue;
    const def = structureDefs[structure.type];
    if (!def?.effects.includes("water_source")) continue;

    // Check if a water node already exists at the well's position
    const wellKey = `well_${structure.id}`;
    if (!world.resourceNodes[wellKey]) {
      // Create a permanent water node at the well
      world.resourceNodes[wellKey] = {
        id: wellKey,
        resourceType: "water",
        position: { ...structure.position },
        quantity: 999,
        maxQuantity: -1,
        regenPerTick: 0,
      } as ResourceNodeState;
      events.push({
        type: "AREA_SCOUTED",
        tick: world.tick,
        entityId: structure.builtByEntityId ?? "",
        message: `A well at (${structure.position.x},${structure.position.y}) now provides fresh water`,
      } as GenericGameEvent);
    }
  }

  return events;
}
