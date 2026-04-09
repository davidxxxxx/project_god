/**
 * environment-tick.ts — Per-tick world environment update (MVP-03-A).
 *
 * Calculates temperature and time-of-day using a sinusoidal day/night cycle.
 * Runs at step 1.5: after advancing tick, before decaying needs.
 *
 * Temperature model:
 *   temperature = 42.5 + 17.5 * sin(2π * tick / dayLength)
 *   → Day peak  ≈ 60  (comfortable)
 *   → Night low ≈ 25  (cold, exposure risk)
 *
 * Cold threshold: temperature < 40
 */

import { WorldState, EnvironmentState, SimEvent, TimeOfDay, EnvironmentChangedEvent } from "@project-god/shared";

/** Day/night cycle length in ticks (20 day + 20 night). */
export const DEFAULT_DAY_LENGTH = 40;

/** Temperature below this value triggers exposure decay. */
export const COLD_THRESHOLD = 40;

/**
 * Calculate temperature for a given tick using a sinusoidal curve.
 * Returns 25 (night low) to 60 (day peak).
 */
export function calculateTemperature(tick: number, dayLength: number): number {
  const angle = (2 * Math.PI * tick) / dayLength;
  return 42.5 + 17.5 * Math.sin(angle);
}

/**
 * Determine time of day from the cycle phase.
 * Phase 0–0.5: sin > 0 → day
 * Phase 0.35–0.5: late day → dusk (last 30% of day before night)
 * Phase 0.5–1.0: sin <= 0 → night
 */
export function calculateTimeOfDay(tick: number, dayLength: number): TimeOfDay {
  const phase = (tick % dayLength) / dayLength;
  const angle = 2 * Math.PI * tick / dayLength;
  const sinVal = Math.sin(angle);

  if (sinVal <= 0) return "night";
  // Dusk: last 30% of the daylight period (phase 0.35 to 0.5)
  if (phase >= 0.35 && phase < 0.5) return "dusk";
  return "day";
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

  world.environment.temperature = newTemperature;
  world.environment.timeOfDay = newTimeOfDay;

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
