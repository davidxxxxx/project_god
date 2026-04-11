import { ValidatedAction, WorldState, SimEvent, EntityState, manhattan } from "@project-god/shared";
import type { GenericGameEvent, ArbiterJudgment } from "@project-god/shared";
import { isArbitrableAction, deterministicFallback } from "@project-god/shared";
import { judgeAction, recordAttempt } from "@project-god/agent-runtime";
import type { ArbiterActionContext } from "@project-god/agent-runtime";
import type { ResourceDef, NeedDef, StructureDef, SkillDef, RecipeDef, TerrainDef } from "../content-types";
import { executeMove } from "./execute-move";
import { executeGather } from "./execute-gather";
import { executeConsume } from "./execute-consume";
import { executeDrop } from "./execute-drop";
import { executeBuild } from "./execute-build";
import { executePray } from "./execute-pray";
import { executeRitual } from "./execute-ritual";
import { executeHarvest } from "./execute-harvest";
import { executeCook } from "./execute-cook";
import { executeFuel } from "./execute-fuel";
import { executePlant } from "./execute-plant";
import { executeWade } from "./execute-wade";

export interface ExecutionContext {
  resources: Record<string, ResourceDef>;
  needs: Record<string, NeedDef>;
  structures?: Record<string, StructureDef>;
  skills?: Record<string, SkillDef>;
  faith?: import("../content-types").FaithDef;
  /** Recipe definitions for cooking. MVP-02X. */
  recipes?: Record<string, RecipeDef>;
  /** Terrain definitions for movement cost. MVP-02Y. */
  terrain?: Record<string, TerrainDef>;
}

export function executeAction(
  action: ValidatedAction,
  world: WorldState,
  ctx: ExecutionContext
): SimEvent[] {
  switch (action.intent.type) {
    case "idle":
      return [];
    case "move":
      return executeMove(action, world, ctx.terrain);
    case "gather":
      return executeGather(action, world, ctx.resources);
    case "eat":
    case "drink":
      return executeConsume(action, world, ctx.resources, ctx.needs);
    case "drop":
      return executeDrop(action, world);
    case "build":
      return executeBuild(action, world, ctx.structures ?? {}, ctx.skills);
    case "pray":
      return executePray(action, world, ctx.faith);
    case "perform_ritual":
    case "participate_ritual":
      return executeRitual(action, world, ctx);
    // MVP-02X: New actions
    case "harvest":
      return executeHarvest(world, action, ctx.resources);
    case "cook":
      return executeCook(world, action, ctx.recipes ?? {});
    case "add_fuel":
      return executeFuel(world, action);
    // MVP-02Y: Planting
    case "plant":
      return executePlant(action, world);
    // MVP-03: River crossing
    case "wade":
      return executeWade(action, world, ctx.terrain);

    // ── Phase 3: Social Actions ──────────────────────────────

    case "talk":
      return executeSocial(action, world, "talk", 0.05);
    case "teach":
      return executeTeach(action, world);
    case "comfort":
      return executeSocial(action, world, "comfort", 0.08);
    case "gift":
      return executeGift(action, world);
    case "trade":
      return executeTrade(action, world);

    // ── Phase 3: Production Actions ──────────────────────────

    case "craft":
      return executeCraft(action, world, ctx.recipes ?? {});
    case "fish":
      return executeFish(action, world);

    // ── Phase 3: Exploration Actions ─────────────────────────

    case "scout":
      return executeScout(action, world);

    // ── Phase 3: Creative Actions ────────────────────────────

    case "experiment":
      return executeExperiment(action, world);

    default:
      return [];
  }
}

// ── Phase 3 Execution Helpers ─────────────────────────────────

/** Social interaction: build trust with nearest entity. Phase 4 enhanced. */
function executeSocial(
  action: ValidatedAction,
  world: WorldState,
  socialType: string,
  trustGain: number,
): SimEvent[] {
  const actor = world.entities[action.intent.actorId] as EntityState;
  const events: SimEvent[] = [];

  const target = findNearestEntity(actor, world);
  if (!target) return events;

  // Update social memory for both parties (with enriched data)
  if (!actor.socialMemory) actor.socialMemory = {};
  if (!target.socialMemory) target.socialMemory = {};

  const actorMem = actor.socialMemory[target.id];
  const targetMem = target.socialMemory[actor.id];

  actor.socialMemory[target.id] = {
    entityId: target.id,
    trust: Math.min(1, (actorMem?.trust ?? 0) + trustGain),
    lastSeenTick: world.tick,
    lastSeenPosition: { ...target.position },
    relationship: actorMem?.relationship ?? deriveRelationship(actor, target),
    interactionCount: (actorMem?.interactionCount ?? 0) + 1,
    lastTopic: socialType,
  };
  target.socialMemory[actor.id] = {
    entityId: actor.id,
    trust: Math.min(1, (targetMem?.trust ?? 0) + trustGain * 0.5),
    lastSeenTick: world.tick,
    lastSeenPosition: { ...actor.position },
    relationship: targetMem?.relationship ?? deriveRelationship(target, actor),
    interactionCount: (targetMem?.interactionCount ?? 0) + 1,
    lastTopic: socialType,
  };

  // Comfort: calm the target's emotion
  if (socialType === "comfort" && target.emotion) {
    target.emotion = "content";
  }

  const evt: GenericGameEvent = {
    type: "SOCIAL_INTERACTION",
    tick: world.tick,
    entityId: actor.id,
    message: `${actor.name ?? actor.id} ${socialType}s with ${target.name ?? target.id} (trust +${trustGain})`,
    detail: socialType,
  };
  events.push(evt);

  return events;
}

/** Teach: actually transfer skill proficiency (3x faster than observation). */
function executeTeach(action: ValidatedAction, world: WorldState): SimEvent[] {
  const actor = world.entities[action.intent.actorId] as EntityState;
  const target = findNearestEntity(actor, world);
  if (!target) return [];

  const events: SimEvent[] = [];

  // Find teacher's best skill that student doesn't have or is worse at
  if (actor.skills) {
    let bestSkill: string | null = null;
    let bestGap = 0;
    for (const [skillId, prof] of Object.entries(actor.skills)) {
      if (prof <= 0) continue;
      const studentProf = target.skills?.[skillId] ?? 0;
      const gap = prof - studentProf;
      if (gap > bestGap) {
        bestGap = gap;
        bestSkill = skillId;
      }
    }

    if (bestSkill && bestGap > 0) {
      if (!target.skills) target.skills = {};
      // Transfer: student gains 0.15 proficiency per teach (vs ~0.05 from observation)
      const transferAmount = Math.min(0.15, bestGap);
      target.skills[bestSkill] = Math.min(1.0, (target.skills[bestSkill] ?? 0) + transferAmount);

      events.push({
        type: "SOCIAL_INTERACTION",
        tick: world.tick,
        entityId: actor.id,
        message: `${actor.name ?? actor.id} teaches ${bestSkill} to ${target.name ?? target.id} (+${transferAmount.toFixed(2)})`,
        detail: "teach",
      } as GenericGameEvent);
    }
  }

  // Also build trust (smaller than talk)
  if (!actor.socialMemory) actor.socialMemory = {};
  if (!target.socialMemory) target.socialMemory = {};
  const tg = 0.03;
  actor.socialMemory[target.id] = {
    entityId: target.id,
    trust: Math.min(1, (actor.socialMemory[target.id]?.trust ?? 0) + tg),
    lastSeenTick: world.tick,
    lastSeenPosition: { ...target.position },
    interactionCount: (actor.socialMemory[target.id]?.interactionCount ?? 0) + 1,
    lastTopic: "teach",
  };
  target.socialMemory[actor.id] = {
    entityId: actor.id,
    trust: Math.min(1, (target.socialMemory[actor.id]?.trust ?? 0) + tg * 2), // student trusts teacher more
    lastSeenTick: world.tick,
    lastSeenPosition: { ...actor.position },
    interactionCount: (target.socialMemory[actor.id]?.interactionCount ?? 0) + 1,
    lastTopic: "teach",
  };

  return events;
}

/** Gift: transfer first item type from actor to nearest entity. */
function executeGift(action: ValidatedAction, world: WorldState): SimEvent[] {
  const actor = world.entities[action.intent.actorId] as EntityState;
  const target = findNearestEntity(actor, world);
  if (!target) return [];

  // Find first item to give
  const [itemType] = Object.entries(actor.inventory).find(([_, v]) => v > 0) ?? [];
  if (!itemType) return [];

  const giveQty = Math.min(actor.inventory[itemType], 2); // Give up to 2
  actor.inventory[itemType] -= giveQty;
  target.inventory[itemType] = (target.inventory[itemType] ?? 0) + giveQty;

  // Large trust boost
  if (!actor.socialMemory) actor.socialMemory = {};
  if (!target.socialMemory) target.socialMemory = {};
  actor.socialMemory[target.id] = {
    entityId: target.id,
    trust: Math.min(1, (actor.socialMemory[target.id]?.trust ?? 0) + 0.1),
    lastSeenTick: world.tick,
    lastSeenPosition: { ...target.position },
  };
  target.socialMemory[actor.id] = {
    entityId: actor.id,
    trust: Math.min(1, (target.socialMemory[actor.id]?.trust ?? 0) + 0.15),
    lastSeenTick: world.tick,
    lastSeenPosition: { ...actor.position },
  };

  const evt: GenericGameEvent = {
    type: "ITEM_GIFTED",
    tick: world.tick,
    entityId: actor.id,
    message: `${actor.name ?? actor.id} gifts ${giveQty}x ${itemType} to ${target.name ?? target.id}`,
  };
  return [evt];
}

/** Trade: needs-based smart exchange. Phase 4 enhanced. */
function executeTrade(action: ValidatedAction, world: WorldState): SimEvent[] {
  const actor = world.entities[action.intent.actorId] as EntityState;
  const target = findNearestEntity(actor, world);
  if (!target) return [];

  // Determine what each party needs most
  const actorNeedFood = actor.needs.hunger < 50;
  const actorNeedDrink = actor.needs.thirst < 50;
  const targetNeedFood = target.needs.hunger < 50;
  const targetNeedDrink = target.needs.thirst < 50;

  // Actor offers what target needs; target offers what actor needs
  let actorGiveItem: string | null = null;
  let targetGiveItem: string | null = null;

  // Find what actor can give that target needs
  if (targetNeedFood) {
    const food = Object.entries(actor.inventory).find(([k, v]) => v > 0 && ["berry", "roast_berry", "fish", "cooked_fish", "meat", "cooked_meat"].includes(k));
    if (food) actorGiveItem = food[0];
  } else if (targetNeedDrink) {
    const drink = Object.entries(actor.inventory).find(([k, v]) => v > 0 && ["water", "boiled_water"].includes(k));
    if (drink) actorGiveItem = drink[0];
  }
  if (!actorGiveItem) {
    // Fall back to most abundant
    const entry = Object.entries(actor.inventory).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    if (entry) actorGiveItem = entry[0];
  }

  // Find what target can give that actor needs
  if (actorNeedFood) {
    const food = Object.entries(target.inventory).find(([k, v]) => v > 0 && ["berry", "roast_berry", "fish", "cooked_fish", "meat", "cooked_meat"].includes(k));
    if (food) targetGiveItem = food[0];
  } else if (actorNeedDrink) {
    const drink = Object.entries(target.inventory).find(([k, v]) => v > 0 && ["water", "boiled_water"].includes(k));
    if (drink) targetGiveItem = drink[0];
  }
  if (!targetGiveItem) {
    const entry = Object.entries(target.inventory).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
    if (entry) targetGiveItem = entry[0];
  }

  if (!actorGiveItem || !targetGiveItem) return [];

  // Execute swap
  actor.inventory[actorGiveItem]--;
  target.inventory[actorGiveItem] = (target.inventory[actorGiveItem] ?? 0) + 1;
  target.inventory[targetGiveItem]--;
  actor.inventory[targetGiveItem] = (actor.inventory[targetGiveItem] ?? 0) + 1;

  // Trust change: fair trade (different items) = +trust, same item swap = neutral
  const trustDelta = actorGiveItem !== targetGiveItem ? 0.06 : 0.02;
  if (!actor.socialMemory) actor.socialMemory = {};
  if (!target.socialMemory) target.socialMemory = {};
  actor.socialMemory[target.id] = {
    entityId: target.id,
    trust: Math.min(1, (actor.socialMemory[target.id]?.trust ?? 0) + trustDelta),
    lastSeenTick: world.tick,
    lastSeenPosition: { ...target.position },
    interactionCount: (actor.socialMemory[target.id]?.interactionCount ?? 0) + 1,
    lastTopic: "trade",
  };
  target.socialMemory[actor.id] = {
    entityId: actor.id,
    trust: Math.min(1, (target.socialMemory[actor.id]?.trust ?? 0) + trustDelta),
    lastSeenTick: world.tick,
    lastSeenPosition: { ...actor.position },
    interactionCount: (target.socialMemory[actor.id]?.interactionCount ?? 0) + 1,
    lastTopic: "trade",
  };

  const evt: GenericGameEvent = {
    type: "TRADE_COMPLETED",
    tick: world.tick,
    entityId: actor.id,
    message: `${actor.name ?? actor.id} trades ${actorGiveItem} for ${targetGiveItem} with ${target.name ?? target.id}`,
  };
  return [evt];
}

/** Craft: arbiter-judged crafting with success/failure. Phase 5 enhanced. */
function executeCraft(
  action: ValidatedAction,
  world: WorldState,
  recipes: Record<string, RecipeDef>,
): SimEvent[] {
  const recipeId = action.intent.recipeId;
  if (!recipeId) return [];
  const recipe = recipes[recipeId];
  if (!recipe) return [];

  const actor = world.entities[action.intent.actorId] as EntityState;
  const events: SimEvent[] = [];

  // Get arbiter judgment
  const ctx: ArbiterActionContext = {
    recipeId,
    inventory: { ...actor.inventory },
    timeOfDay: world.environment?.timeOfDay,
    isCold: world.environment ? world.environment.temperature < 40 : false,
  };
  const judgment = judgeAction(actor, "craft", ctx, world.tick);

  // Always consume inputs (you tried)
  for (const [item, qty] of Object.entries(recipe.inputs)) {
    actor.inventory[item] = (actor.inventory[item] ?? 0) - qty;
  }

  if (judgment.success) {
    // Produce outputs (possibly scaled by quality)
    for (const [item, qty] of Object.entries(recipe.outputs)) {
      const finalQty = Math.max(1, Math.round(qty * judgment.qualityModifier));
      actor.inventory[item] = (actor.inventory[item] ?? 0) + finalQty;
    }
  }

  // Record attempt + skill gain
  recordAttempt(actor, "craft", judgment.success);
  applySkillGain(actor, "tool_making", judgment.skillGain);
  actor.lastArbiterJudgment = judgment;

  // Store judgment narrative in episodic memory
  storeJudgmentMemory(actor, judgment, world.tick);

  events.push({
    type: "ITEM_CRAFTED",
    tick: world.tick,
    entityId: actor.id,
    message: judgment.success
      ? `${actor.name ?? actor.id} crafts ${recipeId} (${Math.round(judgment.successChance * 100)}% chance)`
      : `${actor.name ?? actor.id} fails to craft ${recipeId} — ${judgment.outcome}`,
    detail: judgment.narrative,
  } as GenericGameEvent);

  return events;
}

/** Fish: arbiter-judged fishing with variable yield. Phase 5 enhanced. */
function executeFish(action: ValidatedAction, world: WorldState): SimEvent[] {
  const actor = world.entities[action.intent.actorId] as EntityState;
  const events: SimEvent[] = [];

  const ctx: ArbiterActionContext = {
    inventory: { ...actor.inventory },
    timeOfDay: world.environment?.timeOfDay,
    isCold: world.environment ? world.environment.temperature < 40 : false,
    terrain: "river",
  };
  const judgment = judgeAction(actor, "fish", ctx, world.tick);

  if (judgment.success) {
    const qty = Math.max(1, Math.round(1 * judgment.qualityModifier));
    actor.inventory["fish"] = (actor.inventory["fish"] ?? 0) + qty;
  }

  recordAttempt(actor, "fish", judgment.success);
  applySkillGain(actor, "fishing", judgment.skillGain);
  actor.lastArbiterJudgment = judgment;
  storeJudgmentMemory(actor, judgment, world.tick);

  events.push({
    type: "ITEM_CRAFTED",
    tick: world.tick,
    entityId: actor.id,
    message: judgment.success
      ? `${actor.name ?? actor.id} catches a fish! — ${judgment.outcome}`
      : `${actor.name ?? actor.id} fails to catch anything — ${judgment.outcome}`,
    detail: judgment.narrative,
  } as GenericGameEvent);

  return events;
}

/** Scout: emit scouting event (perception extension handled by agent snapshot). */
function executeScout(action: ValidatedAction, world: WorldState): SimEvent[] {
  const actor = world.entities[action.intent.actorId] as EntityState;
  const evt: GenericGameEvent = {
    type: "AREA_SCOUTED",
    tick: world.tick,
    entityId: actor.id,
    message: `${actor.name ?? actor.id} scouts the area`,
  };
  return [evt];
}

/** Experiment: arbiter-judged with recipe discovery potential. Phase 5 enhanced. */
function executeExperiment(action: ValidatedAction, world: WorldState): SimEvent[] {
  const actor = world.entities[action.intent.actorId] as EntityState;
  const events: SimEvent[] = [];

  // Find undiscovered recipes for context
  const knownRecipes = Object.keys(actor.knownRecipes ?? {});
  const allRecipeIds = ["roast_berry", "boiled_water", "cooked_fish", "cooked_meat", "smoked_meat", "dried_berry", "stone_knife", "clay_pot"];
  const undiscovered = allRecipeIds.filter((r) => !knownRecipes.includes(r));

  const ctx: ArbiterActionContext = {
    inventory: { ...actor.inventory },
    timeOfDay: world.environment?.timeOfDay,
    isCold: world.environment ? world.environment.temperature < 40 : false,
    undiscoveredRecipes: undiscovered,
  };
  const judgment = judgeAction(actor, "experiment", ctx, world.tick);

  // Check for recipe discovery
  if (judgment.success && judgment.discoveryId && undiscovered.includes(judgment.discoveryId)) {
    if (!actor.knownRecipes) actor.knownRecipes = {};
    actor.knownRecipes[judgment.discoveryId] = 0;

    events.push({
      type: "EXPERIMENT_ATTEMPTED",
      tick: world.tick,
      entityId: actor.id,
      message: `${actor.name ?? actor.id} discovers recipe: ${judgment.discoveryId}!`,
      detail: judgment.narrative,
    } as GenericGameEvent);
  } else {
    events.push({
      type: "EXPERIMENT_ATTEMPTED",
      tick: world.tick,
      entityId: actor.id,
      message: judgment.success
        ? `${actor.name ?? actor.id} experiments and learns something — ${judgment.outcome}`
        : `${actor.name ?? actor.id} experiments but nothing comes of it — ${judgment.outcome}`,
      detail: judgment.narrative,
    } as GenericGameEvent);
  }

  recordAttempt(actor, "experiment", judgment.success);
  applySkillGain(actor, "cooking", judgment.skillGain * 0.5);
  applySkillGain(actor, "tool_making", judgment.skillGain * 0.5);
  actor.lastArbiterJudgment = judgment;
  storeJudgmentMemory(actor, judgment, world.tick);

  return events;
}

/** Find the nearest alive entity to the actor (within range 2). */
function findNearestEntity(actor: EntityState, world: WorldState): EntityState | undefined {
  let best: EntityState | undefined;
  let bestDist = Infinity;
  for (const e of Object.values(world.entities) as EntityState[]) {
    if (e.id === actor.id || !e.alive) continue;
    const d = manhattan(actor.position, e.position);
    if (d <= 2 && d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

/** Derive the relationship type between two entities from their state. Phase 4. */
function deriveRelationship(
  from: EntityState,
  to: EntityState,
): "kin" | "spouse" | "friend" | "rival" | "stranger" {
  if (from.spouseId === to.id) return "spouse";
  if (from.parentIds?.includes(to.id as any) || to.parentIds?.includes(from.id as any)) return "kin";
  if (from.childIds?.includes(to.id)) return "kin";
  const trust = from.socialMemory?.[to.id]?.trust ?? 0;
  if (trust > 0.5) return "friend";
  if (trust < -0.3) return "rival";
  return "stranger";
}

// ── Phase 5: Arbiter Helpers ──────────────────────────────────

/** Apply skill proficiency gain from an arbiter judgment. */
function applySkillGain(entity: EntityState, skillId: string, amount: number): void {
  if (amount <= 0) return;
  if (!entity.skills) entity.skills = {};
  entity.skills[skillId] = Math.min(1.0, (entity.skills[skillId] ?? 0) + amount);
}

/** Store arbiter judgment as an episodic memory entry. */
function storeJudgmentMemory(
  entity: EntityState,
  judgment: ArbiterJudgment,
  tick: number,
): void {
  if (!entity.episodicMemory) entity.episodicMemory = [];

  entity.episodicMemory.push({
    tick,
    type: judgment.success ? "action_success" : "action_failure",
    detail: `${judgment.actionType}: ${judgment.lessonLearned}`,
    position: { ...entity.position },
  } as any);

  // Cap memory
  const MAX_EPISODIC = 20;
  if (entity.episodicMemory.length > MAX_EPISODIC) {
    entity.episodicMemory = entity.episodicMemory.slice(-MAX_EPISODIC);
  }
}
