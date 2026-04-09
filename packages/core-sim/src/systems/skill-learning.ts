/**
 * skill-learning.ts — Per-tick system for skill observation and technology unlock.
 *
 * Runs after structure tick in the main loop.
 * For each alive entity without a given skill:
 *   1. Check if a nearby entity WITH the skill is present
 *   2. Check if an active structure related to the skill is nearby
 *   3. If both → increment observation counter (stored in entity attributes)
 *   4. If counter >= learnTicks → learn skill, emit SKILL_LEARNED
 *
 * Also checks tribe-level technology unlock conditions.
 */

import {
  WorldState, EntityState, StructureState, SimEvent,
  SkillLearnedEvent, SkillObservedEvent, TechnologyUnlockedEvent,
  manhattan,
} from "@project-god/shared";
import type { SkillDef, TechnologyDef, StructureDef } from "../content-types";

/** Observation range: how close entities must be to observe. */
const OBSERVATION_RADIUS = 5;

/**
 * Attribute key prefix for tracking observation progress.
 * Stored as entity.attributes[`obs_<skillId>`] = ticksObserved.
 */
function obsKey(skillId: string): string {
  return `obs_${skillId}`;
}

export interface SkillLearningContext {
  skills: Record<string, SkillDef>;
  technologies: Record<string, TechnologyDef>;
  structures?: Record<string, StructureDef>;
}

export function tickSkillLearning(
  world: WorldState,
  ctx: SkillLearningContext
): SimEvent[] {
  const events: SimEvent[] = [];
  const entities = Object.values(world.entities) as EntityState[];
  const aliveEntities = entities.filter((e) => e.alive);

  // Collect active structures for proximity checks
  const activeStructures = world.structures
    ? (Object.values(world.structures) as StructureState[]).filter((s) => s.active)
    : [];

  for (const [skillId, skillDef] of Object.entries(ctx.skills)) {
    if (skillDef.learnMethod !== "observation") continue;

    // Find entities that already have this skill (teachers)
    const skilled = aliveEntities.filter((e) => (e.skills?.[skillId] ?? 0) > 0);

    // Find entities that DON'T have this skill (learners)
    const unskilled = aliveEntities.filter((e) => (e.skills?.[skillId] ?? 0) === 0);

    for (const learner of unskilled) {
      // Check: is there a skilled entity nearby?
      const hasNearbyTeacher = skilled.some(
        (teacher) => manhattan(learner.position, teacher.position) <= OBSERVATION_RADIUS
      );

      // Check: is there an active structure nearby? (proof of skill in action)
      const hasNearbyStructure = activeStructures.some(
        (s) => manhattan(learner.position, s.position) <= OBSERVATION_RADIUS
      );

      if (hasNearbyTeacher && hasNearbyStructure) {
        // Increment observation counter
        const key = obsKey(skillId);
        const current = learner.attributes[key] ?? 0;
        const newCount = current + 1;
        learner.attributes[key] = newCount;

        if (newCount >= skillDef.learnTicks) {
          // Learn the skill!
          if (!learner.skills) learner.skills = {};
          learner.skills[skillId] = skillDef.initialProficiency;
          // Clear observation counter
          delete learner.attributes[key];

          events.push({
            type: "SKILL_LEARNED",
            tick: world.tick,
            entityId: learner.id,
            skillId,
            proficiency: skillDef.initialProficiency,
            method: "observation",
          } as SkillLearnedEvent);
        } else {
          events.push({
            type: "SKILL_OBSERVED",
            tick: world.tick,
            entityId: learner.id,
            skillId,
            observedTicks: newCount,
            requiredTicks: skillDef.learnTicks,
          } as SkillObservedEvent);
        }
      }
    }
  }

  // ── Technology unlock check ────────────────────────────────
  if (world.tribes) {
    for (const [techId, techDef] of Object.entries(ctx.technologies)) {
      for (const tribe of Object.values(world.tribes)) {
        // Skip if already unlocked
        if (tribe.technologies.includes(techId)) continue;

        // Count tribe members with the required skill
        const skilledCount = tribe.memberIds.filter((memberId) => {
          const entity = world.entities[memberId];
          return entity?.alive && (entity.skills?.[techDef.requiredSkill] ?? 0) > 0;
        }).length;

        if (skilledCount >= techDef.minSkilledMembers) {
          tribe.technologies.push(techId);
          events.push({
            type: "TECHNOLOGY_UNLOCKED",
            tick: world.tick,
            tribeId: tribe.id,
            technologyId: techId,
            skilledMemberCount: skilledCount,
          } as TechnologyUnlockedEvent);
        }
      }
    }
  }

  return events;
}
