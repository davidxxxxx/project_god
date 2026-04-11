/**
 * environment-tick.ts — Per-tick world environment update.
 *
 * Calculates temperature, time-of-day (4 phases), and light level
 * using a sinusoidal day/night cycle.
 *
 * Day/Night 4-phase cycle (40 ticks):
 *   dawn:  tick  0- 3 (10%) — sunrise, light ramps up
 *   day:   tick  4-17 (35%) — full sunlight
 *   dusk:  tick 18-19 ( 5%) — sunset, light ramps down
 *   night: tick 20-39 (50%) — moonlight only
 *
 * Temperature model:
 *   temperature = 42.5 + 17.5 * sin(2π * tick / dayLength)
 *   → Day peak  ≈ 60  (comfortable)
 *   → Night low ≈ 25  (cold, exposure risk)
 *
 * Cold threshold: temperature < 40
 */

import { WorldState, EnvironmentState, SimEvent, TimeOfDay, EnvironmentChangedEvent } from "@project-god/shared";

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
// Night runs from 0.50 to 1.00, then wraps to dawn at 0.00

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
 *
 * Phase 0.00–0.10: dawn  (sunrise)
 * Phase 0.10–0.45: day   (full sun)
 * Phase 0.45–0.50: dusk  (sunset)
 * Phase 0.50–1.00: night (moonlight)
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
 *
 * Smoothly transitions between phases:
 * - dawn:  ramps 0.15 → 1.0
 * - day:   stays 1.0
 * - dusk:  ramps 1.0 → 0.15
 * - night: stays 0.15 (faint moonlight, never fully black)
 */
export function calculateLightLevel(tick: number, dayLength: number): number {
  const phase = (tick % dayLength) / dayLength;

  if (phase < DAWN_END) {
    // Dawn: ramp from 0.15 to 1.0
    const t = phase / DAWN_END; // 0→1 across dawn
    return 0.15 + 0.85 * t;
  }
  if (phase < DUSK_START) {
    // Day: full sun
    return 1.0;
  }
  if (phase < NIGHT_START) {
    // Dusk: ramp from 1.0 to 0.15
    const t = (phase - DUSK_START) / (NIGHT_START - DUSK_START); // 0→1 across dusk
    return 1.0 - 0.85 * t;
  }
  // Night: dim moonlight
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
 */
export function tickEnvironment(world: WorldState): SimEvent[] {
  const events: SimEvent[] = [];

  if (!world.environment) return events;

  const { dayLength } = world.environment;
  const prevTimeOfDay = world.environment.timeOfDay;

  const newTemperature = calculateTemperature(world.tick, dayLength);
  const newTimeOfDay = calculateTimeOfDay(world.tick, dayLength);
  const newLightLevel = calculateLightLevel(world.tick, dayLength);

  world.environment.temperature = newTemperature;
  world.environment.timeOfDay = newTimeOfDay;
  world.environment.lightLevel = newLightLevel;

  // Only emit event on transition
  if (newTimeOfDay !== prevTimeOfDay) {
    events.push({
      type: "ENVIRONMENT_CHANGED",
      tick: world.tick,
      temperature: newTemperature,
      timeOfDay: newTimeOfDay,
    } as EnvironmentChangedEvent);
  }

  return events;
}
