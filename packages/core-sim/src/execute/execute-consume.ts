import { ValidatedAction, WorldState, SimEvent, FoodEatenEvent, WaterDrunkEvent } from "@project-god/shared";
import type { ResourceDef, NeedDef } from "../content-types";

/**
 * Generic consume: eat and drink use the same logic.
 * Looks up which needs the consumed item restores from content-data.
 */
export function executeConsume(
  action: ValidatedAction,
  world: WorldState,
  resources: Record<string, ResourceDef>,
  needs: Record<string, NeedDef>
): SimEvent[] {
  const entity = world.entities[action.intent.actorId];
  if (!entity || !entity.alive) return [];

  // Determine which item to consume based on action type
  const itemType = action.intent.type === "eat" ? "berry" : "water";
  const qty = entity.inventory[itemType] ?? 0;
  if (qty <= 0) return [];

  entity.inventory[itemType] = qty - 1;
  if (entity.inventory[itemType] <= 0) {
    delete entity.inventory[itemType];
  }

  const resDef = resources[itemType];
  const events: SimEvent[] = [];

  if (resDef?.restoresNeed) {
    for (const [needKey, amount] of Object.entries(resDef.restoresNeed)) {
      const max = needs[needKey]?.max ?? 100;
      const oldVal = entity.needs[needKey] ?? 0;
      entity.needs[needKey] = Math.min(max, oldVal + amount);

      if (needKey === "hunger") {
        events.push({
          type: "FOOD_EATEN",
          tick: world.tick,
          entityId: entity.id,
          item: itemType,
          hungerRestored: amount,
        } as FoodEatenEvent);
      } else if (needKey === "thirst") {
        events.push({
          type: "WATER_DRUNK",
          tick: world.tick,
          entityId: entity.id,
          thirstRestored: amount,
        } as WaterDrunkEvent);
      }
    }
  }

  return events;
}
