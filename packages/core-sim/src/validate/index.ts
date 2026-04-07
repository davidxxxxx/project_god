import { ActionIntent, ActionOutcome, WorldState } from "@project-god/shared";
import type { TerrainDef, ActionDef } from "../content-types";
import { validateMove } from "./validate-move";
import { validateGather } from "./validate-gather";
import { validateConsume } from "./validate-consume";

export interface ValidationContext {
  actions: Record<string, ActionDef>;
  terrain: Record<string, TerrainDef>;
}

export function validateAction(
  intent: ActionIntent,
  world: WorldState,
  ctx: ValidationContext
): ActionOutcome {
  const entity = world.entities[intent.actorId];

  if (!entity) {
    return { kind: "rejected", intent, reason: `Entity ${intent.actorId} does not exist` };
  }
  if (!entity.alive) {
    return { kind: "rejected", intent, reason: `Entity ${intent.actorId} is dead` };
  }

  switch (intent.type) {
    case "idle":
      return { kind: "validated", intent, energyCost: 0, timeCost: 1 };

    case "move":
      return validateMove(intent, world, ctx.terrain);

    case "gather": {
      const range = ctx.actions["gather"]?.range ?? 1;
      return validateGather(intent, world, range);
    }

    case "eat": {
      const item = ctx.actions["eat"]?.requiresInventory ?? "berry";
      return validateConsume(intent, world, item);
    }

    case "drink": {
      const item = ctx.actions["drink"]?.requiresInventory ?? "water";
      return validateConsume(intent, world, item);
    }

    default:
      return { kind: "rejected", intent, reason: `Action '${intent.type}' not implemented` };
  }
}
