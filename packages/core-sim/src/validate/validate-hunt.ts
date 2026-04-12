/**
 * validate-hunt.ts — Validates the "hunt" action.
 *
 * Requirements:
 *   - Actor must be alive and type "human"
 *   - Target must exist, be alive, and be type "fauna"
 *   - Target must be adjacent (manhattan distance ≤ 1)
 */

import { ActionIntent, ActionOutcome, WorldState, manhattan, EntityState } from "@project-god/shared";

export function validateHunt(
  intent: ActionIntent,
  world: WorldState,
): ActionOutcome {
  const actor = world.entities[intent.actorId] as EntityState;
  if (!actor || !actor.alive) {
    return { kind: "rejected", intent, reason: "actor is dead" };
  }
  if (actor.type !== "human") {
    return { kind: "rejected", intent, reason: "only humans can hunt" };
  }

  const targetId = intent.targetEntityId;
  if (!targetId) {
    return { kind: "rejected", intent, reason: "no hunt target specified" };
  }

  const target = world.entities[targetId] as EntityState | undefined;
  if (!target || !target.alive) {
    return { kind: "rejected", intent, reason: "target does not exist or is dead" };
  }
  if (target.type !== "fauna") {
    return { kind: "rejected", intent, reason: "target is not a huntable animal" };
  }

  if (manhattan(actor.position, target.position) > 1) {
    return { kind: "rejected", intent, reason: "target is too far away (must be adjacent)" };
  }

  return { kind: "validated", intent, energyCost: 2, timeCost: 1 };
}
