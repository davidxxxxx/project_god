/**
 * execute-build.ts — Executes a validated build action.
 *
 * Steps:
 *   1. Deduct requiredItems from entity inventory
 *   2. Create StructureState at entity position
 *   3. Add to world.structures
 *   4. Emit STRUCTURE_BUILT event
 */

import {
  ValidatedAction, WorldState, SimEvent,
  StructureState, StructureBuiltEvent, SkillLearnedEvent,
  EntityId, StructureId,
} from "@project-god/shared";
import type { StructureDef, SkillDef } from "../content-types";

/** Mapping from structure type → required skill id (mirrors validate-build). */
const STRUCTURE_SKILL_REQUIREMENTS: Record<string, string> = {
  fire_pit: "fire_making",
};

/** Running counter for unique structure IDs within a session. */
let structureCounter = 0;

/** Reset counter (for testing). */
export function resetStructureCounter(): void {
  structureCounter = 0;
}

export function executeBuild(
  action: ValidatedAction,
  world: WorldState,
  structureDefs: Record<string, StructureDef>,
  skillDefs?: Record<string, SkillDef>
): SimEvent[] {
  const entity = world.entities[action.intent.actorId];
  const structureType = action.intent.itemId!;
  const def = structureDefs[structureType];

  // ── 1. Deduct materials ───────────────────────────────────
  for (const [item, qty] of Object.entries(def.requiredItems)) {
    entity.inventory[item] = (entity.inventory[item] ?? 0) - qty;
    if (entity.inventory[item] <= 0) {
      delete entity.inventory[item];
    }
  }

  // ── 2. Create structure ───────────────────────────────────
  const structureId = `struct_${structureCounter++}` as StructureId;
  const structure: StructureState = {
    id: structureId,
    type: structureType,
    position: { ...entity.position },
    durability: def.initialDurability,
    builtByEntityId: entity.id,
    builtAtTick: world.tick,
    active: true,
  };

  // ── 3. Add to world ───────────────────────────────────────
  if (!world.structures) {
    world.structures = {};
  }
  world.structures[structureId] = structure;

  // ── 4. Emit event ─────────────────────────────────────────
  const event: StructureBuiltEvent = {
    type: "STRUCTURE_BUILT",
    tick: world.tick,
    entityId: entity.id,
    structureId,
    structureType,
    position: { ...entity.position },
  };

  const events: SimEvent[] = [event];

  // ── 5. Auto-grant skill on first invention (MVP-02-D) ─────
  const requiredSkillId = STRUCTURE_SKILL_REQUIREMENTS[structureType];
  if (requiredSkillId && skillDefs?.[requiredSkillId]) {
    const hasSkill = (entity.skills?.[requiredSkillId] ?? 0) > 0;
    if (!hasSkill) {
      // This entity is the inventor — grant the skill
      if (!entity.skills) entity.skills = {};
      entity.skills[requiredSkillId] = skillDefs[requiredSkillId].initialProficiency;
      events.push({
        type: "SKILL_LEARNED",
        tick: world.tick,
        entityId: entity.id,
        skillId: requiredSkillId,
        proficiency: skillDefs[requiredSkillId].initialProficiency,
        method: "invention",
      } as SkillLearnedEvent);
    }
  }

  return events;
}
