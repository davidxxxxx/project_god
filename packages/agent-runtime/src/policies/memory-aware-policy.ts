/**
 * memory-aware-policy.ts — Upgraded survival policy with memory integration.
 *
 * Extends the base survival-policy with:
 *   - Memory-based resource seeking when nothing is visible
 *   - Inventory capacity awareness (consume before gather when full)
 *   - Task tracking (avoids flip-flopping between goals)
 *   - Stale task abandonment
 *   - Avoidance of remembered-depleted locations
 */

import {
  ActionIntent, EntityId, ResourceNodeId,
  EntityState, ResourceNodeState, Vec2,
  manhattan,
} from "@project-god/shared";
import type { AgentSnapshot } from "../perception";
import { setTask, clearTask, isTaskStale } from "../memory";

export interface NeedConfig {
  max: number;
  criticalThreshold: number;
}

export function memoryAwarePolicy(
  snapshot: AgentSnapshot,
  needsConfig: Record<string, NeedConfig>,
  currentTick: number
): ActionIntent {
  const { self, nearbyResources, memorizedResourcePositions, inventoryRemaining } = snapshot;
  const actorId = self.id;

  const hungerCfg = needsConfig["hunger"] ?? { max: 100, criticalThreshold: 25 };
  const thirstCfg = needsConfig["thirst"] ?? { max: 100, criticalThreshold: 25 };

  const hungerPressure = hungerCfg.max - (self.needs.hunger ?? hungerCfg.max);
  const thirstPressure = thirstCfg.max - (self.needs.thirst ?? thirstCfg.max);

  const hasBerry = (self.inventory["berry"] ?? 0) > 0;
  const hasWater = (self.inventory["water"] ?? 0) > 0;

  // ── Priority 0: Child follows parent (MVP-04) ──────────────
  const isChild = self.statuses?.includes("child") ?? false;
  if (isChild && self.parentIds && self.parentIds.length > 0) {
    // Find nearest alive parent
    const parentId = self.parentIds.find((pid) => {
      const p = snapshot.nearbyEntities.find((e) => e.entityId === pid);
      return p !== undefined; // parent is visible
    });
    if (parentId) {
      const parent = snapshot.nearbyEntities.find((e) => e.entityId === parentId);
      if (parent) {
        const dist = manhattan(self.position, parent.position);
        if (dist > 1) {
          const step = stepToward(self.position, parent.position);
          return { actorId, type: "move", position: step, reason: `child following parent ${parentId}` };
        }
        return { actorId, type: "idle", reason: "child near parent" };
      }
    }
    // Parent not visible — wander toward tribe gather point or idle
    if (snapshot.tribeGatherPoint) {
      const dist = manhattan(self.position, snapshot.tribeGatherPoint);
      if (dist > 1) {
        const step = stepToward(self.position, snapshot.tribeGatherPoint);
        return { actorId, type: "move", position: step, reason: "child moving toward tribe" };
      }
    }
    return { actorId, type: "idle", reason: "child waiting for parent" };
  }

  // ── Stale task check ──────────────────────────────────────
  if (isTaskStale(self, currentTick)) {
    clearTask(self);
  }

  // ── Priority 1: Critical consume ──────────────────────────
  if (self.needs.thirst <= thirstCfg.criticalThreshold && hasWater) {
    clearTask(self);
    return { actorId, type: "drink", reason: "thirst critical, have water" };
  }
  if (self.needs.hunger <= hungerCfg.criticalThreshold && hasBerry) {
    clearTask(self);
    return { actorId, type: "eat", reason: "hunger critical, have berry" };
  }

  // ── Priority 2: Consume if inventory full and we have items ─
  if (inventoryRemaining <= 0) {
    if (thirstPressure > hungerPressure && hasWater) {
      return { actorId, type: "drink", reason: "inventory full, drinking to free space" };
    }
    if (hasBerry) {
      return { actorId, type: "eat", reason: "inventory full, eating to free space" };
    }
    if (hasWater) {
      return { actorId, type: "drink", reason: "inventory full, drinking to free space" };
    }
  }

  // ── Priority 2.5: Exposure crisis (MVP-03-A) ──────────────
  const exposureCfg = needsConfig["exposure"] ?? { max: 100, criticalThreshold: 30 };
  const currentExposure = self.needs.exposure ?? exposureCfg.max;
  const hasSheltered = self.statuses?.includes("sheltered") ?? false;
  const hasWarming = self.statuses?.includes("warming") ?? false;

  if (snapshot.isCold && currentExposure <= exposureCfg.criticalThreshold && !hasSheltered) {
    // Check for nearby active shelter structures (fire_pit or lean_to)
    const nearestShelter = snapshot.nearbyActiveStructures
      .filter((s) => s.type === "lean_to" || s.type === "fire_pit")
      .sort((a, b) => manhattan(self.position, a.position) - manhattan(self.position, b.position))[0];

    if (nearestShelter && !hasWarming) {
      // Move toward nearest shelter
      const dest = nearestShelter.position;
      if (manhattan(self.position, dest) > 0) {
        clearTask(self);
        return { actorId, type: "move", position: stepToward(self.position, dest), reason: "seeking warmth (exposure critical)" };
      }
    }

    // Build a lean_to if we have berries (cheaper and no skill required)
    const berryForShelter = self.inventory["berry"] ?? 0;
    if (berryForShelter >= 2 && !hasWarming) {
      clearTask(self);
      return { actorId, type: "build", itemId: "lean_to", reason: "building shelter (exposure critical)" };
    }
  }

  // ── Priority 2.8: Prayer when in crisis (MVP-05) ──────────
  const faith = self.attributes?.faith ?? 0;
  const MIN_PRAYER_FAITH = 5;
  const PRAYER_COOLDOWN = 20;
  const isCrisis = (self.needs.hunger ?? 100) <= (hungerCfg.criticalThreshold ?? 25)
    || (self.needs.thirst ?? 100) <= (thirstCfg.criticalThreshold ?? 25)
    || (snapshot.isCold && currentExposure <= (exposureCfg.criticalThreshold ?? 30));

  if (
    isCrisis &&
    faith >= MIN_PRAYER_FAITH &&
    !self.isPraying &&
    !isChild &&
    (self.lastPrayerTick === undefined || currentTick - self.lastPrayerTick >= PRAYER_COOLDOWN)
  ) {
    // Pray with probability proportional to faith (higher faith = more likely to pray)
    // Simple threshold: always pray when conditions are met (deterministic for MVP)
    clearTask(self);
    return { actorId, type: "pray", reason: `praying (faith:${faith}, crisis)` };
  }

  // ── Priority 2.9: Shrine / Ritual (MVP-07A) ───────────────
  const RITUAL_COOLDOWN = 30; // ticks between rituals
  const SHRINE_BERRY_COST = 3; // must match structures.json

  // Priest: build shrine if tribe doesn't have one
  if (
    !isCrisis &&
    !isChild &&
    snapshot.selfRole === "priest" &&
    !snapshot.tribeShrinePosition
  ) {
    const berries = self.inventory["berry"] ?? 0;
    if (berries >= SHRINE_BERRY_COST) {
      clearTask(self);
      return { actorId, type: "build", itemId: "shrine", reason: "priest building tribal shrine" };
    }
  }

  // Priest: perform ritual at shrine (only when well-fed)
  const isWellFed = (self.needs.hunger ?? 100) > 50 && (self.needs.thirst ?? 100) > 50;
  if (
    !isCrisis &&
    isWellFed &&
    !isChild &&
    snapshot.tribeShrinePosition &&
    snapshot.selfRole === "priest"
  ) {
    const shrineDist = manhattan(self.position, snapshot.tribeShrinePosition);
    if (shrineDist <= 2) {
      // At shrine → perform ritual (cooldown check via task)
      const lastRitualGoal = self.currentTask?.goal === "perform_ritual" ? self.currentTask.startedAtTick : 0;
      if (currentTick - lastRitualGoal >= RITUAL_COOLDOWN) {
        setTask(self, "perform_ritual", currentTick, snapshot.tribeShrinePosition);
        return { actorId, type: "perform_ritual", reason: "priest performing ritual at shrine" };
      }
    } else {
      // Walk toward shrine
      const step = stepToward(self.position, snapshot.tribeShrinePosition);
      return { actorId, type: "move", position: step, reason: `priest heading to shrine (dist=${shrineDist})` };
    }
  }

  // Non-priest: participate in ritual if priest is at shrine and we're nearby
  if (
    !isCrisis &&
    !isChild &&
    snapshot.tribeShrinePosition &&
    snapshot.tribePriestId &&
    snapshot.selfRole !== "priest"
  ) {
    const shrineDist = manhattan(self.position, snapshot.tribeShrinePosition);
    // Only participate if reasonably close (within 5 tiles)
    if (shrineDist <= 3) {
      return { actorId, type: "participate_ritual", reason: "joining ritual at shrine" };
    } else if (shrineDist <= 8 && hungerPressure < 40 && thirstPressure < 40) {
      const step = stepToward(self.position, snapshot.tribeShrinePosition);
      return { actorId, type: "move", position: step, reason: `moving toward shrine for ritual (dist=${shrineDist})` };
    }
  }

  // ── Priority 3: Consume if pressure warrants it ───────────
  // Calculate build readiness — preserve berries when stockpiling for construction
  const berryCount = self.inventory["berry"] ?? 0;
  /** Minimum berry threshold to build. Matches fire_pit requiredItems. */
  const BUILD_BERRY_THRESHOLD = 2;
  const hasNoNearbyFirePit = snapshot.nearbyActiveStructures.every(
    (s) => s.type !== "fire_pit"
  );
  // Skill-aware build eligibility (MVP-02-D):
  // Can build if: has fire_making skill, OR no one in sight has it (first invention candidate)
  const hasFireMakingSkill = (snapshot.selfSkills["fire_making"] ?? 0) > 0;
  const canBuild = hasFireMakingSkill || snapshot.nearbySkilled.every(
    (ns) => (ns.skills["fire_making"] ?? 0) === 0
  );
  // Stockpile mode: agent is trying to accumulate berries for building
  const wantsToBuild = canBuild && hasNoNearbyFirePit && berryCount < BUILD_BERRY_THRESHOLD;
  // Already has enough berries to build
  const readyToBuild = canBuild && hasNoNearbyFirePit && berryCount >= BUILD_BERRY_THRESHOLD;

  if (thirstPressure > hungerPressure && hasWater) {
    return { actorId, type: "drink", reason: "thirst pressure higher, have water" };
  }
  // Eat berry: but skip if we're stockpiling AND hunger isn't too urgent
  if (hungerPressure > thirstPressure && hasBerry) {
    if (!wantsToBuild || hungerPressure > 50) {
      if (!readyToBuild) {
        return { actorId, type: "eat", reason: "hunger pressure higher, have berry" };
      }
    }
  }
  if (thirstPressure > 0 && hasWater) {
    return { actorId, type: "drink", reason: "some thirst, have water" };
  }
  if (hungerPressure > 0 && hasBerry) {
    if (!wantsToBuild || hungerPressure > 50) {
      if (!readyToBuild) {
        return { actorId, type: "eat", reason: "some hunger, have berry" };
      }
    }
  }

  // ── Priority 3.5: Build fire pit if conditions met ────────
  if (readyToBuild && hungerPressure <= 60 && thirstPressure <= 60) {
    clearTask(self);
    return { actorId, type: "build", itemId: "fire_pit", reason: hasFireMakingSkill ? "skilled builder, building fire pit" : "first invention attempt" };
  }
  // If we were trying to build but pressure got too high, fall back to eating
  if (hungerPressure > 0 && hasBerry && (!wantsToBuild || hungerPressure > 50)) {
    return { actorId, type: "eat", reason: "stockpile abandoned, eating berry" };
  }

  // ── Priority 4: Seek resources ────────────────────────────
  // Search priority: visible → semantic → episodic → shared → cultural → explore
  const primaryNeed = thirstPressure >= hungerPressure ? "water" : "berry";
  const secondaryNeed = primaryNeed === "water" ? "berry" : "water";

  // 4a. Try visible resources first, then semantic memory (MVP-03-B), then episodic
  const action = seekResourceWithSemantic(
    self, actorId, nearbyResources, snapshot.semanticResourceLocations,
    memorizedResourcePositions, primaryNeed, currentTick
  );
  if (action) return action;

  const altAction = seekResourceWithSemantic(
    self, actorId, nearbyResources, snapshot.semanticResourceLocations,
    memorizedResourcePositions, secondaryNeed, currentTick
  );
  if (altAction) return altAction;

  // 4b. Try shared resource memory from nearby tribe members (MVP-02-E)
  if (snapshot.sharedResourcePositions.length > 0) {
    const shared = snapshot.sharedResourcePositions;
    const primaryShared = shared.filter((s) => s.resourceType === primaryNeed);
    const secondaryShared = shared.filter((s) => s.resourceType === secondaryNeed);
    const bestShared = primaryShared[0] ?? secondaryShared[0];
    if (bestShared) {
      setTask(self, `shared_${bestShared.resourceType}`, currentTick, bestShared.position);
      const step = stepToward(self.position, bestShared.position);
      return {
        actorId, type: "move",
        position: step,
        reason: `moving toward ${bestShared.resourceType} shared by ${bestShared.sharedBy}`,
      };
    }
  }

  // 4c. Try cultural memory (MVP-03-B) — tribe-level knowledge
  if (snapshot.culturalKnowledge.length > 0) {
    const primaryCultural = snapshot.culturalKnowledge.filter((c) => c.resourceType === primaryNeed);
    const secondaryCultural = snapshot.culturalKnowledge.filter((c) => c.resourceType === secondaryNeed);
    const bestCultural = primaryCultural[0] ?? secondaryCultural[0];
    if (bestCultural) {
      setTask(self, `cultural_${bestCultural.resourceType}`, currentTick, bestCultural.position);
      const step = stepToward(self.position, bestCultural.position);
      return {
        actorId, type: "move",
        position: step,
        reason: `moving toward ${bestCultural.resourceType} from tribal knowledge`,
      };
    }
  }

  // ── Priority 4.5: Social behavior (MVP-02-E) ──────────────
  // Return toward tribe gather point if far away
  /** Distance threshold: agent tries to return to gatherPoint when farther away. */
  const GATHER_DISTANCE_THRESHOLD = 5;
  if (snapshot.tribeGatherPoint) {
    const distToGather = manhattan(self.position, snapshot.tribeGatherPoint);
    if (distToGather > GATHER_DISTANCE_THRESHOLD) {
      const step = stepToward(self.position, snapshot.tribeGatherPoint);
      return {
        actorId, type: "move",
        position: step,
        reason: `returning to tribe gather point (dist=${distToGather})`,
      };
    }
  }

  // Follow nearest same-tribe member if visible
  const tribeNeighbors = snapshot.nearbyEntities.filter(
    (ne) => ne.tribeId === self.tribeId
  );
  if (tribeNeighbors.length > 0) {
    const nearest = tribeNeighbors.reduce((best, ne) => {
      const d = manhattan(self.position, ne.position);
      const bestD = manhattan(self.position, best.position);
      return d < bestD ? ne : best;
    });
    const dist = manhattan(self.position, nearest.position);
    if (dist > 2) {
      const step = stepToward(self.position, nearest.position);
      return {
        actorId, type: "move",
        position: step,
        reason: `following tribe member ${nearest.entityId}`,
      };
    }
  }

  // ── Priority 5: Wander (explore) ──────────────────────────
  clearTask(self);
  return { actorId, type: "idle", reason: "no resources visible or memorized, near tribe" };
}

// ── Helpers ─────────────────────────────────────────────────

function seekResource(
  self: EntityState,
  actorId: EntityId,
  nearbyResources: ResourceNodeState[],
  memorizedPositions: { resourceType: string; position: Vec2 }[],
  resourceType: string,
  currentTick: number
): ActionIntent | null {
  // 1. Check visible resources
  const nearest = findNearestOfType(self.position, nearbyResources, resourceType);

  if (nearest) {
    const dist = manhattan(self.position, nearest.position);
    if (dist <= 1) {
      // Adjacent → gather
      clearTask(self);
      return {
        actorId, type: "gather",
        targetId: nearest.id,
        reason: `adjacent to ${resourceType}, gathering`,
      };
    } else {
      // Move toward visible resource
      setTask(self, `seek_${resourceType}`, currentTick, nearest.position, nearest.id as string);
      const step = stepToward(self.position, nearest.position);
      return {
        actorId, type: "move",
        position: step,
        reason: `moving toward visible ${resourceType} at (${nearest.position.x},${nearest.position.y})`,
      };
    }
  }

  // 2. Use memory if no visible resources
  const memorized = memorizedPositions.filter((m) => m.resourceType === resourceType);
  if (memorized.length > 0) {
    // Go to nearest memorized position
    const closest = memorized.reduce((best, m) => {
      const d = manhattan(self.position, m.position);
      const bestD = manhattan(self.position, best.position);
      return d < bestD ? m : best;
    });

    setTask(self, `recall_${resourceType}`, currentTick, closest.position);
    const step = stepToward(self.position, closest.position);
    return {
      actorId, type: "move",
      position: step,
      reason: `moving toward memorized ${resourceType} at (${closest.position.x},${closest.position.y})`,
    };
  }

  return null;
}

/**
 * Enhanced resource seeking: visible → semantic → episodic (MVP-03-B).
 * Semantic memory positions are higher confidence than episodic recall.
 */
function seekResourceWithSemantic(
  self: EntityState,
  actorId: EntityId,
  nearbyResources: ResourceNodeState[],
  semanticPositions: { resourceType: string; position: Vec2; confidence: number }[],
  memorizedPositions: { resourceType: string; position: Vec2 }[],
  resourceType: string,
  currentTick: number
): ActionIntent | null {
  // 1. Check visible resources
  const nearest = findNearestOfType(self.position, nearbyResources, resourceType);

  if (nearest) {
    const dist = manhattan(self.position, nearest.position);
    if (dist <= 1) {
      clearTask(self);
      return {
        actorId, type: "gather",
        targetId: nearest.id,
        reason: `adjacent to ${resourceType}, gathering`,
      };
    } else {
      setTask(self, `seek_${resourceType}`, currentTick, nearest.position, nearest.id as string);
      const step = stepToward(self.position, nearest.position);
      return {
        actorId, type: "move",
        position: step,
        reason: `moving toward visible ${resourceType} at (${nearest.position.x},${nearest.position.y})`,
      };
    }
  }

  // 2. Use semantic memory (MVP-03-B) — higher confidence than episodic
  const semantic = semanticPositions.filter((s) => s.resourceType === resourceType);
  if (semantic.length > 0) {
    const closest = semantic.reduce((best, s) => {
      const d = manhattan(self.position, s.position);
      const bestD = manhattan(self.position, best.position);
      return d < bestD ? s : best;
    });
    setTask(self, `semantic_${resourceType}`, currentTick, closest.position);
    const step = stepToward(self.position, closest.position);
    return {
      actorId, type: "move",
      position: step,
      reason: `moving toward known ${resourceType} at (${closest.position.x},${closest.position.y}) [semantic]`,
    };
  }

  // 3. Fall back to episodic memory
  const memorized = memorizedPositions.filter((m) => m.resourceType === resourceType);
  if (memorized.length > 0) {
    const closest = memorized.reduce((best, m) => {
      const d = manhattan(self.position, m.position);
      const bestD = manhattan(self.position, best.position);
      return d < bestD ? m : best;
    });
    setTask(self, `recall_${resourceType}`, currentTick, closest.position);
    const step = stepToward(self.position, closest.position);
    return {
      actorId, type: "move",
      position: step,
      reason: `moving toward memorized ${resourceType} at (${closest.position.x},${closest.position.y})`,
    };
  }

  return null;
}

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
