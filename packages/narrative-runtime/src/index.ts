/**
 * narrative-runtime — Event Narrative System (MVP-06A).
 *
 * Converts SimEvents into readable story fragments.
 * Template-first with optional MiniMax LLM polish.
 */

export { NarrativeEngine } from "./narrative-engine";
export { LLMAdapter, DEFAULT_LLM_CONFIG } from "./llm-adapter";
export { HistorianAdapter } from "./historian-adapter";
export { OracleAdapter } from "./oracle-adapter";
export type { OracleContext } from "./oracle-adapter";
export { TEMPLATE_REGISTRY } from "./narrative-templates";
export type {
  NarrativeEntry,
  NarrativeContext,
  NarrativeImportance,
  AgentLifeEvent,
  EpochSummary,
  DivineIntent,
  LLMConfig,
} from "./types";
