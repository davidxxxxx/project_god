import { ActionIntent, RejectedAction, ValidatedAction, WorldState } from "@project-god/shared";

/**
 * Validate consume: check that entity has the required item or a cooked variant.
 * MVP-02X: Also accepts roast_berry / boiled_water as valid alternatives.
 */
export function validateConsume(
  intent: ActionIntent,
  world: WorldState,
  requiredItem: string
): ValidatedAction | RejectedAction {
  const entity = world.entities[intent.actorId];

  // MVP-02X: Accept cooked alternatives
  const alternatives: Record<string, string[]> = {
    berry: ["roast_berry", "dry_berry"],
    water: ["boiled_water"],
  };

  const allItems = [requiredItem, ...(alternatives[requiredItem] ?? [])];
  const hasAny = allItems.some((item) => (entity.inventory[item] ?? 0) > 0);

  if (!hasAny) {
    return { kind: "rejected", intent, reason: `No ${requiredItem} (or cooked variant) in inventory` };
  }

  return { kind: "validated", intent, energyCost: 2, timeCost: 1 };
}
