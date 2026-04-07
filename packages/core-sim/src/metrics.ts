/**
 * metrics.ts — Collects per-tick metrics from TickResult data.
 */

import {
  WorldState, EntityState, ResourceNodeState,
  TickResult, SimEvent,
  TickMetrics, SimulationMetrics,
} from "@project-god/shared";

export function buildTickMetrics(world: WorldState, result: TickResult): TickMetrics {
  const entities = Object.values(world.entities) as EntityState[];
  const alive = entities.filter((e) => e.alive);
  const dead = entities.filter((e) => !e.alive);
  const resources = Object.values(world.resourceNodes) as ResourceNodeState[];

  const gatherCount = result.events.filter((e: SimEvent) => e.type === "RESOURCE_GATHERED").length;
  const eatCount = result.events.filter((e: SimEvent) => e.type === "FOOD_EATEN").length;
  const drinkCount = result.events.filter((e: SimEvent) => e.type === "WATER_DRUNK").length;
  const deathsThisTick = result.events
    .filter((e: SimEvent) => e.type === "ENTITY_DIED")
    .map((e: any) => e.entityId as string);

  const avgHunger = alive.length > 0
    ? alive.reduce((sum, e) => sum + (e.needs.hunger ?? 0), 0) / alive.length
    : 0;
  const avgThirst = alive.length > 0
    ? alive.reduce((sum, e) => sum + (e.needs.thirst ?? 0), 0) / alive.length
    : 0;

  const totalBerryRemaining = resources
    .filter((r) => r.resourceType === "berry")
    .reduce((sum, r) => sum + r.quantity, 0);
  const totalWaterRemaining = resources
    .filter((r) => r.resourceType === "water")
    .reduce((sum, r) => sum + Math.min(r.quantity, 999), 0);

  return {
    tick: world.tick,
    aliveCount: alive.length,
    deadCount: dead.length,
    rejectedCount: result.rejections.length,
    gatherCount, eatCount, drinkCount,
    avgHunger: Math.round(avgHunger * 10) / 10,
    avgThirst: Math.round(avgThirst * 10) / 10,
    totalBerryRemaining: Math.round(totalBerryRemaining * 10) / 10,
    totalWaterRemaining,
    deathsThisTick,
  };
}

export function aggregateMetrics(tickMetrics: TickMetrics[]): SimulationMetrics {
  let firstDeathTick: number | null = null;
  let totalDeaths = 0, totalGathers = 0, totalEats = 0, totalDrinks = 0, totalRejections = 0;

  for (const tm of tickMetrics) {
    if (tm.deathsThisTick.length > 0 && firstDeathTick === null) {
      firstDeathTick = tm.tick;
    }
    totalDeaths += tm.deathsThisTick.length;
    totalGathers += tm.gatherCount;
    totalEats += tm.eatCount;
    totalDrinks += tm.drinkCount;
    totalRejections += tm.rejectedCount;
  }

  return { tickMetrics, firstDeathTick, totalDeaths, totalGathers, totalEats, totalDrinks, totalRejections };
}
