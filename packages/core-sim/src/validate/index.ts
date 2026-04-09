import { ActionIntent, ActionOutcome, WorldState } from "@project-god/shared";
import type { TerrainDef, ActionDef, StructureDef, SkillDef } from "../content-types";
import { validateMove } from "./validate-move";
import { validateGather } from "./validate-gather";
import { validateConsume } from "./validate-consume";
import { validateDrop } from "./validate-drop";
import { validateBuild } from "./validate-build";
import { validatePray } from "./validate-pray";
import { validateRitual } from "./validate-ritual";

export interface ValidationContext {
  actions: Record<string, ActionDef>;
  terrain: Record<string, TerrainDef>;
  structures?: Record<string, StructureDef>;
  skills?: Record<string, SkillDef>;
  faith?: import("../content-types").FaithDef;
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

    case "drop":
      return validateDrop(intent, world);

    case "build":
      return validateBuild(intent, world, ctx.structures ?? {}, ctx.skills);

    case "pray":
      return validatePray(intent, world, ctx.faith);

    case "perform_ritual":
    case "participate_ritual":
      return validateRitual(intent, world, ctx);

    default:
      return { kind: "rejected", intent, reason: `Action '${intent.type}' not implemented` };
  }
}
