import { EntityId, ResourceNodeId } from "./ids";
import { Vec2 } from "./geometry";

// ─── Action Types ────────────────────────────────────────────

export type ActionType =
  | "idle"
  | "move"
  | "gather"
  | "harvest"    // MVP-02X: labor extraction (wood, stone, grass)
  | "eat"
  | "drink"
  | "drop"
  | "cook"       // MVP-02X: transform raw→cooked at fire
  | "add_fuel"   // MVP-02X: add wood to fire pit
  // Future phases:
  | "rest"
  | "pray"
  | "build"
  | "research"
  // MVP-07A: Priest rituals
  | "perform_ritual"
  | "participate_ritual"
  // MVP-02Y: Planting
  | "plant";

// ─── ActionIntent ────────────────────────────────────────────
// agent-runtime produces these. It is a REQUEST, not a mutation.

export interface ActionIntent {
  readonly actorId: EntityId;
  readonly type: ActionType;
  readonly targetId?: ResourceNodeId;
  readonly position?: Vec2;
  readonly itemId?: string;
  /** Recipe ID for cook actions. */
  readonly recipeId?: string;
  /** Agent's self-reported confidence (0–1). Debug only. */
  readonly confidence?: number;
  /** Agent's self-reported reason. Debug only. */
  readonly reason?: string;
}

// ─── Validated / Rejected ────────────────────────────────────

export interface ValidatedAction {
  readonly kind: "validated";
  readonly intent: ActionIntent;
  readonly energyCost: number;
  readonly timeCost: number;
}

export interface RejectedAction {
  readonly kind: "rejected";
  readonly intent: ActionIntent;
  readonly reason: string;
}

export type ActionOutcome = ValidatedAction | RejectedAction;
