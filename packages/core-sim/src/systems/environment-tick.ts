/**
 * environment-tick.ts — Per-tick world environment update.
 *
 * Calculates temperature, time-of-day (4 phases), seasonal variation,
 * and light level using sinusoidal day/night + seasonal cycles.
 *
 * Day/Night 4-phase cycle (40 ticks):
 *   dawn:  tick  0- 3 (10%) — sunrise, light ramps up
 *   day:   tick  4-17 (35%) — full sunlight
 *   dusk:  tick 18-19 ( 5%) — sunset, light ramps down
 *   night: tick 20-39 (50%) — moonlight only
 *
 * Seasonal cycle (1 year = 40 ticks = 1 day length):
 *   spring: ticks 0-9   (+5°C offset, 1.3x resource regen)
 *   summer: ticks 10-19 (+10°C offset, 1.5x resource regen)
 *   autumn: ticks 20-29 (-5°C offset, 0.8x resource regen)
 *   winter: ticks 30-39 (-15°C offset, 0.2x resource regen)
 *
 * Temperature model:
 *   base = 42.5 + 17.5 * sin(2π * tick / dayLength)
 *   final = clamp(base + seasonOffset, 5, 75)
 */

import { WorldState, EnvironmentState, SimEvent, TimeOfDay, EnvironmentChangedEvent } from "@project-god/shared";
import type { GenericGameEvent } from "@project-god/shared";

/** Day/night cycle length in ticks. */
export const DEFAULT_DAY_LENGTH = 40;

/** Temperature below this value triggers exposure decay. */
export const COLD_THRESHOLD = 40;

// ── Phase boundaries (as fraction of dayLength) ─────────────

/** Dawn ends at this fraction (10% of cycle). */
const DAWN_END = 0.10;
/** Day ends / Dusk starts at this fraction (45%). */
const DUSK_START = 0.45;
/** Dusk ends / Night starts at this fraction (50%). */
const NIGHT_START = 0.50;

// ── Season System (P1) ──────────────────────────────────────

/** How many ticks in one full year (matches lifecycle.json TICKS_PER_YEAR). */
const TICKS_PER_YEAR = 40;

type Season = "spring" | "summer" | "autumn" | "winter";

/** Season definitions: temperature offset and resource regen multiplier. */
const SEASON_CONFIG: Record<Season, { tempOffset: number; regenMultiplier: number }> = {
  spring: { tempOffset: 5,   regenMultiplier: 1.3 },
  summer: { tempOffset: 10,  regenMultiplier: 1.5 },
  autumn: { tempOffset: -5,  regenMultiplier: 0.8 },
  winter: { tempOffset: -15, regenMultiplier: 0.2 },
};

/** Season order within a year (4 equal quarters). */
const SEASON_ORDER: Season[] = ["spring", "summer", "autumn", "winter"];

/**
 * Determine current season from world tick.
 * Each season lasts TICKS_PER_YEAR / 4 ticks.
 */
export function calculateSeason(tick: number): Season {
  const ticksPerSeason = Math.max(1, Math.floor(TICKS_PER_YEAR / 4));
  const yearTick = tick % TICKS_PER_YEAR;
  const seasonIndex = Math.min(3, Math.floor(yearTick / ticksPerSeason));
  return SEASON_ORDER[seasonIndex];
}

/**
 * Calculate temperature for a given tick using a sinusoidal curve.
 * Returns 25 (night low) to 60 (day peak).
 */
export function calculateTemperature(tick: number, dayLength: number): number {
  const angle = (2 * Math.PI * tick) / dayLength;
  return 42.5 + 17.5 * Math.sin(angle);
}

/**
 * Determine time of day from the cycle phase (4 phases).
 */
export function calculateTimeOfDay(tick: number, dayLength: number): TimeOfDay {
  const phase = (tick % dayLength) / dayLength;

  if (phase < DAWN_END) return "dawn";
  if (phase < DUSK_START) return "day";
  if (phase < NIGHT_START) return "dusk";
  return "night";
}

/**
 * Calculate continuous light level (0.0 = pitch black, 1.0 = full sun).
 */
export function calculateLightLevel(tick: number, dayLength: number): number {
  const phase = (tick % dayLength) / dayLength;

  if (phase < DAWN_END) {
    const t = phase / DAWN_END;
    return 0.15 + 0.85 * t;
  }
  if (phase < DUSK_START) {
    return 1.0;
  }
  if (phase < NIGHT_START) {
    const t = (phase - DUSK_START) / (NIGHT_START - DUSK_START);
    return 1.0 - 0.85 * t;
  }
  return 0.15;
}

/** Vision radius per time-of-day phase (used by fog-of-war and perception). */
export const VISION_RADIUS: Record<TimeOfDay, number> = {
  dawn: 7,
  day: 10,
  dusk: 5,
  night: 4,
};

/**
 * Get current vision radius based on time of day.
 */
export function getVisionRadius(timeOfDay: TimeOfDay): number {
  return VISION_RADIUS[timeOfDay];
}

/**
 * Update world.environment each tick.
 * Emits ENVIRONMENT_CHANGED when timeOfDay transitions.
 * P1: Also computes season, applies seasonal temperature offset,
 *     and sets regenMultiplier for resource node tick.
 */
export function tickEnvironment(world: WorldState): SimEvent[] {
  const events: SimEvent[] = [];

  if (!world.environment) return events;

  const { dayLength } = world.environment;
  const prevTimeOfDay = world.environment.timeOfDay;
  const prevSeason = world.environment.season;

  // ── Day/night cycle ───────────────────────────────────────
  const baseTemperature = calculateTemperature(world.tick, dayLength);
  const newTimeOfDay = calculateTimeOfDay(world.tick, dayLength);
  const newLightLevel = calculateLightLevel(world.tick, dayLength);

  // ── Season calculation ────────────────────────────────────
  const newSeason = calculateSeason(world.tick);
  const seasonCfg = SEASON_CONFIG[newSeason];

  // Apply seasonal temperature offset, clamped to [5, 75]
  const finalTemperature = Math.max(5, Math.min(75, baseTemperature + seasonCfg.tempOffset));

  world.environment.temperature = finalTemperature;
  world.environment.timeOfDay = newTimeOfDay;
  world.environment.lightLevel = newLightLevel;
  world.environment.season = newSeason;
  world.environment.seasonTempOffset = seasonCfg.tempOffset;
  world.environment.seasonRegenMultiplier = seasonCfg.regenMultiplier;

  // Emit time-of-day transition event
  if (newTimeOfDay !== prevTimeOfDay) {
    events.push({
      type: "ENVIRONMENT_CHANGED",
      tick: world.tick,
      temperature: finalTemperature,
      timeOfDay: newTimeOfDay,
    } as EnvironmentChangedEvent);
  }

  // Emit season transition event
  if (newSeason !== prevSeason && prevSeason !== undefined) {
    events.push({
      type: "ENVIRONMENT_CHANGED",
      tick: world.tick,
      entityId: "",
      message: `The season has changed to ${newSeason}! (temp offset: ${seasonCfg.tempOffset > 0 ? '+' : ''}${seasonCfg.tempOffset}°C, resource regen: ${seasonCfg.regenMultiplier}x)`,
    } as GenericGameEvent);
    console.log(`[Season] 🌿 ${prevSeason} → ${newSeason} (temp ${seasonCfg.tempOffset > 0 ? '+' : ''}${seasonCfg.tempOffset}°C, regen ${seasonCfg.regenMultiplier}x)`);
  }

  return events;
}
