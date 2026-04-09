/**
 * validate-pray.ts — Validates the "pray" action intent.
 *
 * Conditions:
 *   - Entity is alive
 *   - Entity is adult or elder (not child)
 *   - Entity faith >= MIN_PRAYER_FAITH
 *   - Cooldown has elapsed since last prayer
 *   - Entity is not already praying
 */

import { ActionIntent, ActionOutcome, WorldState, EntityState } from "@project-god/shared";
import type { FaithDef } from "../content-types";

export function validatePray(
  intent: ActionIntent,
  world: WorldState,
  faithCfg?: FaithDef
): ActionOutcome {
  const entity = world.entities[intent.actorId] as EntityState | undefined;
  if (!entity?.alive) {
    return { kind: "rejected", intent, reason: "Entity not alive" };
  }

  // Child cannot pray
  if (entity.statuses?.includes("child")) {
    return { kind: "rejected", intent, reason: "Children cannot pray" };
  }

  if (!faithCfg) {
    return { kind: "rejected", intent, reason: "Faith system not configured" };
  }

  const faith = entity.attributes.faith ?? 0;
  if (faith < faithCfg.MIN_PRAYER_FAITH) {
    return { kind: "rejected", intent, reason: `Faith too low (${faith} < ${faithCfg.MIN_PRAYER_FAITH})` };
  }

  if (entity.isPraying) {
    return { kind: "rejected", intent, reason: "Already praying" };
  }

  // Cooldown check
  const lastPrayer = entity.lastPrayerTick ?? -Infinity;
  if (world.tick - lastPrayer < faithCfg.PRAYER_COOLDOWN) {
    return { kind: "rejected", intent, reason: "Prayer on cooldown" };
  }

  return { kind: "validated", intent, energyCost: 0, timeCost: faithCfg.PRAYER_DURATION };
}
