import { ValidatedAction, WorldState, SimEvent, ItemDroppedEvent } from "@project-god/shared";

/**
 * Execute drop: remove 1 item from entity inventory.
 * In MVP-02 the item is simply destroyed (no ground loot system yet).
 * The event records the position for future pickup implementation.
 */
export function executeDrop(
  action: ValidatedAction,
  world: WorldState
): SimEvent[] {
  const entity = world.entities[action.intent.actorId];
  if (!entity || !entity.alive) return [];

  const itemType = action.intent.itemId!;
  const qty = entity.inventory[itemType] ?? 0;
  if (qty <= 0) return [];

  entity.inventory[itemType] = qty - 1;
  if (entity.inventory[itemType] <= 0) {
    delete entity.inventory[itemType];
  }

  return [{
    type: "ITEM_DROPPED",
    tick: world.tick,
    entityId: entity.id,
    item: itemType,
    quantity: 1,
    position: { ...entity.position },
  } as ItemDroppedEvent];
}
