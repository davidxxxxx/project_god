import { ValidatedAction, WorldState, SimEvent, EntityMovedEvent } from "@project-god/shared";

export function executeMove(action: ValidatedAction, world: WorldState): SimEvent[] {
  const entity = world.entities[action.intent.actorId];
  if (!entity || !entity.alive) return [];

  const from = { ...entity.position };
  const to = action.intent.position!;
  entity.position = { ...to };

  return [{
    type: "ENTITY_MOVED",
    tick: world.tick,
    entityId: entity.id,
    from,
    to,
  } as EntityMovedEvent];
}
