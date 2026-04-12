/**
 * tick.ts — The heart of the simulation.
 * Canonical tick order (from runtime-loop.md):
 *   1. advance tick
 *   2. decay needs
 *   3. check deaths
 *   4. regenerate resources
 *   5. validate intents
 *   6. execute validated actions
 *   7. collect and return TickResult
 */

import {
  WorldState,
  ActionIntent,
  SimEvent,
  ValidatedAction,
  RejectedAction,
  TimeTickedEvent,
  ActionRejectedEvent,
  TickResult,
  EntityState,
  StructureState,
} from "@project-god/shared";
import type { GenericGameEvent } from "@project-god/shared";
import { decayNeeds, checkDeaths } from "./systems/decay-needs";
import { tickStructures } from "./systems/structure-tick";
import { tickSkillLearning } from "./systems/skill-learning";
import { tickTribes } from "./systems/tribe-tick";
import { tickEnvironment } from "./systems/environment-tick";
import { tickLifecycle } from "./systems/lifecycle-tick";
import { tickFaith } from "./systems/faith-tick";
import { tickSpiritual } from "./systems/spiritual-tick";
import { tickDoctrine } from "./systems/doctrine-tick";
import { socialDynamicsTick } from "./systems/social-dynamics-tick";
import { diplomacyTick } from "./systems/diplomacy-tick";
import { faunaTick } from "./systems/fauna-tick";
import { computeFogOfWar } from "./systems/fog-of-war";
import { validateAction, type ValidationContext } from "./validate";
import { executeAction, type ExecutionContext } from "./execute";
import { recordActionResult } from "@project-god/agent-runtime";
import type { NeedDef, ResourceDef, ActionDef, TerrainDef, StructureDef, SkillDef, TechnologyDef, LifecycleDef, FaithDef, RecipeDef, FaunaDef } from "./content-types";

export interface TickContext {
  needs: Record<string, NeedDef>;
  resources: Record<string, ResourceDef>;
  actions: Record<string, ActionDef>;
  terrain: Record<string, TerrainDef>;
  /** Structure definitions for build/tick. Optional for backward compat. */
  structures?: Record<string, StructureDef>;
  /** Skill definitions for learning system. Optional for backward compat. */
  skills?: Record<string, SkillDef>;
  /** Technology definitions for tribe unlock. Optional for backward compat. */
  technologies?: Record<string, TechnologyDef>;
  /** Lifecycle definitions for aging/pairing/birth. Optional for backward compat. */
  lifecycle?: LifecycleDef;
  /** Faith/prayer/miracle definitions. Optional for backward compat. (MVP-05) */
  faith?: FaithDef;
  /** Recipe definitions for cooking/crafting. Optional for backward compat. (MVP-02X) */
  recipes?: Record<string, RecipeDef>;
  /** Fauna species definitions for ecology system. Optional. (P2) */
  fauna?: Record<string, FaunaDef>;
}

export function tickWorld(
  world: WorldState,
  intents: ActionIntent[],
  ctx: TickContext
): TickResult {
  const events: SimEvent[] = [];
  const accepted: ValidatedAction[] = [];
  const rejections: RejectedAction[] = [];

  // ── 1. Advance time ──────────────────────────────────────
  world.tick += 1;
  events.push({ type: "TIME_TICKED", tick: world.tick } as TimeTickedEvent);

  // ── 1.5. Update environment (temperature + day/night) ────
  events.push(...tickEnvironment(world));

  // ── 1.55. Deliver divine visions at night ──────────────────
  events.push(...deliverDivineVisions(world));

  // ── 1.6. Update lifecycle (aging + pairing + birth) ────
  if (ctx.lifecycle) {
    events.push(...tickLifecycle(world, ctx.lifecycle));
  }

  // ── 1.7. Update faith (prayer timeout + divine regen) ────
  if (ctx.faith) {
    const ticksPerYear = ctx.lifecycle?.TICKS_PER_YEAR ?? 40;
    events.push(...tickFaith(world, ctx.faith, ticksPerYear));
  }

  // ── 1.8. Update spiritual (priest assignment) ────────────
  events.push(...tickSpiritual(world));

  // ── 1.9. Update doctrines (formation + violation) ────────
  const ticksPerYearForDoctrine = ctx.lifecycle?.TICKS_PER_YEAR ?? 40;
  events.push(...tickDoctrine(world, events, ticksPerYearForDoctrine));

  // ── 2. Decay needs ───────────────────────────────────────
  events.push(...decayNeeds(world, ctx.needs));

  // ── 3. Check deaths ──────────────────────────────────────
  events.push(...checkDeaths(world, ctx.needs));

  // ── 4. Regenerate resource nodes (P1: seasonal multiplier) ──
  const seasonRegenMult = world.environment?.seasonRegenMultiplier ?? 1.0;
  for (const node of Object.values(world.resourceNodes)) {
    if (node.maxQuantity < 0) continue;
    if (node.quantity < node.maxQuantity) {
      const seasonalRegen = node.regenPerTick * seasonRegenMult;
      node.quantity = Math.min(node.maxQuantity, node.quantity + seasonalRegen);
    }
  }

  // ── 4.4. Food spoilage in inventory (P1) ──────────────────
  events.push(...tickFoodSpoilage(world, ctx.resources, ctx.structures));

  // ── 4.5. Tick structures (fuel decay + warming) ──────────
  if (ctx.structures) {
    events.push(...tickStructures(world, ctx.structures));
  }

  // ── 4.6. Tick skill learning (observation + tech unlock) ──
  if (ctx.skills) {
    events.push(...tickSkillLearning(world, {
      skills: ctx.skills,
      technologies: ctx.technologies ?? {},
      structures: ctx.structures,
      lifecycle: ctx.lifecycle,
    }));
  }

  // ── 4.7. Tick tribes (member cleanup + gatherPoint) ──────
  events.push(...tickTribes(world));

  // ── 4.8. Social dynamics (leader + tension + split) ──────
  events.push(...socialDynamicsTick(world));

  // ── 4.9. Cross-tribe diplomacy (encounters + territory) ──
  events.push(...diplomacyTick(world));

  // ── 4.10. Fauna tick (animal AI + spawn + combat + breed) ──
  if (ctx.fauna) {
    events.push(...faunaTick(world, ctx.fauna));
  }

  // ── 5+6. Validate and execute ────────────────────────────
  const valCtx: ValidationContext = { actions: ctx.actions, terrain: ctx.terrain, structures: ctx.structures, skills: ctx.skills, faith: ctx.faith, resources: ctx.resources, recipes: ctx.recipes };
  const exeCtx: ExecutionContext = { resources: ctx.resources, needs: ctx.needs, structures: ctx.structures, skills: ctx.skills, faith: ctx.faith, recipes: ctx.recipes, terrain: ctx.terrain, fauna: ctx.fauna };

  for (const intent of intents) {
    const outcome = validateAction(intent, world, valCtx);

    if (outcome.kind === "rejected") {
      rejections.push(outcome);
      events.push({
        type: "ACTION_REJECTED",
        tick: world.tick,
        entityId: intent.actorId,
        intent,
        reason: outcome.reason,
      } as ActionRejectedEvent);
      // Feed rejection back to LLM for learning
      recordActionResult(intent.actorId, intent.type, `rejected: ${outcome.reason}`);
    } else {
      accepted.push(outcome);
      const actionEvents = executeAction(outcome, world, exeCtx);
      events.push(...actionEvents);
      // Feed success back to LLM for learning
      recordActionResult(intent.actorId, intent.type, "success");
    }
  }
  // ── 7. Compute fog of war ─────────────────────────────────
  const fogState = computeFogOfWar(world);

  return { world, events, accepted, rejections, fogState };
}

// ── SIMA-2: Divine Vision Delivery System ─────────────────────

/** Per-entity cooldown: 100 ticks between visions. */
const DIVINE_VISION_COOLDOWN = 100;

/**
 * Deliver divine visions from the queue to agents during night.
 * Visions are queued by the player via the Oracle form and delivered
 * during the night cycle so agents process them in their next cognitive cycle.
 */
function deliverDivineVisions(world: WorldState): SimEvent[] {
  const events: SimEvent[] = [];
  const queue = world.divineVisionQueue;
  if (!queue || queue.length === 0) return events;

  // Only deliver at night
  if (world.environment?.timeOfDay !== "night") return events;

  // Process each queued vision
  const toRemove: number[] = [];

  for (let i = 0; i < queue.length; i++) {
    const vision = queue[i];

    // Find target entities
    const targetIds: string[] = [];
    if (vision.targetEntityId) {
      targetIds.push(vision.targetEntityId);
    } else {
      // Broadcast to all alive entities
      for (const eid of Object.keys(world.entities)) {
        const e = world.entities[eid] as EntityState;
        if (e.alive) targetIds.push(eid);
      }
    }

    let delivered = false;

    for (const eid of targetIds) {
      const entity = world.entities[eid] as EntityState;
      if (!entity?.alive) continue;

      // Check cooldown
      if (entity.divineVision && !entity.divineVision.processed) continue; // Already has unprocessed vision
      if (entity.divineVision && (world.tick - entity.divineVision.receivedAtTick) < DIVINE_VISION_COOLDOWN) continue;

      // Inject vision
      entity.divineVision = {
        message: vision.message,
        receivedAtTick: world.tick,
        processed: false,
      };

      // Force cognitive cycle on next tick
      entity.lastCognitiveTick = 0;

      events.push({
        type: "DIVINE_VISION_RECEIVED",
        tick: world.tick,
        entityId: entity.id,
        message: `${entity.name ?? eid} received a divine vision: "${vision.message.slice(0, 50)}..."`,
      } as GenericGameEvent);

      console.log(`[Divine] 💫 Vision delivered to ${entity.name ?? eid}: "${vision.message.slice(0, 60)}"`);
      delivered = true;
    }

    if (delivered) {
      toRemove.push(i);
    }
  }

  // Remove delivered visions (reverse order to preserve indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    queue.splice(toRemove[i], 1);
  }

  return events;
}

// ── P1: Food Spoilage System ──────────────────────────────────

/** How often spoilage is checked (every N ticks). */
const SPOILAGE_CHECK_INTERVAL = 5;

/**
 * Tick food spoilage in entity inventories.
 *
 * - Items with spoilRate > 0 have a chance to spoil each check
 * - Entities near 'food_preservation' structures are protected
 * - Deterministic: uses tick + entity position as seed
 * - Emits events for agent learning ("my fish spoiled!")
 */
function tickFoodSpoilage(
  world: WorldState,
  resources: Record<string, import("./content-types").ResourceDef>,
  structures?: Record<string, import("./content-types").StructureDef>
): SimEvent[] {
  if (world.tick % SPOILAGE_CHECK_INTERVAL !== 0) return [];

  const events: SimEvent[] = [];

  // Pre-compute food_preservation structure positions
  const preservationPositions: { position: { x: number; y: number }; radius: number }[] = [];
  if (world.structures && structures) {
    for (const s of Object.values(world.structures) as StructureState[]) {
      if (!s.active) continue;
      const def = structures[s.type];
      if (def?.effects?.includes("food_preservation")) {
        preservationPositions.push({
          position: s.position,
          radius: def.effectRadius,
        });
      }
    }
  }

  for (const entity of Object.values(world.entities) as EntityState[]) {
    if (!entity.alive) continue;

    // Check if entity is near a food_preservation structure
    const isPreserved = preservationPositions.some((p) => {
      const dist = Math.abs(entity.position.x - p.position.x) + Math.abs(entity.position.y - p.position.y);
      return dist <= p.radius;
    });
    if (isPreserved) continue; // Protected — skip spoilage

    // Check each inventory item
    const spoiledItems: string[] = [];
    for (const [itemType, qty] of Object.entries(entity.inventory)) {
      if (qty <= 0) continue;
      const def = resources[itemType];
      if (!def?.spoilRate || def.spoilRate <= 0) continue;

      // Deterministic spoilage roll per item type
      const seed = (world.tick * 41 + entity.position.x * 19 + entity.position.y * 23
        + itemType.charCodeAt(0) * 7) % 100;
      const spoilChance = def.spoilRate * SPOILAGE_CHECK_INTERVAL * 100; // Scale to percentage

      if (seed < spoilChance) {
        // Spoil 1 unit
        entity.inventory[itemType] = qty - 1;
        if (entity.inventory[itemType] <= 0) {
          delete entity.inventory[itemType];
        }
        spoiledItems.push(itemType);
      }
    }

    if (spoiledItems.length > 0) {
      events.push({
        type: "ITEM_SPOILED",
        tick: world.tick,
        entityId: entity.id,
        message: `${entity.name ?? entity.id}'s ${spoiledItems.join(", ")} spoiled!`,
      } as GenericGameEvent);
    }
  }

  return events;
}
