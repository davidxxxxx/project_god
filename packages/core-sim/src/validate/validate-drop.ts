import { ActionIntent, RejectedAction, ValidatedAction, WorldState } from "@project-god/shared";

export function validateDrop(
  intent: ActionIntent,
  world: WorldState
): ValidatedAction | RejectedAction {
  const entity = world.entities[intent.actorId];

  const itemType = intent.itemId;
  if (!itemType) {
    return { kind: "rejected", intent, reason: "Drop requires itemId" };
  }

  const qty = entity.inventory[itemType] ?? 0;
  if (qty <= 0) {
    return { kind: "rejected", intent, reason: `No ${itemType} in inventory to drop` };
  }

  return { kind: "validated", intent, energyCost: 0, timeCost: 1 };
}
