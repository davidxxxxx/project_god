/**
 * execute-cook.ts — MVP-02X: Transform raw items into cooked items at a fire.
 *
 * Requires: fire_pit within range + recipe inputs in inventory + (optional) cooking skill.
 */

import {
  WorldState, SimEvent, ValidatedAction,
  EntityState, ResourceCookedEvent,
} from "@project-god/shared";
import type { RecipeDef } from "../content-types";

export function executeCook(
  world: WorldState,
  va: ValidatedAction,
  recipeDefs: Record<string, RecipeDef>
): SimEvent[] {
  const events: SimEvent[] = [];
  const entity = world.entities[va.intent.actorId] as EntityState;
  if (!entity?.alive) return events;

  const recipeId = va.intent.recipeId;
  if (!recipeId) return events;

  const recipe = recipeDefs[recipeId];
  if (!recipe) return events;

  // Consume inputs
  for (const [itemType, qty] of Object.entries(recipe.inputs)) {
    entity.inventory[itemType] = (entity.inventory[itemType] ?? 0) - qty;
    if (entity.inventory[itemType] <= 0) {
      delete entity.inventory[itemType];
    }
  }

  // Produce outputs
  for (const [itemType, qty] of Object.entries(recipe.outputs)) {
    entity.inventory[itemType] = (entity.inventory[itemType] ?? 0) + qty;
  }

  // Skill gain
  if (recipe.requiredSkill && recipe.skillGainOnCraft > 0) {
    if (!entity.skills) entity.skills = {};
    const current = entity.skills[recipe.requiredSkill] ?? 0;
    entity.skills[recipe.requiredSkill] = Math.min(1.0, current + recipe.skillGainOnCraft);
  }

  // Emit event for first output (primary product)
  const outputEntries = Object.entries(recipe.outputs);
  if (outputEntries.length > 0) {
    events.push({
      type: "RESOURCE_COOKED",
      tick: world.tick,
      entityId: entity.id,
      recipeId,
      outputType: outputEntries[0][0],
      amount: outputEntries[0][1],
    } as ResourceCookedEvent);
  }

  return events;
}
