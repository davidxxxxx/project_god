import { ValidatedAction, WorldState, SimEvent } from "@project-god/shared";
import type { ResourceDef, NeedDef } from "../content-types";
import { executeMove } from "./execute-move";
import { executeGather } from "./execute-gather";
import { executeConsume } from "./execute-consume";

export interface ExecutionContext {
  resources: Record<string, ResourceDef>;
  needs: Record<string, NeedDef>;
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
    default:
      return [];
  }
}
