import { ActionIntent, WorldState } from "@project-god/shared";
import { perceive } from "./perception";
import { survivalPolicy, type NeedConfig } from "./policies/survival-policy";

/**
 * decideAction — The main entry point for agent decision-making.
 * Takes a world snapshot (READ ONLY) and returns a single ActionIntent.
 * MUST NOT mutate world state.
 */
export function decideAction(
  entityId: string,
  world: WorldState,
  needsConfig: Record<string, NeedConfig>
): ActionIntent {
  const snapshot = perceive(entityId, world);
  return survivalPolicy(snapshot, needsConfig);
}
