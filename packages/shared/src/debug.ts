/**
 * debug.ts — Debug projection and observability contracts.
 * These types are the ONLY interface between core-sim and game-client.
 * game-client NEVER reads raw WorldState directly.
 */

import { SimEvent } from "./events";
import { Vec2 } from "./geometry";
import { EntityId, ResourceNodeId } from "./ids";
import { ActionIntent, ValidatedAction, RejectedAction } from "./actions";
import { WorldState } from "./world";
import { TickResult } from "./results";

// ─── Agent View ──────────────────────────────────────────────

export interface DebugAgentView {
  id: string;
  position: Vec2;
  alive: boolean;
  needs: Record<string, number>;
  inventory: Record<string, number>;
  lastAction?: ActionIntent;
  lastActionResult?: "validated" | "rejected";
  lastActionReason?: string;
}

// ─── Resource View ───────────────────────────────────────────

export interface DebugResourceView {
  id: string;
  position: Vec2;
  resourceType: string;
  quantity: number;
  maxQuantity: number;
}

// ─── Debug Projection ────────────────────────────────────────

export interface DebugProjection {
  tick: number;
  seed: number;
  agents: DebugAgentView[];
  resources: DebugResourceView[];
  recentEvents: SimEvent[];
  counters: {
    aliveAgents: number;
    deadAgents: number;
    totalEvents: number;
    rejectedActions: number;
    gatherCount: number;
    eatCount: number;
    drinkCount: number;
  };
}

// ─── Simulation Metrics (per-tick time series) ───────────────

export interface TickMetrics {
  tick: number;
  aliveCount: number;
  deadCount: number;
  rejectedCount: number;
  gatherCount: number;
  eatCount: number;
  drinkCount: number;
  avgHunger: number;
  avgThirst: number;
  totalBerryRemaining: number;
  totalWaterRemaining: number;
  deathsThisTick: string[]; // entityIds
}

export interface SimulationMetrics {
  tickMetrics: TickMetrics[];
  firstDeathTick: number | null;
  totalDeaths: number;
  totalGathers: number;
  totalEats: number;
  totalDrinks: number;
  totalRejections: number;
}

// ─── Scenario Run Result ─────────────────────────────────────

export interface ScenarioRunResult {
  finalWorld: WorldState;
  tickResults: TickResult[];
  metrics: SimulationMetrics;
  summary: {
    scenarioId: string;
    seed: number;
    totalTicks: number;
    aliveAgents: number;
    deadAgents: number;
    totalEvents: number;
    rejectedActions: number;
  };
}
