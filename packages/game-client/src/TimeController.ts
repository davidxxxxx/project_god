/**
 * TimeController.ts — Divine Time controller.
 *
 * Replaces the old setInterval game loop with requestAnimationFrame.
 * Controls speed presets, pause/resume, auto-interruption, and fast-forward.
 *
 * core-sim stays deterministic — this only controls how many ticks run per frame.
 */

import type { ScenarioRunner } from "@project-god/core-sim";
import type { SimEventType, TickResult } from "@project-god/shared";
import {
  TimeSpeed, TimeMode, TimeInterruption, FastForwardTarget,
  SPEED_TICKS_PER_FRAME, FF_TARGET_EVENTS,
} from "@project-god/shared";
import { AutoTimePolicy } from "./AutoTimePolicy";

/** Minimum milliseconds between sim frames. Controls effective sim-FPS. */
const SIM_FRAME_INTERVAL_MS = 80; // ~12.5 sim-frames/sec at base

export class TimeController {
  private speed: TimeSpeed = "1x";
  private mode: TimeMode = "paused";
  private lastInterruption: TimeInterruption | null = null;
  private rafId: number | null = null;
  private lastFrameTime: number = 0;
  private interruptionClearTimer: ReturnType<typeof setTimeout> | null = null;

  /** Callback to select an agent (auto-focus on interruption). */
  onAutoFocus: ((entityId: string) => void) | null = null;

  constructor(
    private runner: ScenarioRunner,
    private policy: AutoTimePolicy,
    private onRender: () => void,
  ) {}

  // ── Public API ──────────────────────────────────────────────

  getSpeed(): TimeSpeed { return this.speed; }
  getMode(): TimeMode { return this.mode; }
  getLastInterruption(): TimeInterruption | null { return this.lastInterruption; }
  isPaused(): boolean { return this.mode === "paused"; }
  isPlaying(): boolean { return this.mode === "playing"; }

  /** Set speed preset. If playing, takes effect next frame. */
  setSpeed(speed: TimeSpeed): void {
    this.speed = speed;
  }

  /** Start/resume simulation. */
  play(): void {
    if (this.mode === "playing") return;
    this.mode = "playing";
    this.lastFrameTime = performance.now();
    this.scheduleLoop();
  }

  /** Pause simulation. */
  pause(): void {
    this.mode = "paused";
    this.cancelLoop();
    this.onRender();
  }

  /** Toggle play/pause. */
  toggle(): void {
    if (this.mode === "playing") {
      this.pause();
    } else {
      this.play();
    }
  }

  /** Advance exactly 1 tick. Works in any mode. */
  step(): void {
    const wasPaused = this.mode === "paused";
    const result = this.runner.step();
    this.checkInterruption(result);
    this.onRender();
    if (!wasPaused && this.mode === "playing") {
      // Continue playing — don't disrupt
    }
  }

  /**
   * Fast-forward until target event or maxTicks (2000).
   * Runs synchronously, then pauses and renders final state.
   */
  fastForward(target: FastForwardTarget): void {
    const targetEvents = FF_TARGET_EVENTS[target];
    if (!targetEvents) return;

    this.cancelLoop();
    this.mode = "fastForward";
    this.onRender(); // show "FAST FORWARD" status briefly

    const result = this.runner.stepUntil(targetEvents as SimEventType[], 2000);

    if (result.found && result.triggerEvent) {
      this.lastInterruption = {
        reason: result.triggerEvent.type as SimEventType,
        tick: result.triggerEvent.tick,
        entityId: (result.triggerEvent as any).entityId,
        action: "pause",
      };
      this.scheduleInterruptionClear();

      // Auto-focus on the entity
      if (this.lastInterruption.entityId && this.onAutoFocus) {
        this.onAutoFocus(this.lastInterruption.entityId);
      }
    }

    this.mode = "paused";
    this.onRender();
  }

  /** Reset state when world resets. */
  reset(): void {
    this.cancelLoop();
    this.mode = "paused";
    this.speed = "1x";
    this.lastInterruption = null;
  }

  /** Clean up for disposal. */
  destroy(): void {
    this.cancelLoop();
    if (this.interruptionClearTimer) clearTimeout(this.interruptionClearTimer);
  }

  // ── Auto-pause toggle ──────────────────────────────────────

  isAutoEnabled(): boolean { return this.policy.isEnabled(); }

  setAutoEnabled(enabled: boolean): void {
    this.policy.setEnabled(enabled);
  }

  // ── Internal Loop ──────────────────────────────────────────

  private scheduleLoop(): void {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }

  private cancelLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop(timestamp: number): void {
    this.rafId = null;
    if (this.mode !== "playing") return;

    const elapsed = timestamp - this.lastFrameTime;

    if (elapsed >= SIM_FRAME_INTERVAL_MS) {
      this.lastFrameTime = timestamp;

      const ticksThisFrame = SPEED_TICKS_PER_FRAME[this.speed];

      // Check if everyone is dead
      const proj = this.runner.getProjection();
      if (proj.counters.aliveAgents === 0) {
        this.pause();
        return;
      }

      // Run N ticks, checking policy after each
      for (let i = 0; i < ticksThisFrame; i++) {
        const result = this.runner.step();
        const interruption = this.checkInterruption(result);

        if (interruption) {
          // Policy triggered — handle it
          if (interruption.action === "pause") {
            this.mode = "paused";
            this.onRender();
            return; // exit loop, don't schedule next frame
          }
          if (interruption.action === "slow" && this.speed !== "1x") {
            this.speed = "1x";
            // Continue this frame but at reduced speed next frame
          }
        }
      }

      this.onRender();
    }

    // Schedule next frame
    if (this.mode === "playing") {
      this.scheduleLoop();
    }
  }

  private checkInterruption(result: TickResult): TimeInterruption | null {
    const interruption = this.policy.check(result.events, result.world.tick);

    if (interruption) {
      this.lastInterruption = interruption;
      this.scheduleInterruptionClear();

      // Auto-focus
      if (interruption.entityId && this.onAutoFocus) {
        this.onAutoFocus(interruption.entityId);
      }
    }

    return interruption;
  }

  /** Clear interruption badge after 5 seconds. */
  private scheduleInterruptionClear(): void {
    if (this.interruptionClearTimer) clearTimeout(this.interruptionClearTimer);
    this.interruptionClearTimer = setTimeout(() => {
      this.lastInterruption = null;
      this.onRender();
    }, 5000);
  }
}
