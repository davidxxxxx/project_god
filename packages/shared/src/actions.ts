import { EntityId, ResourceNodeId } from "./ids";
import { Vec2 } from "./geometry";

// ─── Action Types ────────────────────────────────────────────

export type ActionType =
  | "idle"
  | "move"
  | "gather"
  | "eat"
  | "drink"
  // Future phases:
  | "rest"
  | "pray"
  | "build"
  | "research";

// ─── ActionIntent ────────────────────────────────────────────
// agent-runtime produces these. It is a REQUEST, not a mutation.

export interface ActionIntent {
  readonly actorId: EntityId;
  readonly type: ActionType;
  readonly targetId?: ResourceNodeId;
  readonly position?: Vec2;
  readonly itemId?: string;
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
