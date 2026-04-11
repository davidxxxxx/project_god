/**
 * cognitive-adapter.ts — LLM-driven agent cognition.
 *
 * Converts an agent's perception snapshot into a natural-language prompt,
 * sends it to MiniMax API, and parses the structured JSON response into
 * an ActionPlanStep[] that the rule engine executes.
 *
 * This module is the "brain" of the hybrid architecture:
 *   LLM decides WHAT to do → Rule engine checks IF it's possible → Executor applies the result
 *
 * Key design:
 * - Pre-plan mode: LLM outputs 3-5 steps, rules execute one per tick
 * - Fallback: If LLM fails, rule-based policy takes over
 * - Async: LLM calls are non-blocking, agent uses rules while waiting
 * - Rate limiting: max 3 concurrent calls across all agents
 */

import type { EntityState, ActionPlanStep, EmotionType } from "@project-god/shared";
import { getMBTICode, EMOTION_EMOJI } from "@project-god/shared";
import type { AgentSnapshot } from "./perception";

// ── LLM Config ────────────────────────────────────────────────

export interface CognitiveConfig {
  /** MiniMax API endpoint. */
  endpoint: string;
  /** API key for authentication. */
  apiKey: string;
  /** Model identifier. */
  model: string;
  /** Whether LLM cognition is enabled. */
  enabled: boolean;
  /** Ticks between cognitive cycles for each agent. Default 30. */
  cognitivePeriod: number;
  /** Max tokens for response. */
  maxTokens: number;
  /** Temperature for generation. Lower = more deterministic. */
  temperature: number;
}

export const DEFAULT_COGNITIVE_CONFIG: CognitiveConfig = {
  endpoint: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
  apiKey: "",
  model: "MiniMax-M2.7",
  enabled: false,
  cognitivePeriod: 30,
  maxTokens: 1024,
  temperature: 0.7,
};

// ── Response Types ────────────────────────────────────────────

/** Structured response parsed from LLM JSON output. */
export interface CognitiveResponse {
  thought: string;
  emotion: EmotionType;
  plan: ActionPlanStep[];
  goal?: string;
}

// ── Adapter Class ─────────────────────────────────────────────

/** Active LLM call counter (for observability). */
let _pendingCalls = 0;

export class CognitiveAdapter {
  private config: CognitiveConfig;

  constructor(config: CognitiveConfig) {
    this.config = config;
  }

  isEnabled(): boolean {
    return this.config.enabled && this.config.apiKey.length > 0;
  }

  /**
   * Determine if this agent should trigger a cognitive cycle this tick.
   */
  shouldTrigger(
    entity: EntityState,
    currentTick: number,
    recentDeathNearby: boolean = false,
    seesNewTerrain: boolean = false,
  ): boolean {
    if (!this.isEnabled()) return false;
    if (!entity.alive) return false;
    // Young children (age < 10) don't get cognitive cycles — they just follow parents.
    // Adolescents (age 10-14) DO get LLM cognition: they start having thoughts,
    // plans, and personality before reaching full adulthood at 15.
    const ADOLESCENT_AGE = 10;
    if (entity.statuses?.includes("child") && (entity.age ?? 0) < ADOLESCENT_AGE) return false;

    const lastCog = entity.lastCognitiveTick ?? 0;
    const elapsed = currentTick - lastCog;

    // Regular cycle: every N ticks
    if (elapsed >= this.config.cognitivePeriod) return true;

    // Crisis trigger: HP critical
    if ((entity.needs.hp ?? 100) <= 25 && elapsed >= 10) return true;

    // Crisis trigger: nearby death
    if (recentDeathNearby && elapsed >= 10) return true;

    // Discovery trigger: new terrain/resource
    if (seesNewTerrain && elapsed >= 15) return true;

    return false;
  }

  /**
   * Run a cognitive cycle for an agent.
   * Returns null if LLM fails or is unavailable — caller should fallback to rules.
   */
  async runCognition(
    entity: EntityState,
    snapshot: AgentSnapshot,
    currentTick: number,
    recentActions: { action: string; result: string }[] = [],
  ): Promise<CognitiveResponse | null> {
    if (!this.isEnabled()) return null;

    const prompt = this.buildPrompt(entity, snapshot, recentActions);

    _pendingCalls++;
    try {
      const endpoint = typeof window !== "undefined"
        ? "/minimax-api/v1/text/chatcompletion_v2"
        : this.config.endpoint;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "user", content: prompt },
          ],
          stream: false,
          temperature: this.config.temperature,
          max_tokens: this.config.maxTokens,
        }),
      });

      if (!response.ok) {
        console.warn(`[Cognitive] MiniMax returned ${response.status}`);
        return null;
      }

      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText.split("\n")[0]);
      } catch {
        console.warn("[Cognitive] Failed to parse MiniMax response");
        return null;
      }

      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) return null;

      return this.parseResponse(content);
    } catch (err) {
      console.warn("[Cognitive] LLM call failed:", err);
      return null;
    } finally {
      _pendingCalls--;
    }
  }

  // ── Prompt Builder ────────────────────────────────────────

  private buildPrompt(
    entity: EntityState,
    snapshot: AgentSnapshot,
    recentActions: { action: string; result: string }[],
  ): string {
    const name = entity.name ?? entity.id;
    const age = entity.age ?? 0;
    const sex = entity.sex ?? "unknown";
    const mbti = entity.personality ? getMBTICode(entity.personality) : "unknown";
    const emotion = entity.emotion ?? "calm";
    const goal = entity.personalGoal ?? "survive";

    // Personality description
    const p = entity.personality;
    const traitDesc = p ? [
      p.ei >= 0.3 ? "outgoing and sociable" : p.ei <= -0.3 ? "quiet and independent" : "balanced socially",
      p.sn >= 0.3 ? "curious and imaginative" : p.sn <= -0.3 ? "practical and grounded" : "moderately observant",
      p.tf >= 0.3 ? "empathetic and caring" : p.tf <= -0.3 ? "logical and analytical" : "balanced in judgment",
      p.jp >= 0.3 ? "spontaneous and flexible" : p.jp <= -0.3 ? "organized and methodical" : "adaptive",
    ].join(", ") : "no strong tendencies";

    // Body state
    const hp = Math.round(entity.needs.hp ?? 100);
    const hunger = Math.round(entity.needs.hunger ?? 100);
    const thirst = Math.round(entity.needs.thirst ?? 100);

    // Inventory
    const inv = Object.entries(entity.inventory)
      .filter(([_, v]) => v > 0)
      .map(([k, v]) => `${k}:${v}`)
      .join(", ") || "empty";

    // Skills
    const skills = Object.entries(entity.skills ?? {})
      .map(([k, v]) => `${k} (${Math.round(v * 100)}%)`)
      .join(", ") || "none";

    // Nearby resources
    const resources = snapshot.nearbyResources.slice(0, 8).map((r) =>
      `${r.resourceType} at (${r.position.x},${r.position.y}) [qty:${Math.round(r.quantity)}]`
    ).join("\n  ") || "none visible";

    // Nearby entities
    const nearby = snapshot.nearbyEntities.slice(0, 6).map((ne) => {
      const rel = entity.spouseId === ne.entityId ? "spouse"
        : (entity.parentIds as any[])?.includes(ne.entityId) ? "parent"
        : (entity.childIds as any[])?.includes(ne.entityId) ? "child"
        : "tribe member";
      const trust = entity.socialMemory?.[ne.entityId]?.trust;
      const trustStr = trust !== undefined ? ` trust:${trust.toFixed(1)}` : "";
      return `${ne.entityId} (${rel}${trustStr}) at (${ne.position.x},${ne.position.y})`;
    }).join("\n  ") || "nobody nearby";

    // Nearby structures
    const structures = snapshot.nearbyActiveStructures.slice(0, 5).map((s) =>
      `${s.type} at (${s.position.x},${s.position.y})`
    ).join("\n  ") || "none";

    // Recent memories
    const memories = (entity.episodicMemory ?? []).slice(-5).map((m) =>
      `${m.type}: ${m.detail ?? m.resourceType ?? "event"} at (${m.position.x},${m.position.y})`
    ).join("\n  ") || "no recent memories";

    // Recent actions
    const actionHistory = recentActions.slice(-3).map((a) =>
      `Tried: ${a.action} → ${a.result}`
    ).join("\n  ") || "no actions yet";

    // Life stage context for adolescents
    const isAdolescent = entity.statuses?.includes("child") && (entity.age ?? 0) >= 10;
    const lifeStage = isAdolescent
      ? `\nYou are an adolescent (age ${age}). You are curious and eager to learn. You stay near your tribe but are starting to help gather food, observe skills, and form your own opinions. You look up to adults and want to prove yourself.`
      : "";

    return `You are ${name}, a ${age}-year-old ${sex} person in the Stone Age.

Your personality: ${mbti} — ${traitDesc}
Your current emotion: ${emotion}
Your current goal: ${goal}${lifeStage}

== Your Body ==
HP: ${hp}/100  Hunger: ${hunger}/100  Thirst: ${thirst}/100
Inventory: ${inv}
Skills: ${skills}

== What You See ==
Location: (${entity.position.x},${entity.position.y}). Time: ${snapshot.timeOfDay}. Vision: ${snapshot.visionRadius} tiles. ${snapshot.isCold ? "It's cold." : "Warm enough."}
Resources nearby:
  ${resources}
People nearby:
  ${nearby}
Structures nearby:
  ${structures}

== Your Memories ==
  ${memories}

== Available Actions ==
Survival:
1. move(x,y) — walk TOWARD a destination (set position to your GOAL, the engine pathfinds automatically)
2. gather(targetId) — pick up food/water from resource node you're on
3. harvest(targetId) — extract wood/stone/grass/clay from nearby node
4. eat — eat food from your inventory (berry, roast_berry, fish, cooked_fish, meat, cooked_meat, dried_berry, smoked_meat)
5. drink — drink water from your inventory (water, boiled_water)
6. cook(recipeId) — cook at a fire pit (recipes: roast_berry, boiled_water, cooked_fish, cooked_meat)
7. build(itemId) — build a structure if you have materials
8. add_fuel — add wood to a fire pit
9. pray — pray to the gods for help
10. wade(x,y) — cross shallow water (risky, may lose HP)
11. idle — rest and observe

Social:
12. talk — converse with a nearby person (builds trust)
13. teach — share a skill with a nearby person
14. trade — exchange items with a nearby person
15. gift — give items to a nearby person (big trust boost)
16. comfort — console a distressed nearby person

Production:
17. craft(recipeId) — create tool/item (recipes: stone_knife, clay_pot)
18. fish — catch fish from adjacent water (need to be next to river)

Exploration:
19. scout — survey surroundings carefully (extended vision radius)

Creative:
20. experiment — try combining items in new ways (may discover recipe)

== Structures You Can Build ==
fire_pit (stone:2, wood:1), lean_to (wood:2, grass:2), hut (wood:6, grass:3, stone:2)
smoker (wood:4, stone:2), granary (wood:6, stone:4), well (stone:6, wood:2)
longhouse (wood:10, stone:4, grass:6), shrine (stone:4, wood:2), temple (stone:8, wood:4, grass:2)

== What Happened Recently ==
  ${actionHistory}

IMPORTANT: Respond with ONLY valid JSON, no other text. Plan 3-5 steps ahead.
{
  "thought": "1-2 sentence inner monologue in first person, reflecting your personality",
  "emotion": "one of: calm, anxious, curious, content, afraid, angry, grieving, hopeful, determined",
  "plan": [
    { "type": "action_type", "targetId": "optional_target", "position": {"x":0,"y":0}, "recipeId": "optional_recipe", "reason": "why" },
    ...more steps...
  ],
  "goal": "your current personal goal (only change if situation demands it)"
}`;
  }

  // ── Response Parser ───────────────────────────────────────

  private parseResponse(content: string): CognitiveResponse | null {
    try {
      // Extract JSON from potential markdown fences or reasoning tokens
      let jsonStr = content;

      // Strip markdown code fences
      const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonStr = fenceMatch[1];

      // Try to find JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn("[Cognitive] No JSON found in response");
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const thought = typeof parsed.thought === "string" ? parsed.thought.slice(0, 200) : "";
      const emotion = this.validateEmotion(parsed.emotion);
      const plan = this.validatePlan(parsed.plan);
      const goal = typeof parsed.goal === "string" ? parsed.goal.slice(0, 100) : undefined;

      if (plan.length === 0) {
        console.warn("[Cognitive] LLM returned empty plan");
        return null;
      }

      return { thought, emotion, plan, goal };
    } catch (err) {
      console.warn("[Cognitive] Failed to parse LLM JSON:", err);
      return null;
    }
  }

  private validateEmotion(raw: any): EmotionType {
    const valid: EmotionType[] = [
      "calm", "anxious", "curious", "content", "afraid",
      "angry", "grieving", "hopeful", "determined",
    ];
    return valid.includes(raw) ? raw : "calm";
  }

  private validatePlan(raw: any): ActionPlanStep[] {
    if (!Array.isArray(raw)) return [];

    const validTypes = new Set([
      "idle", "move", "gather", "harvest", "eat", "drink",
      "cook", "add_fuel", "build", "pray", "wade", "plant",
      "rest", "perform_ritual", "participate_ritual", "drop",
      // Phase 3: Social
      "talk", "teach", "trade", "gift", "comfort",
      // Phase 3: Production
      "craft", "fish",
      // Phase 3: Exploration + Creative
      "scout", "experiment",
    ]);

    return raw
      .filter((step: any) => step && typeof step.type === "string" && validTypes.has(step.type))
      .slice(0, 5) // Max 5 steps
      .map((step: any): ActionPlanStep => ({
        type: step.type,
        targetId: typeof step.targetId === "string" ? step.targetId : undefined,
        position: step.position && typeof step.position.x === "number"
          ? { x: Math.round(step.position.x), y: Math.round(step.position.y) }
          : undefined,
        recipeId: typeof step.recipeId === "string" ? step.recipeId : undefined,
        itemId: typeof step.itemId === "string" ? step.itemId : undefined,
        reason: typeof step.reason === "string" ? step.reason.slice(0, 100) : "LLM plan step",
      }));
  }
}
