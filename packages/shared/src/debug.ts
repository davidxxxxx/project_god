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
  /** Skills this agent has. MVP-02-D. */
  skills: Record<string, number>;
  /** Tribe this agent belongs to. MVP-02-E. */
  tribeId: string;
  /** Number of entities this agent has social memory of. MVP-02-E. */
  socialMemoryCount: number;
  /** Current status effects (warming, sheltered, child, elder). */
  statuses: string[];
  /** Count of semantic memory entries. MVP-03-B. */
  semanticMemoryCount: number;
  /** Age in life-years. MVP-04. */
  age: number;
  /** Biological sex. MVP-04. */
  sex: string;
  /** Current life stage. MVP-04. */
  lifeStage: string;
  /** Spouse entity ID if paired. MVP-04. */
  spouseId?: string;
  /** Number of children. MVP-04. */
  childCount: number;
  /** Entity's current faith level 0-100. MVP-05. */
  faith: number;
  /** Whether the entity is currently praying. MVP-05. */
  isPraying: boolean;
  /** Entity's role, e.g. 'priest'. MVP-07A. */
  role?: string;
  /** Number of doctrine violations this entity has committed. MVP-07B. */
  doctrineViolations: number;
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

// ─── Structure View (MVP-02-C) ───────────────────────────────

export interface DebugStructureView {
  id: string;
  type: string;
  position: Vec2;
  active: boolean;
  durability: number;
  builtByEntityId: string;
  builtAtTick: number;
}

// ─── Tribe View (MVP-02-E) ────────────────────────────────

export interface DebugTribeView {
  id: string;
  name: string;
  memberCount: number;
  aliveMemberCount: number;
  technologies: string[];
  gatherPoint?: Vec2;
  /** Count of cultural memory entries. MVP-03-B. */
  culturalMemoryCount: number;
  /** Entity ID of current priest. MVP-07A. */
  priestId?: string;
  /** Structure ID of spiritual center. MVP-07A. */
  spiritualCenterId?: string;
  /** Active doctrines held by this tribe. MVP-07B. */
  doctrines: { id: string; type: string; strength: number }[];
}

// ─── Environment View (MVP-03-A) ─────────────────────────────

export interface DebugEnvironmentView {
  temperature: number;
  timeOfDay: "day" | "night";
  dayLength: number;
}

// ─── Debug Projection ────────────────────────────────────────

export interface DebugProjection {
  tick: number;
  seed: number;
  agents: DebugAgentView[];
  resources: DebugResourceView[];
  /** Structures in the world (fire pits etc). MVP-02-C. */
  structures: DebugStructureView[];
  /** Tribes in the world. MVP-02-E. */
  tribes: DebugTribeView[];
  /** World environment state. MVP-03-A. */
  environment?: DebugEnvironmentView;
  recentEvents: SimEvent[];
  counters: {
    aliveAgents: number;
    deadAgents: number;
    totalEvents: number;
    rejectedActions: number;
    gatherCount: number;
    eatCount: number;
    drinkCount: number;
    /** Number of structures built. MVP-02-C. */
    buildCount: number;
    /** Number of skills learned. MVP-02-D. */
    skillLearnedCount: number;
    /** Number of technologies unlocked. MVP-02-D. */
    techUnlockedCount: number;
    /** Number of tribes. MVP-02-E. */
    tribeCount: number;
    /** Number of active shelter structures. MVP-03-A. */
    shelterCount: number;
    /** Number of semantic facts across all agents. MVP-03-B. */
    totalSemanticFacts: number;
    /** Number of cultural memory entries across all tribes. MVP-03-B. */
    totalCulturalFacts: number;
    /** Total children currently alive. MVP-04. */
    childCount: number;
    /** Total elders currently alive. MVP-04. */
    elderCount: number;
    /** Total births this session. MVP-04. */
    totalBirths: number;
    /** Total pair bonds formed. MVP-04. */
    totalPairBonds: number;
    /** Total prayers this session. MVP-05. */
    totalPrayers: number;
    /** Total miracles performed. MVP-05. */
    totalMiracles: number;
    /** Entities currently praying. MVP-05. */
    prayingCount: number;
  };
  /** Global divine points available to the player. MVP-05. */
  divinePoints: number;
  /** Maximum divine points. MVP-05. */
  maxDivinePoints: number;
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

// ─── Run Summary (produced by runUntilDone) ──────────────────

export type TerminationReason = "all_dead" | "max_tick";

export interface RunSummary {
  terminationReason: TerminationReason;
  seed: number;
  totalTicks: number;
  aliveCount: number;
  deadCount: number;
  firstDeathTick: number | null;
  totalGathers: number;
  totalEats: number;
  totalDrinks: number;
  totalRejections: number;
  remainingBerries: number;
  remainingWater: number;
}
