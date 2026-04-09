/**
 * AutoTimePolicy.ts — Event-driven auto slow/pause strategy.
 *
 * Checks TickResult events against a priority map.
 * Returns the highest-priority interruption if any event warrants it.
 *
 * The TimeController consults this after every tick.
 */

import type { SimEvent, SimEventType, TimeInterruption, EventTimePriority } from "@project-god/shared";
import { DEFAULT_AUTO_TIME_RULES } from "@project-god/shared";

export class AutoTimePolicy {
  private rules: Map<SimEventType, EventTimePriority>;
  private enabled: boolean = true;

  constructor(customRules?: Partial<Record<SimEventType, EventTimePriority>>) {
    const source = customRules ?? DEFAULT_AUTO_TIME_RULES;
    this.rules = new Map(Object.entries(source) as [SimEventType, EventTimePriority][]);
  }

  /** Enable or disable auto-interruption. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check a batch of events.
   * Returns the highest-priority interruption, or null.
   * Priority order: pause > slow > ignore.
   */
  check(events: SimEvent[], tick: number): TimeInterruption | null {
    if (!this.enabled) return null;

    let bestAction: "slow" | "pause" | null = null;
    let bestEvent: SimEvent | null = null;

    for (const ev of events) {
      const priority = this.rules.get(ev.type);
      if (!priority || priority === "ignore") continue;

      if (priority === "pause") {
        // Pause is highest priority — return immediately
        return {
          reason: ev.type,
          tick,
          entityId: (ev as any).entityId,
          action: "pause",
        };
      }

      if (priority === "slow" && bestAction !== "slow") {
        bestAction = "slow";
        bestEvent = ev;
      }
    }

    if (bestAction && bestEvent) {
      return {
        reason: bestEvent.type,
        tick,
        entityId: (bestEvent as any).entityId,
        action: bestAction,
      };
    }

    return null;
  }
}
