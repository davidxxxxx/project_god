/**
 * scenario-runner.ts — Encapsulates a full scenario lifecycle.
 * Accepts a decision function to keep core-sim independent of agent-runtime.
 */

import {
  WorldState, ActionIntent, EntityState,
  TickResult, DebugProjection, ScenarioRunResult,
  TickMetrics, SimulationMetrics, manhattan, ResourceNodeState,
} from "@project-god/shared";
import { createWorld, type WorldConfig } from "./create-world";
import { tickWorld, type TickContext } from "./tick";
import { buildProjection } from "./snapshot";
import { buildTickMetrics, aggregateMetrics } from "./metrics";

export type DecisionFn = (entityId: string, world: WorldState) => ActionIntent;

export interface ScenarioConfig {
  id: string;
  worldConfig: WorldConfig;
  tickContext: TickContext;
  decideFn: DecisionFn;
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

  /** Advance exactly one tick. */
  step(): TickResult {
    const intents: ActionIntent[] = [];
    for (const entityId of Object.keys(this.world.entities)) {
      const entity = this.world.entities[entityId] as EntityState;
      if (!entity.alive) continue;
      intents.push(this.config.decideFn(entityId, this.world));
    }

    const result = tickWorld(this.world, intents, this.config.tickContext);
    this.world = result.world;

    this.tickHistory.push(result);
    if (this.tickHistory.length > this.maxHistory) {
      this.tickHistory.shift();
    }

    this.metricsHistory.push(buildTickMetrics(this.world, result));
    return result;
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
