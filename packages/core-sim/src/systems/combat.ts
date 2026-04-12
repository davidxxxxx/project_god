/**
 * combat.ts — Shared deterministic combat resolver.
 *
 * Used by both fauna-tick (predator auto-attacks) and execute-hunt (player attacks).
 * Pure function: computes damage, dodge, death, loot. Does NOT mutate state.
 * The caller is responsible for applying the result.
 */

import { EntityState } from "@project-god/shared";
import type { FaunaDef } from "../content-types";

// ── Weapon / Armor lookup ────────────────────────────────────

/** Weapon attack bonuses by item ID. */
const WEAPON_BONUS: Record<string, number> = {
  spear: 8,
  club: 5,
  stone_tool: 3,
};

/** Armor defense bonuses by item ID. */
const ARMOR_BONUS: Record<string, number> = {
  hide_armor: 5,
};

/** Default human base attack (bare fists). */
const HUMAN_BASE_ATTACK = 2;

/** Default human base defense (no armor). */
const HUMAN_BASE_DEFENSE = 0;

// ── Combat Result ────────────────────────────────────────────

export interface CombatResult {
  /** Damage dealt TO the attacker by the defender. */
  attackerDamageTaken: number;
  /** Damage dealt TO the defender by the attacker. */
  defenderDamageTaken: number;
  /** Whether attacker dodged the defender's counter-attack. */
  attackerDodged: boolean;
  /** Whether defender dodged the attacker's attack. */
  defenderDodged: boolean;
  /** Whether defender died from this exchange. */
  defenderDied: boolean;
  /** Whether attacker died from this exchange. */
  attackerDied: boolean;
  /** Loot dropped if defender died (from FaunaDef.drops or empty). */
  loot: Record<string, number>;
}

// ── Main resolver ────────────────────────────────────────────

/**
 * Resolve one tick of combat between attacker and defender.
 * Deterministic: uses tick + positions as RNG seed.
 *
 * @param attacker - The entity initiating the attack.
 * @param defender - The entity being attacked.
 * @param tick - Current world tick (for deterministic randomness).
 * @param faunaDefs - Fauna definitions (for loot lookup).
 */
export function resolveCombat(
  attacker: EntityState,
  defender: EntityState,
  tick: number,
  faunaDefs: Record<string, FaunaDef>,
): CombatResult {
  // ── Calculate attack/defense powers ─────────────────────
  const atkPower = getAttackPower(attacker);
  const defPower = getDefensePower(defender);
  const defAtkPower = getAttackPower(defender);
  const atkDefPower = getDefensePower(attacker);

  // ── Dodge checks (deterministic) ────────────────────────
  const defenderDodged = checkDodge(defender, attacker, tick, 0);
  const attackerDodged = checkDodge(attacker, defender, tick, 1);

  // ── Damage calculation ──────────────────────────────────
  const defenderDamageTaken = defenderDodged ? 0 : Math.max(1, atkPower - defPower);
  const attackerDamageTaken = attackerDodged ? 0 : Math.max(1, defAtkPower - atkDefPower);

  // ── Apply to HP (read current, compute result) ──────────
  const defenderNewHp = (defender.needs.hp ?? 100) - defenderDamageTaken;
  const attackerNewHp = (attacker.needs.hp ?? 100) - attackerDamageTaken;

  const defenderDied = defenderNewHp <= 0;
  const attackerDied = attackerNewHp <= 0;

  // ── Loot calculation ────────────────────────────────────
  let loot: Record<string, number> = {};
  if (defenderDied && defender.type === "fauna") {
    const species = String(defender.attributes["species"] ?? "");
    const def = faunaDefs[species];
    if (def?.drops) {
      loot = { ...def.drops };
    }
  }

  return {
    attackerDamageTaken,
    defenderDamageTaken,
    attackerDodged,
    defenderDodged,
    defenderDied,
    attackerDied,
    loot,
  };
}

/**
 * Apply a CombatResult to the actual entities (mutates state).
 */
export function applyCombatResult(
  attacker: EntityState,
  defender: EntityState,
  result: CombatResult,
): void {
  defender.needs.hp = Math.max(0, (defender.needs.hp ?? 100) - result.defenderDamageTaken);
  attacker.needs.hp = Math.max(0, (attacker.needs.hp ?? 100) - result.attackerDamageTaken);

  if (result.defenderDied) {
    defender.alive = false;
  }
  if (result.attackerDied) {
    attacker.alive = false;
  }

  // Transfer loot to attacker's inventory
  if (result.defenderDied && attacker.alive) {
    for (const [item, qty] of Object.entries(result.loot)) {
      attacker.inventory[item] = (attacker.inventory[item] ?? 0) + qty;
    }
  }
}

// ── Helper functions ─────────────────────────────────────────

/** Get total attack power including weapon bonuses. */
function getAttackPower(entity: EntityState): number {
  const baseAttack = entity.type === "fauna"
    ? (entity.attributes["attack"] ?? 0)
    : (entity.attributes["attack"] ?? HUMAN_BASE_ATTACK);

  // Check inventory for best weapon
  let weaponBonus = 0;
  for (const [item, bonus] of Object.entries(WEAPON_BONUS)) {
    if ((entity.inventory[item] ?? 0) > 0 && bonus > weaponBonus) {
      weaponBonus = bonus;
    }
  }

  return baseAttack + weaponBonus;
}

/** Get total defense power including armor bonuses. */
function getDefensePower(entity: EntityState): number {
  const baseDefense = entity.type === "fauna"
    ? (entity.attributes["defense"] ?? 0)
    : (entity.attributes["defense"] ?? HUMAN_BASE_DEFENSE);

  let armorBonus = 0;
  for (const [item, bonus] of Object.entries(ARMOR_BONUS)) {
    if ((entity.inventory[item] ?? 0) > 0 && bonus > armorBonus) {
      armorBonus = bonus;
    }
  }

  return baseDefense + armorBonus;
}

/**
 * Deterministic dodge check.
 * Faster entities have a base 15% dodge chance.
 * Hunting skill adds up to 10% more.
 */
function checkDodge(
  dodger: EntityState,
  attacker: EntityState,
  tick: number,
  salt: number,
): boolean {
  const dodgerSpeed = dodger.attributes["speed"] ?? 1;
  const attackerSpeed = attacker.attributes["speed"] ?? 1;

  let dodgeChance = dodgerSpeed > attackerSpeed ? 0.15 : 0.0;
  dodgeChance += (dodger.skills?.["hunting"] ?? 0) * 0.10;

  // Deterministic roll
  const seed = (tick * 31 + dodger.position.x * 17 + attacker.position.y * 13 + salt * 7) % 100;
  return seed < dodgeChance * 100;
}
