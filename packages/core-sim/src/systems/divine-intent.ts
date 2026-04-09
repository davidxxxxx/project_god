/**
 * divine-intent.ts — MVP-07C Structured divine intent parser.
 *
 * Parses player text input into structured simulation commands.
 * Uses keyword matching (no LLM needed for MVP).
 *
 * Intent types:
 *   - miracle: trigger a miracle (bless/heal/rain/bounty)
 *   - doctrine_shift: adjust a doctrine's strength
 *   - none: unrecognized (falls through to LLM if available)
 */

import type { MiracleType } from "@project-god/shared";

// ── Types ────────────────────────────────────────────────────

export interface DivineIntent {
  /** What kind of divine action. */
  type: "miracle" | "doctrine_shift" | "none";
  /** If type=miracle, which miracle. */
  miracleType?: MiracleType;
  /** Target entity ID for targeted miracles. */
  targetId?: string;
  /** If type=doctrine_shift, which doctrine. */
  doctrineId?: string;
  /** If type=doctrine_shift, how much to change (+/-). */
  doctrineChange?: number;
  /** Human-readable explanation. */
  reason: string;
}

// ── Keyword patterns ─────────────────────────────────────────

interface MiraclePattern {
  keywords: string[];
  miracleType: MiracleType;
  needsTarget: boolean;
}

const MIRACLE_PATTERNS: MiraclePattern[] = [
  { keywords: ["bless", "祝福"], miracleType: "bless", needsTarget: true },
  { keywords: ["heal", "治愈", "治疗"], miracleType: "heal", needsTarget: true },
  { keywords: ["rain", "雨", "降雨"], miracleType: "rain", needsTarget: false },
  { keywords: ["bounty", "丰收", "食物"], miracleType: "bounty", needsTarget: false },
];

interface DoctrinePattern {
  keywords: string[];
  doctrineId: string;
  defaultChange: number;
}

const DOCTRINE_STRENGTHEN: DoctrinePattern[] = [
  { keywords: ["forbid fire", "禁止火", "sacred fire", "火焰神圣", "protect fire", "保护火"], doctrineId: "fire_sacred", defaultChange: 20 },
  { keywords: ["encourage sharing", "鼓励分享", "share food", "分享食物"], doctrineId: "share_food", defaultChange: 20 },
  { keywords: ["honor dead", "祭奠亡者", "remember dead", "纪念死者"], doctrineId: "honor_the_dead", defaultChange: 20 },
  { keywords: ["divine bounty", "神赐", "give thanks", "感恩"], doctrineId: "divine_bounty", defaultChange: 20 },
];

const DOCTRINE_WEAKEN: DoctrinePattern[] = [
  { keywords: ["abandon fire", "放弃火", "fire unimportant", "火不重要"], doctrineId: "fire_sacred", defaultChange: -20 },
  { keywords: ["stop sharing", "停止分享", "hoard", "囤积"], doctrineId: "share_food", defaultChange: -20 },
  { keywords: ["forget dead", "忘记死者", "move on", "向前看"], doctrineId: "honor_the_dead", defaultChange: -20 },
  { keywords: ["weaken bounty", "削弱感恩", "no thanks", "不必感恩"], doctrineId: "divine_bounty", defaultChange: -20 },
];

// ── Parser ───────────────────────────────────────────────────

/**
 * Parse a player's text input into a structured DivineIntent.
 * Returns { type: "none" } if no pattern matches.
 */
export function parseDivineIntent(input: string): DivineIntent {
  const text = input.trim().toLowerCase();
  if (!text) return { type: "none", reason: "empty input" };

  // ── 1. Check miracle patterns ────────────────────────────
  for (const pattern of MIRACLE_PATTERNS) {
    for (const kw of pattern.keywords) {
      if (text.includes(kw)) {
        let targetId: string | undefined;
        if (pattern.needsTarget) {
          // Extract target: look for "entity_N" or word after keyword
          const entityMatch = text.match(/entity_\d+/);
          if (entityMatch) {
            targetId = entityMatch[0];
          }
        }
        return {
          type: "miracle",
          miracleType: pattern.miracleType,
          targetId,
          reason: `Keyword "${kw}" matched → miracle:${pattern.miracleType}`,
        };
      }
    }
  }

  // ── 2. Check doctrine strengthen patterns ────────────────
  for (const pattern of DOCTRINE_STRENGTHEN) {
    for (const kw of pattern.keywords) {
      if (text.includes(kw)) {
        return {
          type: "doctrine_shift",
          doctrineId: pattern.doctrineId,
          doctrineChange: pattern.defaultChange,
          reason: `Keyword "${kw}" → strengthen doctrine:${pattern.doctrineId}`,
        };
      }
    }
  }

  // ── 3. Check doctrine weaken patterns ────────────────────
  for (const pattern of DOCTRINE_WEAKEN) {
    for (const kw of pattern.keywords) {
      if (text.includes(kw)) {
        return {
          type: "doctrine_shift",
          doctrineId: pattern.doctrineId,
          doctrineChange: pattern.defaultChange,
          reason: `Keyword "${kw}" → weaken doctrine:${pattern.doctrineId}`,
        };
      }
    }
  }

  // ── 4. No match → falls through to LLM ──────────────────
  return { type: "none", reason: `No keyword match for: "${text}"` };
}

/**
 * Apply a doctrine_shift intent to a tribe's doctrine list.
 * If doctrine doesn't exist yet, does nothing (tribe must have formed it first).
 * Returns true if shift was applied.
 */
export function applyDoctrineShift(
  doctrines: { id: string; strength: number }[],
  doctrineId: string,
  change: number
): boolean {
  const doctrine = doctrines.find(d => d.id === doctrineId);
  if (!doctrine) return false;

  doctrine.strength = Math.max(0, Math.min(100, doctrine.strength + change));
  return true;
}
