/**
 * execute-harvest.ts — MVP-02X: Labor extraction action.
 *
 * Used for: wood (from tree), stone (from rock), grass/fiber (from grassland).
 * Distinguished from 'gather' which is instant pickup (berry, water).
 */

import {
  WorldState, ActionIntent, SimEvent, ValidatedAction,
  ResourceNodeState, EntityState,
  ResourceHarvestedEvent,
} from "@project-god/shared";
import type { ResourceDef } from "../content-types";

export function executeHarvest(
  world: WorldState,
  va: ValidatedAction,
  resourceDefs: Record<string, ResourceDef>
): SimEvent[] {
  const events: SimEvent[] = [];
  const entity = world.entities[va.intent.actorId] as EntityState;
  if (!entity?.alive) return events;

  const nodeId = va.intent.targetId;
  if (!nodeId) return events;

  const node = world.resourceNodes[nodeId] as ResourceNodeState | undefined;
  if (!node || node.quantity <= 0) return events;

  const def = resourceDefs[node.resourceType];
  if (!def) return events;

  // P0: Skill proficiency scaling
  // Map resource type to relevant skill for efficiency
  const HARVEST_SKILL_MAP: Record<string, string> = {
    wood: "tool_making",
    stone: "tool_making",
    grass: "planting",
    fiber: "planting",
    clay: "tool_making",
  };
  const relevantSkill = HARVEST_SKILL_MAP[node.resourceType];
  const proficiency = relevantSkill ? (entity.skills?.[relevantSkill] ?? 0) : 0;
  // Proficiency multiplier: 0→1.0x, 0.5→1.25x, 1.0→1.5x
  const proficiencyMultiplier = 1.0 + (proficiency * 0.5);

  // P0: Tool bonus — stone_tool gives +50%
  const hasToolBonus = (entity.inventory["stone_tool"] ?? 0) > 0;
  const toolMultiplier = hasToolBonus ? 1.5 : 1.0;

  const baseAmount = def.gatherAmount;
  const scaledAmount = Math.max(1, Math.round(baseAmount * proficiencyMultiplier * toolMultiplier));
  const amount = Math.min(scaledAmount, node.quantity);
  node.quantity -= amount;

  // Add to inventory
  if (!entity.inventory) entity.inventory = {};
  entity.inventory[node.resourceType] = (entity.inventory[node.resourceType] ?? 0) + amount;

  events.push({
    type: "RESOURCE_HARVESTED",
    tick: world.tick,
    entityId: entity.id,
    resourceType: node.resourceType,
    amount,
    position: { ...node.position },
  } as ResourceHarvestedEvent);

  return events;
}
