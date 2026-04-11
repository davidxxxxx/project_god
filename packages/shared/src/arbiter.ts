/**
 * arbiter.ts — World Arbiter judgment types.
 *
 * The World Arbiter is an LLM that evaluates uncertain agent actions
 * (craft, experiment, fish, build) and outputs structured judgments.
 * core-sim uses these judgments to determine success/failure/side-effects.
 *
 * Key design constraint:
 *   LLM NEVER mutates world state directly.
 *   It outputs a structured judgment → core-sim validates → core-sim executes.
 */

/**
 * Actions that require arbiter judgment (uncertain outcomes).
 * Deterministic actions (move, eat, drink, gather) skip the arbiter.
 */
export type ArbitrableAction = "craft" | "experiment" | "fish" | "build";

/** Whether an action type should go through the arbiter. */
export function isArbitrableAction(actionType: string): actionType is ArbitrableAction {
  return ["craft", "experiment", "fish", "build"].includes(actionType);
}

/**
 * Structured judgment from the World Arbiter LLM.
 *
 * This is the ONLY thing the LLM outputs. It does NOT contain
 * any world mutations — those are derived by core-sim.
 */
export interface ArbiterJudgment {
  /** The action being judged. */
  actionType: ArbitrableAction;

  /** Did the action succeed? */
  success: boolean;

  /**
   * Estimated probability of success (0.0 – 1.0).
   * Based on agent skill, materials, experience, environment.
   */
  successChance: number;

  /**
   * What happened, in brief.
   * e.g. "Shaped the stone but it cracked" or "Caught a small trout".
   */
  outcome: string;

  /**
   * Skill proficiency gain from the attempt.
   * Positive even on failure (you learn from mistakes).
   * Range: 0.0 – 0.2.
   */
  skillGain: number;

  /**
   * ID of discovered recipe/tech, if any.
   * Only relevant for "experiment" actions.
   * null if nothing discovered.
   */
  discoveryId: string | null;

  /**
   * Quality modifier for produced item (0.5 = crude, 1.0 = normal, 1.5 = excellent).
   * Affects durability, effectiveness, etc.
   * Only relevant when success = true.
   */
  qualityModifier: number;

  /**
   * Dramatic 1-2 sentence narrative description.
   * Stored in episodic memory and shown in UI.
   * e.g. "Aela struck the flint with desperate precision. A sharp edge formed — crude but usable."
   */
  narrative: string;

  /**
   * What memory/lesson the agent takes away.
   * e.g. "Making stone knives requires patience and the right angle."
   */
  lessonLearned: string;
}

/** Default fallback judgment when arbiter is unavailable. */
export function deterministicFallback(
  actionType: ArbitrableAction,
  agentSkillLevel: number,
): ArbiterJudgment {
  // Generous base: 40% + 50% * skill. Even novices can get lucky.
  const baseChance = 0.4 + 0.5 * agentSkillLevel;
  const successChance = Math.min(0.95, baseChance);
  // Novices succeed if skill + experience >= 0.1 (basically always on first try)
  // This reflects that basic Stone Age tasks (fishing, simple crafting) aren't impossible
  const success = agentSkillLevel >= 0.05 || successChance >= 0.4;

  return {
    actionType,
    success,
    successChance,
    outcome: success ? "completed successfully" : "failed — not enough experience yet",
    skillGain: success ? 0.05 : 0.08, // Learn MORE from failure
    discoveryId: null,
    qualityModifier: success ? Math.max(0.5, 0.5 + agentSkillLevel * 0.5) : 0,
    narrative: success
      ? "The attempt went well enough."
      : "The attempt failed, but valuable experience was gained.",
    lessonLearned: success
      ? `${actionType} went smoothly this time.`
      : `${actionType} is harder than it looks — but I'll get better.`,
  };
}
