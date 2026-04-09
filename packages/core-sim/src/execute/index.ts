import { ValidatedAction, WorldState, SimEvent } from "@project-god/shared";
import type { ResourceDef, NeedDef, StructureDef, SkillDef } from "../content-types";
import { executeMove } from "./execute-move";
import { executeGather } from "./execute-gather";
import { executeConsume } from "./execute-consume";
import { executeDrop } from "./execute-drop";
import { executeBuild } from "./execute-build";
import { executePray } from "./execute-pray";
import { executeRitual } from "./execute-ritual";

export interface ExecutionContext {
  resources: Record<string, ResourceDef>;
  needs: Record<string, NeedDef>;
  structures?: Record<string, StructureDef>;
  skills?: Record<string, SkillDef>;
  faith?: import("../content-types").FaithDef;
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
      return executeMove(action, world);
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
    default:
      return [];
  }
}
