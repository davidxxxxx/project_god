/**
 * time.ts — Divine Time system shared types.
 *
 * These types define how the time control layer (game-client)
 * communicates intent. They do NOT affect core-sim determinism.
 *
 * The core-sim still runs step-by-step; the TimeController in
 * game-client decides how many steps to run per render frame.
 */

import type { SimEventType } from "./events";

// ─── Speed Presets ───────────────────────────────────────────

/** Discrete speed levels the player can select. */
export type TimeSpeed = "1x" | "2x" | "4x" | "8x" | "16x";

/** All available speed levels in order. */
export const TIME_SPEEDS: TimeSpeed[] = ["1x", "2x", "4x", "8x", "16x"];

/**
 * How many sim ticks to advance per sim-frame at each speed.
 * Rendering runs at ~10 sim-frames/sec (100ms interval).
 * At 16x, we push 16 ticks per frame → 160 tick/sec effective.
 */
export const SPEED_TICKS_PER_FRAME: Record<TimeSpeed, number> = {
  "1x": 1,
  "2x": 2,
  "4x": 4,
  "8x": 8,
  "16x": 16,
};

// ─── Time Mode ───────────────────────────────────────────────

/** Current operating mode of the time controller. */
export type TimeMode = "paused" | "playing" | "fastForward";

// ─── Event Time Priority ─────────────────────────────────────

/**
 * How an event should affect the time controller.
 * - ignore: no effect on speed
 * - slow: drop to 1x if currently faster
 * - pause: immediately pause simulation
 */
export type EventTimePriority = "ignore" | "slow" | "pause";

// ─── Auto-Interruption ──────────────────────────────────────

/** Record of why the time controller auto-interrupted. */
export interface TimeInterruption {
  /** The event type that triggered the interruption. */
  readonly reason: SimEventType;
  /** World tick when it happened. */
  readonly tick: number;
  /** Entity involved (for auto-focus). Optional. */
  readonly entityId?: string;
  /** What the controller did: slowed down or paused. */
  readonly action: "slow" | "pause";
}

// ─── Fast-Forward ────────────────────────────────────────────

/** Targets the player can fast-forward to. */
export type FastForwardTarget =
  | "next_prayer"
  | "next_birth"
  | "next_death"
  | "next_invention";

/** All fast-forward targets in display order. */
export const FAST_FORWARD_TARGETS: FastForwardTarget[] = [
  "next_prayer",
  "next_birth",
  "next_death",
  "next_invention",
];

/**
 * Maps each fast-forward target to the event types that satisfy it.
 * When any of these events appear in a tick, the fast-forward stops.
 */
export const FF_TARGET_EVENTS: Record<FastForwardTarget, SimEventType[]> = {
  next_prayer:    ["PRAYER_STARTED"],
  next_birth:     ["ENTITY_BORN"],
  next_death:     ["ENTITY_DIED"],
  next_invention: ["SKILL_LEARNED", "TECHNOLOGY_UNLOCKED"],
};

// ─── Auto Time Rules ─────────────────────────────────────────

/**
 * Default event → time-priority mapping.
 * Used by AutoTimePolicy to decide when to slow/pause.
 */
export const DEFAULT_AUTO_TIME_RULES: Partial<Record<SimEventType, EventTimePriority>> = {
  PRAYER_STARTED:      "pause",
  ENTITY_BORN:         "slow",
  ENTITY_DIED:         "slow",
  SKILL_LEARNED:       "pause",
  TECHNOLOGY_UNLOCKED: "pause",
  MIRACLE_PERFORMED:   "pause",
  PAIR_BONDED:         "slow",
};

// ─── Time Display Helpers ────────────────────────────────────

/** Default ticks per game-year (matches lifecycle TICKS_PER_YEAR). */
export const DEFAULT_TICKS_PER_YEAR = 40;

/** Calculate in-game day and year from a tick number. */
export function tickToGameDate(tick: number, ticksPerYear: number = DEFAULT_TICKS_PER_YEAR): { day: number; year: number } {
  return {
    day: Math.floor(tick % ticksPerYear),
    year: Math.floor(tick / ticksPerYear),
  };
}
