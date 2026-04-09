import { ActionIntent, ActionOutcome, WorldState } from "@project-god/shared";
import type { ValidationContext } from "./index";

export function validateRitual(
  intent: ActionIntent,
  world: WorldState,
  ctx: ValidationContext
): ActionOutcome {
  const entity = world.entities[intent.actorId];
  if (!entity || !entity.alive) {
    return { kind: "rejected", intent, reason: "Entity is dead or missing" };
  }

  if (intent.type === "perform_ritual") {
    if (entity.role !== "priest") {
      return { kind: "rejected", intent, reason: "Only a priest can perform a ritual" };
    }

    const tribe = world.tribes?.[entity.tribeId];
    if (!tribe || !tribe.spiritualCenterId) {
      return { kind: "rejected", intent, reason: "Tribe has no spiritual center (shrine)" };
    }

    const shrine = world.structures?.[tribe.spiritualCenterId];
    if (!shrine || !shrine.active) {
      return { kind: "rejected", intent, reason: "Shrine is destroyed or inactive" };
    }

    // Must be near the shrine
    const dist = Math.abs(entity.position.x - shrine.position.x) + Math.abs(entity.position.y - shrine.position.y);
    if (dist > 2) {
      return { kind: "rejected", intent, reason: "Too far from the spiritual center" };
    }

    return { kind: "validated", intent, energyCost: 0, timeCost: 1 };
  }

  if (intent.type === "participate_ritual") {
    const tribe = world.tribes?.[entity.tribeId];
    if (!tribe || !tribe.spiritualCenterId) {
      return { kind: "rejected", intent, reason: "Tribe has no spiritual center" };
    }

    const shrine = world.structures?.[tribe.spiritualCenterId];
    if (!shrine) {
      return { kind: "rejected", intent, reason: "Shrine not found" };
    }

    // Must be near the shrine to participate
    const dist = Math.abs(entity.position.x - shrine.position.x) + Math.abs(entity.position.y - shrine.position.y);
    if (dist > 3) {
      return { kind: "rejected", intent, reason: "Too far from the ritual" };
    }

    return { kind: "validated", intent, energyCost: 0, timeCost: 1 };
  }

  return { kind: "rejected", intent, reason: "Unknown ritual action" };
}
