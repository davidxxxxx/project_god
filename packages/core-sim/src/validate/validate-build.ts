/**
 * validate-build.ts — Validates a build action intent.
 *
 * Rules:
 *   1. entity must be alive (checked by dispatcher)
 *   2. intent.itemId must be a known structure type
 *   3. entity must have all requiredItems in inventory
 *   4. entity must have the required skill (MVP-02-D)
 *      EXCEPTION: "first invention" bypass — if NO entity in the world
 *      has the skill, the builder is the inventor and gets a free pass.
 */

import { ActionIntent, ActionOutcome, WorldState, EntityState } from "@project-god/shared";
import type { StructureDef, SkillDef } from "../content-types";

/** Mapping from structure type → required skill id. */
const STRUCTURE_SKILL_REQUIREMENTS: Record<string, string> = {
  fire_pit: "fire_making",
};

export function validateBuild(
  intent: ActionIntent,
  world: WorldState,
  structureDefs: Record<string, StructureDef>,
  skillDefs?: Record<string, SkillDef>
): ActionOutcome {
  const structureType = intent.itemId;

  if (!structureType) {
    return { kind: "rejected", intent, reason: "build requires itemId (structure type)" };
  }

  const def = structureDefs[structureType];
  if (!def) {
    return { kind: "rejected", intent, reason: `unknown structure type: ${structureType}` };
  }

  const entity = world.entities[intent.actorId];

  // Check required items
  for (const [item, qty] of Object.entries(def.requiredItems)) {
    const has = entity.inventory[item] ?? 0;
    if (has < qty) {
      return {
        kind: "rejected",
        intent,
        reason: `insufficient ${item}: need ${qty}, have ${has}`,
      };
    }
  }

  // ── Faith condition check (MVP-02X) ────────────────────────
  if (def.faithCondition && def.faithCondition > 0) {
    const builderFaith = entity.attributes?.faith ?? 0;
    if (builderFaith < def.faithCondition) {
      return {
        kind: "rejected",
        intent,
        reason: `insufficient faith: need ${def.faithCondition}, have ${builderFaith}`,
      };
    }
  }

  // ── Skill prerequisite check (MVP-02-D) ────────────────────
  // Check both the static STRUCTURE_SKILL_REQUIREMENTS map and the StructureDef.requiresSkill field
  const requiredSkillId = def.requiresSkill ?? STRUCTURE_SKILL_REQUIREMENTS[structureType];
  if (requiredSkillId && skillDefs) {
    const hasSkill = (entity.skills?.[requiredSkillId] ?? 0) > 0;

    if (!hasSkill) {
      // First-invention bypass: if NO alive entity in the world has this skill,
      // the builder is the "inventor" — allow and mark for skill grant post-execution.
      const anyoneHasSkill = (Object.values(world.entities) as EntityState[]).some(
        (e) => e.alive && (e.skills?.[requiredSkillId] ?? 0) > 0
      );

      if (anyoneHasSkill) {
        // Someone else already has the skill — this entity needs to learn it first
        return {
          kind: "rejected",
          intent,
          reason: `lacks required skill: ${requiredSkillId}`,
        };
      }
      // else: first invention — allow through
    }
  }

  return { kind: "validated", intent, energyCost: 0, timeCost: 1 };
}

