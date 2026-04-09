import type { LLMConfig, DivineIntent } from "./types";

export interface OracleContext {
  divinePoints: number;
  availableMiracles: Array<{ intent: string; cost: number; description: string; needsTarget: boolean }>;
  prayingAgents: Array<{ id: string; hunger: number; thirst: number; exposure: number; faith: number }>;
  strugglingAgents: Array<{ id: string; hunger: number; thirst: number; exposure: number; faith: number }>;
}

export class OracleAdapter {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  /**
   * Parses a natural language command into a structured DivineIntent.
   */
  async parseDivineWill(text: string, context: OracleContext): Promise<DivineIntent | null> {
    if (!this.config.enabled || !text.trim()) return null;

    const miraclesInstruction = context.availableMiracles.map(m => 
      `- ${m.intent}: cost ${m.cost}. ${m.description} (Needs target: ${m.needsTarget})`
    ).join("\n");

    const prayingInstruction = context.prayingAgents.length > 0
      ? `Currently Praying Agents:\n` + context.prayingAgents.map(a => `- ${a.id} (Hunger: ${a.hunger.toFixed(0)}, Thirst: ${a.thirst.toFixed(0)}, Cold: ${a.exposure.toFixed(0)}, Faith: ${a.faith})`).join("\n")
      : "No agents currently praying.";

    const strugglingInstruction = context.strugglingAgents.length > 0
      ? `Other Struggling Agents:\n` + context.strugglingAgents.map(a => `- ${a.id} (Hunger: ${a.hunger.toFixed(0)}, Thirst: ${a.thirst.toFixed(0)}, Cold: ${a.exposure.toFixed(0)}, Faith: ${a.faith})`).join("\n")
      : "";

    const prompt = `You are the Divine Oracle parsing the will of the God.
The God has spoken: "${text}"

Available Miracles (Current Divine Points: ${context.divinePoints}):
${miraclesInstruction}

World State Snippets:
${prayingInstruction}
${strugglingInstruction}

Rules:
1. You must select EXACTLY ONE "intent" from the Available Miracles list, or "NONE" if the command is impossible, invalid, or unaffordable.
2. If the chosen miracle "Needs target: true", you MUST extract the best matching agent ID as "targetId". Guess based on the God's words and the struggling agents list (e.g. if the God says "heal the child", find a child). If you cannot deduce a target, intent is NONE.
3. If intent does not need a target (e.g., RAIN, BOUNTY), omit "targetId".
4. Output STRICTLY raw JSON data matching this schema:
{
  "intent": "BLESS" | "HEAL" | "RAIN" | "BOUNTY" | "NONE",
  "targetId": "string" | null,
  "reason": "short explanation of your decision"
}
Do not use Markdown blocks (\`\`\`). Do not add any extra text.`;

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
            { role: "user", content: prompt },
          ],
          max_tokens: 1024, // M2.7 is a reasoning model — needs headroom for thinking tokens
          temperature: 0.1, // Very low temperature for strict JSON matching
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "Unknown");
        throw new Error(`Oracle API error: ${resp.status} - ${errText}`);
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
        console.warn("[OracleAdapter] Empty response:", data);
        const errMsg = data.base_resp?.status_msg || JSON.stringify(data);
        return { intent: "NONE", reason: `API Error: ${errMsg}` };
      }

      // Cleanup markdown block if model ignored parsing rule
      const jsonStr = rawContent.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      
      let result: DivineIntent;
      try {
        result = JSON.parse(jsonStr) as DivineIntent;
      } catch (parseErr) {
        console.warn("[OracleAdapter] Failed to parse JSON:", jsonStr);
        return { intent: "NONE", reason: "The Gods speak in tongues." };
      }
      
      // Validation fallback
      if (!["BLESS", "HEAL", "RAIN", "BOUNTY", "NONE"].includes(result.intent)) {
        result.intent = "NONE";
      }

      return result;
    } catch (err: any) {
      console.warn("[OracleAdapter] Failed to parse divine will:", err);
      const errMsg = err?.message || "API/JSON Error";
      return { intent: "NONE", reason: `The Heavens could not parse the command (${errMsg}).` };
    }
  }
}
