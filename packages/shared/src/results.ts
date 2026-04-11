import { WorldState } from "./world";
import { SimEvent } from "./events";
import { ValidatedAction, RejectedAction } from "./actions";

/** Per-tick fog of war state (computed, not persisted). */
export interface FogState {
  /** Set of tileKeys currently visible by any alive agent. */
  readonly visibleTiles: Set<string>;
  /** Vision radius used this tick (based on time of day). */
  readonly currentVisionRadius: number;
}

export interface TickResult {
  readonly world: WorldState;
  readonly events: SimEvent[];
  readonly accepted: ValidatedAction[];
  readonly rejections: RejectedAction[];
  /** Fog of war state for this tick. */
  readonly fogState?: FogState;
}
