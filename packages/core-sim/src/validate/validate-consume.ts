import { ActionIntent, RejectedAction, ValidatedAction, WorldState } from "@project-god/shared";

export function validateConsume(
  intent: ActionIntent,
  world: WorldState,
  requiredItem: string
): ValidatedAction | RejectedAction {
  const entity = world.entities[intent.actorId];
  const qty = entity.inventory[requiredItem] ?? 0;

  if (qty <= 0) {
    return { kind: "rejected", intent, reason: `No ${requiredItem} in inventory` };
  }

  return { kind: "validated", intent, energyCost: 2, timeCost: 1 };
}
