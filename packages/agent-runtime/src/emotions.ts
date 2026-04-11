/**
 * emotions.ts — Rule-based emotion system.
 *
 * Runs every tick (no LLM needed). Derives an agent's emotional state
 * from their current needs, recent events, and situation.
 * LLM can override on cognitive ticks.
 *
 * Pure function — deterministic, no side effects.
 */

import type { EntityState, EmotionType } from "@project-god/shared";

/**
 * Conditions checked in priority order.
 * First match wins. Designed to feel natural:
 * - Physical danger → afraid
 * - Loss → grieving
 * - Deprivation → anxious
 * - Success → hopeful/determined
 * - Comfort → content
 * - Default → calm
 */
export function deriveEmotion(
  entity: EntityState,
  recentDeathNearby: boolean = false,
  recentBuildSuccess: boolean = false,
  recentActionRejected: boolean = false,
  seesUnknownTerrain: boolean = false,
): EmotionType {
  const hp = entity.needs.hp ?? 100;
  const hunger = entity.needs.hunger ?? 100;
  const thirst = entity.needs.thirst ?? 100;

  // Priority 1: Life-threatening danger
  if (hp <= 30) return "afraid";

  // Priority 2: Grief (nearby death)
  if (recentDeathNearby) return "grieving";

  // Priority 3: Severe deprivation
  if (hunger <= 15 || thirst <= 15) return "anxious";

  // Priority 4: Frustration from repeated failures
  if (recentActionRejected) return "angry";

  // Priority 5: Curiosity (sees something new)
  if (seesUnknownTerrain) return "curious";

  // Priority 6: Achievement
  if (recentBuildSuccess) return "hopeful";

  // Priority 7: Moderate stress
  if (hunger <= 35 || thirst <= 35) return "anxious";

  // Priority 8: Well-fed and healthy → content
  if (hp >= 80 && hunger >= 60 && thirst >= 60) return "content";

  // Priority 9: Actively working toward a goal
  if (entity.currentTask?.goal) return "determined";

  // Default: calm
  return "calm";
}

/**
 * Update an entity's emotion based on current state.
 * Mutates entity.emotion in place.
 *
 * @param entity The entity to update
 * @param recentDeathNearby Whether a nearby entity died recently
 * @param recentBuildSuccess Whether the entity successfully built something recently
 * @param recentActionRejected Whether the entity's last action was rejected
 * @param seesUnknownTerrain Whether the entity sees terrain it hasn't visited
 */
export function updateEmotion(
  entity: EntityState,
  recentDeathNearby: boolean = false,
  recentBuildSuccess: boolean = false,
  recentActionRejected: boolean = false,
  seesUnknownTerrain: boolean = false,
): void {
  // Don't override LLM-set emotions within 10 ticks of a cognitive tick
  if (
    entity.lastCognitiveTick !== undefined &&
    entity.lastCognitiveTick > 0 &&
    ((entity as any)._lastEmotionTick ?? 0) <= entity.lastCognitiveTick
  ) {
    // LLM recently set emotion — let it persist for a while
    // But still allow extreme state changes to override
    const hp = entity.needs.hp ?? 100;
    if (hp <= 20) {
      entity.emotion = "afraid";
    }
    return;
  }

  entity.emotion = deriveEmotion(
    entity,
    recentDeathNearby,
    recentBuildSuccess,
    recentActionRejected,
    seesUnknownTerrain,
  );
}
