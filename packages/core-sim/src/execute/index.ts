import { ValidatedAction, WorldState, SimEvent } from "@project-god/shared";
import type { ResourceDef, NeedDef, StructureDef, SkillDef, RecipeDef, TerrainDef } from "../content-types";
import { executeMove } from "./execute-move";
import { executeGather } from "./execute-gather";
import { executeConsume } from "./execute-consume";
import { executeDrop } from "./execute-drop";
import { executeBuild } from "./execute-build";
import { executePray } from "./execute-pray";
import { executeRitual } from "./execute-ritual";
import { executeHarvest } from "./execute-harvest";
import { executeCook } from "./execute-cook";
import { executeFuel } from "./execute-fuel";
import { executePlant } from "./execute-plant";

export interface ExecutionContext {
  resources: Record<string, ResourceDef>;
  needs: Record<string, NeedDef>;
  structures?: Record<string, StructureDef>;
  skills?: Record<string, SkillDef>;
  faith?: import("../content-types").FaithDef;
  /** Recipe definitions for cooking. MVP-02X. */
  recipes?: Record<string, RecipeDef>;
  /** Terrain definitions for movement cost. MVP-02Y. */
  terrain?: Record<string, TerrainDef>;
}

export function executeAction(
  action: ValidatedAction,
  world: WorldState,
  ctx: ExecutionContext
): SimEvent[] {
  switch (action.intent.type) {
    case "idle":
      return [];
    case "move":
      return executeMove(action, world, ctx.terrain);
    case "gather":
      return executeGather(action, world, ctx.resources);
    case "eat":
    case "drink":
      return executeConsume(action, world, ctx.resources, ctx.needs);
    case "drop":
      return executeDrop(action, world);
    case "build":
      return executeBuild(action, world, ctx.structures ?? {}, ctx.skills);
    case "pray":
      return executePray(action, world, ctx.faith);
    case "perform_ritual":
    case "participate_ritual":
      return executeRitual(action, world, ctx);
    // MVP-02X: New actions
    case "harvest":
      return executeHarvest(world, action, ctx.resources);
    case "cook":
      return executeCook(world, action, ctx.recipes ?? {});
    case "add_fuel":
      return executeFuel(world, action);
    // MVP-02Y: Planting
    case "plant":
      return executePlant(action, world);
    default:
      return [];
  }
}
