/**
 * narrative-engine.ts — Core narrative engine.
 *
 * Converts SimEvents into NarrativeEntry objects using templates.
 * Maintains a chronicle (ordered list of entries) and per-agent life events.
 * Optionally polishes entries via LLM adapter.
 *
 * Usage:
 *   const engine = new NarrativeEngine();
 *   engine.processEvents(tickResult.events, tick, worldContext);
 *   const chronicle = engine.getChronicle();
 *   const lifeEvents = engine.getAgentLifeEvents("entity_0");
 */

import type { SimEvent, SimEventType } from "@project-god/shared";
import type { NarrativeEntry, NarrativeContext, AgentLifeEvent } from "./types";
import { TEMPLATE_REGISTRY, type TemplateId } from "./narrative-templates";
import { LLMAdapter } from "./llm-adapter";
import { HistorianAdapter } from "./historian-adapter";
import { OracleAdapter } from "./oracle-adapter";
import type { LLMConfig, EpochSummary } from "./types";

/** Max chronicle entries kept in memory. */
const MAX_CHRONICLE_SIZE = 200;

/** Max life events per agent. */
const MAX_LIFE_EVENTS = 50;

/** Event types that generate narratives. */
const NARRATIVE_EVENT_TYPES = new Set<SimEventType>([
  "ENTITY_BORN",
  "ENTITY_DIED",
  "SKILL_LEARNED",
  "TECHNOLOGY_UNLOCKED",
  "PRAYER_STARTED",
  "PRAYER_UNANSWERED",
  "MIRACLE_PERFORMED",
  "PAIR_BONDED",
]);

/** Default ticks per year, matching lifecycle system. */
const TICKS_PER_YEAR = 40;

let entryCounter = 0;

export class NarrativeEngine {
  private chronicle: NarrativeEntry[] = [];
  private agentLifeEvents: Map<string, AgentLifeEvent[]> = new Map();
  private epochSummaries: EpochSummary[] = [];
  private llmAdapter: LLMAdapter | null = null;
  private historianAdapter: HistorianAdapter | null = null;
  private oracleAdapter: OracleAdapter | null = null;
  private _lastEntry: NarrativeEntry | null = null;
  /** Callback fired when an async LLM polish resolves. */
  public onPolished?: (entry: NarrativeEntry) => void;
  /** Track last processed tick to avoid duplicate processing. */
  private lastProcessedTick: number = -1;

  constructor(llmConfig?: LLMConfig) {
    if (llmConfig && llmConfig.enabled) {
      this.llmAdapter = new LLMAdapter(llmConfig);
      this.historianAdapter = new HistorianAdapter(llmConfig);
      this.oracleAdapter = new OracleAdapter(llmConfig);
    }
  }

  /** Get Historian adapter (if enabled). */
  getHistorian(): HistorianAdapter | null {
    return this.historianAdapter;
  }

  /** Get Oracle adapter (if enabled). */
  getOracle(): OracleAdapter | null {
    return this.oracleAdapter;
  }

  /** Add an epoch summary. */
  addEpochSummary(summary: EpochSummary): void {
    this.epochSummaries.unshift(summary); // newest first
  }

  /** Get all epoch summaries. */
  getEpochSummaries(): readonly EpochSummary[] {
    return this.epochSummaries;
  }

  /** Get the most recent narrative entry (for toast display). */
  getLastEntry(): NarrativeEntry | null {
    return this._lastEntry;
  }

  /** Get full chronicle, most recent first. */
  getChronicle(): readonly NarrativeEntry[] {
    return this.chronicle;
  }

  /** Get life events for a specific agent. */
  getAgentLifeEvents(agentId: string): readonly AgentLifeEvent[] {
    return this.agentLifeEvents.get(agentId) ?? [];
  }

  /** Clear all state (on world reset). */
  reset(): void {
    this.chronicle = [];
    this.agentLifeEvents.clear();
    this._lastEntry = null;
    this.lastProcessedTick = -1;
    entryCounter = 0;
  }

  /**
   * Process a batch of events from a single tick.
   * Generates narrative entries for qualifying events.
   * Skips if this tick was already processed (dedup for multiple render calls).
   */
  processEvents(events: SimEvent[], tick: number, worldContext?: Partial<NarrativeContext>): void {
    if (tick <= this.lastProcessedTick) return; // already processed
    this.lastProcessedTick = tick;

    for (const ev of events) {
      if (!NARRATIVE_EVENT_TYPES.has(ev.type)) continue;

      const templateFn = TEMPLATE_REGISTRY[ev.type as TemplateId];
      if (!templateFn) continue;

      const ctx = this.buildContext(ev, worldContext);
      const result = templateFn(ctx, tick);

      const entry: NarrativeEntry = {
        id: `nar_${++entryCounter}`,
        tick,
        year: Math.floor(tick / TICKS_PER_YEAR),
        eventType: ev.type,
        importance: result.importance,
        title: result.title,
        body: result.body,
        focusEntityId: ctx.agentId ?? ctx.childId,
        focusTribeId: ctx.tribeName,
        tags: result.tags,
      };

      // Add to chronicle
      this.chronicle.unshift(entry); // newest first
      if (this.chronicle.length > MAX_CHRONICLE_SIZE) {
        this.chronicle.pop();
      }

      // Track as last entry for toast
      this._lastEntry = entry;

      // Add agent life event
      this.addLifeEvent(entry, ctx);

      // Fire-and-forget LLM polish (async, won't block)
      if (this.llmAdapter) {
        this.llmAdapter.polish(entry, ctx).then((polished) => {
          if (polished) {
            entry.llmBody = polished;
            this.onPolished?.(entry);
          }
        }).catch(() => { /* LLM failure is non-critical */ });
      }
    }
  }

  // ── Private ─────────────────────────────────────────────────

  private buildContext(ev: SimEvent, worldCtx?: Partial<NarrativeContext>): NarrativeContext {
    const e = ev as any;
    const ctx: NarrativeContext = {
      ...worldCtx,
    };

    // Extract common fields from event payload
    if (e.entityId) ctx.agentId = e.entityId;

    // Event-specific extraction
    switch (ev.type) {
      case "ENTITY_BORN":
        ctx.childId = e.entityId;
        ctx.childSex = e.sex;
        ctx.parentIds = e.parentIds;
        ctx.agentId = e.entityId;
        break;
      case "ENTITY_DIED":
        ctx.deathCause = e.cause;
        ctx.age = e.age;
        break;
      case "SKILL_LEARNED":
        ctx.skillId = e.skillId;
        ctx.learnMethod = e.method;
        break;
      case "TECHNOLOGY_UNLOCKED":
        ctx.technologyId = e.technologyId;
        ctx.tribeName = ctx.tribeName ?? e.tribeId;
        break;
      case "PRAYER_STARTED":
        ctx.faith = e.faith;
        break;
      case "PRAYER_UNANSWERED":
        ctx.faithLost = e.faithLost;
        break;
      case "MIRACLE_PERFORMED":
        ctx.miracleType = e.miracleType;
        ctx.miracleCost = e.cost;
        ctx.miracleTargetId = e.targetId;
        ctx.agentId = e.targetId;
        break;
      case "PAIR_BONDED":
        ctx.agentId = e.entity1Id;
        ctx.spouseId = e.entity2Id;
        break;
    }

    return ctx;
  }

  private addLifeEvent(entry: NarrativeEntry, ctx: NarrativeContext): void {
    // Determine which agent(s) get a life event
    const agents: string[] = [];
    if (ctx.agentId) agents.push(ctx.agentId);

    // Birth: also record for parents
    if (entry.eventType === "ENTITY_BORN" && ctx.parentIds) {
      for (const pid of ctx.parentIds) agents.push(pid);
    }
    // Pairing: record for both
    if (entry.eventType === "PAIR_BONDED" && ctx.spouseId) {
      agents.push(ctx.spouseId);
    }

    const lifeEvent: AgentLifeEvent = {
      tick: entry.tick,
      year: entry.year,
      age: ctx.age ?? 0,
      type: entry.eventType,
      description: entry.title,
    };

    for (const agentId of agents) {
      let events = this.agentLifeEvents.get(agentId);
      if (!events) {
        events = [];
        this.agentLifeEvents.set(agentId, events);
      }
      events.push(lifeEvent);
      if (events.length > MAX_LIFE_EVENTS) {
        events.shift();
      }
    }
  }
}
