/**
 * memory-aware-policy.ts — Upgraded survival policy with memory integration.
 *
 * MVP-02X extension:
 *   - Harvest materials (wood, stone, grass) for building
 *   - Cook food at fire pit (roast_berry doubles nutrition)
 *   - Add fuel (wood) to keep fire pits alive
 *   - Dusk shelter-seeking behavior
 *   - Build with material costs (stone+wood for fire_pit, wood+grass for lean_to)
 *
 * Decision priority (highest → lowest):
 *   0. Child follows parent
 *   1. Critical consume (thirst/hunger ≤ threshold, have items)
 *   2. Inventory full → consume to free space
 *   2.5. Exposure crisis → seek/build shelter
 *   2.6. DUSK SHELTER SEEKING (MVP-02X) — at dusk, go to hut > lean_to > fire_pit
 *   2.7. MAINTAIN FIRE (MVP-02Z) — refuel low fire pit, higher priority than building new
 *   2.8. Prayer in crisis
 *   2.9. Shrine / ritual
 *   3. Consume if pressure warrants
 *   3.2. COOK at fire pit if have raw food + near fire (MVP-02X)
 *   3.5. Build structures (with material costs)
 *   3.8. PREPARE BUILD MATERIALS (MVP-02Z) — gather wood/stone/grass for planned build
 *   4. Seek food/water resources (gather berry/water)
 *   4.2. HARVEST materials when under-stocked (MVP-02X)
 *   4.5. Social behavior + tribe gather point
 *   5. Wander / idle
 */

import {
  ActionIntent, EntityId, ResourceNodeId,
  EntityState, ResourceNodeState, StructureState, Vec2,
  manhattan,
} from "@project-god/shared";
import type { AgentSnapshot } from "../perception";
import { setTask, clearTask, isTaskStale } from "../memory";

export interface NeedConfig {
  max: number;
  criticalThreshold: number;
}

// ── Material inventory helpers ──────────────────────────────

/** Count total food items (berry + roast_berry + dry_berry). */
function foodCount(inv: Record<string, number>): number {
  return (inv["berry"] ?? 0) + (inv["roast_berry"] ?? 0) + (inv["dry_berry"] ?? 0);
}

/** Count total drink items (water + boiled_water). */
function drinkCount(inv: Record<string, number>): number {
  return (inv["water"] ?? 0) + (inv["boiled_water"] ?? 0);
}

/** Check if entity has enough materials to build a structure. */
function hasMaterialsFor(inv: Record<string, number>, structure: string): boolean {
  const req = BUILD_REQUIREMENTS[structure];
  if (!req) return false;
  return Object.entries(req).every(([mat, needed]) => (inv[mat] ?? 0) >= needed);
}

/** Structure material requirements. Shared between hasMaterialsFor and mostNeededMaterial. */
const BUILD_REQUIREMENTS: Record<string, Record<string, number>> = {
  fire_pit: { stone: 2, wood: 1 },
  lean_to: { wood: 3, grass: 2 },
  hut: { wood: 6, grass: 3, stone: 2 },
  shrine: { stone: 4, wood: 2 },
};

/** What material does the entity need most for a given structure? */
function mostNeededMaterial(inv: Record<string, number>, structure: string): string | null {
  const req = BUILD_REQUIREMENTS[structure];
  if (!req) return null;

  let bestMat: string | null = null;
  let bestDeficit = 0;
  for (const [mat, needed] of Object.entries(req)) {
    const have = inv[mat] ?? 0;
    const deficit = needed - have;
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestMat = mat;
    }
  }
  return bestMat;
}

// ── MVP-02Z: Food safety stock — configurable thresholds ─────

/**
 * Minimum food items before an agent considers non-survival activities.
 * Agent won't enter builder prep if food stock is below this.
 */
const FOOD_SAFETY_STOCK = 4;
/** Higher safety stock when agent has children to feed. */
const FAMILY_FOOD_SAFETY_STOCK = 6;
/** Hunger level at which builder prep is immediately abandoned. */
const BUILDER_HUNGER_ABORT = 35;

// ── MVP-02Y: Module-level terrain context for stepToward ────
// Set at the start of each memoryAwarePolicy call, read by stepToward.
// This avoids passing terrain data through all 17 call sites.
let _worldTiles: Record<string, { terrain: string }> | undefined;
let _terrainDefs: Record<string, { moveCostMultiplier: number; passable: boolean }> | undefined;

// ── Main policy ─────────────────────────────────────────────

export function memoryAwarePolicy(
  snapshot: AgentSnapshot,
  needsConfig: Record<string, NeedConfig>,
  currentTick: number
): ActionIntent {
  // MVP-02Y: Set terrain context for stepToward calls
  _worldTiles = snapshot.worldTiles;
  _terrainDefs = snapshot.terrainDefs;

  const { self, nearbyResources, memorizedResourcePositions, inventoryRemaining } = snapshot;
  const actorId = self.id;

  const hungerCfg = needsConfig["hunger"] ?? { max: 100, criticalThreshold: 25 };
  const thirstCfg = needsConfig["thirst"] ?? { max: 100, criticalThreshold: 25 };

  const hungerPressure = hungerCfg.max - (self.needs.hunger ?? hungerCfg.max);
  const thirstPressure = thirstCfg.max - (self.needs.thirst ?? thirstCfg.max);

  const hasFood = foodCount(self.inventory) > 0;
  const hasDrink = drinkCount(self.inventory) > 0;
  const hasBerry = (self.inventory["berry"] ?? 0) > 0;
  const hasWater = (self.inventory["water"] ?? 0) > 0;
  const hasRoastBerry = (self.inventory["roast_berry"] ?? 0) > 0;
  const hasBoiledWater = (self.inventory["boiled_water"] ?? 0) > 0;
  const hasWood = (self.inventory["wood"] ?? 0) > 0;

  // ── Priority 0: Child follows parent (MVP-04) ──────────────
  const isChild = self.statuses?.includes("child") ?? false;
  if (isChild && self.parentIds && self.parentIds.length > 0) {
    const parentId = self.parentIds.find((pid) => {
      return snapshot.nearbyEntities.find((e) => e.entityId === pid) !== undefined;
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
  if (self.needs.thirst <= thirstCfg.criticalThreshold && hasDrink) {
    clearTask(self);
    return { actorId, type: "drink", reason: "thirst critical, have drink" };
  }
  if (self.needs.hunger <= hungerCfg.criticalThreshold && hasFood) {
    clearTask(self);
    return { actorId, type: "eat", reason: "hunger critical, have food" };
  }

  // ── Priority 2: Consume if inventory full ─────────────────
  if (inventoryRemaining <= 0) {
    if (thirstPressure > hungerPressure && hasDrink) {
      return { actorId, type: "drink", reason: "inventory full, drinking to free space" };
    }
    if (hasFood) {
      return { actorId, type: "eat", reason: "inventory full, eating to free space" };
    }
    if (hasDrink) {
      return { actorId, type: "drink", reason: "inventory full, drinking to free space" };
    }
  }

  // ── Priority 2.5: Exposure crisis (MVP-03-A) ──────────────
  const exposureCfg = needsConfig["exposure"] ?? { max: 100, criticalThreshold: 30 };
  const currentExposure = self.needs.exposure ?? exposureCfg.max;
  const hasSheltered = self.statuses?.includes("sheltered") ?? false;
  const hasHome = self.statuses?.includes("home") ?? false;
  const hasWarming = self.statuses?.includes("warming") ?? false;

  if (snapshot.isCold && currentExposure <= exposureCfg.criticalThreshold && !hasSheltered && !hasHome) {
    // Seek nearest shelter: hut > lean_to > fire_pit
    const shelterAction = seekShelter(self, actorId, snapshot, "exposure critical");
    if (shelterAction) return shelterAction;

    // Build lean_to if we have materials
    if (hasMaterialsFor(self.inventory, "lean_to")) {
      clearTask(self);
      return { actorId, type: "build", itemId: "lean_to", reason: "building shelter (exposure critical, have materials)" };
    }
  }

  // ── Lookup nearest fire pit (shared across priorities 2.7, 3.2) ──
  const nearbyFire = snapshot.nearbyActiveStructures
    .filter((s) => s.type === "fire_pit")
    .sort((a, b) => manhattan(self.position, a.position) - manhattan(self.position, b.position))[0];

  // ── Priority 2.6: DUSK SHELTER SEEKING (MVP-02X) ──────────
  if (snapshot.timeOfDay === "dusk" && !hasSheltered && !hasHome) {
    // At dusk, agents should head to shelter before night
    const shelterAction = seekShelter(self, actorId, snapshot, "dusk approaching, seeking shelter");
    if (shelterAction) return shelterAction;
  }

  // ── Priority 2.7: MAINTAIN FIRE (MVP-02Z) ─────────────────
  // Refuel an existing fire pit before it dies. Higher priority than building new.
  // Triggered when: nearby fire is low, agent has wood or can quickly get it,
  // and it's cold/dusk/night.
  const FIRE_LOW_DURABILITY = 50;
  if (
    nearbyFire &&
    nearbyFire.durability <= FIRE_LOW_DURABILITY &&
    !isChild &&
    (snapshot.isCold || snapshot.timeOfDay === "dusk" || snapshot.timeOfDay === "night")
  ) {
    const fireDist = manhattan(self.position, nearbyFire.position);
    if (fireDist <= 1 && hasWood) {
      // Adjacent + have wood → refuel immediately
      return { actorId, type: "add_fuel", reason: `[maintain-fire] refueling fire (dur=${nearbyFire.durability})` };
    }
    if (fireDist <= 1 && !hasWood) {
      // Adjacent but no wood → go get wood first
      const woodAction = seekAndHarvestMaterial(
        self, actorId, nearbyResources, memorizedResourcePositions,
        snapshot.semanticResourceLocations, "wood", currentTick
      );
      if (woodAction) {
        return { ...woodAction, reason: `[maintain-fire] getting wood for fire: ${woodAction.reason}` };
      }
    }
    if (fireDist > 1 && fireDist <= 6) {
      // Not adjacent → walk to fire
      const step = stepToward(self.position, nearbyFire.position);
      return { actorId, type: "move", position: step, reason: `[maintain-fire] heading to fire (dur=${nearbyFire.durability}, dist=${fireDist})` };
    }
  }

  // ── Priority 2.8: Prayer when in crisis (MVP-05) ──────────
  const faith = self.attributes?.faith ?? 0;
  const MIN_PRAYER_FAITH = 8; // MVP-02Z: raised from 5→8, don't burn last faith
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
    clearTask(self);
    return { actorId, type: "pray", reason: `praying (faith:${faith}, crisis)` };
  }

  // ── Priority 2.9: Shrine / Ritual (MVP-07A) ───────────────
  const RITUAL_COOLDOWN = 30;
  const isWellFed = (self.needs.hunger ?? 100) > 50 && (self.needs.thirst ?? 100) > 50;

  // Priest: build shrine if tribe doesn't have one
  if (
    !isCrisis &&
    !isChild &&
    snapshot.selfRole === "priest" &&
    !snapshot.tribeShrinePosition
  ) {
    if (hasMaterialsFor(self.inventory, "shrine")) {
      clearTask(self);
      return { actorId, type: "build", itemId: "shrine", reason: "priest building tribal shrine" };
    }
  }

  // Priest: perform ritual at shrine
  if (
    !isCrisis &&
    isWellFed &&
    !isChild &&
    snapshot.tribeShrinePosition &&
    snapshot.selfRole === "priest"
  ) {
    const shrineDist = manhattan(self.position, snapshot.tribeShrinePosition);
    if (shrineDist <= 2) {
      const lastRitualGoal = self.currentTask?.goal === "perform_ritual" ? self.currentTask.startedAtTick : 0;
      if (currentTick - lastRitualGoal >= RITUAL_COOLDOWN) {
        setTask(self, "perform_ritual", currentTick, snapshot.tribeShrinePosition);
        return { actorId, type: "perform_ritual", reason: "priest performing ritual at shrine" };
      }
    } else {
      const step = stepToward(self.position, snapshot.tribeShrinePosition);
      return { actorId, type: "move", position: step, reason: `priest heading to shrine (dist=${shrineDist})` };
    }
  }

  // Non-priest: participate in ritual
  if (
    !isCrisis &&
    !isChild &&
    snapshot.tribeShrinePosition &&
    snapshot.tribePriestId &&
    snapshot.selfRole !== "priest"
  ) {
    const shrineDist = manhattan(self.position, snapshot.tribeShrinePosition);
    if (shrineDist <= 3) {
      return { actorId, type: "participate_ritual", reason: "joining ritual at shrine" };
    } else if (shrineDist <= 8 && hungerPressure < 40 && thirstPressure < 40) {
      const step = stepToward(self.position, snapshot.tribeShrinePosition);
      return { actorId, type: "move", position: step, reason: `moving toward shrine for ritual (dist=${shrineDist})` };
    }
  }

  // ── Priority 3: Consume if pressure warrants ──────────────
  // Determine build target: what structure does this agent want to build?
  const buildTarget = decideBuildTarget(self, snapshot);

  if (thirstPressure > hungerPressure && hasDrink) {
    return { actorId, type: "drink", reason: "thirst pressure higher, have drink" };
  }
  if (hungerPressure > thirstPressure && hasFood) {
    // Don't eat if we're stockpiling AND hunger isn't urgent
    const isStockpiling = buildTarget && !hasMaterialsFor(self.inventory, buildTarget);
    if (!isStockpiling || hungerPressure > 50) {
      return { actorId, type: "eat", reason: "hunger pressure higher, have food" };
    }
  }
  if (thirstPressure > 0 && hasDrink) {
    return { actorId, type: "drink", reason: "some thirst, have drink" };
  }
  if (hungerPressure > 0 && hasFood) {
    const isStockpiling = buildTarget && !hasMaterialsFor(self.inventory, buildTarget);
    if (!isStockpiling || hungerPressure > 50) {
      return { actorId, type: "eat", reason: "some hunger, have food" };
    }
  }

  // ── Priority 3.2: COOK at fire pit (MVP-02X) ─────────────
  // nearbyFire already computed at priority 2.7 level
  const cookPreference = self.preferences?.["cook"] ?? 0;
  const knownRecipes = self.knownRecipes ?? {};

  if (nearbyFire && manhattan(self.position, nearbyFire.position) <= 1) {
    const hasCookingSkill = (snapshot.selfSkills["cooking"] ?? 0) > 0;

    // Cook roast_berry if known (via observation or skill) + have berry
    if (hasCookingSkill && hasBerry && (knownRecipes["roast_berry"] !== undefined || cookPreference > 0)) {
      return { actorId, type: "cook", recipeId: "roast_berry", reason: "cooking roast_berry at fire" };
    }
    // Cook dry_berry if known + have 2+ berry
    if (hasCookingSkill && (self.inventory["berry"] ?? 0) >= 2 && knownRecipes["dry_berry"] !== undefined) {
      return { actorId, type: "cook", recipeId: "dry_berry", reason: "drying berry for storage" };
    }
    // boiled_water: no skill needed, always available
    if (hasWater) {
      return { actorId, type: "cook", recipeId: "boiled_water", reason: "boiling water at fire" };
    }
  }

  // If high cook preference and have raw food, actively seek fire pit
  if (cookPreference > 0.2 && nearbyFire && manhattan(self.position, nearbyFire.position) > 1 && (hasBerry || hasWater)) {
    const step = stepToward(self.position, nearbyFire.position);
    return { actorId, type: "move", position: step, reason: "heading to fire to cook (preference)" };
  }

  // NOTE: ADD_FUEL moved to Priority 2.7 (maintain-fire). No more 3.3.

  // ── Priority 3.5: Build structures ────────────────────────
  if (buildTarget && hasMaterialsFor(self.inventory, buildTarget) && hungerPressure <= 60 && thirstPressure <= 60) {
    clearTask(self);
    const hasSkill = buildTarget === "fire_pit"
      ? (snapshot.selfSkills["fire_making"] ?? 0) > 0
      : true;
    const reason = hasSkill
      ? `building ${buildTarget} (have materials)`
      : `first ${buildTarget} invention attempt`;
    return { actorId, type: "build", itemId: buildTarget, reason };
  }

  // ── Priority 3.8: Prepare build materials (MVP-02Z) ────────
  // Agents with building skills gather wood/stone/grass specifically for building,
  // but only when food safety stock is met.
  if (buildTarget) {
    const neededMat = mostNeededMaterial(self.inventory, buildTarget);
    if (neededMat) {
      const hasAnyBuildSkill =
        (snapshot.selfSkills["fire_making"] ?? 0) > 0 ||
        (snapshot.selfSkills["shelter_building"] ?? 0) > 0;

      const currentHunger = self.needs.hunger ?? 100;
      const hasChildren = (self.childIds ?? []).length > 0;
      const safetyStock = hasChildren ? FAMILY_FOOD_SAFETY_STOCK : FOOD_SAFETY_STOCK;
      const hasFoodSafety = foodCount(self.inventory) >= safetyStock;
      const notStarving = currentHunger > BUILDER_HUNGER_ABORT;

      if (
        hasAnyBuildSkill &&
        hasFoodSafety &&
        notStarving &&
        hungerPressure <= 50 &&
        thirstPressure <= 50
      ) {
        const harvestAction = seekAndHarvestMaterial(
          self, actorId, nearbyResources, memorizedResourcePositions,
          snapshot.semanticResourceLocations, neededMat, currentTick
        );
        if (harvestAction) {
          // Annotate the reason with builder context
          return {
            ...harvestAction,
            reason: `[builder-prep] ${buildTarget} needs ${neededMat}: ${harvestAction.reason}`,
          };
        }
      }
    }
  }

  // If we were trying to stockpile but pressure is too high, eat
  if (hungerPressure > 0 && hasFood && hungerPressure > 50) {
    return { actorId, type: "eat", reason: "stockpile abandoned, eating" };
  }

  // ── Priority 4: Seek food/water resources ─────────────────
  const primaryNeed = thirstPressure >= hungerPressure ? "water" : "berry";
  const secondaryNeed = primaryNeed === "water" ? "berry" : "water";

  // 4a. Visible → semantic → episodic
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

  // ── Priority 4.2: HARVEST materials (MVP-02X) ──────────────
  // If building target needs materials, seek and harvest them
  if (buildTarget) {
    const neededMat = mostNeededMaterial(self.inventory, buildTarget);
    if (neededMat) {
      const harvestAction = seekAndHarvestMaterial(
        self, actorId, nearbyResources, memorizedResourcePositions,
        snapshot.semanticResourceLocations, neededMat, currentTick
      );
      if (harvestAction) return harvestAction;
    }
  }

  // Even without a build target, harvest some wood/stone/grass opportunistically
  // if within 3 tiles of a material node and inventory isn't full
  if (inventoryRemaining > 2) {
    const MATERIAL_TYPES = ["wood", "stone", "grass"];
    for (const mat of MATERIAL_TYPES) {
      const nearMat = findNearestOfType(self.position, nearbyResources, mat);
      if (nearMat && manhattan(self.position, nearMat.position) <= 3) {
        if (manhattan(self.position, nearMat.position) <= 1) {
          clearTask(self);
          return { actorId, type: "harvest", targetId: nearMat.id, reason: `harvesting nearby ${mat}` };
        } else {
          const step = stepToward(self.position, nearMat.position);
          return { actorId, type: "move", position: step, reason: `moving to harvest nearby ${mat}` };
        }
      }
    }
  }

  // 4b. Shared resource memory (MVP-02-E)
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

  // 4c. Cultural memory (MVP-03-B)
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

  // Follow nearest tribe member if visible
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

  // ── Priority 4.8: Plant berry bush (MVP-02Y) ────────────────
  const hasPlantingSkill = (snapshot.selfSkills["planting"] ?? 0) > 0;
  const hasBerryToPlant = (self.inventory["berry"] ?? 0) >= 2; // Keep 1 for eating
  const nearbyBerryNodes = snapshot.nearbyResources.filter(
    (r) => r.resourceType === "berry" && manhattan(self.position, r.position) <= 4
  );
  // Plant if: has skill, has spare berry, near home/camp, and few nearby berry sources
  if (hasPlantingSkill && hasBerryToPlant && nearbyBerryNodes.length < 2) {
    const isNearHome = self.campPosition
      ? manhattan(self.position, self.campPosition) <= 3
      : false;
    if (isNearHome) {
      return {
        actorId, type: "plant",
        reason: "planting berry bush near camp",
      };
    }
  }

  // ── Priority 5: Wander / idle ─────────────────────────────
  clearTask(self);
  return { actorId, type: "idle", reason: "no resources visible or memorized, near tribe" };
}

// ── Helper: Decide what to build ────────────────────────────

function decideBuildTarget(self: EntityState, snapshot: AgentSnapshot): string | null {
  const hasFireMakingSkill = (snapshot.selfSkills["fire_making"] ?? 0) > 0;
  const hasShelterSkill = (snapshot.selfSkills["shelter_building"] ?? 0) > 0;
  const hasNoNearbyFirePit = snapshot.nearbyActiveStructures.every((s) => s.type !== "fire_pit");
  const hasNoNearbyShelter = snapshot.nearbyActiveStructures.every(
    (s) => s.type !== "lean_to" && s.type !== "hut"
  );
  const hasNoNearbyShrine = snapshot.nearbyActiveStructures.every((s) => s.type !== "shrine");

  // ── MVP-02Z: Corrected build priority order ─────────────────
  // 1. Shelter first (survive the night)
  // 2. Fire pit second (warmth + cooking)
  // 3. Hut third (family home)
  // 4. Shrine last (late game)

  // 1. Night/cold/no shelter → lean_to (anyone can build)
  if (hasNoNearbyShelter) {
    const wantsShelter = snapshot.isCold
      || (self.preferences?.["shelter"] ?? 0) > 0.15
      || snapshot.timeOfDay === "dusk" || snapshot.timeOfDay === "night";
    if (wantsShelter) {
      // Prefer hut if has shelter_building skill and high preference
      if (hasShelterSkill && (self.preferences?.["hut"] ?? 0) > 0.2) return "hut";
      return "lean_to";
    }
  }

  // 2. No fire → fire_pit (requires fire_making skill)
  if (hasFireMakingSkill && hasNoNearbyFirePit) return "fire_pit";

  // 3. Hut upgrade: has shelter_building + high preference + no hut yet
  if (hasShelterSkill && (self.preferences?.["hut"] ?? 0) > 0.3
    && !snapshot.nearbyActiveStructures.some((s) => s.type === "hut")) {
    return "hut";
  }

  // 4. Shrine: requires faith >= 15 + priest role
  if (hasNoNearbyShrine && (self.attributes?.faith ?? 0) >= 15 && self.role === "priest") {
    return "shrine";
  }

  return null;
}

// ── Helper: Seek shelter ────────────────────────────────────

function seekShelter(
  self: EntityState,
  actorId: EntityId,
  snapshot: AgentSnapshot,
  reason: string
): ActionIntent | null {
  // Priority: hut > lean_to > fire_pit
  const shelters = snapshot.nearbyActiveStructures
    .filter((s) => s.type === "hut" || s.type === "lean_to" || s.type === "fire_pit")
    .sort((a, b) => {
      // Score: hut=0, lean_to=1, fire_pit=2 (lower = better)
      const typeScore = (s: StructureState) => s.type === "hut" ? 0 : s.type === "lean_to" ? 1 : 2;
      const scoreDiff = typeScore(a) - typeScore(b);
      if (scoreDiff !== 0) return scoreDiff;
      return manhattan(self.position, a.position) - manhattan(self.position, b.position);
    });

  const best = shelters[0];
  if (!best) return null;

  const dist = manhattan(self.position, best.position);
  if (dist <= 0) {
    // Already at shelter → idle (let structure-tick apply status)
    return null;
  }

  clearTask(self);
  const step = stepToward(self.position, best.position);
  return {
    actorId, type: "move",
    position: step,
    reason: `${reason} → ${best.type} at (${best.position.x},${best.position.y})`,
  };
}

// ── Helper: Seek and harvest material resources ─────────────

function seekAndHarvestMaterial(
  self: EntityState,
  actorId: EntityId,
  nearbyResources: ResourceNodeState[],
  memorizedPositions: { resourceType: string; position: Vec2 }[],
  semanticPositions: { resourceType: string; position: Vec2; confidence: number }[],
  materialType: string,
  currentTick: number
): ActionIntent | null {
  // 1. Visible material nodes
  const nearestMat = findNearestOfType(self.position, nearbyResources, materialType);

  if (nearestMat) {
    const dist = manhattan(self.position, nearestMat.position);
    if (dist <= 1) {
      clearTask(self);
      return {
        actorId, type: "harvest",
        targetId: nearestMat.id,
        reason: `harvesting ${materialType} for building`,
      };
    } else {
      setTask(self, `harvest_${materialType}`, currentTick, nearestMat.position, nearestMat.id as string);
      const step = stepToward(self.position, nearestMat.position);
      return {
        actorId, type: "move",
        position: step,
        reason: `moving to harvest ${materialType} at (${nearestMat.position.x},${nearestMat.position.y})`,
      };
    }
  }

  // 2. Semantic memory
  const semantic = semanticPositions.filter((s) => s.resourceType === materialType);
  if (semantic.length > 0) {
    const closest = semantic.reduce((best, s) => {
      const d = manhattan(self.position, s.position);
      const bestD = manhattan(self.position, best.position);
      return d < bestD ? s : best;
    });
    setTask(self, `semantic_${materialType}`, currentTick, closest.position);
    const step = stepToward(self.position, closest.position);
    return {
      actorId, type: "move",
      position: step,
      reason: `moving toward known ${materialType} at (${closest.position.x},${closest.position.y}) [semantic]`,
    };
  }

  // 3. Episodic memory
  const memorized = memorizedPositions.filter((m) => m.resourceType === materialType);
  if (memorized.length > 0) {
    const closest = memorized.reduce((best, m) => {
      const d = manhattan(self.position, m.position);
      const bestD = manhattan(self.position, best.position);
      return d < bestD ? m : best;
    });
    setTask(self, `recall_${materialType}`, currentTick, closest.position);
    const step = stepToward(self.position, closest.position);
    return {
      actorId, type: "move",
      position: step,
      reason: `moving toward memorized ${materialType} at (${closest.position.x},${closest.position.y})`,
    };
  }

  return null;
}

// ── Helper: Standard food/water seeking ─────────────────────

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

  // 2. Use semantic memory (MVP-03-B)
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

/**
 * Terrain-aware step toward a target.
 * Evaluates all 8 neighbors, filters out impassable tiles,
 * then picks the one that minimizes: manhattan(candidate, target) + terrainCostWeight.
 *
 * MVP-02Y: Uses module-level _worldTiles/_terrainDefs set by memoryAwarePolicy().
 * Falls back to simple sign-based step if no terrain data available.
 */
const TERRAIN_COST_WEIGHT = 1.5; // How much terrain cost matters vs distance

function stepToward(from: Vec2, to: Vec2): Vec2 {
  // Fast path: no terrain data, use simple step
  if (!_worldTiles || !_terrainDefs) {
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    if (dx === 0 && dy === 0) return from;
    return { x: from.x + dx, y: from.y + dy };
  }

  // Generate all 8 adjacent candidates
  const candidates: { pos: Vec2; score: number }[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const cx = from.x + dx;
      const cy = from.y + dy;
      const key = `${cx},${cy}`;
      const tile = _worldTiles[key];
      if (!tile) continue; // out of bounds

      const tDef = _terrainDefs[tile.terrain];
      if (!tDef || !tDef.passable) continue; // impassable

      const distToTarget = manhattan({ x: cx, y: cy }, to);
      const terrainPenalty = (tDef.moveCostMultiplier - 1) * TERRAIN_COST_WEIGHT;
      candidates.push({
        pos: { x: cx, y: cy },
        score: distToTarget + terrainPenalty,
      });
    }
  }

  if (candidates.length === 0) return from; // stuck

  // Pick lowest score
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0].pos;
}
