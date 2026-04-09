import { ActionIntent, ActionOutcome, WorldState, manhattan } from "@project-god/shared";
import type { TerrainDef, ActionDef, StructureDef, SkillDef, ResourceDef, RecipeDef } from "../content-types";
import { validateMove } from "./validate-move";
import { validateGather } from "./validate-gather";
import { validateConsume } from "./validate-consume";
import { validateDrop } from "./validate-drop";
import { validateBuild } from "./validate-build";
import { validatePray } from "./validate-pray";
import { validateRitual } from "./validate-ritual";
import { validateHarvest } from "./validate-harvest";
import { validateCook } from "./validate-cook";
import { validatePlant } from "./validate-plant";

export interface ValidationContext {
  actions: Record<string, ActionDef>;
  terrain: Record<string, TerrainDef>;
  structures?: Record<string, StructureDef>;
  skills?: Record<string, SkillDef>;
  faith?: import("../content-types").FaithDef;
  /** Resource definitions for harvest validation. MVP-02X. */
  resources?: Record<string, ResourceDef>;
  /** Recipe definitions for cook validation. MVP-02X. */
  recipes?: Record<string, RecipeDef>;
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

    case "harvest":
      return validateHarvest(intent, world, ctx.resources ?? {});

    case "cook":
      return validateCook(intent, world, ctx.recipes ?? {});

    case "add_fuel": {
      // Inline validation: has wood + near fire_pit
      const e = world.entities[intent.actorId];
      if ((e.inventory["wood"] ?? 0) <= 0) {
        return { kind: "rejected", intent, reason: "no wood in inventory" };
      }
      const fuelStructures = Object.values(world.structures ?? {});
      const hasNearbyFire = fuelStructures.some(
        (s: any) => s.active && s.type === "fire_pit" && manhattan(e.position, s.position) <= 1
      );
      if (!hasNearbyFire) {
        return { kind: "rejected", intent, reason: "no active fire_pit nearby" };
      }
      return { kind: "validated", intent, energyCost: 1, timeCost: 1 };
    }

    // MVP-02Y: Planting
    case "plant":
      return validatePlant(intent, world, ctx.terrain);

    default:
      return { kind: "rejected", intent, reason: `Action '${intent.type}' not implemented` };
  }
}
