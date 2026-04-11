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
import { validateWade } from "./validate-wade";

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

    // MVP-03: River crossing
    case "wade":
      return validateWade(intent, world, ctx.terrain);

    // ── Phase 3: Social Actions ──────────────────────────────

    case "talk":
    case "teach":
    case "comfort": {
      // Require a nearby alive entity within range 2
      const actor = world.entities[intent.actorId];
      const nearbyEntities = Object.values(world.entities).filter(
        (e: any) => e.id !== actor.id && e.alive && manhattan(actor.position, e.position) <= 2
      );
      if (nearbyEntities.length === 0) {
        return { kind: "rejected", intent, reason: "no entity nearby to interact with" };
      }
      return { kind: "validated", intent, energyCost: 1, timeCost: 2 };
    }

    case "trade":
    case "gift": {
      const actor2 = world.entities[intent.actorId];
      // Must have something in inventory
      const hasItems = Object.values(actor2.inventory).some((v: number) => v > 0);
      if (!hasItems) {
        return { kind: "rejected", intent, reason: "nothing in inventory to give/trade" };
      }
      const nearbyForTrade = Object.values(world.entities).filter(
        (e: any) => e.id !== actor2.id && e.alive && manhattan(actor2.position, e.position) <= 2
      );
      if (nearbyForTrade.length === 0) {
        return { kind: "rejected", intent, reason: "no entity nearby to trade/gift with" };
      }
      return { kind: "validated", intent, energyCost: 1, timeCost: 2 };
    }

    // ── Phase 3: Production Actions ──────────────────────────

    case "craft": {
      // Validate recipe exists and actor has materials
      if (!intent.recipeId) {
        return { kind: "rejected", intent, reason: "no recipe specified for craft" };
      }
      const recipe = (ctx.recipes ?? {})[intent.recipeId];
      if (!recipe) {
        return { kind: "rejected", intent, reason: `recipe '${intent.recipeId}' not found` };
      }
      const crafter = world.entities[intent.actorId];
      for (const [item, qty] of Object.entries(recipe.inputs)) {
        if ((crafter.inventory[item] ?? 0) < qty) {
          return { kind: "rejected", intent, reason: `insufficient ${item} (need ${qty})` };
        }
      }
      return { kind: "validated", intent, energyCost: 2, timeCost: 3 };
    }

    case "fish": {
      // Must be adjacent to a water tile
      const fisher = world.entities[intent.actorId];
      const adjacentTiles = [
        { x: fisher.position.x - 1, y: fisher.position.y },
        { x: fisher.position.x + 1, y: fisher.position.y },
        { x: fisher.position.x, y: fisher.position.y - 1 },
        { x: fisher.position.x, y: fisher.position.y + 1 },
      ];
      const hasWater = adjacentTiles.some((pos) => {
        const key = `${pos.x},${pos.y}`;
        const tile = world.tiles[key];
        return tile && (tile.terrain === "river" || tile.terrain === "shallow_water" || tile.terrain === "water");
      });
      if (!hasWater) {
        return { kind: "rejected", intent, reason: "no water tile adjacent for fishing" };
      }
      return { kind: "validated", intent, energyCost: 2, timeCost: 3 };
    }

    // ── Phase 3: Exploration Actions ─────────────────────────

    case "scout":
      // Always valid — reveals extra tiles
      return { kind: "validated", intent, energyCost: 1, timeCost: 2 };

    // ── Phase 3: Creative Actions ────────────────────────────

    case "experiment": {
      // Must have at least 2 different item types
      const experimenter = world.entities[intent.actorId];
      const itemTypes = Object.entries(experimenter.inventory).filter(([_, v]) => v > 0).length;
      if (itemTypes < 2) {
        return { kind: "rejected", intent, reason: "need at least 2 different items to experiment" };
      }
      return { kind: "validated", intent, energyCost: 2, timeCost: 3 };
    }

    default:
      return { kind: "rejected", intent, reason: `Action '${intent.type}' not implemented` };
  }
}
