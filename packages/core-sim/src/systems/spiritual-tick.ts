/**
 * spiritual-tick.ts — MVP-07A Spiritual system tick.
 *
 * Runs once per world tick to:
 *   1. Grant spiritual_awareness skill to high-faith entities
 *   2. Evaluate the tribe's priest (assigning a new one if needed)
 *   3. Link tribe to shrine if one exists
 */

import type { WorldState, EntityState, TribeState, SimEvent, EntityId } from "@project-god/shared";

// ── Tunable constants ────────────────────────────────────────

/** Faith threshold required to gain spiritual_awareness skill. */
const SPIRITUAL_AWARENESS_FAITH = 12;

/** Faith threshold required to become a priest. */
const PRIEST_FAITH_THRESHOLD = 15;

/** Proficiency granted when spiritual_awareness is first learned. */
const SPIRITUAL_AWARENESS_PROFICIENCY = 0.5;

export function tickSpiritual(
  world: WorldState
): SimEvent[] {
  const events: SimEvent[] = [];
  const tick = world.tick;

  // ── 1. Grant spiritual_awareness to high-faith entities ────
  for (const entity of Object.values(world.entities) as EntityState[]) {
    if (!entity.alive) continue;
    if (entity.statuses?.includes("child")) continue;

    const faith = entity.attributes.faith ?? 0;
    const hasSkill = (entity.skills?.["spiritual_awareness"] ?? 0) > 0;

    if (faith >= SPIRITUAL_AWARENESS_FAITH && !hasSkill) {
      if (!entity.skills) entity.skills = {};
      entity.skills["spiritual_awareness"] = SPIRITUAL_AWARENESS_PROFICIENCY;
      events.push({
        type: "SKILL_LEARNED",
        tick,
        entityId: entity.id,
        skillId: "spiritual_awareness",
        proficiency: SPIRITUAL_AWARENESS_PROFICIENCY,
        method: "invention",
      } as SimEvent);
    }
  }

  // ── 2. Priest assignment per tribe ─────────────────────────
  for (const tribe of Object.values(world.tribes ?? {}) as TribeState[]) {
    let currentPriest = tribe.priestId ? world.entities[tribe.priestId] : undefined;

    // Check if current priest is still valid
    if (currentPriest && (!currentPriest.alive || currentPriest.tribeId !== tribe.id)) {
      currentPriest.role = undefined;
      tribe.priestId = undefined;
      currentPriest = undefined;
    }

    // Elect a new priest if none exists
    if (!currentPriest) {
      let highestFaith = -1;
      let newPriestId: EntityId | undefined = undefined;

      for (const memberId of tribe.memberIds) {
        const member = world.entities[memberId];
        if (!member || !member.alive) continue;
        if (member.statuses?.includes("child")) continue;

        const faith = member.attributes.faith ?? 0;
        if (faith >= PRIEST_FAITH_THRESHOLD && faith > highestFaith) {
          highestFaith = faith;
          newPriestId = memberId;
        }
      }

      if (newPriestId) {
        const newPriest = world.entities[newPriestId]!;
        newPriest.role = "priest";
        tribe.priestId = newPriestId;

        events.push({
          type: "ROLE_ASSIGNED",
          tick,
          entityId: newPriest.id,
          tribeId: tribe.id,
          role: "priest",
        } as SimEvent);
      }
    }

    // ── 3. Link tribe to shrine if one exists ──────────────
    if (tribe.spiritualCenterId) {
      const center = world.structures?.[tribe.spiritualCenterId];
      if (!center || !center.active) {
        tribe.spiritualCenterId = undefined;
      }
    } else if (world.structures) {
      for (const struct of Object.values(world.structures)) {
        if (struct.type === "shrine" && struct.active) {
          tribe.spiritualCenterId = struct.id;
          break;
        }
      }
    }
  }

  return events;
}
