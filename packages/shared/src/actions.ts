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
  | "rest"
  | "pray"
  | "build"
  | "research"
  // MVP-07A: Priest rituals
  | "perform_ritual"
  | "participate_ritual"
  // MVP-02Y: Planting
  | "plant"
  // MVP-03: River crossing
  | "wade"
  // Phase 3: Social actions
  | "talk"
  | "teach"
  | "trade"
  | "gift"
  | "comfort"
  // Phase 3: Production actions
  | "craft"
  | "fish"
  // Phase 3: Exploration actions
  | "scout"
  // Phase 3: Creative actions
  | "experiment"
  // Phase 4: Emergent invention
  | "invent"
  // P2: Ecology + Combat
  | "hunt";

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
  /** Free-form description for 'invent' actions (sent to World Arbiter). */
  readonly description?: string;
  /** Target entity ID for hunt/attack actions (P2). */
  readonly targetEntityId?: string;
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
