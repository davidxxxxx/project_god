/**
 * tribe-tick.ts — Per-tick system for tribe state maintenance.
 *
 * Runs after skill learning in the main tick loop.
 * For each tribe:
 *   1. Remove dead members from memberIds
 *   2. Calculate gatherPoint as centroid of alive members
 *   3. Emit TRIBE_GATHER_POINT_UPDATED when point changes
 */

import {
  WorldState, EntityState, TribeState, SimEvent,
  Vec2,
} from "@project-god/shared";

/** Minimum distance change to emit an update event. */
const GATHER_POINT_CHANGE_THRESHOLD = 1;

export function tickTribes(world: WorldState): SimEvent[] {
  const events: SimEvent[] = [];
  if (!world.tribes) return events;

  for (const tribe of Object.values(world.tribes) as TribeState[]) {
    // ── 1. Remove dead members ──────────────────────────────
    tribe.memberIds = tribe.memberIds.filter((id) => {
      const entity = world.entities[id];
      return entity?.alive;
    });

    // ── 2. Calculate gatherPoint (centroid) ──────────────────
    if (tribe.memberIds.length === 0) {
      tribe.gatherPoint = undefined;
      continue;
    }

    let sumX = 0;
    let sumY = 0;
    for (const memberId of tribe.memberIds) {
      const entity = world.entities[memberId] as EntityState;
      sumX += entity.position.x;
      sumY += entity.position.y;
    }

    const newPoint: Vec2 = {
      x: Math.round(sumX / tribe.memberIds.length),
      y: Math.round(sumY / tribe.memberIds.length),
    };

    // Check if changed significantly
    const oldPoint = tribe.gatherPoint;
    const changed = !oldPoint
      || Math.abs(oldPoint.x - newPoint.x) >= GATHER_POINT_CHANGE_THRESHOLD
      || Math.abs(oldPoint.y - newPoint.y) >= GATHER_POINT_CHANGE_THRESHOLD;

    tribe.gatherPoint = newPoint;

    if (changed) {
      events.push({
        type: "TRIBE_GATHER_POINT_UPDATED",
        tick: world.tick,
        tribeId: tribe.id,
        position: { ...newPoint },
        memberCount: tribe.memberIds.length,
      } as any);
    }
  }

  return events;
}
