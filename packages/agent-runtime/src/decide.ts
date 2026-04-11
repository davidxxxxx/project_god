/**
 * decide.ts — The main entry point for agent decision-making.
 *
 * MVP-02 upgrade: perceive → recall → memory-aware policy → update task.
 * LLM Cognition upgrade: perceive → cognitive-loop → LLM plan or rule fallback.
 *
 * Phase 5 fix: plan translator converts LLM goal-coordinates into valid
 * single-tile moves. Smart consumption keeps move steps until arrival.
 *
 * Takes a world snapshot (READ ONLY for world) and returns a single ActionIntent.
 * NOTE: may mutate entity.currentTask (working memory) as a side effect.
 */

import { ActionIntent, WorldState, EntityState, ActionPlanStep, chebyshev, samePos } from "@project-god/shared";
import type { Vec2 } from "@project-god/shared";
import { perceive } from "./perception";
import { survivalPolicy, type NeedConfig } from "./policies/survival-policy";
import { memoryAwarePolicy, type NeedConfig as MemNeedConfig } from "./policies/memory-aware-policy";
import { CognitiveAdapter, type CognitiveConfig } from "./cognitive-adapter";
import { cognitiveTick, recordActionForCognition } from "./cognitive-loop";
import { updateEmotion } from "./emotions";
import { stepToward } from "./step-toward";

/**
 * decideAction — Legacy API (uses base survival policy, no memory).
 * Kept for backward compatibility with existing tests.
 */
export function decideAction(
  entityId: string,
  world: WorldState,
  needsConfig: Record<string, NeedConfig>
): ActionIntent {
  const snapshot = perceive(entityId, world);
  return survivalPolicy(snapshot, needsConfig);
}

/**
 * decideActionV2 — Memory-aware decision-making (MVP-02).
 * Uses episodic memory for resource recall and working memory for task tracking.
 */
export function decideActionV2(
  entityId: string,
  world: WorldState,
  needsConfig: Record<string, MemNeedConfig>
): ActionIntent {
  const snapshot = perceive(entityId, world);
  return memoryAwarePolicy(snapshot, needsConfig, world.tick);
}

/** Singleton cognitive adapter instance. Created on first use. */
let _adapter: CognitiveAdapter | null = null;

/** Track how many ticks each entity has been stuck on current plan step. */
const _planStuckCounts = new Map<string, number>();
/** Max ticks before abandoning a stuck plan step. */
const MAX_STUCK_TICKS = 5;

/**
 * Initialize or update the cognitive adapter with a new config.
 * Call this from the game client when LLM settings change.
 */
export function setCognitiveConfig(config: CognitiveConfig): void {
  _adapter = new CognitiveAdapter(config);
}

// ── Plan Step Translator ──────────────────────────────────────

/** Cached terrain defs for stepToward pathfinding. */
let _cachedTerrainDefs: Record<string, { moveCostMultiplier: number; passable: boolean }> | undefined;

/**
 * Translate an LLM ActionPlanStep into a valid ActionIntent.
 *
 * The key problem: LLM gives goal coordinates (e.g. "move to berry at (5,3)")
 * but the validator only accepts adjacent tiles (chebyshev distance = 1).
 * This function decomposes far-distance moves into single-tile steps.
 *
 * For non-move actions, passes through directly.
 */
function translatePlanStep(
  entity: EntityState,
  step: ActionPlanStep,
  world: WorldState,
): ActionIntent {
  const actorId = entity.id;

  // For "move" actions: decompose far-distance goal into adjacent step
  if (step.type === "move" && step.position) {
    const dist = chebyshev(entity.position, step.position);
    if (dist > 1) {
      // Goal is far away — compute one step toward it
      const nextPos = stepToward(
        entity.position,
        step.position,
        world.tiles as any,
        _cachedTerrainDefs,
      );
      return {
        actorId,
        type: "move",
        position: nextPos,
        reason: `🧠 ${step.reason}`,
      };
    }
    // Exactly 1 tile away — pass through as-is
    return {
      actorId,
      type: "move",
      position: step.position,
      reason: `🧠 ${step.reason}`,
    };
  }

  // Non-move actions: pass through directly
  return {
    actorId,
    type: step.type as any,
    targetId: step.targetId as any,
    position: step.position,
    recipeId: step.recipeId,
    itemId: step.itemId,
    reason: `🧠 ${step.reason}`,
  };
}

/**
 * Check if a plan step should be consumed (shifted off the plan).
 * Move steps are kept until arrival (or staleness).
 * Non-move steps are always consumed.
 */
function shouldConsumePlanStep(
  entity: EntityState,
  step: ActionPlanStep,
): boolean {
  // Non-move: always consume after one attempt
  if (step.type !== "move" || !step.position) return true;

  // Move: consume only when arrived at destination
  if (samePos(entity.position, step.position)) return true;

  // Check for stuck condition
  const stuckCount = _planStuckCounts.get(entity.id) ?? 0;
  if (stuckCount >= MAX_STUCK_TICKS) {
    _planStuckCounts.set(entity.id, 0);
    return true; // Give up on this step
  }

  // Increment stuck counter
  _planStuckCounts.set(entity.id, stuckCount + 1);
  return false; // Keep re-using this step
}

// ── Crisis Detection ──────────────────────────────────────────

/**
 * Check if the agent is in a crisis state that should override the LLM plan.
 * Returns true if the plan should be abandoned.
 *
 * Softer thresholds than before:
 * - HP ≤ 10: always abandon (near death)
 * - Hunger ≤ 10: abandon non-survival actions (but allow move/gather/eat)
 * - Thirst ≤ 10: abandon non-survival actions (but allow move/gather/drink)
 */
function shouldAbandonPlanForCrisis(
  entity: EntityState,
  step: ActionPlanStep,
): boolean {
  const hp = entity.needs.hp ?? 100;
  const hunger = entity.needs.hunger ?? 100;
  const thirst = entity.needs.thirst ?? 100;

  // Near death: always abandon
  if (hp <= 10) return true;

  // Survival action types that should still be allowed during crisis
  const survivalTypes = new Set(["eat", "drink", "gather", "move", "harvest"]);
  const isSurvivalAction = survivalTypes.has(step.type);

  // Severe starvation: allow only survival actions
  if (hunger <= 10 && !isSurvivalAction) return true;

  // Severe dehydration: allow only survival actions
  if (thirst <= 10 && !isSurvivalAction) return true;

  return false;
}

// ── Main Decision Function ────────────────────────────────────

/**
 * runCognitivePhase — Batch LLM cognition for all agents, concurrently.
 *
 * Called BEFORE the decision phase in each tick. Fires all needed LLM calls
 * in parallel (Promise.all), awaits all results, then writes them to entities.
 *
 * This enables "pause sim while LLM thinks" — the caller awaits this function,
 * and no ticks advance until all agents have their updated plans.
 *
 * @returns Number of agents that received new cognitive plans this tick.
 */
export async function runCognitivePhase(
  world: WorldState,
  terrainDefs?: Record<string, { moveCostMultiplier: number; passable: boolean }>,
): Promise<number> {
  if (!_adapter?.isEnabled()) return 0;

  // Collect all entities needing a cognitive cycle
  const candidates: { entity: EntityState; snapshot: ReturnType<typeof perceive> }[] = [];

  for (const entityId of Object.keys(world.entities)) {
    const entity = world.entities[entityId] as EntityState;
    if (!entity.alive) continue;
    if (!_adapter.shouldTrigger(entity, world.tick)) continue;

    // Mark immediately so the next tick won't re-trigger
    entity.lastCognitiveTick = world.tick;

    const snapshot = perceive(entityId, world, undefined, terrainDefs);
    candidates.push({ entity, snapshot });
  }

  if (candidates.length === 0) return 0;

  const startTime = Date.now();
  console.log(
    `[Cognitive] 🧠 Tick ${world.tick}: firing ${candidates.length} LLM calls concurrently...`
  );

  // Fire ALL LLM calls in parallel
  const promises = candidates.map(async ({ entity, snapshot }) => {
    const history = _recentEntityActions.get(entity.id) ?? [];
    try {
      const response = await _adapter!.runCognition(entity, snapshot, world.tick, history);
      if (response) {
        entity.innerThought = response.thought;
        entity.emotion = response.emotion;
        entity.actionPlan = response.plan;
        if (response.goal) entity.personalGoal = response.goal;
        console.log(
          `[Cognitive] ✓ ${entity.name ?? entity.id}: "${response.thought}" | ` +
          `plan: ${response.plan.length} steps`
        );
        return true;
      }
    } catch (err) {
      console.warn(`[Cognitive] ✗ ${entity.name ?? entity.id} error:`, err);
    }
    return false;
  });

  const results = await Promise.all(promises);
  const successCount = results.filter(Boolean).length;
  const elapsedMs = Date.now() - startTime;

  console.log(
    `[Cognitive] 🧠 Done: ${successCount}/${candidates.length} agents updated in ${elapsedMs}ms`
  );

  return successCount;
}

/**
 * decideActionV3 — LLM-Cognitive decision-making.
 *
 * Hybrid architecture:
 * 1. Execute existing LLM plan steps (with pathfinding translation)
 * 2. If no plan → fallback to memoryAwarePolicy (rules)
 * 3. Update emotions every tick regardless
 *
 * NOTE: LLM calls are NO LONGER fired here. They happen in
 * runCognitivePhase() which is awaited before this function runs.
 */
export function decideActionV3(
  entityId: string,
  world: WorldState,
  needsConfig: Record<string, MemNeedConfig>,
  terrainDefs?: Record<string, { moveCostMultiplier: number; passable: boolean }>,
): ActionIntent {
  const entity = world.entities[entityId] as EntityState;
  if (!entity?.alive) {
    return { actorId: entity.id, type: "idle", reason: "dead" };
  }

  // Cache terrain defs for plan translator
  _cachedTerrainDefs = terrainDefs;

  const snapshot = perceive(entityId, world, undefined, terrainDefs);

  // Always update emotions (cheap, rule-based)
  updateEmotion(entity);

  // Try cognitive loop if adapter is available
  if (_adapter?.isEnabled()) {
    // ── Execute existing plan ────────────────────────────────
    if (entity.actionPlan && entity.actionPlan.length > 0) {
      const step = entity.actionPlan[0];

      // Check for crisis override (softer thresholds)
      if (shouldAbandonPlanForCrisis(entity, step)) {
        entity.actionPlan = [];
        _planStuckCounts.delete(entity.id);
        // Fall through to rule-based policy
      } else {
        // Translate plan step into a valid intent (pathfinding for moves)
        const intent = translatePlanStep(entity, step, world);

        // Smart consumption: move steps stay until arrival
        if (shouldConsumePlanStep(entity, step)) {
          entity.actionPlan.shift();
          _planStuckCounts.delete(entity.id);
        }

        return intent;
      }
    }
  }

  // Fallback to rule-based policy (always available)
  return memoryAwarePolicy(snapshot, needsConfig, world.tick);
}

// ── Action Feedback Storage (Component 4) ─────────────────────

/** Per-entity action history for LLM feedback. */
const _recentEntityActions = new Map<string, { action: string; result: string }[]>();

/**
 * Record an action outcome for an entity. Called by tick.ts after validation.
 * This feeds back into the next LLM cognitive call so it knows what happened.
 */
export function recordActionResult(
  entityId: string,
  action: string,
  result: string,
): void {
  let history = _recentEntityActions.get(entityId);
  if (!history) {
    history = [];
    _recentEntityActions.set(entityId, history);
  }
  history.push({ action, result });
  // Keep only last 5 actions
  if (history.length > 5) history.shift();
}
