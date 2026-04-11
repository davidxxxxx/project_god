/**
 * execute-wade.ts — Executes a wading attempt (MVP-03).
 *
 * Uses world RNG for deterministic probabilistic outcomes.
 * Success factors:
 *   base 40% + water_crossing skill (+30%) + HP (+10%) + hunger (+10%)
 *   + daytime (+10%) + light load (+10%)
 *
 * On success: move to target, moveCooldown=3, wet status, form success memory
 * On failure: stay in place, lose 10-20 HP, drop 1 item, wet status, cooldown=5
 */

import {
  ValidatedAction, WorldState, SimEvent, EntityState,
  WadeAttemptedEvent, createRNG, tileKey,
} from "@project-god/shared";
import type { TerrainDef } from "../content-types";

// ── Balance Constants ──────────────────────────────────────────

/** Base probability of successfully wading (without any bonuses). */
const BASE_SUCCESS_RATE = 0.40;
/** Bonus from water_crossing skill (0.3 proficiency * this = +9%, max +30%). */
const SKILL_BONUS_MAX = 0.30;
/** Bonus for HP ≥ 80. */
const HP_BONUS = 0.10;
/** Bonus for hunger ≥ 60. */
const HUNGER_BONUS = 0.10;
/** Bonus for daytime. */
const DAY_BONUS = 0.10;
/** Bonus for carrying ≤ 3 items. */
const LIGHT_LOAD_BONUS = 0.10;

/** HP damage range on failure [min, max]. */
const FAIL_HP_DAMAGE_MIN = 10;
const FAIL_HP_DAMAGE_MAX = 20;

/** Movement cooldown after successful wade. */
const SUCCESS_COOLDOWN = 3;
/** Movement cooldown after failed wade. */
const FAIL_COOLDOWN = 5;

/** Ticks the "wet" status lasts. */
export const WET_DURATION = 10;

export function executeWade(
  action: ValidatedAction,
  world: WorldState,
  _terrainDefs?: Record<string, TerrainDef>
): SimEvent[] {
  const entity = world.entities[action.intent.actorId];
  if (!entity || !entity.alive) return [];

  const from = { ...entity.position };
  const to = action.intent.position!;
  const events: SimEvent[] = [];

  // ── Calculate success probability ──────────────────────────
  let successChance = BASE_SUCCESS_RATE;

  // Skill bonus: proficiency * SKILL_BONUS_MAX
  const crossingSkill = entity.skills?.["water_crossing"] ?? 0;
  successChance += crossingSkill * SKILL_BONUS_MAX;

  // HP bonus
  if ((entity.needs.hp ?? 100) >= 80) {
    successChance += HP_BONUS;
  }

  // Hunger bonus
  if ((entity.needs.hunger ?? 100) >= 60) {
    successChance += HUNGER_BONUS;
  }

  // Daytime bonus (dusk gets half)
  const timeOfDay = world.environment?.timeOfDay ?? "day";
  if (timeOfDay === "day") {
    successChance += DAY_BONUS;
  } else if (timeOfDay === "dusk") {
    successChance += DAY_BONUS * 0.5;
  }

  // Light load bonus
  const totalItems = Object.values(entity.inventory).reduce((sum, qty) => sum + qty, 0);
  if (totalItems <= 3) {
    successChance += LIGHT_LOAD_BONUS;
  }

  // Cap at 95% — always some risk
  successChance = Math.min(0.95, successChance);

  // ── Roll for outcome (deterministic via world RNG) ─────────
  const rng = createRNG(world.rngState);
  const roll = rng.next();
  world.rngState = rng.state; // advance world RNG state

  const success = roll < successChance;

  if (success) {
    // ── SUCCESS: move to target ─────────────────────────
    entity.position = { ...to };
    entity.moveCooldownUntil = world.tick + SUCCESS_COOLDOWN;

    // Apply wet status
    applyWetStatus(entity, world.tick);

    // Grant water_crossing skill if not already known
    if (!entity.skills) entity.skills = {};
    if ((entity.skills["water_crossing"] ?? 0) === 0) {
      entity.skills["water_crossing"] = 0.3;
      events.push({
        type: "SKILL_LEARNED",
        tick: world.tick,
        entityId: entity.id,
        skillId: "water_crossing",
        proficiency: 0.3,
        method: "invention", // discovered through experience, not observation
      } as any);
    } else {
      // Increase proficiency slightly (practice)
      entity.skills["water_crossing"] = Math.min(1.0, entity.skills["water_crossing"] + 0.05);
    }

    // Form episodic memory of successful crossing
    if (!entity.episodicMemory) entity.episodicMemory = [];
    entity.episodicMemory.push({
      tick: world.tick,
      type: "successful_crossing",
      position: { ...to },
      detail: `waded from (${from.x},${from.y}) to (${to.x},${to.y})`,
    });

    events.push({
      type: "ENTITY_MOVED",
      tick: world.tick,
      entityId: entity.id,
      from,
      to,
    } as any);

    events.push({
      type: "WADE_ATTEMPTED",
      tick: world.tick,
      entityId: entity.id,
      from,
      to,
      success: true,
      successChance,
    } as WadeAttemptedEvent);

  } else {
    // ── FAILURE: stay in place, take damage ──────────────
    entity.moveCooldownUntil = world.tick + FAIL_COOLDOWN;

    // HP damage
    const hpDamage = FAIL_HP_DAMAGE_MIN + Math.floor(rng.next() * (FAIL_HP_DAMAGE_MAX - FAIL_HP_DAMAGE_MIN + 1));
    world.rngState = rng.state;
    const oldHp = entity.needs.hp ?? 100;
    entity.needs.hp = Math.max(0, oldHp - hpDamage);

    // Apply wet status
    applyWetStatus(entity, world.tick);

    // Drop 1 random inventory item (falls into river)
    let itemLost: string | undefined;
    const carriedItems = Object.entries(entity.inventory).filter(([_, qty]) => qty > 0);
    if (carriedItems.length > 0) {
      const dropIdx = Math.floor(rng.next() * carriedItems.length);
      world.rngState = rng.state;
      const [dropItem] = carriedItems[dropIdx];
      entity.inventory[dropItem] = Math.max(0, (entity.inventory[dropItem] ?? 0) - 1);
      if (entity.inventory[dropItem] === 0) delete entity.inventory[dropItem];
      itemLost = dropItem;
    }

    // Form episodic memory of failed crossing
    if (!entity.episodicMemory) entity.episodicMemory = [];
    entity.episodicMemory.push({
      tick: world.tick,
      type: "failed_crossing",
      position: { ...from },
      detail: `failed wade to (${to.x},${to.y}), lost ${hpDamage} HP${itemLost ? `, dropped ${itemLost}` : ""}`,
    });

    events.push({
      type: "HP_CHANGED",
      tick: world.tick,
      entityId: entity.id,
      oldHp,
      newHp: entity.needs.hp,
      cause: "wade_failure",
    } as any);

    events.push({
      type: "WADE_ATTEMPTED",
      tick: world.tick,
      entityId: entity.id,
      from,
      to,
      success: false,
      hpLost: hpDamage,
      itemLost,
      successChance,
    } as WadeAttemptedEvent);

    // Check for death
    if (entity.needs.hp <= 0) {
      entity.alive = false;
      events.push({
        type: "ENTITY_DIED",
        tick: world.tick,
        entityId: entity.id,
        cause: "drowning",
      } as any);
    }
  }

  return events;
}

// ── Helper: Apply wet status ──────────────────────────────────

function applyWetStatus(entity: EntityState, tick: number): void {
  if (!entity.statuses) entity.statuses = [];
  if (!entity.statuses.includes("wet")) {
    entity.statuses.push("wet");
  }
  // Store when wet was applied for duration tracking
  entity.attributes["wet_until"] = tick + WET_DURATION;
}
