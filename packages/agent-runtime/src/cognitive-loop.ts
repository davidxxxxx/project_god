/**
 * cognitive-loop.ts — Orchestrates LLM cognitive cycles and plan execution.
 *
 * This module sits between the CognitiveAdapter (LLM) and the existing
 * rule-based policy. It decides:
 * 1. Whether to trigger a new LLM cognitive cycle
 * 2. Whether to execute the next step from an existing plan
 * 3. When to fall back to rule-based policy
 *
 * Flow per tick:
 *   Has active plan? ──YES──> Execute next step from plan
 *        │ NO                       │
 *        ▼                          ▼
 *   Should trigger? ──YES──> Call LLM (async)
 *        │ NO                  │ (while waiting, use rules)
 *        ▼                     ▼
 *   Use rule policy       On LLM return: set plan + thought + emotion
 */

import type { EntityState, ActionIntent, ActionPlanStep, EmotionType } from "@project-god/shared";
import type { AgentSnapshot } from "./perception";
import { CognitiveAdapter, type CognitiveConfig, type CognitiveResponse } from "./cognitive-adapter";
import { updateEmotion } from "./emotions";

// ── Cognitive Loop State ──────────────────────────────────────

/** Tracks pending LLM calls per entity to prevent double-calls. */
const _pendingEntities = new Set<string>();

/** Stores recent action history per entity for prompt context. */
const _recentActions = new Map<string, { action: string; result: string }[]>();

/** Record an action result for cognitive context. */
export function recordActionForCognition(
  entityId: string,
  action: string,
  result: string,
): void {
  let history = _recentActions.get(entityId);
  if (!history) {
    history = [];
    _recentActions.set(entityId, history);
  }
  history.push({ action, result });
  // Keep only last 5
  if (history.length > 5) history.shift();
}

// ── Plan Execution ────────────────────────────────────────────

/**
 * Try to execute the next step from an entity's action plan.
 * Returns an ActionIntent if a plan step is available, or null if not.
 *
 * Plan steps are converted to ActionIntents and consumed (shifted off the array).
 * If a plan step seems invalid for current state, the plan is cleared.
 */
export function tryExecutePlanStep(
  entity: EntityState,
  snapshot: AgentSnapshot,
): ActionIntent | null {
  const plan = entity.actionPlan;
  if (!plan || plan.length === 0) return null;

  const step = plan[0];
  const actorId = entity.id;

  // Basic sanity checks before executing plan step
  // If agent is in crisis (HP critical), abandon plan
  if ((entity.needs.hp ?? 100) <= 20) {
    entity.actionPlan = [];
    return null;
  }

  // If hunger is critical and plan step isn't eating, abandon plan
  if (
    (entity.needs.hunger ?? 100) <= 15 &&
    step.type !== "eat" && step.type !== "gather" && step.type !== "cook"
  ) {
    entity.actionPlan = [];
    return null;
  }

  // Consume the step
  plan.shift();

  // Convert ActionPlanStep to ActionIntent
  const intent: ActionIntent = {
    actorId,
    type: step.type as any,
    targetId: step.targetId as any,
    position: step.position,
    recipeId: step.recipeId,
    itemId: step.itemId,
    reason: `🧠 [LLM plan] ${step.reason}`,
  };

  return intent;
}

// ── Main Cognitive Tick ───────────────────────────────────────

/**
 * Run the cognitive loop for a single entity.
 *
 * @returns ActionIntent from LLM plan, or null (caller should fallback to rules)
 */
export async function cognitiveTick(
  entity: EntityState,
  snapshot: AgentSnapshot,
  adapter: CognitiveAdapter,
  currentTick: number,
  recentDeathNearby: boolean = false,
  seesNewTerrain: boolean = false,
): Promise<ActionIntent | null> {
  // Step 1: Always update emotions (rule-based, cheap)
  updateEmotion(entity, recentDeathNearby, false, false, seesNewTerrain);

  // Step 2: Try to execute existing plan
  const planAction = tryExecutePlanStep(entity, snapshot);
  if (planAction) return planAction;

  // Step 3: Check if we should trigger a new cognitive cycle
  if (!adapter.shouldTrigger(entity, currentTick, recentDeathNearby, seesNewTerrain)) {
    return null; // Fallback to rules
  }

  // Step 4: Don't double-call for same entity
  if (_pendingEntities.has(entity.id)) return null;

  // Step 5: Fire LLM call (async — returns null immediately, plan set later)
  _pendingEntities.add(entity.id);
  const history = _recentActions.get(entity.id) ?? [];

  // Non-blocking: fire and forget, plan will be available next tick
  adapter.runCognition(entity, snapshot, currentTick, history).then((response) => {
    _pendingEntities.delete(entity.id);

    if (response) {
      applyCognitiveResponse(entity, response, currentTick);
      console.log(
        `[Cognitive] ${entity.name ?? entity.id} thinks: "${response.thought}" ` +
        `| emotion: ${response.emotion} | plan: ${response.plan.length} steps`
      );
    }
  }).catch((err) => {
    _pendingEntities.delete(entity.id);
    console.warn(`[Cognitive] Error for ${entity.id}:`, err);
  });

  // This tick: fallback to rules while waiting for LLM
  return null;
}

/**
 * Apply LLM cognitive response to entity state.
 * Updates thought, emotion, goal, and sets action plan.
 */
function applyCognitiveResponse(
  entity: EntityState,
  response: CognitiveResponse,
  currentTick: number,
): void {
  entity.innerThought = response.thought;
  entity.emotion = response.emotion;
  entity.lastCognitiveTick = currentTick;
  entity.actionPlan = response.plan;

  if (response.goal) {
    entity.personalGoal = response.goal;
  }
}
