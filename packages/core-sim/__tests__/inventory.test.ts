/**
 * inventory.test.ts — MVP-02 Phase A: Inventory capacity tests.
 */

import { describe, it, expect } from "vitest";
import { createWorld, validateAction, executeAction } from "../src";
import type { ActionIntent, EntityId, ResourceNodeId } from "@project-god/shared";

const TERRAIN = {
  grass: { displayName: "Grass", moveCostMultiplier: 1, passable: true, fertility: 0.5 },
};
const NEEDS = {
  hunger: { max: 100, initial: 80, decayPerTick: 1, deathThreshold: 0, criticalThreshold: 25 },
  thirst: { max: 100, initial: 80, decayPerTick: 2, deathThreshold: 0, criticalThreshold: 25 },
};
const RESOURCES = {
  berry: { displayName: "Berry", gatherAmount: 1, restoresNeed: { hunger: 20 }, maxQuantity: 100, regenPerTick: 0 },
};
const ACTIONS = {
  gather: { range: 1 },
  eat: { requiresInventory: "berry" },
  drop: {},
};

function makeWorld(inventoryCapacity: number = 3) {
  const world = createWorld({
    seed: 42, width: 5, height: 5, entityCount: 1,
    terrain: TERRAIN, needs: NEEDS,
    resourceNodes: [
      { position: { x: 0, y: 0 }, resourceType: "berry", quantity: 50, maxQuantity: 100, regenPerTick: 0 },
    ],
  });
  // Set entity at same position as resource, with limited capacity
  const entity = world.entities["entity_0" as EntityId];
  entity.position = { x: 0, y: 0 };
  entity.inventoryCapacity = inventoryCapacity;
  return world;
}

describe("inventory capacity (MVP-02)", () => {
  it("rejects gather when inventory is full", () => {
    const world = makeWorld(2);
    const entity = world.entities["entity_0" as EntityId];
    entity.inventory["berry"] = 2; // Full

    const intent: ActionIntent = {
      actorId: "entity_0" as EntityId,
      type: "gather",
      targetId: "rnode_0" as ResourceNodeId,
    };

    const result = validateAction(intent, world, { actions: ACTIONS, terrain: TERRAIN });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") {
      expect(result.reason).toContain("full");
    }
  });

  it("allows gather when inventory has space", () => {
    const world = makeWorld(5);
    const entity = world.entities["entity_0" as EntityId];
    entity.inventory["berry"] = 3;

    const intent: ActionIntent = {
      actorId: "entity_0" as EntityId,
      type: "gather",
      targetId: "rnode_0" as ResourceNodeId,
    };

    const result = validateAction(intent, world, { actions: ACTIONS, terrain: TERRAIN });
    expect(result.kind).toBe("validated");
  });

  it("gather clamps to remaining capacity", () => {
    const world = makeWorld(3);
    const entity = world.entities["entity_0" as EntityId];
    entity.inventory["berry"] = 2; // 1 slot left

    const intent: ActionIntent = {
      actorId: "entity_0" as EntityId,
      type: "gather",
      targetId: "rnode_0" as ResourceNodeId,
    };

    const validated = validateAction(intent, world, { actions: ACTIONS, terrain: TERRAIN });
    expect(validated.kind).toBe("validated");
    if (validated.kind === "validated") {
      const events = executeAction(validated, world, { resources: RESOURCES, needs: NEEDS });
      expect(events.length).toBeGreaterThan(0);
      // Should have gathered exactly 1 (clamped by remaining capacity)
      expect(entity.inventory["berry"]).toBe(3);
    }
  });

  it("drop removes item from inventory", () => {
    const world = makeWorld(5);
    const entity = world.entities["entity_0" as EntityId];
    entity.inventory["berry"] = 3;

    const intent: ActionIntent = {
      actorId: "entity_0" as EntityId,
      type: "drop",
      itemId: "berry",
    };

    const validated = validateAction(intent, world, { actions: ACTIONS, terrain: TERRAIN });
    expect(validated.kind).toBe("validated");
    if (validated.kind === "validated") {
      const events = executeAction(validated, world, { resources: RESOURCES, needs: NEEDS });
      expect(entity.inventory["berry"]).toBe(2);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe("ITEM_DROPPED");
    }
  });

  it("drop rejects when item not in inventory", () => {
    const world = makeWorld(5);

    const intent: ActionIntent = {
      actorId: "entity_0" as EntityId,
      type: "drop",
      itemId: "water",
    };

    const result = validateAction(intent, world, { actions: ACTIONS, terrain: TERRAIN });
    expect(result.kind).toBe("rejected");
  });

  it("drop rejects when no itemId specified", () => {
    const world = makeWorld(5);

    const intent: ActionIntent = {
      actorId: "entity_0" as EntityId,
      type: "drop",
    };

    const result = validateAction(intent, world, { actions: ACTIONS, terrain: TERRAIN });
    expect(result.kind).toBe("rejected");
  });
});
