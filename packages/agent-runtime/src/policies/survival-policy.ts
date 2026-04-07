/**
 * survival-policy.ts — The dumbest, most stable rule-based brain.
 *
 * Decision priority (per user spec):
 *   1. thirst critical AND has water → drink
 *   2. hunger critical AND has berry → eat
 *   3. higher-pressure need → find appropriate resource
 *      a. adjacent → gather
 *      b. not adjacent → move toward nearest
 *   4. nothing to do → idle
 *
 * Pressure = max - current (higher = more urgent)
 */

import {
  ActionIntent, EntityId, ResourceNodeId,
  EntityState, ResourceNodeState, Vec2,
  manhattan,
} from "@project-god/shared";
import type { AgentSnapshot } from "../perception";

export interface NeedConfig {
  max: number;
  criticalThreshold: number;
}

export function survivalPolicy(
  snapshot: AgentSnapshot,
  needsConfig: Record<string, NeedConfig>
): ActionIntent {
  const { self, nearbyResources } = snapshot;
  const actorId = self.id;

  const hungerCfg = needsConfig["hunger"] ?? { max: 100, criticalThreshold: 25 };
  const thirstCfg = needsConfig["thirst"] ?? { max: 100, criticalThreshold: 25 };

  const hungerPressure = hungerCfg.max - (self.needs.hunger ?? hungerCfg.max);
  const thirstPressure = thirstCfg.max - (self.needs.thirst ?? thirstCfg.max);

  const hasBerry = (self.inventory["berry"] ?? 0) > 0;
  const hasWater = (self.inventory["water"] ?? 0) > 0;

  // ── Priority 1: Critical consume ──────────────────────────
  if (self.needs.thirst <= thirstCfg.criticalThreshold && hasWater) {
    return { actorId, type: "drink", reason: "thirst critical, have water" };
  }
  if (self.needs.hunger <= hungerCfg.criticalThreshold && hasBerry) {
    return { actorId, type: "eat", reason: "hunger critical, have berry" };
  }

  // ── Priority 2: Consume if pressure high and have item ────
  if (thirstPressure > hungerPressure && hasWater) {
    return { actorId, type: "drink", reason: "thirst pressure higher, have water" };
  }
  if (hungerPressure > thirstPressure && hasBerry) {
    return { actorId, type: "eat", reason: "hunger pressure higher, have berry" };
  }
  // Tie-break: consume whichever we have
  if (thirstPressure > 0 && hasWater) {
    return { actorId, type: "drink", reason: "some thirst, have water" };
  }
  if (hungerPressure > 0 && hasBerry) {
    return { actorId, type: "eat", reason: "some hunger, have berry" };
  }

  // ── Priority 3: Seek resources based on pressure ──────────
  const needType = thirstPressure >= hungerPressure ? "water" : "berry";
  const nearest = findNearestOfType(self.position, nearbyResources, needType);

  if (nearest) {
    const dist = manhattan(self.position, nearest.position);
    if (dist <= 1) {
      // Adjacent → gather
      return {
        actorId, type: "gather",
        targetId: nearest.id,
        reason: `adjacent to ${needType}, gathering`,
      };
    } else {
      // Move one step toward it
      const step = stepToward(self.position, nearest.position);
      return {
        actorId, type: "move",
        position: step,
        reason: `moving toward ${needType} at (${nearest.position.x},${nearest.position.y})`,
      };
    }
  }

  // ── Priority 4: Try the other resource type ───────────────
  const altType = needType === "water" ? "berry" : "water";
  const altNearest = findNearestOfType(self.position, nearbyResources, altType);

  if (altNearest) {
    const dist = manhattan(self.position, altNearest.position);
    if (dist <= 1) {
      return { actorId, type: "gather", targetId: altNearest.id, reason: `adjacent to ${altType}` };
    } else {
      const step = stepToward(self.position, altNearest.position);
      return { actorId, type: "move", position: step, reason: `moving toward ${altType}` };
    }
  }

  // ── Nothing to do ─────────────────────────────────────────
  return { actorId, type: "idle", reason: "no resources in perception range" };
}

// ── Helpers ────────────────────────────────────────────────────

function findNearestOfType(
  from: Vec2,
  resources: ResourceNodeState[],
  resourceType: string
): ResourceNodeState | undefined {
  let best: ResourceNodeState | undefined;
  let bestDist = Infinity;

  for (const r of resources) {
    if (r.resourceType !== resourceType || r.quantity <= 0) continue;
    const d = manhattan(from, r.position);
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }

  return best;
}

function stepToward(from: Vec2, to: Vec2): Vec2 {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  if (dx === 0 && dy === 0) return from;
  return { x: from.x + dx, y: from.y + dy };
}
