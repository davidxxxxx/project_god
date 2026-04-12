/**
 * execute-hunt.ts — Executes a validated "hunt" action.
 *
 * Resolves one tick of combat between the hunting human
 * and the target fauna using the shared combat resolver.
 * On kill: transfers loot to hunter, emits events, triggers herd aggro.
 */

import { WorldState, EntityState, SimEvent, EntityId, manhattan } from "@project-god/shared";
import type { GenericGameEvent } from "@project-god/shared";
import type { FaunaDef } from "../content-types";
import { resolveCombat, applyCombatResult } from "../systems/combat";

/**
 * Execute a hunt action.
 * @param actorId - The hunting human entity ID.
 * @param targetId - The target fauna entity ID.
 * @param world - Current world state (mutated).
 * @param faunaDefs - Fauna definitions for loot lookup.
 * @returns Array of events emitted.
 */
export function executeHunt(
  actorId: string,
  targetId: string,
  world: WorldState,
  faunaDefs: Record<string, FaunaDef>,
): SimEvent[] {
  const events: SimEvent[] = [];
  const hunter = world.entities[actorId] as EntityState;
  const target = world.entities[targetId] as EntityState;

  if (!hunter?.alive || !target?.alive) return events;

  // ── Resolve combat ──────────────────────────────────────
  const result = resolveCombat(hunter, target, world.tick, faunaDefs);
  applyCombatResult(hunter, target, result);

  // ── Emit combat event ───────────────────────────────────
  const hunterName = hunter.name ?? hunter.id;
  const species = String(target.attributes["species"] ?? "animal");
  const speciesDef = faunaDefs[species];
  const targetName = speciesDef?.displayName ?? species;

  events.push({
    type: "COMBAT_HIT",
    tick: world.tick,
    entityId: hunter.id,
    message: `${hunterName} struck the ${targetName} for ${result.defenderDamageTaken} damage.${result.attackerDamageTaken > 0 ? ` The ${targetName} fought back for ${result.attackerDamageTaken} damage.` : ""}`,
  } as GenericGameEvent);

  // ── Kill event + loot ────────────────────────────────────
  if (result.defenderDied) {
    events.push({
      type: "HUNT_SUCCESS",
      tick: world.tick,
      entityId: hunter.id,
      message: `${hunterName} successfully hunted a ${targetName}! Obtained: ${formatLoot(result.loot)}.`,
    } as GenericGameEvent);

    // Gain hunting skill
    if (hunter.skills) {
      hunter.skills["hunting"] = Math.min(1.0, (hunter.skills["hunting"] ?? 0) + 0.05);
    } else {
      hunter.skills = { hunting: 0.05 };
    }
  }

  // ── Herd aggro trigger ───────────────────────────────────
  if (speciesDef?.aggroType === "herd_retaliate") {
    const herdId = String(target.attributes["herdId"] ?? "");
    if (herdId) {
      // All herd members within detection range target the hunter
      const herdMembers = (Object.values(world.entities) as EntityState[])
        .filter(e =>
          e.alive &&
          e.type === "fauna" &&
          e.id !== target.id &&
          String(e.attributes["herdId"]) === herdId &&
          manhattan(e.position, hunter.position) <= (speciesDef.detectionRadius ?? 6)
        );

      for (const member of herdMembers) {
        member.attributes["combatTarget"] = hunter.id as any;
        member.attributes["aiState"] = 3; // AI_CHASE
      }

      if (herdMembers.length > 0) {
        events.push({
          type: "COMBAT_HIT",
          tick: world.tick,
          entityId: hunter.id,
          message: `The ${targetName} herd (${herdMembers.length} members) turned hostile toward ${hunterName}!`,
        } as GenericGameEvent);
      }
    }
  }

  // ── Hunter died ─────────────────────────────────────────
  if (result.attackerDied) {
    events.push({
      type: "ANIMAL_KILLED",
      tick: world.tick,
      entityId: hunter.id,
      message: `${hunterName} was killed while hunting a ${targetName}.`,
    } as GenericGameEvent);
  }

  return events;
}

function formatLoot(loot: Record<string, number>): string {
  return Object.entries(loot).map(([k, v]) => `${v}× ${k}`).join(", ") || "nothing";
}
