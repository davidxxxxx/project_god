/**
 * snapshot.ts — Builds DebugProjection from world state + recent events.
 * This is a DERIVED view. It never mutates the world.
 */

import {
  WorldState, EntityState, ResourceNodeState, StructureState, TribeState, EnvironmentState,
  SimEvent, ActionIntent, LifeStage,
  DebugProjection, DebugAgentView, DebugResourceView, DebugStructureView, DebugTribeView, DebugEnvironmentView,
  TickResult,
} from "@project-god/shared";

export function buildProjection(
  world: WorldState,
  recentTickResults: TickResult[],
  maxRecentEvents: number = 30
): DebugProjection {
  // ── Build agent views ────────────────────────────────────
  const agents: DebugAgentView[] = [];
  for (const entity of Object.values(world.entities) as EntityState[]) {
    // Find the last action for this agent from recent results
    let lastAction: ActionIntent | undefined;
    let lastActionResult: "validated" | "rejected" | undefined;
    let lastActionReason: string | undefined;

    for (let i = recentTickResults.length - 1; i >= 0; i--) {
      const tr = recentTickResults[i];
      const accepted = tr.accepted.find((a) => a.intent.actorId === entity.id);
      if (accepted) {
        lastAction = accepted.intent;
        lastActionResult = "validated";
        lastActionReason = accepted.intent.reason;
        break;
      }
      const rejected = tr.rejections.find((r) => r.intent.actorId === entity.id);
      if (rejected) {
        lastAction = rejected.intent;
        lastActionResult = "rejected";
        lastActionReason = rejected.reason;
        break;
      }
    }

    // MVP-04: Derive life stage
    const age = entity.age ?? 0;
    const maxAge = entity.maxAge ?? 70;
    let lifeStage: string = "adult";
    if (age < 15) lifeStage = "child";
    else if (maxAge > 0 && age >= maxAge * 0.75) lifeStage = "elder";

    agents.push({
      id: entity.id,
      position: { ...entity.position },
      alive: entity.alive,
      needs: { ...entity.needs },
      inventory: { ...entity.inventory },
      skills: { ...(entity.skills ?? {}) },
      tribeId: entity.tribeId,
      socialMemoryCount: entity.socialMemory ? Object.keys(entity.socialMemory).length : 0,
      statuses: [...(entity.statuses ?? [])],
      semanticMemoryCount: entity.semanticMemory?.length ?? 0,
      age,
      sex: entity.sex ?? "unknown",
      lifeStage,
      spouseId: entity.spouseId ?? undefined,
      childCount: entity.childIds?.length ?? 0,
      faith: entity.attributes?.faith ?? 0,
      isPraying: entity.isPraying ?? false,
      role: entity.role,
      doctrineViolations: entity.doctrineAlignment
        ? Object.values(entity.doctrineAlignment).filter(v => v < 0).length
        : 0,
      knownRecipes: { ...(entity.knownRecipes ?? {}) },
      preferences: { ...(entity.preferences ?? {}) },
      homeStructureId: entity.homeStructureId ?? undefined,
      lastAction,
      lastActionResult,
      lastActionReason,
    });
  }

  // ── Build resource views ─────────────────────────────────
  const resources: DebugResourceView[] = [];
  for (const node of Object.values(world.resourceNodes) as ResourceNodeState[]) {
    resources.push({
      id: node.id,
      position: { ...node.position },
      resourceType: node.resourceType,
      quantity: Math.round(node.quantity * 10) / 10,
      maxQuantity: node.maxQuantity,
    });
  }

  // ── Collect recent events ────────────────────────────────
  const allRecentEvents: SimEvent[] = [];
  for (const tr of recentTickResults) {
    allRecentEvents.push(...tr.events);
  }
  const recentEvents = allRecentEvents.slice(-maxRecentEvents);

  // ── Counters ─────────────────────────────────────────────
  const aliveAgents = agents.filter((a) => a.alive).length;
  const deadAgents = agents.filter((a) => !a.alive).length;

  let totalEvents = 0, rejectedActions = 0, gatherCount = 0, eatCount = 0, drinkCount = 0, buildCount = 0, skillLearnedCount = 0, techUnlockedCount = 0;
  for (const tr of recentTickResults) {
    totalEvents += tr.events.length;
    rejectedActions += tr.rejections.length;
    for (const ev of tr.events) {
      if (ev.type === "RESOURCE_GATHERED") gatherCount++;
      if (ev.type === "FOOD_EATEN") eatCount++;
      if (ev.type === "WATER_DRUNK") drinkCount++;
      if (ev.type === "STRUCTURE_BUILT") buildCount++;
      if (ev.type === "SKILL_LEARNED") skillLearnedCount++;
      if (ev.type === "TECHNOLOGY_UNLOCKED") techUnlockedCount++;
    }
  }

  // ── Build structure views ────────────────────────────────
  const structures: DebugStructureView[] = [];
  if (world.structures) {
    for (const s of Object.values(world.structures) as StructureState[]) {
      structures.push({
        id: s.id,
        type: s.type,
        position: { ...s.position },
        active: s.active,
        durability: s.durability,
        builtByEntityId: s.builtByEntityId,
        builtAtTick: s.builtAtTick,
      });
    }
  }
  // ── Build tribe views (MVP-02-E) ────────────────────────
  const tribes: DebugTribeView[] = [];
  if (world.tribes) {
    for (const t of Object.values(world.tribes) as TribeState[]) {
      const aliveMemberCount = t.memberIds.filter((id) => {
        const e = world.entities[id];
        return e?.alive;
      }).length;
      tribes.push({
        id: t.id,
        name: t.name,
        memberCount: t.memberIds.length,
        aliveMemberCount,
        technologies: [...t.technologies],
        gatherPoint: t.gatherPoint ? { ...t.gatherPoint } : undefined,
        culturalMemoryCount: t.culturalMemory?.length ?? 0,
        priestId: t.priestId,
        spiritualCenterId: t.spiritualCenterId,
        doctrines: (t.doctrines ?? []).map(d => ({ id: d.id, type: d.type, strength: d.strength })),
      });
    }
  }

  const tribeCount = tribes.length;

  // ── Build environment view (MVP-03-A) ──────────────────────
  let environment: DebugEnvironmentView | undefined;
  if (world.environment) {
    environment = {
      temperature: Math.round(world.environment.temperature * 10) / 10,
      timeOfDay: world.environment.timeOfDay,
      dayLength: world.environment.dayLength,
    };
  }

  // Count active shelters
  const shelterCount = structures.filter((s) => s.active && s.type === "lean_to").length;

  // Count knowledge (MVP-03-B)
  let totalSemanticFacts = 0;
  for (const entity of Object.values(world.entities) as EntityState[]) {
    totalSemanticFacts += entity.semanticMemory?.length ?? 0;
  }
  let totalCulturalFacts = 0;
  if (world.tribes) {
    for (const t of Object.values(world.tribes) as TribeState[]) {
      totalCulturalFacts += t.culturalMemory?.length ?? 0;
    }
  }

  // Count lifecycle stats (MVP-04)
  let totalBirths = 0, totalPairBonds = 0;
  for (const tr of recentTickResults) {
    for (const ev of tr.events) {
      if (ev.type === "ENTITY_BORN") totalBirths++;
      if (ev.type === "PAIR_BONDED") totalPairBonds++;
    }
  }
  const aliveAgentsList = agents.filter((a) => a.alive);
  const childCount = aliveAgentsList.filter((a) => a.lifeStage === "child").length;
  const elderCount = aliveAgentsList.filter((a) => a.lifeStage === "elder").length;

  // Count faith stats (MVP-05)
  let totalPrayers = 0, totalMiracles = 0;
  for (const tr of recentTickResults) {
    for (const ev of tr.events) {
      if (ev.type === "PRAYER_STARTED") totalPrayers++;
      if (ev.type === "MIRACLE_PERFORMED") totalMiracles++;
    }
  }
  const prayingCount = aliveAgentsList.filter((a) => a.isPraying).length;

  return {
    tick: world.tick,
    seed: world.seed,
    agents,
    resources,
    structures,
    tribes,
    environment,
    recentEvents,
    counters: {
      aliveAgents, deadAgents, totalEvents, rejectedActions,
      gatherCount, eatCount, drinkCount, buildCount,
      skillLearnedCount, techUnlockedCount, tribeCount,
      shelterCount, totalSemanticFacts, totalCulturalFacts,
      childCount, elderCount, totalBirths, totalPairBonds,
      totalPrayers, totalMiracles, prayingCount,
    },
    divinePoints: world.divinePoints ?? 0,
    maxDivinePoints: world.maxDivinePoints ?? 20,
    // MVP-02Y: Tile terrain data for renderer
    tiles: Object.values(world.tiles).map((t: any) => ({
      x: t.position.x,
      y: t.position.y,
      terrain: t.terrain,
    })),
  };
}
