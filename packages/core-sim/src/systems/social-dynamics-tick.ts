/**
 * Social Dynamics Tick — Phase 4
 *
 * Runs once per tick to update social-level state:
 * 1. Leader election (highest average trust among tribe members)
 * 2. Tribe tension tracking (based on resource scarcity + trust levels)
 * 3. Update average tribe needs (hunger/thirst)
 *
 * Emits events for leader changes and high-tension warnings.
 */

import { WorldState, SimEvent, EntityState, TribeState } from "@project-god/shared";
import type { GenericGameEvent } from "@project-god/shared";

// ── Configuration ────────────────────────────────────────────

/** How often to re-elect leader (in ticks). */
const ELECTION_INTERVAL = 800; // 1 year (TICKS_PER_YEAR)

/** Hunger/thirst threshold below which agents feel scarcity. */
const SCARCITY_THRESHOLD = 35;

/** Tension increase per tick when tribe is in scarcity. */
const TENSION_SCARCITY_RATE = 2;

/** Tension decrease per tick when tribe is well-fed. */
const TENSION_DECAY_RATE = 1;

/** Tension level that triggers a warning event. */
const TENSION_WARNING_THRESHOLD = 60;

/** Tension level that triggers tribe split check. */
const TENSION_SPLIT_THRESHOLD = 90;

/** Minimum tribe size for a split to occur. */
const MIN_SPLIT_SIZE = 4;

// ── Main System ──────────────────────────────────────────────

export function socialDynamicsTick(world: WorldState): SimEvent[] {
  if (!world.tribes) return [];

  const events: SimEvent[] = [];

  for (const tribe of Object.values(world.tribes) as TribeState[]) {
    const aliveMembers = tribe.memberIds
      .map((id) => world.entities[id])
      .filter((e): e is EntityState => !!e && e.alive);

    if (aliveMembers.length === 0) continue;

    // ── 1. Update average tribe needs ─────────────────────
    const totalHunger = aliveMembers.reduce((sum, e) => sum + e.needs.hunger, 0);
    const totalThirst = aliveMembers.reduce((sum, e) => sum + e.needs.thirst, 0);
    tribe.avgHunger = Math.round(totalHunger / aliveMembers.length);
    tribe.avgThirst = Math.round(totalThirst / aliveMembers.length);

    // ── 2. Leader election (periodic) ─────────────────────
    if (world.tick % ELECTION_INTERVAL === 0 && aliveMembers.length >= 2) {
      const newLeader = electLeader(aliveMembers);
      if (newLeader && newLeader.id !== tribe.leaderId) {
        const oldLeader = tribe.leaderId;
        tribe.leaderId = newLeader.id;
        const evt: GenericGameEvent = {
          type: "SOCIAL_INTERACTION",
          tick: world.tick,
          entityId: newLeader.id,
          message: `${newLeader.name ?? newLeader.id} elected as leader of ${tribe.name}${oldLeader ? ` (replacing ${oldLeader})` : ""}`,
          detail: "leader_elected",
        };
        events.push(evt);
      }
    }

    // ── 3. Tension tracking ──────────────────────────────
    const prevTension = tribe.tension ?? 0;
    const inScarcity = tribe.avgHunger < SCARCITY_THRESHOLD || tribe.avgThirst < SCARCITY_THRESHOLD;

    // Calculate average trust within tribe
    let totalTrust = 0;
    let trustPairs = 0;
    for (const member of aliveMembers) {
      if (!member.socialMemory) continue;
      for (const otherId of tribe.memberIds) {
        if (otherId === member.id) continue;
        const impression = member.socialMemory[otherId];
        if (impression) {
          totalTrust += impression.trust;
          trustPairs++;
        }
      }
    }
    const avgTrust = trustPairs > 0 ? totalTrust / trustPairs : 0.5;

    // Tension rises with scarcity, low trust; decays otherwise
    let tensionDelta = 0;
    if (inScarcity) {
      tensionDelta = TENSION_SCARCITY_RATE;
      // Low trust amplifies tension
      if (avgTrust < 0.3) tensionDelta *= 2;
    } else {
      tensionDelta = -TENSION_DECAY_RATE;
      // High trust accelerates calm
      if (avgTrust > 0.6) tensionDelta *= 2;
    }

    tribe.tension = Math.max(0, Math.min(100, prevTension + tensionDelta));

    // Emit warning at threshold
    if (prevTension < TENSION_WARNING_THRESHOLD && tribe.tension >= TENSION_WARNING_THRESHOLD) {
      const evt: GenericGameEvent = {
        type: "SOCIAL_INTERACTION",
        tick: world.tick,
        entityId: tribe.leaderId ?? aliveMembers[0].id,
        message: `Tension in ${tribe.name} is rising! (${tribe.tension}/100) — resources are scarce and trust is low`,
        detail: "tension_warning",
      };
      events.push(evt);
    }

    // ── 4. Tribe split check ─────────────────────────────
    if (tribe.tension >= TENSION_SPLIT_THRESHOLD && aliveMembers.length >= MIN_SPLIT_SIZE) {
      const splitEvents = tryTribeSplit(tribe, aliveMembers, world);
      events.push(...splitEvents);
    }
  }

  return events;
}

// ── Helper Functions ─────────────────────────────────────────

/**
 * Elect leader based on:
 * 1. Priest role (highest priority)
 * 2. Elder status + highest average trust from tribe members
 * 3. Highest interaction count as fallback
 */
function electLeader(members: EntityState[]): EntityState | null {
  // Priest gets priority
  const priest = members.find((m) => m.role === "priest");
  if (priest) return priest;

  // Score each member: age weight + trust weight
  let bestScore = -Infinity;
  let bestMember: EntityState | null = null;

  for (const member of members) {
    let score = 0;

    // Age factor: elders get a bonus
    const age = member.age ?? 20;
    if (age > 40) score += 20; // elder bonus
    score += Math.min(age, 50); // age experience

    // Trust factor: average trust others have towards this member
    let totalTrustReceived = 0;
    let trustCount = 0;
    for (const other of members) {
      if (other.id === member.id || !other.socialMemory) continue;
      const imp = other.socialMemory[member.id];
      if (imp) {
        totalTrustReceived += imp.trust;
        trustCount++;
      }
    }
    if (trustCount > 0) {
      score += (totalTrustReceived / trustCount) * 50; // trust: up to 50 points
    }

    // Interaction factor: well-connected members score higher
    const totalInteractions = members.reduce((sum, other) => {
      if (other.id === member.id || !other.socialMemory) return sum;
      return sum + (other.socialMemory[member.id]?.interactionCount ?? 0);
    }, 0);
    score += Math.min(totalInteractions, 20);

    if (score > bestScore) {
      bestScore = score;
      bestMember = member;
    }
  }

  return bestMember;
}

/**
 * Try splitting the tribe when tension is critical.
 * The lowest-trust subgroup breaks away.
 */
function tryTribeSplit(
  tribe: TribeState,
  members: EntityState[],
  world: WorldState,
): SimEvent[] {
  // Find the member with lowest average trust (the "disgruntled" one)
  let lowestTrust = Infinity;
  let disgruntled: EntityState | undefined;

  for (const member of members) {
    let avgTrust = 0;
    let count = 0;
    for (const other of members) {
      if (other.id === member.id) continue;
      const imp = member.socialMemory?.[other.id];
      avgTrust += imp?.trust ?? 0;
      count++;
    }
    if (count > 0) avgTrust /= count;
    if (avgTrust < lowestTrust) {
      lowestTrust = avgTrust;
      disgruntled = member;
    }
  }

  if (!disgruntled || lowestTrust > 0.2) return []; // Not disgruntled enough

  // Find who follows the disgruntled one (spouse, children)
  const splitters = [disgruntled];
  for (const member of members) {
    if (member.id === disgruntled.id) continue;
    if (member.spouseId === disgruntled.id) splitters.push(member);
    if (member.parentIds?.includes(disgruntled.id as any)) splitters.push(member);
  }

  // Need at least 2 to split, and can't take more than half
  if (splitters.length < 2 || splitters.length >= members.length - 1) return [];

  // Create new tribe
  const newTribeId = `tribe_${world.tick}` as any;
  const newTribe: TribeState = {
    id: newTribeId,
    name: `${tribe.name} Splinter`,
    memberIds: splitters.map((s) => s.id),
    technologies: [...tribe.technologies], // inherit tech
    tension: 0,
  };

  // Remove from old tribe
  tribe.memberIds = tribe.memberIds.filter(
    (id) => !splitters.some((s) => s.id === id)
  );
  tribe.tension = Math.max(0, (tribe.tension ?? 0) - 40); // tension released after split

  // Update entity tribe IDs
  for (const s of splitters) {
    s.tribeId = newTribeId;
  }

  // Register new tribe
  if (!world.tribes) world.tribes = {};
  (world.tribes as any)[newTribeId] = newTribe;

  const evt: GenericGameEvent = {
    type: "SOCIAL_INTERACTION",
    tick: world.tick,
    entityId: disgruntled.id,
    message: `${disgruntled.name ?? disgruntled.id} leads ${splitters.length} members to split from ${tribe.name}, forming "${newTribe.name}"`,
    detail: "tribe_split",
  };

  return [evt];
}
