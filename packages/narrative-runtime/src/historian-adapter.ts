import type { LLMConfig, NarrativeEntry } from "./types";

export class HistorianAdapter {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Generates a sweeping historical epoch summary from physical events.
   * Uses raw template bodies or LLM bodies if available.
   */
  async generateEpochSummary(entries: NarrativeEntry[], startYear: number, endYear: number): Promise<string | null> {
    if (!this.config.enabled || entries.length === 0) return null;

    // Filter strictly to the boundaries
    const validEntries = entries.filter(e => e.year >= startYear && e.year <= endYear);
    if (validEntries.length === 0) return null;

    // Format chronicle chronologically (oldest first) for the LLM
    const chronologicalEntries = [...validEntries].sort((a, b) => a.tick - b.tick);
    
    // Create a dense summary string as input
    const historyLog = chronologicalEntries.map(e => 
      `Y${e.year} (${e.eventType}): ${e.llmBody || e.body}`
    ).join("\n");

    const prompt = `You are the Historian of a primeval world.
Summarize the following sequence of events covering Year ${startYear} to Year ${endYear} into an epic, poetic, but concise historical saga (1-2 paragraphs max).
Focus on the overall theme, the struggles, and the progression of the tribe, weaving individual events together.
Maintain a solemn, mythical tone. Do not list events bluntly.
Output ONLY the poetic narrative.

Event Log:
${historyLog}`;

    try {
      const endpoint = typeof window !== "undefined" 
          ? "/minimax-api/v1/text/chatcompletion_v2" 
          : "https://api.minimaxi.com/v1/text/chatcompletion_v2";

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "user", content: "You are the God Game Epic Historian.\n\n" + prompt },
          ],
          max_tokens: 2048, // M2.7 reasoning model needs headroom; summaries are longer
          temperature: 0.8, // Slightly higher creativity for storytelling
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "Unknown");
        throw new Error(`Historian API error: ${resp.status} - ${errText}`);
      }

      const rawText = await resp.text();
      let data: any;
      try {
        data = JSON.parse(rawText.split('\n')[0]);
      } catch (e) {
        throw new Error(`Failed to parse MiniMax JSON: ${rawText}`);
      }

      const rawContent = data.choices?.[0]?.message?.content?.trim() || "";
      if (!rawContent) {
        console.warn("[Historian] Empty response:", data);
      }
      return rawContent || null;
    } catch (err: any) {
      console.warn("[HistorianAdapter] Epoch summarization failed:", err);
      return null;
    }
  }
}
