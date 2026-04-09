/**
 * execute-pray.ts — Executes a validated "pray" action.
 *
 * When a pray action is executed:
 *   1. Start the prayer (set isPraying, emit PRAYER_STARTED)
 *   2. After PRAYER_DURATION ticks, auto-complete via faith-tick
 *      (for MVP simplicity, we start AND complete in one go since
 *       the timeCost on validated action already blocks the agent)
 */

import { ValidatedAction, WorldState, SimEvent, EntityState } from "@project-god/shared";
import type { FaithDef } from "../content-types";
import { startPrayer, completePrayer } from "../systems/faith-tick";

export function executePray(
  action: ValidatedAction,
  world: WorldState,
  faithCfg?: FaithDef
): SimEvent[] {
  if (!faithCfg) return [];

  const entity = world.entities[action.intent.actorId] as EntityState | undefined;
  if (!entity?.alive) return [];

  // Start prayer → agent is now praying
  const events = startPrayer(entity, world.tick, faithCfg);

  // For MVP: immediately complete after start (timeCost handles blocking)
  // The prayer response window begins now
  events.push(...completePrayer(entity, world.tick));

  return events;
}
