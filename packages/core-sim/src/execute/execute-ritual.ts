import { ValidatedAction, WorldState, SimEvent } from "@project-god/shared";
import type { ExecutionContext } from "./index";

export function executeRitual(
  action: ValidatedAction,
  world: WorldState,
  ctx: ExecutionContext
): SimEvent[] {
  const events: SimEvent[] = [];
  const intent = action.intent;
  const entity = world.entities[intent.actorId];
  const tick = world.tick;

  if (intent.type === "perform_ritual") {
    const tribe = world.tribes![entity.tribeId];
    const structureId = tribe.spiritualCenterId!;
    const shrine = world.structures![structureId];
    
    // Priest performs ritual!
    // Cost: maybe consume 1 berry from Shrine? For now just time.
    events.push({
      type: "RITUAL_COMPLETED",
      tick,
      entityId: entity.id,
      tribeId: tribe.id,
      structureId: shrine.id,
      position: { ...shrine.position }
    } as SimEvent);

    // Give priest a faith bump and God gets divine points
    const oldFaith = entity.attributes.faith ?? 0;
    const newFaith = Math.min(100, oldFaith + (ctx.faith?.FAITH_GAIN_ON_MIRACLE ?? 10)); // Re-using miracle faith gain for ritual
    if (oldFaith !== newFaith) {
      entity.attributes.faith = newFaith;
      events.push({
        type: "FAITH_CHANGED",
        tick,
        entityId: entity.id,
        oldFaith,
        newFaith,
        reason: "performed_ritual"
      } as SimEvent);
    }

    if (world.divinePoints !== undefined && ctx.faith) {
      const maxDP = world.maxDivinePoints ?? ctx.faith.DIVINE_POINTS_MAX;
      world.divinePoints = Math.min(maxDP, world.divinePoints + 2); // 2 DP per ritual
    }
  }

  if (intent.type === "participate_ritual") {
    // Participant gets a faith bump
    const oldFaith = entity.attributes.faith ?? 0;
    const newFaith = Math.min(100, oldFaith + (ctx.faith?.FAITH_GAIN_WITNESS ?? 5));
    if (oldFaith !== newFaith) {
      entity.attributes.faith = newFaith;
      events.push({
        type: "FAITH_CHANGED",
        tick,
        entityId: entity.id,
        oldFaith,
        newFaith,
        reason: "participated_ritual"
      } as SimEvent);
    }
  }

  return events;
}
