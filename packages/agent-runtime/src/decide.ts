/**
 * decide.ts — The main entry point for agent decision-making.
 *
 * MVP-02 upgrade: perceive → recall → memory-aware policy → update task.
 * Also re-exports the legacy survival policy for backward compatibility.
 *
 * Takes a world snapshot (READ ONLY for world) and returns a single ActionIntent.
 * NOTE: may mutate entity.currentTask (working memory) as a side effect.
 */

import { ActionIntent, WorldState } from "@project-god/shared";
import { perceive } from "./perception";
import { survivalPolicy, type NeedConfig } from "./policies/survival-policy";
import { memoryAwarePolicy, type NeedConfig as MemNeedConfig } from "./policies/memory-aware-policy";

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
