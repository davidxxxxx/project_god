/**
 * perception.ts — Builds an agent's view of the world.
 * MVP-02: extended with memory-based resource recall.
 * MVP-03-A: extended with environment awareness (temperature, exposure).
 */

import {
  EntityState, ResourceNodeState, StructureState, TribeState, WorldState,
  Vec2, manhattan, EpisodicEntry, TimeOfDay, SemanticEntry, CulturalEntry,
} from "@project-god/shared";
import { recallResourcePositions, isRememberedDepleted } from "./memory";

/** Temperature below this triggers exposure decay. Must match environment-tick.ts COLD_THRESHOLD. */
const COLD_THRESHOLD = 40;

export interface AgentSnapshot {
  self: EntityState;
  /** Resources currently visible within perception radius. */
  nearbyResources: ResourceNodeState[];
  /** Resource positions recalled from episodic memory (not currently visible). */
  memorizedResourcePositions: { resourceType: string; position: Vec2 }[];
  /** Active structures within perception radius. */
  nearbyActiveStructures: StructureState[];
  /** Nearby alive entities that have at least one skill (potential teachers). */
  nearbySkilled: { entityId: string; skills: Record<string, number>; position: Vec2 }[];
  /** This entity's own skills (convenience accessor). */
  selfSkills: Record<string, number>;
  /** All nearby alive entities (MVP-02-E social perception). */
  nearbyEntities: { entityId: string; tribeId: string; position: Vec2 }[];
  /** This entity's tribe's gather point, if available (MVP-02-E). */
  tribeGatherPoint?: Vec2;
  /** Resource positions shared by nearby tribe members' episodic memory (MVP-02-E). */
  sharedResourcePositions: { resourceType: string; position: Vec2; sharedBy: string }[];
  /** Total items currently carried. */
  inventoryTotal: number;
  /** Remaining inventory capacity. */
  inventoryRemaining: number;
  /** Current world temperature (MVP-03-A). */
  temperature: number;
  /** Current time of day (MVP-03-A). */
  timeOfDay: TimeOfDay;
  /** Whether the world is currently cold enough to cause exposure (MVP-03-A). */
  isCold: boolean;
  /** This entity's current exposure level (MVP-03-A). */
  selfExposure: number;
  /** Resource positions from semantic memory, higher confidence than episodic. (MVP-03-B) */
  semanticResourceLocations: { resourceType: string; position: Vec2; confidence: number }[];
  /** Knowledge facts from tribe cultural memory (MVP-03-B). */
  culturalKnowledge: { resourceType: string; position: Vec2; confidence: number }[];
  /** Count of this entity's semantic memory entries (MVP-03-B). */
  semanticMemoryCount: number;
  // ── MVP-07A: Priest/Shrine awareness ────────────────────
  /** Position of tribe's shrine, if built. */
  tribeShrinePosition?: Vec2;
  /** Entity ID of current tribe priest (may be self). */
  tribePriestId?: string;
  /** This entity's role (e.g. "priest"). */
  selfRole?: string;
  /** Terrain types/costs for adjacent tiles (MVP-02Y). */
  nearbyTerrain: { position: Vec2; terrain: string; moveCost: number; passable: boolean }[];
  /** Reference to world tiles for pathfinding. MVP-02Y. */
  worldTiles?: Record<string, { terrain: string }>;
  /** Terrain defs for cost lookup. MVP-02Y. */
  terrainDefs?: Record<string, { moveCostMultiplier: number; passable: boolean }>;
}

/** Default perception radius in manhattan distance. */
const PERCEPTION_RADIUS = 10;
/** Default inventory capacity if not set on entity. */
const DEFAULT_INVENTORY_CAPACITY = 10;

export function perceive(
  entityId: string,
  world: WorldState,
  radius: number = PERCEPTION_RADIUS,
  terrainDefs?: Record<string, { moveCostMultiplier: number; passable: boolean }>
): AgentSnapshot {
  const self = world.entities[entityId];

  // ── Visible resources ─────────────────────────────────────
  const nearbyResources = Object.values(world.resourceNodes).filter(
    (node: ResourceNodeState) => node.quantity > 0 && manhattan(self.position, node.position) <= radius
  );

  // ── Memory-based recall ───────────────────────────────────
  const memorizedResourcePositions: AgentSnapshot["memorizedResourcePositions"] = [];

  // Only recall from memory if we can't see enough resources
  for (const resType of ["berry", "water"]) {
    const visibleOfType = nearbyResources.filter((r) => r.resourceType === resType);
    if (visibleOfType.length === 0) {
      // No visible resources of this type — check memory
      const recalled = recallResourcePositions(self, resType);
      for (const pos of recalled) {
        // Skip positions remembered as depleted
        if (!isRememberedDepleted(self, pos)) {
          memorizedResourcePositions.push({ resourceType: resType, position: pos });
        }
      }
    }
  }

  // ── Inventory awareness ───────────────────────────────────
  const inventoryTotal = Object.values(self.inventory).reduce((sum, qty) => sum + qty, 0);
  const capacity = self.inventoryCapacity ?? DEFAULT_INVENTORY_CAPACITY;
  const inventoryRemaining = Math.max(0, capacity - inventoryTotal);

  // ── Nearby structures ─────────────────────────────────────
  const nearbyActiveStructures = world.structures
    ? (Object.values(world.structures) as StructureState[]).filter(
        (s) => s.active && manhattan(self.position, s.position) <= radius
      )
    : [];

  // ── Nearby skilled entities (MVP-02-D) ─────────────────────
  const nearbySkilled: AgentSnapshot["nearbySkilled"] = [];
  const nearbyEntities: AgentSnapshot["nearbyEntities"] = [];
  for (const other of Object.values(world.entities) as EntityState[]) {
    if (!other.alive || other.id === self.id) continue;
    if (manhattan(self.position, other.position) > radius) continue;
    nearbyEntities.push({
      entityId: other.id,
      tribeId: other.tribeId,
      position: { ...other.position },
    });
    if (other.skills && Object.keys(other.skills).length > 0) {
      nearbySkilled.push({
        entityId: other.id,
        skills: { ...other.skills },
        position: { ...other.position },
      });
    }
  }

  const selfSkills = self.skills ?? {};

  // ── Tribe gather point (MVP-02-E) ─────────────────────────
  let tribeGatherPoint: Vec2 | undefined;
  if (world.tribes && self.tribeId) {
    const tribe = world.tribes[self.tribeId] as TribeState | undefined;
    tribeGatherPoint = tribe?.gatherPoint;
  }

  // ── Shared resource memory from nearby tribe members (MVP-02-E)
  const sharedResourcePositions: AgentSnapshot["sharedResourcePositions"] = [];
  for (const ne of nearbyEntities) {
    if (ne.tribeId !== self.tribeId) continue;
    const other = world.entities[ne.entityId] as EntityState;
    if (!other.episodicMemory) continue;
    for (const entry of other.episodicMemory) {
      if (entry.type === "found_resource" && entry.resourceType) {
        // Only share what we don't already know
        const already = memorizedResourcePositions.some(
          (m) => m.position.x === entry.position.x && m.position.y === entry.position.y
        );
        if (!already) {
          sharedResourcePositions.push({
            resourceType: entry.resourceType,
            position: { ...entry.position },
            sharedBy: ne.entityId,
          });
        }
      }
    }
  }

  // ── Environment awareness (MVP-03-A) ───────────────────────
  const temperature = world.environment?.temperature ?? 60;
  const timeOfDay: TimeOfDay = world.environment?.timeOfDay ?? "day";
  const isCold = temperature < COLD_THRESHOLD;
  const selfExposure = self.needs.exposure ?? 100;

  // ── Semantic memory resource locations (MVP-03-B) ──────────
  const semanticResourceLocations: AgentSnapshot["semanticResourceLocations"] = [];
  if (self.semanticMemory) {
    for (const sem of self.semanticMemory) {
      if (sem.confidence <= 0.3) continue; // too faint to act on
      if (sem.fact === "resource_location" && sem.position && sem.subject) {
        semanticResourceLocations.push({
          resourceType: sem.subject,
          position: { ...sem.position },
          confidence: sem.confidence,
        });
      } else if (sem.fact === "water_location" && sem.position) {
        semanticResourceLocations.push({
          resourceType: "water",
          position: { ...sem.position },
          confidence: sem.confidence,
        });
      }
    }
  }

  // ── Cultural knowledge from tribe (MVP-03-B) ───────────────
  const culturalKnowledge: AgentSnapshot["culturalKnowledge"] = [];
  if (world.tribes && self.tribeId) {
    const tribe = world.tribes[self.tribeId] as TribeState | undefined;
    if (tribe?.culturalMemory) {
      for (const cm of tribe.culturalMemory) {
        if (cm.confidence <= 0.3) continue;
        if ((cm.fact === "resource_location" || cm.fact === "water_location") && cm.position) {
          const alreadyKnown = semanticResourceLocations.some(
            (s) => s.position.x === cm.position!.x && s.position.y === cm.position!.y
          );
          if (!alreadyKnown) {
            culturalKnowledge.push({
              resourceType: cm.subject ?? (cm.fact === "water_location" ? "water" : "berry"),
              position: { ...cm.position },
              confidence: cm.confidence,
            });
          }
        }
      }
    }
  }

  const semanticMemoryCount = self.semanticMemory?.length ?? 0;

  // ── MVP-07A: Shrine / Priest awareness ─────────────────────
  let tribeShrinePosition: Vec2 | undefined;
  let tribePriestId: string | undefined;
  if (world.tribes && self.tribeId) {
    const tribe = world.tribes[self.tribeId] as TribeState | undefined;
    tribePriestId = tribe?.priestId;
    if (tribe?.spiritualCenterId && world.structures) {
      const shrine = world.structures[tribe.spiritualCenterId];
      if (shrine?.active) {
        tribeShrinePosition = { ...shrine.position };
      }
    }
  }
  const selfRole = self.role;

  // ── MVP-02Y: Nearby terrain for pathfinding ────────────────
  const nearbyTerrain: AgentSnapshot["nearbyTerrain"] = [];
  const TERRAIN_SCAN_RADIUS = 2;
  for (let dy = -TERRAIN_SCAN_RADIUS; dy <= TERRAIN_SCAN_RADIUS; dy++) {
    for (let dx = -TERRAIN_SCAN_RADIUS; dx <= TERRAIN_SCAN_RADIUS; dx++) {
      if (dx === 0 && dy === 0) continue;
      const tx = self.position.x + dx;
      const ty = self.position.y + dy;
      const tKey = `${tx},${ty}`;
      const tile = world.tiles[tKey];
      if (!tile) continue;
      const tDef = tile.terrain;
      // We don't have terrain defs directly, so we store raw terrain type
      // and let the policy/pathfinder look up cost from terrainDefs
      nearbyTerrain.push({
        position: { x: tx, y: ty },
        terrain: tDef,
        moveCost: 1, // placeholder, will be resolved by policy
        passable: true,
      });
    }
  }

  return {
    self, nearbyResources, memorizedResourcePositions, nearbyActiveStructures,
    nearbySkilled, selfSkills, nearbyEntities, tribeGatherPoint, sharedResourcePositions,
    inventoryTotal, inventoryRemaining,
    temperature, timeOfDay, isCold, selfExposure,
    semanticResourceLocations, culturalKnowledge, semanticMemoryCount,
    tribeShrinePosition, tribePriestId, selfRole,
    nearbyTerrain,
    worldTiles: world.tiles as any,
    terrainDefs: terrainDefs as any,
  };
}
