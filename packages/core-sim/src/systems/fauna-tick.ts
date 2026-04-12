/**
 * fauna-tick.ts — Per-tick fauna lifecycle system (P2).
 *
 * Handles:
 *   1. Periodic spawn of new animal herds (respects seasonal weights)
 *   2. AI state machine: idle → forage / flee / chase / attack / patrol
 *   3. Predator-prey auto-combat (wolf hunts rabbit, etc.)
 *   4. Animal foraging (consumes resource nodes)
 *   5. Breeding (population growth)
 *   6. Ecological safety net: extinction respawn at map edges
 *
 * Runs at step 4.10 in the tick loop, after diplomacy and before action execution.
 */

import {
  WorldState, EntityState, SimEvent, EntityId, Vec2,
  manhattan, createRNG,
} from "@project-god/shared";
import type { GenericGameEvent } from "@project-god/shared";
import type { FaunaDef } from "../content-types";
import { resolveCombat, applyCombatResult } from "./combat";

// ── AI State constants ───────────────────────────────────────

const AI_IDLE = 0;
const AI_FORAGE = 1;
const AI_FLEE = 2;
const AI_CHASE = 3;
const AI_ATTACK = 4;

// ── Config constants ─────────────────────────────────────────

/** How often (in ticks) to attempt spawning new fauna. */
const SPAWN_CHECK_INTERVAL = 50;

/** How often (in ticks) to attempt breeding. */
const BREED_CHECK_INTERVAL = 100;

/** Ticks after extinction before safety-net respawn triggers. */
const EXTINCTION_RESPAWN_DELAY = 200;

/** Hunger decay per tick for fauna. */
const FAUNA_HUNGER_DECAY = 0.5;

/** Hunger threshold below which predators become aggressive. */
const PREDATOR_HUNGER_THRESHOLD = 50;

// ── Main tick function ───────────────────────────────────────

/**
 * Process all fauna entities for one tick.
 * @param world - Current world state (mutated in place).
 * @param faunaDefs - Species definitions from fauna.json.
 * @returns Array of events emitted.
 */
export function faunaTick(
  world: WorldState,
  faunaDefs: Record<string, FaunaDef>,
): SimEvent[] {
  const events: SimEvent[] = [];

  // ── Filter fauna entities ─────────────────────────────────
  const allEntities = Object.values(world.entities) as EntityState[];
  const faunaEntities = allEntities.filter(e => e.alive && e.type === "fauna");
  const humanEntities = allEntities.filter(e => e.alive && e.type === "human");
  const season = world.environment?.season ?? "summer";

  // ── 1. Periodic spawn ─────────────────────────────────────
  if (world.tick % SPAWN_CHECK_INTERVAL === 0) {
    events.push(...spawnFauna(world, faunaDefs, faunaEntities, season));
  }

  // ── 2. Ecological safety net ──────────────────────────────
  events.push(...checkExtinctionSafetyNet(world, faunaDefs, faunaEntities, season));

  // ── 3. AI state machine per fauna entity ──────────────────
  for (const fauna of faunaEntities) {
    if (!fauna.alive) continue;

    const species = String(fauna.attributes["species"] ?? "");
    const def = faunaDefs[species];
    if (!def) continue;

    // Decay hunger
    fauna.needs.hunger = Math.max(0, (fauna.needs.hunger ?? 80) - FAUNA_HUNGER_DECAY);

    // Kill starving animals
    if (fauna.needs.hunger <= 0) {
      fauna.alive = false;
      events.push({
        type: "ANIMAL_KILLED",
        tick: world.tick,
        entityId: fauna.id,
        message: `${def.displayName} starved to death.`,
      } as GenericGameEvent);
      continue;
    }

    // Get seasonal modifiers
    const seasonAttackMod = (season === "winter" && def.tier === "predator") ? 1.2 : 1.0;
    const seasonDetectMod = (season === "winter" && def.tier === "predator") ? 1.5
      : (season === "autumn" && def.tier === "predator") ? 1.3 : 1.0;
    const effectiveDetection = Math.round(def.detectionRadius * seasonDetectMod);

    // ── Determine AI behavior ─────────────────────────────
    const aiState = fauna.attributes["aiState"] ?? AI_IDLE;

    switch (def.aggroType) {
      case "flee":
        events.push(...tickFleeAI(fauna, def, humanEntities, world, effectiveDetection));
        break;
      case "herd_retaliate":
        events.push(...tickHerdAI(fauna, def, faunaEntities, humanEntities, world, effectiveDetection, seasonAttackMod));
        break;
      case "hunt_weak":
        events.push(...tickPredatorAI(fauna, def, faunaEntities, humanEntities, world, faunaDefs, effectiveDetection, seasonAttackMod));
        break;
      case "territorial":
        events.push(...tickTerritorialAI(fauna, def, allEntities, world, faunaDefs, effectiveDetection, seasonAttackMod));
        break;
    }
  }

  // ── 4. Breeding ───────────────────────────────────────────
  if (world.tick % BREED_CHECK_INTERVAL === 0) {
    events.push(...breedFauna(world, faunaDefs, faunaEntities, season));
  }

  return events;
}

// ══════════════════════════════════════════════════════════════
// SPAWN SYSTEM
// ══════════════════════════════════════════════════════════════

function spawnFauna(
  world: WorldState,
  faunaDefs: Record<string, FaunaDef>,
  existing: EntityState[],
  season: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const rng = createRNG(world.rngState);

  for (const [speciesId, def] of Object.entries(faunaDefs)) {
    if (speciesId.startsWith("_")) continue; // skip meta like _ecology

    const currentPop = existing.filter(e => String(e.attributes["species"]) === speciesId).length;
    if (currentPop >= def.maxPopulation) continue;

    // Seasonal spawn probability
    const weight = def.spawnWeight[season] ?? 1.0;
    const spawnRoll = rng.next();
    if (spawnRoll > weight * 0.3) continue; // base 30% chance × seasonal weight

    // Find a valid spawn tile in a matching biome
    const spawnPos = findSpawnPosition(world, def.spawnBiome, rng);
    if (!spawnPos) continue;

    const herdSize = rng.nextInt(def.herdSize[0], def.herdSize[1]);
    const herdId = `herd_${world.tick}_${speciesId}`;
    const actualSpawn = Math.min(herdSize, def.maxPopulation - currentPop);

    for (let i = 0; i < actualSpawn; i++) {
      const id = `fauna_${world.tick}_${speciesId}_${i}` as EntityId;
      const ox = Math.max(0, Math.min(world.width - 1, spawnPos.x + rng.nextInt(-1, 1)));
      const oy = Math.max(0, Math.min(world.height - 1, spawnPos.y + rng.nextInt(-1, 1)));
      const offset: Vec2 = { x: ox, y: oy };

      const entity: EntityState = {
        id,
        type: "fauna",
        tribeId: "" as any,
        position: offset,
        attributes: {
          species: speciesId as any,
          aiState: AI_IDLE,
          combatTarget: "" as any,
          herdId: herdId as any,
          attack: def.attack,
          defense: def.defense,
          speed: def.speed,
        },
        needs: { hunger: 80, hp: def.hp } as any,
        inventory: {},
        alive: true,
      };

      world.entities[id] = entity;
    }

    events.push({
      type: "ANIMAL_SPAWNED",
      tick: world.tick,
      entityId: "" as EntityId,
      message: `A group of ${actualSpawn} ${def.displayName}(s) appeared.`,
    } as GenericGameEvent);
  }

  world.rngState = rng.state;
  return events;
}

/** Find a valid position in one of the target biomes. Prefers map edges for spawn variety. */
function findSpawnPosition(
  world: WorldState,
  biomes: string[],
  rng: ReturnType<typeof createRNG>,
): Vec2 | null {
  const candidates: Vec2[] = [];
  for (const tile of Object.values(world.tiles)) {
    if (biomes.includes(tile.biome)) {
      candidates.push(tile.position);
    }
  }
  if (candidates.length === 0) {
    // Fallback: any passable tile
    const all = Object.values(world.tiles);
    if (all.length === 0) return null;
    return all[rng.nextInt(0, all.length - 1)].position;
  }
  return candidates[rng.nextInt(0, candidates.length - 1)];
}

// ══════════════════════════════════════════════════════════════
// ECOLOGICAL SAFETY NET
// ══════════════════════════════════════════════════════════════

/**
 * Extinction prevention: if a species population reaches 0,
 * wait EXTINCTION_RESPAWN_DELAY ticks then force-spawn a herd
 * at a map-edge tile to simulate migration from off-map.
 *
 * Uses world.attributes to track when extinction was detected.
 */
function checkExtinctionSafetyNet(
  world: WorldState,
  faunaDefs: Record<string, FaunaDef>,
  existing: EntityState[],
  season: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const rng = createRNG(world.rngState);

  for (const [speciesId, def] of Object.entries(faunaDefs)) {
    if (speciesId.startsWith("_")) continue;

    const currentPop = existing.filter(e => String(e.attributes["species"]) === speciesId).length;

    // Track extinction tick in a lightweight way using environment
    // We store extinction timestamps in world-level attributes
    const extinctionKey = `_extinct_${speciesId}`;

    if (currentPop === 0) {
      // Mark the tick when extinction was first detected
      if (!world.environment?.[extinctionKey as keyof typeof world.environment]) {
        // Use a side-channel: store in world's environment as any (lightweight hack)
        (world.environment as any)[extinctionKey] = world.tick;
      }

      const extinctSinceTick = (world.environment as any)?.[extinctionKey] ?? world.tick;
      const ticksSinceExtinct = world.tick - extinctSinceTick;

      if (ticksSinceExtinct >= EXTINCTION_RESPAWN_DELAY) {
        // Force spawn at map edge
        const edgePos = findEdgeSpawnPosition(world, rng);
        if (!edgePos) continue;

        const herdSize = def.herdSize[0]; // spawn minimum herd
        const herdId = `migration_${world.tick}_${speciesId}`;

        for (let i = 0; i < herdSize; i++) {
          const id = `fauna_mig_${world.tick}_${speciesId}_${i}` as EntityId;
          const offset: Vec2 = {
            x: Math.max(0, Math.min(world.width - 1, edgePos.x + rng.nextInt(-1, 1))),
            y: Math.max(0, Math.min(world.height - 1, edgePos.y + rng.nextInt(-1, 1))),
          };

          const entity: EntityState = {
            id,
            type: "fauna",
            tribeId: "" as any,
            position: offset,
            attributes: {
              species: speciesId as any,
              aiState: AI_IDLE,
              combatTarget: "" as any,
              herdId: herdId as any,
              attack: def.attack,
              defense: def.defense,
              speed: def.speed,
            },
            needs: { hunger: 60, hp: def.hp } as any,
            inventory: {},
            alive: true,
          };

          world.entities[id] = entity;
        }

        events.push({
          type: "EXTINCTION_RESPAWN",
          tick: world.tick,
          entityId: "" as EntityId,
          message: `A herd of ${herdSize} ${def.displayName}(s) migrated from beyond the map edge, restoring the species.`,
        } as GenericGameEvent);

        // Clear extinction marker
        delete (world.environment as any)[extinctionKey];
      }
    } else {
      // Population recovered — clear any extinction marker
      if ((world.environment as any)?.[extinctionKey] !== undefined) {
        delete (world.environment as any)[extinctionKey];
      }
    }
  }

  world.rngState = rng.state;
  return events;
}

/** Find a position on the map edge (row 0, last row, col 0, last col). */
function findEdgeSpawnPosition(
  world: WorldState,
  rng: ReturnType<typeof createRNG>,
): Vec2 | null {
  const edge: Vec2[] = [];
  for (const tile of Object.values(world.tiles)) {
    const { x, y } = tile.position;
    if (x === 0 || y === 0 || x === world.width - 1 || y === world.height - 1) {
      edge.push(tile.position);
    }
  }
  if (edge.length === 0) return null;
  return edge[rng.nextInt(0, edge.length - 1)];
}

// ══════════════════════════════════════════════════════════════
// AI STATE MACHINES
// ══════════════════════════════════════════════════════════════

/** Prey AI: eat nearby resources, flee from humans. */
function tickFleeAI(
  fauna: EntityState,
  def: FaunaDef,
  humans: EntityState[],
  world: WorldState,
  detectionRadius: number,
): SimEvent[] {
  // Check for nearby threats
  const nearestThreat = humans.find(h =>
    manhattan(fauna.position, h.position) <= detectionRadius
  );

  if (nearestThreat) {
    // FLEE: move away from threat
    fauna.attributes["aiState"] = AI_FLEE;
    moveAwayFrom(fauna, nearestThreat.position, world, def.speed);
    return [];
  }

  // No threat — forage (consume nearby resource nodes)
  fauna.attributes["aiState"] = AI_FORAGE;
  forage(fauna, def, world);
  return [];
}

/** Herd AI: graze, retaliate as a group when any member is attacked. */
function tickHerdAI(
  fauna: EntityState,
  def: FaunaDef,
  allFauna: EntityState[],
  humans: EntityState[],
  world: WorldState,
  detectionRadius: number,
  attackMod: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  const combatTargetId = String(fauna.attributes["combatTarget"] ?? "");

  // If we have an active combat target, pursue/attack
  if (combatTargetId) {
    const target = world.entities[combatTargetId] as EntityState | undefined;
    if (!target || !target.alive || manhattan(fauna.position, target.position) > def.leashRadius) {
      // Target lost — reset
      fauna.attributes["combatTarget"] = "" as any;
      fauna.attributes["aiState"] = AI_IDLE;
      return [];
    }

    if (manhattan(fauna.position, target.position) <= 1) {
      // Adjacent — attack
      fauna.attributes["aiState"] = AI_ATTACK;
      const result = resolveCombat(fauna, target, world.tick, {});
      applyCombatResult(fauna, target, result);
      events.push(...combatEvents(fauna, target, result, world.tick, def));
    } else {
      // Chase
      fauna.attributes["aiState"] = AI_CHASE;
      moveToward(fauna, target.position, world, def.speed);
    }
    return events;
  }

  // Default: graze
  fauna.attributes["aiState"] = AI_FORAGE;
  forage(fauna, def, world);
  wander(fauna, world);

  return events;
}

/** Predator AI: hunt prey species and weak humans. */
function tickPredatorAI(
  fauna: EntityState,
  def: FaunaDef,
  allFauna: EntityState[],
  humans: EntityState[],
  world: WorldState,
  faunaDefs: Record<string, FaunaDef>,
  detectionRadius: number,
  attackMod: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  const isHungry = (fauna.needs.hunger ?? 80) < PREDATOR_HUNGER_THRESHOLD;

  // Look for prey fauna (from diet chain: wolf eats rabbit/deer)
  const preySpecies = (def as any).prey as string[] | undefined;

  let target: EntityState | undefined;

  if (isHungry) {
    // Hunt fauna prey
    if (preySpecies) {
      target = allFauna
        .filter(f => f.id !== fauna.id && f.alive && preySpecies.includes(String(f.attributes["species"])))
        .sort((a, b) => manhattan(fauna.position, a.position) - manhattan(fauna.position, b.position))
        [0];
    }

    // Hunt weak humans (HP < 50%)
    if (!target) {
      target = humans
        .filter(h => (h.needs.hp ?? 100) < 50)
        .sort((a, b) => manhattan(fauna.position, a.position) - manhattan(fauna.position, b.position))
        [0];
    }
  }

  // Execute pursuit/attack
  if (target && manhattan(fauna.position, target.position) <= detectionRadius) {
    if (manhattan(fauna.position, target.position) <= 1) {
      fauna.attributes["aiState"] = AI_ATTACK;
      const result = resolveCombat(fauna, target, world.tick, faunaDefs);
      applyCombatResult(fauna, target, result);
      events.push(...combatEvents(fauna, target, result, world.tick, def));

      // If kill was a fauna, feed
      if (result.defenderDied && target.type === "fauna") {
        fauna.needs.hunger = Math.min(100, (fauna.needs.hunger ?? 0) + 30);
      }
    } else if (manhattan(fauna.position, target.position) <= def.leashRadius) {
      fauna.attributes["aiState"] = AI_CHASE;
      moveToward(fauna, target.position, world, def.speed);
    }
    return events;
  }

  // No target — wander
  fauna.attributes["aiState"] = AI_IDLE;
  wander(fauna, world);
  return events;
}

/** Territorial AI (bear): attacks anything that enters territory radius. */
function tickTerritorialAI(
  fauna: EntityState,
  def: FaunaDef,
  allEntities: EntityState[],
  world: WorldState,
  faunaDefs: Record<string, FaunaDef>,
  detectionRadius: number,
  attackMod: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  const territoryRadius = (def as any).territoryRadius ?? detectionRadius;

  // Find nearest intruder (anyone except same species)
  const intruder = allEntities
    .filter(e => e.id !== fauna.id && e.alive && e.attributes["species"] !== fauna.attributes["species"])
    .filter(e => manhattan(fauna.position, e.position) <= territoryRadius)
    .sort((a, b) => manhattan(fauna.position, a.position) - manhattan(fauna.position, b.position))
    [0];

  if (intruder) {
    if (manhattan(fauna.position, intruder.position) <= 1) {
      fauna.attributes["aiState"] = AI_ATTACK;
      const result = resolveCombat(fauna, intruder, world.tick, faunaDefs);
      applyCombatResult(fauna, intruder, result);
      events.push(...combatEvents(fauna, intruder, result, world.tick, def));
    } else {
      fauna.attributes["aiState"] = AI_CHASE;
      moveToward(fauna, intruder.position, world, def.speed);
    }
    return events;
  }

  // No intruders — stay put or wander slowly
  fauna.attributes["aiState"] = AI_IDLE;
  return events;
}

// ══════════════════════════════════════════════════════════════
// BREEDING
// ══════════════════════════════════════════════════════════════

function breedFauna(
  world: WorldState,
  faunaDefs: Record<string, FaunaDef>,
  existing: EntityState[],
  season: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const rng = createRNG(world.rngState);

  for (const [speciesId, def] of Object.entries(faunaDefs)) {
    if (speciesId.startsWith("_")) continue;
    if (def.breedChance <= 0) continue;

    const members = existing.filter(e => String(e.attributes["species"]) === speciesId);
    if (members.length < 2) continue;
    if (members.length >= def.maxPopulation) continue;

    // Seasonal breed modifier (spring = 1.5x)
    const breedMod = season === "spring" ? 1.5 : 1.0;
    if (rng.next() > def.breedChance * breedMod) continue;

    // Pick a random parent to spawn near
    const parent = members[rng.nextInt(0, members.length - 1)];
    const id = `fauna_baby_${world.tick}_${speciesId}` as EntityId;

    const baby: EntityState = {
      id,
      type: "fauna",
      tribeId: "" as any,
      position: { ...parent.position },
      attributes: {
        species: speciesId as any,
        aiState: AI_IDLE,
        combatTarget: "" as any,
        herdId: parent.attributes["herdId"] as any,
        attack: def.attack,
        defense: def.defense,
        speed: def.speed,
      },
      needs: { hunger: 70, hp: Math.round(def.hp * 0.7) } as any,
      inventory: {},
      alive: true,
    };

    world.entities[id] = baby;
    events.push({
      type: "ANIMAL_SPAWNED",
      tick: world.tick,
      entityId: id,
      message: `A young ${def.displayName} was born.`,
    } as GenericGameEvent);
  }

  world.rngState = rng.state;
  return events;
}

// ══════════════════════════════════════════════════════════════
// MOVEMENT HELPERS
// ══════════════════════════════════════════════════════════════

function moveToward(entity: EntityState, target: Vec2, world: WorldState, speed: number): void {
  const dx = Math.sign(target.x - entity.position.x);
  const dy = Math.sign(target.y - entity.position.y);

  const newX = Math.max(0, Math.min(world.width - 1, entity.position.x + dx));
  const newY = Math.max(0, Math.min(world.height - 1, entity.position.y + dy));

  entity.position = { x: newX, y: newY };
}

function moveAwayFrom(entity: EntityState, threat: Vec2, world: WorldState, speed: number): void {
  const dx = Math.sign(entity.position.x - threat.x);
  const dy = Math.sign(entity.position.y - threat.y);

  // Move up to `speed` tiles away
  const newX = Math.max(0, Math.min(world.width - 1, entity.position.x + dx * speed));
  const newY = Math.max(0, Math.min(world.height - 1, entity.position.y + dy * speed));

  entity.position = { x: newX, y: newY };
}

function wander(entity: EntityState, world: WorldState): void {
  // Deterministic wander based on tick + position
  const hash = (world.tick * 13 + entity.position.x * 7 + entity.position.y * 3) % 5;
  const dx = hash < 2 ? -1 : hash < 4 ? 1 : 0;
  const dy = hash < 1 ? -1 : hash < 3 ? 1 : 0;

  entity.position = {
    x: Math.max(0, Math.min(world.width - 1, entity.position.x + dx)),
    y: Math.max(0, Math.min(world.height - 1, entity.position.y + dy)),
  };
}

/** Forage: consume a nearby resource node matching diet. */
function forage(fauna: EntityState, def: FaunaDef, world: WorldState): void {
  for (const node of Object.values(world.resourceNodes)) {
    if (node.quantity <= 0) continue;
    if (!def.diet.includes(node.resourceType)) continue;
    if (manhattan(fauna.position, node.position) > 1) continue;

    // Eat from the node
    node.quantity = Math.max(0, node.quantity - 1);
    fauna.needs.hunger = Math.min(100, (fauna.needs.hunger ?? 0) + 15);
    return; // eat one resource per tick
  }
}

// ── Event helpers ────────────────────────────────────────────

function combatEvents(
  attacker: EntityState,
  defender: EntityState,
  result: ReturnType<typeof resolveCombat>,
  tick: number,
  attackerDef: FaunaDef,
): SimEvent[] {
  const events: SimEvent[] = [];
  const attackerName = attackerDef.displayName ?? attacker.type;
  const defenderName = (defender as any).name ?? defender.attributes["species"] ?? defender.type;

  events.push({
    type: "COMBAT_HIT",
    tick,
    entityId: attacker.id,
    message: `${attackerName} hit ${defenderName} for ${result.defenderDamageTaken} damage${result.defenderDodged ? " (dodged!)" : ""}.`,
  } as GenericGameEvent);

  if (result.defenderDied) {
    events.push({
      type: "ANIMAL_KILLED",
      tick,
      entityId: defender.id,
      message: `${defenderName} was killed by ${attackerName}.`,
    } as GenericGameEvent);
  }

  if (result.attackerDied) {
    events.push({
      type: "ANIMAL_KILLED",
      tick,
      entityId: attacker.id,
      message: `${attackerName} was killed by ${defenderName}.`,
    } as GenericGameEvent);
  }

  return events;
}
