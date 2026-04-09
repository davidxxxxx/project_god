/**
 * validate-cook.ts — MVP-02X: Validate cook action.
 *
 * Checks: recipe exists, inputs in inventory, fire_pit nearby, skill if required.
 */

import {
  ActionIntent, ActionOutcome, ValidatedAction, RejectedAction,
  WorldState, EntityState, StructureState, manhattan,
} from "@project-god/shared";
import type { RecipeDef } from "../content-types";

export function validateCook(
  intent: ActionIntent,
  world: WorldState,
  recipeDefs: Record<string, RecipeDef>
): ActionOutcome {
  const entity = world.entities[intent.actorId] as EntityState;
  if (!entity?.alive) {
    return { kind: "rejected", intent, reason: "entity not alive" } as RejectedAction;
  }

  const recipeId = intent.recipeId;
  if (!recipeId) {
    return { kind: "rejected", intent, reason: "no recipe specified" } as RejectedAction;
  }

  const recipe = recipeDefs[recipeId];
  if (!recipe) {
    return { kind: "rejected", intent, reason: `unknown recipe: ${recipeId}` } as RejectedAction;
  }

  // Check inputs
  for (const [itemType, qty] of Object.entries(recipe.inputs)) {
    if ((entity.inventory[itemType] ?? 0) < qty) {
      return { kind: "rejected", intent, reason: `insufficient ${itemType}: need ${qty}` } as RejectedAction;
    }
  }

  // Check nearby structure
  if (recipe.requiresNearby) {
    const structures = Object.values(world.structures ?? {}) as StructureState[];
    const hasNearby = structures.some(
      (s) => s.active && s.type === recipe.requiresNearby && manhattan(entity.position, s.position) <= 1
    );
    if (!hasNearby) {
      return { kind: "rejected", intent, reason: `need ${recipe.requiresNearby} nearby` } as RejectedAction;
    }
  }

  // Check skill
  if (recipe.requiredSkill) {
    const proficiency = entity.skills?.[recipe.requiredSkill] ?? 0;
    if (proficiency <= 0) {
      return { kind: "rejected", intent, reason: `requires ${recipe.requiredSkill} skill` } as RejectedAction;
    }
  }

  return { kind: "validated", intent, energyCost: 1, timeCost: 1 } as ValidatedAction;
}
