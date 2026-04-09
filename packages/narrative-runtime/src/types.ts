/**
 * types.ts — Narrative system types.
 *
 * Defines the structured output of the narrative engine.
 * These types are consumed by game-client for rendering
 * Chronicle panels, toasts, and agent biography.
 */

import type { SimEventType } from "@project-god/shared";

// ─── Importance Levels ───────────────────────────────────────

/** How significant a narrative entry is. Affects display prominence. */
export type NarrativeImportance = "minor" | "major" | "legendary";

// ─── Narrative Entry ─────────────────────────────────────────

/**
 * A single narrative fragment generated from one or more sim events.
 * This is the primary output of the narrative engine.
 */
export interface NarrativeEntry {
  /** Unique ID for this entry. */
  readonly id: string;
  /** World tick when this occurred. */
  readonly tick: number;
  /** In-game year (tick / 40). */
  readonly year: number;
  /** The primary event type that triggered this narrative. */
  readonly eventType: SimEventType;
  /** How significant this event is. */
  readonly importance: NarrativeImportance;
  /** Short headline (e.g., "A child is born"). */
  readonly title: string;
  /** 1-2 sentence narrative body from template. */
  readonly body: string;
  /** Optional LLM-polished version of the body. */
  llmBody?: string;
  /** Entity this narrative focuses on (for auto-focus). */
  readonly focusEntityId?: string;
  /** Tribe this narrative relates to. */
  readonly focusTribeId?: string;
  /** Tags for filtering/searching. */
  readonly tags: string[];
}

// ─── Narrative Context ───────────────────────────────────────

/**
 * Contextual data extracted from world state + event payload.
 * Fed into templates and LLM prompts for richer narration.
 */
export interface NarrativeContext {
  /** The agent's display name / ID. */
  agentId?: string;
  /** Agent's age. */
  age?: number;
  /** Agent's sex. */
  sex?: string;
  /** Agent's life stage. */
  lifeStage?: string;
  /** Agent's tribe name. */
  tribeName?: string;
  /** Agent's faith level. */
  faith?: number;
  /** Is it day or night? */
  timeOfDay?: "day" | "night";
  /** Current temperature. */
  temperature?: number;
  /** Number of alive tribe members. */
  tribePopulation?: number;

  // Event-specific fields
  /** Child ID (for birth). */
  childId?: string;
  /** Child's sex (for birth). */
  childSex?: string;
  /** Parent IDs (for birth). */
  parentIds?: string[];
  /** Skill ID (for invention). */
  skillId?: string;
  /** Technology ID (for tech unlock). */
  technologyId?: string;
  /** Cause of death. */
  deathCause?: string;
  /** Spouse ID (for pairing). */
  spouseId?: string;
  /** Miracle type (for miracle events). */
  miracleType?: string;
  /** Miracle cost. */
  miracleCost?: number;
  /** Target of miracle. */
  miracleTargetId?: string;
  /** Learning method (for skill). */
  learnMethod?: string;
  /** Faith lost (for unanswered prayer). */
  faithLost?: number;
}

// ─── Agent Life Event ────────────────────────────────────────

/**
 * A milestone in an agent's life, shown in their biography panel.
 */
export interface AgentLifeEvent {
  readonly tick: number;
  readonly year: number;
  readonly age: number;
  readonly type: string;
  readonly description: string;
}

// ─── Epoch Summary ───────────────────────────────────────────

export interface EpochSummary {
  readonly startYear: number;
  readonly endYear: number;
  readonly body: string;
}

// ─── Oracle Intent ───────────────────────────────────────────

export interface DivineIntent {
  intent: "BLESS" | "HEAL" | "RAIN" | "BOUNTY" | "NONE";
  targetId?: string;
  reason: string;
}

// ─── LLM Config ──────────────────────────────────────────────

/** Configuration for the optional LLM polish adapter. */
export interface LLMConfig {
  /** API endpoint URL. */
  endpoint: string;
  /** API key for authentication. */
  apiKey: string;
  /** Model identifier. */
  model: string;
  /** Whether LLM polish is enabled. */
  enabled: boolean;
  /** Max tokens for response. */
  maxTokens: number;
  /** Temperature for generation. */
  temperature: number;
}
