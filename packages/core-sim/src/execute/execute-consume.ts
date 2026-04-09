import { ValidatedAction, WorldState, SimEvent, FoodEatenEvent, WaterDrunkEvent, EntityState, manhattan } from "@project-god/shared";
import type { ResourceDef, NeedDef } from "../content-types";

/**
 * Generic consume: eat and drink use the same logic.
 * Looks up which needs the consumed item restores from content-data.
 *
 * MVP-02Z: When a parent eats, nearby children (dist ≤ 1) are auto-fed
 * at 50% of the nutrition value. This prevents 100% infant mortality.
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
  // MVP-02X: Prefer cooked items first (roast_berry > berry, boiled_water > water)
  let itemType: string;
  if (action.intent.type === "eat") {
    // Prefer roast_berry > dry_berry > berry
    if ((entity.inventory["roast_berry"] ?? 0) > 0) {
      itemType = "roast_berry";
    } else if ((entity.inventory["dry_berry"] ?? 0) > 0) {
      itemType = "dry_berry";
    } else {
      itemType = "berry";
    }
  } else {
    // Prefer boiled_water, then water
    if ((entity.inventory["boiled_water"] ?? 0) > 0) {
      itemType = "boiled_water";
    } else {
      itemType = "water";
    }
  }

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

    // ── MVP-02Z: Auto-feed nearby children ──────────────────
    // When a parent eats, their children within distance ≤ 1 get 50% nutrition.
    const childIds = entity.childIds ?? [];
    if (childIds.length > 0) {
      const CHILD_FEED_RATIO = 0.5;
      const CHILD_FEED_RANGE = 1;
      for (const childId of childIds) {
        const child = world.entities[childId] as EntityState | undefined;
        if (!child || !child.alive) continue;
        if (manhattan(entity.position, child.position) > CHILD_FEED_RANGE) continue;
        // Only feed children (has "child" status)
        if (!child.statuses?.includes("child")) continue;

        for (const [needKey, amount] of Object.entries(resDef.restoresNeed)) {
          const childMax = needs[needKey]?.max ?? 100;
          const childOld = child.needs[needKey] ?? 0;
          const feedAmount = Math.round(amount * CHILD_FEED_RATIO);
          child.needs[needKey] = Math.min(childMax, childOld + feedAmount);
        }

        events.push({
          type: "CHILD_FED",
          tick: world.tick,
          entityId: entity.id,
          childId,
          item: itemType,
        } as unknown as SimEvent);
      }
    }
  }

  return events;
}
