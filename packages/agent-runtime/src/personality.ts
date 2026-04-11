/**
 * personality.ts — Compute gameplay modifiers from MBTI personality axes.
 *
 * Phase 1: Each agent has 4 continuous axes (ei, sn, tf, jp) from -1 to +1.
 * This module converts those raw axes into concrete gameplay thresholds
 * that the policy uses for decision-making.
 *
 * Pure function — no side effects, deterministic.
 */

import { Personality } from "@project-god/shared";

// ── Modifier output ─────────────────────────────────────────

/**
 * Concrete gameplay values derived from personality.
 * Used by the policy to modulate decision thresholds.
 */
export interface PersonalityModifiers {
  /** Minimum food items before agent considers non-survival activities. J→high, P→low. */
  foodSafetyStock: number;
  /** Multiplier on exploration/wander tendency. N→high, S→low. */
  exploreWeight: number;
  /** Multiplier on social-seeking behavior (tribe gather point, approach others). E→high, I→low. */
  socialSeekWeight: number;
  /** Bonus added to build-priority score. J→positive (builds sooner), P→negative. */
  buildPriorityBonus: number;
  /** Multiplier on skill discovery / invention chance. N→high, S→low. */
  innovationChance: number;
  /** Multiplier on trust gain rate from social encounters. E+F→high. */
  trustGainRate: number;
  /** Probability of voluntarily sharing resources (feeding children/others). F→high, T→low. */
  resourceShareChance: number;
  /** Minimum HP to attempt risky actions (wading, exploration). S→high(cautious), N→low(brave). */
  riskHpThreshold: number;
  /** Multiplier on faith gain and prayer frequency. F→high, T→low. */
  faithAffinity: number;
  /** Maximum wander distance when idle. N+P→wider, S+J→tighter. */
  wanderRadius: number;
  /** Hunger level at which builder-prep is immediately abandoned. J→higher (more cautious). */
  hungerAbortThreshold: number;
}

// ── Default personality (neutral = all zeros) ────────────────

/** A perfectly balanced personality with no bias. */
export const NEUTRAL_PERSONALITY: Personality = { ei: 0, sn: 0, tf: 0, jp: 0 };

/** Default modifiers when personality is undefined (backward compatible). */
export const DEFAULT_MODIFIERS: PersonalityModifiers = {
  foodSafetyStock: 4,
  exploreWeight: 1.0,
  socialSeekWeight: 1.0,
  buildPriorityBonus: 0,
  innovationChance: 1.0,
  trustGainRate: 1.0,
  resourceShareChance: 0.3,
  riskHpThreshold: 60,
  faithAffinity: 1.0,
  wanderRadius: 5,
  hungerAbortThreshold: 35,
};

// ── Core computation ─────────────────────────────────────────

/**
 * Linearly interpolate a value from an axis.
 *
 * @param axisValue  The personality axis value (-1 to +1)
 * @param minVal     Value when axis = -1
 * @param maxVal     Value when axis = +1
 * @returns Interpolated value
 */
function lerp(axisValue: number, minVal: number, maxVal: number): number {
  // Clamp axis to [-1, 1]
  const t = Math.max(-1, Math.min(1, axisValue));
  // Map from [-1, +1] to [0, 1]
  const normalized = (t + 1) / 2;
  return minVal + (maxVal - minVal) * normalized;
}

/**
 * Compute all gameplay modifiers from a personality.
 *
 * If personality is undefined/null, returns DEFAULT_MODIFIERS.
 * All modifier formulas are pure linear interpolations for predictability.
 *
 * @example
 * // INTJ → introvert, intuitive, thinking, judging
 * computeModifiers({ ei: -0.8, sn: 0.7, tf: -0.6, jp: -0.9 })
 * // → { foodSafetyStock: 6.5, exploreWeight: 1.7, socialSeekWeight: 0.4, ... }
 */
export function computeModifiers(personality: Personality | undefined): PersonalityModifiers {
  if (!personality) return { ...DEFAULT_MODIFIERS };

  const { ei, sn, tf, jp } = personality;

  return {
    // J(-1) → 7 (stockpile lots), P(+1) → 2 (live loose)
    foodSafetyStock: Math.round(lerp(jp, 7, 2)),

    // S(-1) → 0.5x (practical, stays put), N(+1) → 2.0x (explore eagerly)
    exploreWeight: lerp(sn, 0.5, 2.0),

    // I(-1) → 0.3x (solo worker), E(+1) → 1.8x (seeks tribe)
    socialSeekWeight: lerp(ei, 0.3, 1.8),

    // J(-1) → +15 (builds early), P(+1) → -10 (builds late/never)
    buildPriorityBonus: Math.round(lerp(jp, 15, -10)),

    // S(-1) → 0.7x, N(+1) → 1.6x (N types discover/invent more)
    innovationChance: lerp(sn, 0.7, 1.6),

    // Combined E+F → faster trust. Base from E, slight boost from F.
    trustGainRate: lerp(ei, 0.6, 1.3) + lerp(tf, -0.1, 0.2),

    // T(-1) → 10% share, F(+1) → 60% share
    resourceShareChance: lerp(tf, 0.1, 0.6),

    // S(-1) → 85 (very cautious, needs high HP), N(+1) → 50 (brave, risks low HP)
    // Inverted: higher number = MORE cautious
    riskHpThreshold: Math.round(lerp(sn, 85, 50)),

    // T(-1) → 0.5x (rarely prays), F(+1) → 1.8x (devout)
    faithAffinity: lerp(tf, 0.5, 1.8),

    // S+J(-1) → 3 tiles, N+P(+1) → 8 tiles
    wanderRadius: Math.round(lerp(sn, 3, 6) + lerp(jp, 0, 2)),

    // J(-1) → 45 (cautious, aborts early), P(+1) → 25 (keeps going longer)
    hungerAbortThreshold: Math.round(lerp(jp, 45, 25)),
  };
}

// ── Personality generation ───────────────────────────────────

/**
 * Generate a random personality using a seeded RNG function.
 *
 * @param rng  A function that returns a random number in [0, 1).
 *             Must be the simulation's seeded RNG for determinism.
 * @returns A new Personality with values in [-1, +1].
 */
export function randomPersonality(rng: () => number): Personality {
  // Each axis is independently random, uniform distribution
  return {
    ei: rng() * 2 - 1,
    sn: rng() * 2 - 1,
    tf: rng() * 2 - 1,
    jp: rng() * 2 - 1,
  };
}

/**
 * Generate a child's personality by blending parents + random mutation.
 *
 * Formula: child_axis = parentBlendWeight * avg(mother, father) + (1 - parentBlendWeight) * random
 *
 * @param mother  Mother's personality
 * @param father  Father's personality
 * @param rng     Seeded RNG function
 * @param blendWeight  How much parents influence child (0-1). Default 0.7.
 * @returns Child's personality
 */
export function inheritPersonality(
  mother: Personality,
  father: Personality,
  rng: () => number,
  blendWeight: number = 0.7
): Personality {
  function blendAxis(m: number, f: number): number {
    const parentAvg = (m + f) / 2;
    const mutation = rng() * 2 - 1; // random in [-1, 1]
    const raw = blendWeight * parentAvg + (1 - blendWeight) * mutation;
    // Clamp to [-1, 1]
    return Math.max(-1, Math.min(1, raw));
  }

  return {
    ei: blendAxis(mother.ei, father.ei),
    sn: blendAxis(mother.sn, father.sn),
    tf: blendAxis(mother.tf, father.tf),
    jp: blendAxis(mother.jp, father.jp),
  };
}
