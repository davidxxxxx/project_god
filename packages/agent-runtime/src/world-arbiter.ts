/**
 * world-arbiter.ts — LLM-powered World Arbiter.
 *
 * Evaluates uncertain agent actions (craft, experiment, fish, build)
 * and returns structured judgments. The LLM acts as an objective
 * world referee, NOT as the agent's brain.
 *
 * Architecture:
 *   Agent decides "I want to craft" (cognitive-adapter.ts)
 *   → core-sim validates prerequisites (validate/index.ts)
 *   → World Arbiter judges outcome (this file)
 *   → core-sim executes based on judgment (execute/index.ts)
 *
 * The arbiter is ASYNC. When a judgment hasn't been computed yet,
 * the executor uses a deterministic fallback. Cached judgments are
 * consumed on the next execution.
 */

import type { EntityState } from "@project-god/shared";
import type { ArbiterJudgment, ArbitrableAction, InventionDef } from "@project-god/shared";
import { deterministicFallback } from "@project-god/shared";

// ── Config ────────────────────────────────────────────────────

export interface ArbiterConfig {
  /** MiniMax API endpoint. */
  endpoint: string;
  /** API key. */
  apiKey: string;
  /** Model identifier. */
  model: string;
  /** Whether the arbiter is enabled. */
  enabled: boolean;
  /** Max tokens for arbiter response. */
  maxTokens: number;
  /** Temperature — lower = more deterministic judgments. */
  temperature: number;
}

export const DEFAULT_ARBITER_CONFIG: ArbiterConfig = {
  endpoint: "https://api.minimaxi.com/v1/text/chatcompletion_v2",
  apiKey: "",
  model: "MiniMax-M2.7",
  enabled: false,
  maxTokens: 512,
  temperature: 0.4, // Lower than cognitive: we want consistent judgments
};

// ── Judgment Cache ────────────────────────────────────────────

/** Pending judgments keyed by `entityId:actionType:tick`. */
const _pendingJudgments = new Map<string, Promise<ArbiterJudgment>>();
/** Cached completed judgments. Expires after 5 ticks. */
const _judgmentCache = new Map<string, { judgment: ArbiterJudgment; tick: number }>();
/** Max concurrent arbiter calls. */
let _pendingCalls = 0;
const MAX_CONCURRENT_ARBITER = 2;

// ── Arbiter Class ─────────────────────────────────────────────

/** Singleton config. */
let _config: ArbiterConfig = { ...DEFAULT_ARBITER_CONFIG };

export function setArbiterConfig(cfg: Partial<ArbiterConfig>) {
  _config = { ..._config, ...cfg };
}

export function getArbiterConfig(): ArbiterConfig {
  return _config;
}

/**
 * Request a judgment for an arbitrable action.
 *
 * This is called at execution time. If a cached judgment exists,
 * return it immediately. Otherwise, fire an async LLM call and
 * return a deterministic fallback. The async result is cached
 * for the next attempt.
 *
 * @returns ArbiterJudgment — either cached LLM result or deterministic fallback.
 */
export function judgeAction(
  entity: EntityState,
  actionType: ArbitrableAction,
  context: ArbiterActionContext,
  currentTick: number,
): ArbiterJudgment {
  const cacheKey = `${entity.id}:${actionType}`;

  // 1. Check cache (valid for 5 ticks)
  const cached = _judgmentCache.get(cacheKey);
  if (cached && currentTick - cached.tick < 5) {
    _judgmentCache.delete(cacheKey); // Consume the judgment
    return cached.judgment;
  }

  // 2. Fire async LLM call if enabled (don't block execution)
  if (_config.enabled && _config.apiKey.length > 0 && _pendingCalls < MAX_CONCURRENT_ARBITER) {
    if (!_pendingJudgments.has(cacheKey)) {
      const promise = callArbiterLLM(entity, actionType, context, currentTick);
      _pendingJudgments.set(cacheKey, promise);

      promise.then((judgment) => {
        _judgmentCache.set(cacheKey, { judgment, tick: currentTick });
        _pendingJudgments.delete(cacheKey);
      }).catch(() => {
        _pendingJudgments.delete(cacheKey);
      });
    }
  }

  // 3. Return deterministic fallback for immediate execution
  const relevantSkill = getRelevantSkillLevel(entity, actionType, context);
  const experienceBonus = getExperienceBonus(entity, actionType);
  return deterministicFallback(actionType, Math.min(1, relevantSkill + experienceBonus));
}

// ── Context Types ─────────────────────────────────────────────

export interface ArbiterActionContext {
  /** Recipe being crafted, if applicable. */
  recipeId?: string;
  /** Materials the agent has. */
  inventory: Record<string, number>;
  /** Structure being built, if applicable. */
  structureType?: string;
  /** Nearby terrain type. */
  terrain?: string;
  /** Time of day. */
  timeOfDay?: string;
  /** Is it cold? */
  isCold?: boolean;
  /** Available recipe/tech IDs for discovery (experiment). */
  undiscoveredRecipes?: string[];
  /** Free-form description of the invention proposal (invent action). */
  inventionDescription?: string;
  /** Already invented IDs (to prevent duplicates). */
  existingInventions?: string[];
}

// ── LLM Call ──────────────────────────────────────────────────

async function callArbiterLLM(
  entity: EntityState,
  actionType: ArbitrableAction,
  context: ArbiterActionContext,
  currentTick: number,
): Promise<ArbiterJudgment> {
  _pendingCalls++;
  try {
    const prompt = buildArbiterPrompt(entity, actionType, context);
    const endpoint = typeof window !== "undefined"
      ? "/minimax-api/v1/text/chatcompletion_v2"
      : _config.endpoint;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${_config.apiKey}`,
      },
      body: JSON.stringify({
        model: _config.model,
        messages: [
          {
            role: "system",
            content: ARBITER_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        stream: false,
        temperature: _config.temperature,
        max_tokens: _config.maxTokens,
      }),
    });

    if (!response.ok) {
      console.warn(`[WorldArbiter] MiniMax returned ${response.status}`);
      throw new Error(`HTTP ${response.status}`);
    }

    const rawText = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawText.split("\n")[0]);
    } catch {
      throw new Error("Failed to parse response JSON");
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty response");

    return parseArbiterResponse(content, actionType);
  } catch (err) {
    console.warn("[WorldArbiter] LLM call failed:", err);
    const skill = getRelevantSkillLevel(entity, actionType, context);
    return deterministicFallback(actionType, skill);
  } finally {
    _pendingCalls--;
  }
}

// ── Prompt Building ───────────────────────────────────────────

const ARBITER_SYSTEM_PROMPT = `You are the World Arbiter for a Stone Age survival simulation. Your role is to judge whether an agent's action succeeds or fails, based on their skills, experience, materials, and circumstances.

Rules:
1. Be realistic for Stone Age technology. First attempts at anything should have LOW success rates.
2. Skill level 0.0-0.3 = novice (20-40% success). 0.3-0.6 = experienced (50-70%). 0.7-1.0 = master (80-95%).
3. Better materials and tools improve success rate.
4. Cold, night, or dangerous conditions reduce success rate.
5. Previous failures should INCREASE future success (learning from mistakes).
6. On experiment actions, only discover recipes that make physical sense.
7. Narrative should be dramatic and specific — describe textures, sounds, the moment of success or failure.
8. Lessons should be practical knowledge the agent remembers.

For INVENT actions:
9. The agent proposes a novel technique/tool. Judge whether it is PHYSICALLY PLAUSIBLE in the Stone Age.
10. The agent MUST have the required materials in their inventory.
11. The invention MUST NOT violate basic physics (no gunpowder, no metal smelting, no magic).
12. Valid inventions: woven baskets, fish traps, simple snares, tools from bone/stone/wood, fire techniques, food preservation, simple shelters, clay containers, cordage.
13. If approved, define the invention as a recipe with clear inputs and outputs.
14. Outputs must be reasonable: a vine fish net might catch 1-2 fish, not 100.
15. Use snake_case for invention IDs (e.g. vine_fish_trap, bark_water_container).

You MUST respond with ONLY valid JSON and nothing else.`;

function buildArbiterPrompt(
  entity: EntityState,
  actionType: ArbitrableAction,
  ctx: ArbiterActionContext,
): string {
  const name = entity.name ?? entity.id;
  const age = entity.age ?? 20;
  const skills = entity.skills
    ? Object.entries(entity.skills).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(", ")
    : "none";
  const inv = Object.entries(entity.inventory)
    .filter(([_, v]) => v > 0)
    .map(([k, v]) => `${k}:${v}`)
    .join(", ") || "empty";

  // Past experience with this action type
  const attempts = entity.actionAttempts?.[actionType];
  const attemptStr = attempts
    ? `${attempts.attempts} attempts, ${attempts.successes} successes (${Math.round(attempts.successes / attempts.attempts * 100)}% success rate)`
    : "first time ever attempting this";

  const personality = entity.personality
    ? `E/I:${entity.personality.ei.toFixed(1)} S/N:${entity.personality.sn.toFixed(1)} T/F:${entity.personality.tf.toFixed(1)} J/P:${entity.personality.jp.toFixed(1)}`
    : "balanced";

  let actionDetail = "";
  switch (actionType) {
    case "craft":
      actionDetail = `Crafting recipe: ${ctx.recipeId ?? "unknown"}`;
      break;
    case "experiment":
      actionDetail = `Experimenting with items in inventory. Undiscovered recipes: ${ctx.undiscoveredRecipes?.join(", ") ?? "unknown"}`;
      break;
    case "invent":
      actionDetail = `INVENTION PROPOSAL: "${ctx.inventionDescription ?? "unknown idea"}"
Already invented: ${ctx.existingInventions?.join(", ") || "nothing yet"}`;
      break;
    case "fish":
      actionDetail = `Fishing in nearby water`;
      break;
    case "build":
      actionDetail = `Building structure: ${ctx.structureType ?? "unknown"}`;
      break;
  }

  return `== Agent ==
Name: ${name}, Age: ${age}
Skills: ${skills}
Inventory: ${inv}
Personality: ${personality}
Emotion: ${entity.emotion ?? "calm"}
Experience: ${attemptStr}

== Action ==
Type: ${actionType}
Detail: ${actionDetail}

== Environment ==
Time: ${ctx.timeOfDay ?? "day"}
Cold: ${ctx.isCold ? "yes" : "no"}
Terrain: ${ctx.terrain ?? "grassland"}

== Judge This Action ==
Respond with ONLY JSON:
{
  "success": true/false,
  "successChance": 0.0-1.0,
  "outcome": "1 sentence: what physically happened",
  "skillGain": 0.0-0.2,
  "discoveryId": "recipe_id_string_or_null",
  "qualityModifier": 0.5-1.5,
  "narrative": "2 sentences: dramatic description with sensory details",
  "lessonLearned": "1 sentence: what the agent remembers from this"${actionType === "invent" ? `,
  "inventionDef": {
    "id": "snake_case_id",
    "name": "Human Readable Name",
    "description": "what it does",
    "inputs": {"material1": count, "material2": count},
    "outputs": {"product1": count},
    "requiredSkill": "skill_name_or_null",
    "skillGainType": "skill_that_improves"
  }` : ""}
}`;
}

// ── Response Parsing ──────────────────────────────────────────

function parseArbiterResponse(content: string, actionType: ArbitrableAction): ArbiterJudgment {
  // Strip markdown code fences if present
  let json = content;
  if (json.startsWith("```")) {
    json = json.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const parsed = JSON.parse(json);

    return {
      actionType,
      success: !!parsed.success,
      successChance: clamp(parsed.successChance ?? 0.5, 0, 1),
      outcome: typeof parsed.outcome === "string" ? parsed.outcome : "action completed",
      skillGain: clamp(parsed.skillGain ?? 0.03, 0, 0.2),
      discoveryId: typeof parsed.discoveryId === "string" ? parsed.discoveryId : null,
      qualityModifier: clamp(parsed.qualityModifier ?? 1.0, 0.3, 2.0),
      narrative: typeof parsed.narrative === "string" ? parsed.narrative : "The attempt was made.",
      lessonLearned: typeof parsed.lessonLearned === "string"
        ? parsed.lessonLearned
        : "Experience was gained.",
      inventionDef: parseInventionDef(parsed.inventionDef),
    };
  } catch {
    console.warn("[WorldArbiter] Failed to parse JSON response, using fallback");
    return {
      ...deterministicFallback(actionType, 0.3),
      narrative: "The world's judgment was unclear.",
      lessonLearned: "Sometimes things don't go as planned.",
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/** Get the most relevant skill level for an action. */
function getRelevantSkillLevel(
  entity: EntityState,
  actionType: ArbitrableAction,
  ctx: ArbiterActionContext,
): number {
  if (!entity.skills) return 0;

  switch (actionType) {
    case "craft":
      return entity.skills["tool_making"] ?? entity.skills["cooking"] ?? 0;
    case "experiment":
      return Math.max(entity.skills["cooking"] ?? 0, entity.skills["tool_making"] ?? 0);
    case "fish":
      return entity.skills["fishing"] ?? 0;
    case "build":
      return entity.skills["building"] ?? entity.skills["masonry_skill"] ?? 0;
    case "invent":
      // Invention uses the highest of any creative skill
      return Math.max(
        entity.skills["tool_making"] ?? 0,
        entity.skills["cooking"] ?? 0,
        entity.skills["gathering"] ?? 0,
        entity.skills["fishing"] ?? 0,
      );
    default:
      return 0;
  }
}

/** Experience bonus from past attempts (learning from failure). */
function getExperienceBonus(entity: EntityState, actionType: string): number {
  const attempts = entity.actionAttempts?.[actionType];
  if (!attempts) return 0;
  // +0.05 per attempt, capped at 0.25
  const attemptBonus = Math.min(0.25, attempts.attempts * 0.05);
  // Extra bonus for past successes
  const successBonus = Math.min(0.15, attempts.successes * 0.05);
  return attemptBonus + successBonus;
}

/**
 * Record an action attempt on the entity.
 * Called by execution logic after arbiter judgment.
 */
export function recordAttempt(entity: EntityState, actionType: string, success: boolean): void {
  if (!entity.actionAttempts) entity.actionAttempts = {};
  const entry = entity.actionAttempts[actionType] ?? { attempts: 0, successes: 0 };
  entry.attempts++;
  if (success) entry.successes++;
  entity.actionAttempts[actionType] = entry;
}

// ── Invention Parsing ─────────────────────────────────────────

/**
 * Validate and sanitize an inventionDef from LLM output.
 * Returns undefined if the definition is invalid or missing.
 */
function parseInventionDef(raw: any): InventionDef | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  if (!raw.id || typeof raw.id !== "string") return undefined;
  if (!raw.name || typeof raw.name !== "string") return undefined;
  if (!raw.inputs || typeof raw.inputs !== "object") return undefined;
  if (!raw.outputs || typeof raw.outputs !== "object") return undefined;

  // Validate inputs are all positive numbers
  const inputs: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.inputs)) {
    const n = Number(v);
    if (isNaN(n) || n <= 0) continue;
    inputs[k] = Math.round(n);
  }
  if (Object.keys(inputs).length === 0) return undefined;

  // Validate outputs are all positive numbers, cap at 5 per item
  const outputs: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.outputs)) {
    const n = Number(v);
    if (isNaN(n) || n <= 0) continue;
    outputs[k] = Math.min(5, Math.round(n)); // Cap at 5 to prevent OP inventions
  }
  if (Object.keys(outputs).length === 0) return undefined;

  // Sanitize ID to snake_case
  const id = raw.id.replace(/[^a-z0-9_]/g, "").substring(0, 30);
  if (id.length === 0) return undefined;

  return {
    id,
    name: String(raw.name).substring(0, 50),
    description: typeof raw.description === "string" ? raw.description.substring(0, 200) : "",
    inputs,
    outputs,
    requiredSkill: typeof raw.requiredSkill === "string" ? raw.requiredSkill : undefined,
    skillGainType: typeof raw.skillGainType === "string" ? raw.skillGainType : undefined,
  };
}
