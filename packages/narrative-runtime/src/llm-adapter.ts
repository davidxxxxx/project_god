/**
 * llm-adapter.ts — MiniMax LLM adapter for narrative polish.
 *
 * Takes a template-generated NarrativeEntry and its context,
 * sends them to MiniMax API for a more literary rewrite.
 *
 * This is OPTIONAL — the template version always works standalone.
 * LLM polish is fire-and-forget: if it fails, we keep the template text.
 *
 * API: POST https://api.minimax.io/v1/text/chatcompletion_v2
 * Auth: Bearer token
 * Model: MiniMax-M2.7
 */

import type { NarrativeEntry, NarrativeContext, LLMConfig } from "./types";

/** Default LLM configuration for MiniMax. */
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  endpoint: "https://api.minimax.io/v1/text/chatcompletion_v2",
  apiKey: "",
  model: "MiniMax-M2.7",
  enabled: false,
  maxTokens: 120,
  temperature: 0.8,
};

const SYSTEM_PROMPT = `You are a literary narrator for an ancient civilization simulation game.
The player is a god observing a primitive tribe's evolution.
You receive a structured event summary and must rewrite it as a short, evocative narrative fragment.

Rules:
- Write 1-2 sentences maximum.
- Use third-person perspective.
- Be poetic but concise.
- Match the tone to the event: solemn for death, joyful for birth, awe for miracles, tense for prayer.
- Never mention game mechanics, ticks, or numbers.
- Use the character names provided.
- Do NOT add any commentary or explanation.
- Respond with ONLY the narrative text, nothing else.`;

export class LLMAdapter {
  private config: LLMConfig;
  private pending: number = 0;
  private readonly maxConcurrent = 3;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /** Whether this adapter is enabled and has an API key. */
  isEnabled(): boolean {
    return this.config.enabled && this.config.apiKey.length > 0;
  }

  /**
   * Polish a narrative entry using LLM.
   * Returns the polished text, or null if unavailable.
   */
  async polish(entry: NarrativeEntry, ctx: NarrativeContext): Promise<string | null> {
    if (!this.isEnabled()) return null;
    if (this.pending >= this.maxConcurrent) return null; // throttle

    const userPrompt = this.buildPrompt(entry, ctx);

    this.pending++;
    try {
      const endpoint = typeof window !== "undefined" 
          ? "/minimax-api/v1/text/chatcompletion_v2" 
          : "https://api.minimaxi.com/v1/text/chatcompletion_v2";

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "user", content: SYSTEM_PROMPT + "\n\n" + userPrompt },
          ],
          stream: false,
          temperature: this.config.temperature,
          max_tokens: 1024, // M2.7 is a reasoning model — needs headroom for thinking tokens
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "Unknown");
        console.warn(`[LLM] MiniMax returned ${response.status}: ${errText}`);
        return null;
      }

      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText.split('\n')[0]);
      } catch (e) {
        console.warn("[LLM] Failed to parse MiniMax response:", rawText);
        return null;
      }

      const text = data?.choices?.[0]?.message?.content?.trim();
      return text || null;
    } catch (err) {
      console.warn("[LLM] Polish request failed:", err);
      return null;
    } finally {
      this.pending--;
    }
  }

  private buildPrompt(entry: NarrativeEntry, ctx: NarrativeContext): string {
    const parts: string[] = [
      `Event: ${entry.eventType}`,
      `Title: ${entry.title}`,
      `Template text: ${entry.body}`,
    ];

    if (ctx.agentId) parts.push(`Character: ${ctx.agentId}`);
    if (ctx.tribeName) parts.push(`Tribe: ${ctx.tribeName}`);
    if (ctx.age !== undefined) parts.push(`Age: ${ctx.age}`);
    if (ctx.sex) parts.push(`Sex: ${ctx.sex}`);
    if (ctx.timeOfDay) parts.push(`Time: ${ctx.timeOfDay}`);
    if (ctx.temperature !== undefined) parts.push(`Temperature: ${ctx.temperature}°`);
    if (ctx.faith !== undefined) parts.push(`Faith level: ${ctx.faith}`);
    if (ctx.childId) parts.push(`Child: ${ctx.childId}`);
    if (ctx.parentIds) parts.push(`Parents: ${ctx.parentIds.join(", ")}`);
    if (ctx.deathCause) parts.push(`Cause of death: ${ctx.deathCause}`);
    if (ctx.skillId) parts.push(`Skill: ${ctx.skillId}`);
    if (ctx.miracleType) parts.push(`Miracle: ${ctx.miracleType}`);
    if (ctx.spouseId) parts.push(`Partner: ${ctx.spouseId}`);

    parts.push("\nRewrite the template text as an evocative 1-2 sentence narrative.");

    return parts.join("\n");
  }
}
