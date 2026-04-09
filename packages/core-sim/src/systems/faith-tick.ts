/**
 * faith-tick.ts — MVP-05 Faith system tick.
 *
 * Runs once per world tick to:
 *   1. Check prayer timeouts (unanswered prayers → faith loss)
 *   2. Regenerate divine points from active prayers
 *   3. Yearly faith decay
 *
 * Separate functions handle prayer start/complete (via action execution)
 * and miracle performance (via player input).
 */

import type { WorldState, EntityState, SimEvent } from "@project-god/shared";
import type { EntityId } from "@project-god/shared";
import type { FaithDef } from "../content-types";

// ─── Tick: runs every world tick ──────────────────────────────

export function tickFaith(
  world: WorldState,
  faithCfg: FaithDef,
  ticksPerYear: number
): SimEvent[] {
  const events: SimEvent[] = [];
  const tick = world.tick;

  let prayingCount = 0;

  for (const entity of Object.values(world.entities) as EntityState[]) {
    if (!entity.alive) continue;

    // ── Prayer timeout check ──────────────────────────────
    if (
      entity.prayerCompletedTick !== undefined &&
      !entity.isPraying &&
      tick - entity.prayerCompletedTick >= faithCfg.PRAYER_RESPONSE_WINDOW
    ) {
      // Prayer expired without divine response
      const oldFaith = entity.attributes.faith ?? 0;
      const newFaith = Math.max(0, oldFaith - faithCfg.FAITH_DECAY_UNANSWERED);
      entity.attributes.faith = newFaith;
      entity.prayerCompletedTick = undefined;
      events.push({
        type: "PRAYER_UNANSWERED",
        tick,
        entityId: entity.id,
        faithLost: oldFaith - newFaith,
      } as SimEvent);
      if (oldFaith !== newFaith) {
        events.push({
          type: "FAITH_CHANGED",
          tick,
          entityId: entity.id,
          oldFaith,
          newFaith,
          reason: "prayer_unanswered",
        } as SimEvent);
      }
    }

    // ── Count actively praying entities for divine regen ──
    if (entity.isPraying) {
      prayingCount++;
    }

    // ── Yearly faith decay ────────────────────────────────
    if (ticksPerYear > 0 && tick > 0 && tick % ticksPerYear === 0) {
      const faith = entity.attributes.faith ?? 0;
      if (faith > 0) {
        const newFaith = Math.max(0, faith - faithCfg.FAITH_DECAY_PER_YEAR);
        if (newFaith !== faith) {
          entity.attributes.faith = newFaith;
          events.push({
            type: "FAITH_CHANGED",
            tick,
            entityId: entity.id,
            oldFaith: faith,
            newFaith,
            reason: "yearly_decay",
          } as SimEvent);
        }
      }
    }
  }

  // ── Divine points regeneration ──────────────────────────
  if (prayingCount > 0 && world.divinePoints !== undefined) {
    const maxDP = world.maxDivinePoints ?? faithCfg.DIVINE_POINTS_MAX;
    const regen = prayingCount * faithCfg.DIVINE_REGEN_PER_PRAYER;
    world.divinePoints = Math.min(maxDP, world.divinePoints + regen);
  }

  return events;
}

// ─── Prayer execution helpers ─────────────────────────────────

/** Start a prayer. Called from action execution. */
export function startPrayer(
  entity: EntityState,
  tick: number,
  faithCfg: FaithDef
): SimEvent[] {
  entity.isPraying = true;
  entity.lastPrayerTick = tick;
  return [{
    type: "PRAYER_STARTED",
    tick,
    entityId: entity.id,
    position: { ...entity.position },
    faith: entity.attributes.faith ?? 0,
  } as SimEvent];
}

/** Complete a prayer (duration elapsed). Called from action execution. */
export function completePrayer(
  entity: EntityState,
  tick: number
): SimEvent[] {
  entity.isPraying = false;
  entity.prayerCompletedTick = tick;
  return [{
    type: "PRAYER_COMPLETED",
    tick,
    entityId: entity.id,
    position: { ...entity.position },
  } as SimEvent];
}

// ─── Miracle system ───────────────────────────────────────────

export type MiracleType = "bless" | "heal" | "rain" | "bounty";

export interface MiracleRequest {
  type: MiracleType;
  /** Target entity ID. Required for bless/heal. */
  targetId?: string;
}

/**
 * Apply a miracle requested by the player.
 * Returns events and whether the miracle was successfully applied.
 */
export function performMiracle(
  request: MiracleRequest,
  world: WorldState,
  faithCfg: FaithDef
): { events: SimEvent[]; success: boolean } {
  const events: SimEvent[] = [];
  const tick = world.tick;
  const dp = world.divinePoints ?? 0;

  // Cost lookup
  const costMap: Record<MiracleType, number> = {
    bless: faithCfg.BLESS_COST,
    heal: faithCfg.HEAL_COST,
    rain: faithCfg.RAIN_COST,
    bounty: faithCfg.BOUNTY_COST,
  };

  const cost = costMap[request.type];
  if (dp < cost) return { events, success: false };

  world.divinePoints = dp - cost;

  switch (request.type) {
    case "bless": {
      const target = request.targetId ? world.entities[request.targetId] as EntityState : undefined;
      if (!target?.alive) return { events, success: false };
      target.needs.hunger = Math.min(100, (target.needs.hunger ?? 0) + faithCfg.BLESS_HUNGER_RESTORE);
      target.needs.thirst = Math.min(100, (target.needs.thirst ?? 0) + faithCfg.BLESS_THIRST_RESTORE);
      events.push({
        type: "MIRACLE_PERFORMED", tick, miracleType: "bless",
        targetId: target.id, cost, position: { ...target.position },
      } as SimEvent);
      applyFaithGain(target, faithCfg.FAITH_GAIN_ON_MIRACLE, tick, "miracle_bless", events);
      applyWitnessGain(target, world, faithCfg, tick, events);
      clearPrayerWait(target);
      break;
    }

    case "heal": {
      const target = request.targetId ? world.entities[request.targetId] as EntityState : undefined;
      if (!target?.alive) return { events, success: false };
      target.needs.exposure = 100;
      // Remove negative statuses
      if (target.statuses) {
        target.statuses = target.statuses.filter((s) => s !== "freezing" && s !== "starving");
      }
      events.push({
        type: "MIRACLE_PERFORMED", tick, miracleType: "heal",
        targetId: target.id, cost, position: { ...target.position },
      } as SimEvent);
      applyFaithGain(target, faithCfg.FAITH_GAIN_ON_MIRACLE, tick, "miracle_heal", events);
      applyWitnessGain(target, world, faithCfg, tick, events);
      clearPrayerWait(target);
      break;
    }

    case "rain": {
      for (const node of Object.values(world.resourceNodes)) {
        if (node.resourceType === "water") {
          node.quantity = node.maxQuantity < 0
            ? node.quantity + faithCfg.RAIN_WATER_RESTORE
            : Math.min(node.maxQuantity, node.quantity + faithCfg.RAIN_WATER_RESTORE);
        }
      }
      events.push({
        type: "MIRACLE_PERFORMED", tick, miracleType: "rain", cost,
      } as SimEvent);
      // All alive entities gain witness faith
      for (const e of Object.values(world.entities) as EntityState[]) {
        if (e.alive) applyFaithGain(e, faithCfg.FAITH_GAIN_WITNESS, tick, "witness_rain", events);
      }
      break;
    }

    case "bounty": {
      for (const node of Object.values(world.resourceNodes)) {
        if (node.resourceType === "berry") {
          node.quantity = node.maxQuantity < 0
            ? node.quantity + faithCfg.BOUNTY_BERRY_RESTORE
            : Math.min(node.maxQuantity, node.quantity + faithCfg.BOUNTY_BERRY_RESTORE);
        }
      }
      events.push({
        type: "MIRACLE_PERFORMED", tick, miracleType: "bounty", cost,
      } as SimEvent);
      for (const e of Object.values(world.entities) as EntityState[]) {
        if (e.alive) applyFaithGain(e, faithCfg.FAITH_GAIN_WITNESS, tick, "witness_bounty", events);
      }
      break;
    }
  }

  return { events, success: true };
}

// ─── Helpers ──────────────────────────────────────────────────

/** Increase faith on an entity, capped at 100. */
function applyFaithGain(
  entity: EntityState,
  amount: number,
  tick: number,
  reason: string,
  events: SimEvent[]
): void {
  const old = entity.attributes.faith ?? 0;
  const updated = Math.min(100, old + amount);
  if (updated !== old) {
    entity.attributes.faith = updated;
    events.push({
      type: "FAITH_CHANGED", tick,
      entityId: entity.id, oldFaith: old, newFaith: updated, reason,
    } as SimEvent);
  }
}

/** Nearby entities witness the miracle → small faith gain. */
function applyWitnessGain(
  target: EntityState,
  world: WorldState,
  faithCfg: FaithDef,
  tick: number,
  events: SimEvent[]
): void {
  const WITNESS_RADIUS = 10;
  for (const e of Object.values(world.entities) as EntityState[]) {
    if (!e.alive || e.id === target.id) continue;
    const dist = Math.abs(e.position.x - target.position.x) + Math.abs(e.position.y - target.position.y);
    if (dist <= WITNESS_RADIUS) {
      applyFaithGain(e, faithCfg.FAITH_GAIN_WITNESS, tick, "witness_miracle", events);
    }
  }
}

/** Clear prayer awaiting state when a miracle answers the prayer. */
function clearPrayerWait(entity: EntityState): void {
  entity.prayerCompletedTick = undefined;
  entity.isPraying = false;
}
