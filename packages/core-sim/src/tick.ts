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
} from "@project-god/shared";
import { decayNeeds, checkDeaths } from "./systems/decay-needs";
import { validateAction, type ValidationContext } from "./validate";
import { executeAction, type ExecutionContext } from "./execute";
import type { NeedDef, ResourceDef, ActionDef, TerrainDef } from "./content-types";

export interface TickContext {
  needs: Record<string, NeedDef>;
  resources: Record<string, ResourceDef>;
  actions: Record<string, ActionDef>;
  terrain: Record<string, TerrainDef>;
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

  // ── 2. Decay needs ───────────────────────────────────────
  events.push(...decayNeeds(world, ctx.needs));

  // ── 3. Check deaths ──────────────────────────────────────
  events.push(...checkDeaths(world, ctx.needs));

  // ── 4. Regenerate resource nodes ─────────────────────────
  for (const node of Object.values(world.resourceNodes)) {
    if (node.maxQuantity < 0) continue;
    if (node.quantity < node.maxQuantity) {
      node.quantity = Math.min(node.maxQuantity, node.quantity + node.regenPerTick);
    }
  }

  // ── 5+6. Validate and execute ────────────────────────────
  const valCtx: ValidationContext = { actions: ctx.actions, terrain: ctx.terrain };
  const exeCtx: ExecutionContext = { resources: ctx.resources, needs: ctx.needs };

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
    } else {
      accepted.push(outcome);
      const actionEvents = executeAction(outcome, world, exeCtx);
      events.push(...actionEvents);
    }
  }

  return { world, events, accepted, rejections };
}
