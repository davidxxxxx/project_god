/**
 * snapshot.ts — Builds DebugProjection from world state + recent events.
 * This is a DERIVED view. It never mutates the world.
 */

import {
  WorldState, EntityState, ResourceNodeState,
  SimEvent, ActionIntent,
  DebugProjection, DebugAgentView, DebugResourceView,
  TickResult,
} from "@project-god/shared";

export function buildProjection(
  world: WorldState,
  recentTickResults: TickResult[],
  maxRecentEvents: number = 30
): DebugProjection {
  // ── Build agent views ────────────────────────────────────
  const agents: DebugAgentView[] = [];
  for (const entity of Object.values(world.entities) as EntityState[]) {
    // Find the last action for this agent from recent results
    let lastAction: ActionIntent | undefined;
    let lastActionResult: "validated" | "rejected" | undefined;
    let lastActionReason: string | undefined;

    for (let i = recentTickResults.length - 1; i >= 0; i--) {
      const tr = recentTickResults[i];
      const accepted = tr.accepted.find((a) => a.intent.actorId === entity.id);
      if (accepted) {
        lastAction = accepted.intent;
        lastActionResult = "validated";
        lastActionReason = accepted.intent.reason;
        break;
      }
      const rejected = tr.rejections.find((r) => r.intent.actorId === entity.id);
      if (rejected) {
        lastAction = rejected.intent;
        lastActionResult = "rejected";
        lastActionReason = rejected.reason;
        break;
      }
    }

    agents.push({
      id: entity.id,
      position: { ...entity.position },
      alive: entity.alive,
      needs: { ...entity.needs },
      inventory: { ...entity.inventory },
      lastAction,
      lastActionResult,
      lastActionReason,
    });
  }

  // ── Build resource views ─────────────────────────────────
  const resources: DebugResourceView[] = [];
  for (const node of Object.values(world.resourceNodes) as ResourceNodeState[]) {
    resources.push({
      id: node.id,
      position: { ...node.position },
      resourceType: node.resourceType,
      quantity: Math.round(node.quantity * 10) / 10,
      maxQuantity: node.maxQuantity,
    });
  }

  // ── Collect recent events ────────────────────────────────
  const allRecentEvents: SimEvent[] = [];
  for (const tr of recentTickResults) {
    allRecentEvents.push(...tr.events);
  }
  const recentEvents = allRecentEvents.slice(-maxRecentEvents);

  // ── Counters ─────────────────────────────────────────────
  const aliveAgents = agents.filter((a) => a.alive).length;
  const deadAgents = agents.filter((a) => !a.alive).length;

  let totalEvents = 0, rejectedActions = 0, gatherCount = 0, eatCount = 0, drinkCount = 0;
  for (const tr of recentTickResults) {
    totalEvents += tr.events.length;
    rejectedActions += tr.rejections.length;
    for (const ev of tr.events) {
      if (ev.type === "RESOURCE_GATHERED") gatherCount++;
      if (ev.type === "FOOD_EATEN") eatCount++;
      if (ev.type === "WATER_DRUNK") drinkCount++;
    }
  }

  return {
    tick: world.tick,
    seed: world.seed,
    agents,
    resources,
    recentEvents,
    counters: { aliveAgents, deadAgents, totalEvents, rejectedActions, gatherCount, eatCount, drinkCount },
  };
}
