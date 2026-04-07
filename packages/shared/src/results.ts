import { WorldState } from "./world";
import { SimEvent } from "./events";
import { ValidatedAction, RejectedAction } from "./actions";

export interface TickResult {
  readonly world: WorldState;
  readonly events: SimEvent[];
  readonly accepted: ValidatedAction[];
  readonly rejections: RejectedAction[];
}
