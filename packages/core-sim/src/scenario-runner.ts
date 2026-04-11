/**
 * scenario-runner.ts — Encapsulates a full scenario lifecycle.
 * Accepts a decision function to keep core-sim independent of agent-runtime.
 */

import {
  WorldState, ActionIntent, EntityState, TribeState,
  TickResult, DebugProjection, ScenarioRunResult,
  TickMetrics, SimulationMetrics, RunSummary,
  manhattan, ResourceNodeState, SimEvent, SimEventType,
} from "@project-god/shared";
import { createWorld, type WorldConfig } from "./create-world";
import { tickWorld, type TickContext } from "./tick";
import { buildProjection } from "./snapshot";
import { buildTickMetrics, aggregateMetrics } from "./metrics";
import { performMiracle as applyMiracle, type MiracleRequest } from "./systems/faith-tick";
import { runCognitivePhase } from "@project-god/agent-runtime";

export type DecisionFn = (entityId: string, world: WorldState) => ActionIntent;
export type PostTickHook = (world: WorldState, result: TickResult) => void;

export interface ScenarioConfig {
  id: string;
  worldConfig: WorldConfig;
  tickContext: TickContext;
  decideFn: DecisionFn;
  /** Optional hook called after each tick for memory updates etc. */
  postTickHook?: PostTickHook;
}

export class ScenarioRunner {
  readonly config: ScenarioConfig;
  private world: WorldState;
  private tickHistory: TickResult[] = [];
  private metricsHistory: TickMetrics[] = [];
  private readonly maxHistory = 50;

  constructor(config: ScenarioConfig) {
    this.config = config;
    this.world = createWorld(config.worldConfig);
  }

  /** Advance exactly one tick (sync — for tests and non-LLM scenarios). */
  step(): TickResult {
    const intents: ActionIntent[] = [];
    for (const entityId of Object.keys(this.world.entities)) {
      const entity = this.world.entities[entityId] as EntityState;
      if (!entity.alive) continue;
      intents.push(this.config.decideFn(entityId, this.world));
    }

    const result = tickWorld(this.world, intents, this.config.tickContext);
    this.world = result.world;

    // ── Memory update hook (MVP-02) ───────────────────────
    if (this.config.postTickHook) {
      this.config.postTickHook(this.world, result);
    }

    this.tickHistory.push(result);
    if (this.tickHistory.length > this.maxHistory) {
      this.tickHistory.shift();
    }

    this.metricsHistory.push(buildTickMetrics(this.world, result));
    return result;
  }

  /**
   * Advance one tick WITH cognitive pause.
   *
   * Flow:
   * 1. Run cognitive phase — batch all LLM calls concurrently (await)
   * 2. Run normal tick (decisions use freshly-set plans)
   *
   * The caller (TimeController) awaits this, effectively pausing
   * the sim loop while LLM processes.
   *
   * @returns The tick result and how many agents got new cognition.
   */
  async stepWithCognition(): Promise<{ result: TickResult; cognitionCount: number }> {
    // Phase 1: Run LLM batch (awaited — sim pauses here)
    const cognitionCount = await runCognitivePhase(
      this.world,
      this.config.tickContext.terrain,
    );

    // Phase 2: Normal tick (all agents now have fresh plans)
    const result = this.step();
    return { result, cognitionCount };
  }

  /** Run N ticks, return full result. */
  runN(n: number): ScenarioRunResult {
    const allResults: TickResult[] = [];
    for (let i = 0; i < n; i++) {
      allResults.push(this.step());
    }

    const metrics = aggregateMetrics(this.metricsHistory);
    const entities = Object.values(this.world.entities) as EntityState[];

    return {
      finalWorld: this.world,
      tickResults: allResults,
      metrics,
      summary: {
        scenarioId: this.config.id,
        seed: this.world.seed,
        totalTicks: this.world.tick,
        aliveAgents: entities.filter((e) => e.alive).length,
        deadAgents: entities.filter((e) => !e.alive).length,
        totalEvents: allResults.reduce((sum, r) => sum + r.events.length, 0),
        rejectedActions: metrics.totalRejections,
      },
    };
  }

  /** Get current debug projection. */
  getProjection(): DebugProjection {
    return buildProjection(this.world, this.tickHistory);
  }

  /** Get current world state (read only). */
  getWorld(): WorldState {
    return this.world;
  }

  /** Get fog render data for the current tick (visible + explored tiles). */
  getFogRenderData(): { visibleTiles: Set<string>; exploredTiles: Record<string, boolean> } | undefined {
    const lastResult = this.tickHistory[this.tickHistory.length - 1];
    if (!lastResult?.fogState) return undefined;
    return {
      visibleTiles: lastResult.fogState.visibleTiles,
      exploredTiles: this.world.exploredTiles ?? {},
    };
  }

  /** Get accumulated metrics. */
  getMetrics(): SimulationMetrics {
    return aggregateMetrics(this.metricsHistory);
  }

  /** Reset to initial state. */
  reset(): void {
    this.world = createWorld(this.config.worldConfig);
    this.tickHistory = [];
    this.metricsHistory = [];
  }

  /**
   * Perform a divine miracle (MVP-05).
   * This is the player's active input — it mutates world state directly.
   * Returns the events generated and whether the miracle succeeded.
   */
  performMiracle(request: MiracleRequest): { events: SimEvent[]; success: boolean } {
    const faithCfg = this.config.tickContext.faith;
    if (!faithCfg) return { events: [], success: false };
    return applyMiracle(request, this.world, faithCfg);
  }

  /**
   * Run ticks until a matching event type appears, or maxTicks reached.
   * Used by TimeController for fast-forward.
   *
   * Returns all tick results, whether a target was found, and the trigger event.
   * Also stops early if all agents die.
   */
  stepUntil(
    targetEventTypes: SimEventType[],
    maxTicks: number = 2000
  ): { results: TickResult[]; found: boolean; triggerEvent?: SimEvent; ticksRan: number } {
    const results: TickResult[] = [];
    const targetSet = new Set(targetEventTypes);
    let found = false;
    let triggerEvent: SimEvent | undefined;

    for (let i = 0; i < maxTicks; i++) {
      // Check if all agents are dead before stepping
      const entities = Object.values(this.world.entities) as EntityState[];
      if (entities.every((e) => !e.alive) && this.world.tick > 0) break;

      const result = this.step();
      results.push(result);

      // Check if any emitted event matches a target
      for (const ev of result.events) {
        if (targetSet.has(ev.type)) {
          found = true;
          triggerEvent = ev;
          break;
        }
      }
      if (found) break;
    }

    return { results, found, triggerEvent, ticksRan: results.length };
  }

  /**
   * Run until a termination condition is met.
   * Stops when all agents are dead OR maxTick is reached.
   */
  runUntilDone(maxTick: number): RunSummary {
    while (this.world.tick < maxTick) {
      const entities = Object.values(this.world.entities) as EntityState[];
      const allDead = entities.every((e) => !e.alive);
      if (allDead && this.world.tick > 0) {
        return this.buildRunSummary("all_dead");
      }
      this.step();
    }
    return this.buildRunSummary("max_tick");
  }

  private buildRunSummary(reason: RunSummary["terminationReason"]): RunSummary {
    const metrics = aggregateMetrics(this.metricsHistory);
    const entities = Object.values(this.world.entities) as EntityState[];
    const resources = Object.values(this.world.resourceNodes) as ResourceNodeState[];

    return {
      terminationReason: reason,
      seed: this.world.seed,
      totalTicks: this.world.tick,
      aliveCount: entities.filter((e) => e.alive).length,
      deadCount: entities.filter((e) => !e.alive).length,
      firstDeathTick: metrics.firstDeathTick,
      totalGathers: metrics.totalGathers,
      totalEats: metrics.totalEats,
      totalDrinks: metrics.totalDrinks,
      totalRejections: metrics.totalRejections,
      remainingBerries: resources
        .filter((r) => r.resourceType === "berry")
        .reduce((sum, r) => sum + r.quantity, 0),
      remainingWater: resources
        .filter((r) => r.resourceType === "water")
        .reduce((sum, r) => sum + Math.min(r.quantity, 999), 0),
    };
  }
}

// ─── Built-in survival decision function ───────────────────

export function defaultSurvivalDecision(
  needsConfig: Record<string, { max: number; criticalThreshold: number }>
): DecisionFn {
  return (entityId: string, world: WorldState): ActionIntent => {
    const self = world.entities[entityId] as EntityState;
    const actorId = self.id;
    const nearby = (Object.values(world.resourceNodes) as ResourceNodeState[])
      .filter((n) => n.quantity > 0 && manhattan(self.position, n.position) <= 10);

    const hCfg = needsConfig["hunger"] ?? { max: 100, criticalThreshold: 25 };
    const tCfg = needsConfig["thirst"] ?? { max: 100, criticalThreshold: 25 };
    const hP = hCfg.max - (self.needs.hunger ?? hCfg.max);
    const tP = tCfg.max - (self.needs.thirst ?? tCfg.max);
    const hasBerry = (self.inventory["berry"] ?? 0) > 0;
    const hasWater = (self.inventory["water"] ?? 0) > 0;

    // Critical consume
    if (self.needs.thirst <= tCfg.criticalThreshold && hasWater) return { actorId, type: "drink", reason: "critical thirst" };
    if (self.needs.hunger <= hCfg.criticalThreshold && hasBerry) return { actorId, type: "eat", reason: "critical hunger" };
    // Pressure consume
    if (tP > hP && hasWater) return { actorId, type: "drink", reason: "thirst pressure" };
    if (hP > tP && hasBerry) return { actorId, type: "eat", reason: "hunger pressure" };
    if (tP > 0 && hasWater) return { actorId, type: "drink", reason: "some thirst" };
    if (hP > 0 && hasBerry) return { actorId, type: "eat", reason: "some hunger" };

    // Seek resources
    const seekType = tP >= hP ? "water" : "berry";
    const target = findNearest(self, nearby, seekType) ?? findNearest(self, nearby, seekType === "water" ? "berry" : "water");
    if (target) {
      if (manhattan(self.position, target.position) <= 1)
        return { actorId, type: "gather", targetId: target.id, reason: `gather ${target.resourceType}` };
      const dx = Math.sign(target.position.x - self.position.x);
      const dy = Math.sign(target.position.y - self.position.y);
      return { actorId, type: "move", position: { x: self.position.x + dx, y: self.position.y + dy }, reason: `toward ${target.resourceType}` };
    }

    return { actorId, type: "idle", reason: "nothing nearby" };
  };
}

function findNearest(self: EntityState, resources: ResourceNodeState[], type: string): ResourceNodeState | undefined {
  return resources
    .filter((r) => r.resourceType === type)
    .sort((a, b) => manhattan(self.position, a.position) - manhattan(self.position, b.position))[0];
}

// ─── Memory-aware decision function (MVP-02) ────────────────

import {
  perceive, memoryAwarePolicy, decideActionV3,
  updateMemoryFromEvents, enrichEventsWithPositions,
  updateSocialMemory,
  distillSemanticMemory, decaySemanticMemory,
  teachToCulturalMemory, inheritFromCulturalMemory, decayCulturalMemory,
  updateRecipeObservation, updatePreferences,
  recordFarBankSighting, recordCrossingExperience,
} from "@project-god/agent-runtime";

/**
 * Creates a memory-aware decision function (MVP-02).
 * Uses episodic memory for resource recall and task tracking.
 */
export function defaultMemoryDecision(
  needsConfig: Record<string, { max: number; criticalThreshold: number }>,
  terrainDefs?: Record<string, { moveCostMultiplier: number; passable: boolean }>
): DecisionFn {
  return (entityId: string, world: WorldState): ActionIntent => {
    const snapshot = perceive(entityId, world, undefined, terrainDefs);
    return memoryAwarePolicy(snapshot, needsConfig, world.tick);
  };
}

/**
 * Creates a cognitive decision function (LLM Cognition).
 * Uses LLM for periodic reflection/planning with rule-based fallback.
 * The cognitive adapter must be initialized via setCognitiveConfig() first.
 */
export function defaultCognitiveDecision(
  needsConfig: Record<string, { max: number; criticalThreshold: number }>,
  terrainDefs?: Record<string, { moveCostMultiplier: number; passable: boolean }>
): DecisionFn {
  return (entityId: string, world: WorldState): ActionIntent => {
    return decideActionV3(entityId, world, needsConfig, terrainDefs);
  };
}

/**
 * Creates a post-tick hook that updates entity memories from tick events.
 * MVP-02-E: also updates social memory from perception.
 * MVP-03-B: adds semantic distillation, cultural teaching/inheritance.
 * Pass this as postTickHook to ScenarioConfig.
 */
export function defaultPostTickMemoryHook(): PostTickHook {
  return (world: WorldState, result: TickResult): void => {
    // Enrich events with resource node positions
    const enriched = enrichEventsWithPositions(result.events, world.resourceNodes);

    // Update memory for each alive entity
    for (const entity of Object.values(world.entities) as EntityState[]) {
      if (!entity.alive) continue;
      updateMemoryFromEvents(entity, enriched, world.tick);

      // Social memory update (MVP-02-E): perceive nearby entities
      const snapshot = perceive(entity.id, world);
      updateSocialMemory(entity, snapshot.nearbyEntities, world.tick);

      // Semantic distillation (MVP-03-B): episodic → semantic
      distillSemanticMemory(entity, world.tick);

      // Semantic decay (MVP-03-B): fade unreinforced knowledge
      decaySemanticMemory(entity, world.tick);

      // Recipe observation learning (MVP-02X): watch nearby cooking
      const nearbyIds = snapshot.nearbyEntities.map((ne: any) => ne.entityId);
      const recipeEvents = updateRecipeObservation(entity, enriched, nearbyIds, world.tick);
      result.events.push(...recipeEvents);

      // Experience-based preferences (MVP-02X): outcome → weight shifts
      updatePreferences(entity, enriched, world.tick);

      // MVP-03: Far-bank resource sighting → memory formation + event emission
      const farBankSnapshot = perceive(entity.id, world);
      // Throttle: only emit FAR_BANK_SPOTTED once every 20 ticks per entity
      const lastFarBankTick = (entity.attributes as any)?.["last_far_bank_spotted_tick"] ?? -999;
      const farBankThrottled = world.tick - lastFarBankTick < 20;
      for (const fb of farBankSnapshot.farBankResources) {
        const sightEvents = recordFarBankSighting(entity, fb.resourceType, fb.position, world.tick);
        result.events.push(...sightEvents);
        // Emit FAR_BANK_SPOTTED event (throttled to avoid spam)
        if (!farBankThrottled) {
          result.events.push({
            type: "FAR_BANK_SPOTTED",
            tick: world.tick,
            entityId: entity.id,
            resourceType: fb.resourceType,
            position: { ...fb.position },
          } as any);
          entity.attributes["last_far_bank_spotted_tick"] = world.tick;
        }
      }

      // MVP-03: Crossing experience → memory formation
      for (const evt of enriched) {
        if (evt.type === "WADE_ATTEMPTED" && (evt as any).entityId === entity.id) {
          const wadeEvt = evt as any;
          const crossEvents = recordCrossingExperience(
            entity,
            wadeEvt.success ? wadeEvt.to : wadeEvt.from,
            wadeEvt.success,
            world.tick
          );
          result.events.push(...crossEvents);
        }
      }

      // Cultural teaching + inheritance (MVP-03-B)
      if (world.tribes && entity.tribeId) {
        const tribe = world.tribes[entity.tribeId] as TribeState | undefined;
        if (tribe) {
          const hasNearbyTribeMember = snapshot.nearbyEntities.some(
            (ne: any) => ne.tribeId === entity.tribeId
          );
          teachToCulturalMemory(entity, tribe, hasNearbyTribeMember, world.tick);
          inheritFromCulturalMemory(entity, tribe, hasNearbyTribeMember, world.tick);
        }
      }
    }

    // Cultural memory decay (MVP-03-B): per tribe
    if (world.tribes) {
      for (const tribe of Object.values(world.tribes) as TribeState[]) {
        decayCulturalMemory(tribe, world.tick);
      }
    }
  };
}
