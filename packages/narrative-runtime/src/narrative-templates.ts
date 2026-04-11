/**
 * narrative-templates.ts — Event-to-narrative template mapping.
 *
 * Each template is a pure function: (context) => { title, body, importance, tags }.
 * Templates use simple string interpolation, no LLM needed.
 *
 * This is the deterministic, fast, always-available narrative layer.
 * LLM polish is applied on top of these outputs as an optional enhancement.
 */

import type { NarrativeContext, NarrativeImportance } from "./types";

// ─── Template Output ─────────────────────────────────────────

export interface TemplateResult {
  title: string;
  body: string;
  importance: NarrativeImportance;
  tags: string[];
}

// ─── Helper ──────────────────────────────────────────────────

/** Pick a random element from array using tick as poor-man's seed. */
function pick<T>(items: T[], tick: number): T {
  return items[tick % items.length];
}

function timeDesc(ctx: NarrativeContext): string {
  if (ctx.timeOfDay === "dawn") return "As the first light touches the horizon";
  if (ctx.timeOfDay === "night") return "In the darkness of night";
  if (ctx.temperature !== undefined && ctx.temperature < 40) return "Against the biting cold";
  return "Under the open sky";
}

// ─── Templates ───────────────────────────────────────────────

export function birthTemplate(ctx: NarrativeContext, tick: number): TemplateResult {
  const parents = ctx.parentIds?.join(" and ") ?? "unknown parents";
  const sexLabel = ctx.childSex === "male" ? "boy" : ctx.childSex === "female" ? "girl" : "child";
  const setting = timeDesc(ctx);

  const bodies = [
    `${setting}, ${parents} welcomed a new ${sexLabel} into ${ctx.tribeName ?? "the tribe"}. The child was named ${ctx.childId}.`,
    `A new life stirs. ${ctx.childId}, a ${sexLabel}, is born to ${parents} in ${ctx.tribeName ?? "the tribe"}.`,
    `${ctx.tribeName ?? "The tribe"} grows — ${ctx.childId} has been born, ${sexLabel}, to ${parents}.`,
  ];

  return {
    title: `A ${sexLabel} is born`,
    body: pick(bodies, tick),
    importance: "major",
    tags: ["birth", "family", "population"],
  };
}

export function deathTemplate(ctx: NarrativeContext, tick: number): TemplateResult {
  const cause = ctx.deathCause ?? "unknown causes";
  const ageStr = ctx.age !== undefined ? ` at age ${ctx.age}` : "";

  const bodies = [
    `${ctx.agentId} has perished from ${cause}${ageStr}. ${ctx.tribeName ?? "The tribe"} mourns the loss.`,
    `The fire of ${ctx.agentId}'s life has gone out${ageStr}. Cause: ${cause}.`,
    `${ctx.tribeName ?? "The tribe"} lost ${ctx.agentId}${ageStr} to ${cause}. The living carry on.`,
  ];

  return {
    title: `${ctx.agentId} has died`,
    body: pick(bodies, tick),
    importance: ctx.lifeStage === "elder" ? "major" : "major",
    tags: ["death", "loss"],
  };
}

export function inventionTemplate(ctx: NarrativeContext, tick: number): TemplateResult {
  const skill = ctx.skillId ?? "a new skill";
  const method = ctx.learnMethod ?? "discovery";

  const bodies = [
    `Through pure ${method}, ${ctx.agentId} has grasped the secret of ${skill}. ${ctx.tribeName ?? "The tribe"}'s understanding deepens.`,
    `${ctx.agentId} became the first to master ${skill} — discovered through ${method}. A new capability is born.`,
    `A breakthrough: ${ctx.agentId} now knows ${skill}, learned by ${method}. The boundaries of knowledge expand.`,
  ];

  return {
    title: `${ctx.agentId} discovers ${skill}`,
    body: pick(bodies, tick),
    importance: "legendary",
    tags: ["invention", "skill", "knowledge", "milestone"],
  };
}

export function techUnlockedTemplate(ctx: NarrativeContext, tick: number): TemplateResult {
  const tech = ctx.technologyId ?? "a new technology";

  const bodies = [
    `${ctx.tribeName ?? "The tribe"} has unlocked ${tech}. Civilization takes another step forward.`,
    `A milestone for ${ctx.tribeName ?? "the tribe"}: the collective knowledge of ${tech} is now established.`,
    `The era of ${tech} begins. ${ctx.tribeName ?? "The tribe"} will never be the same.`,
  ];

  return {
    title: `Technology unlocked: ${tech}`,
    body: pick(bodies, tick),
    importance: "legendary",
    tags: ["technology", "civilization", "milestone"],
  };
}

export function prayerStartedTemplate(ctx: NarrativeContext, tick: number): TemplateResult {
  const setting = timeDesc(ctx);
  const faithStr = ctx.faith !== undefined ? ` (faith: ${ctx.faith})` : "";

  const bodies = [
    `${setting}, ${ctx.agentId} kneels and begins to pray${faithStr}. Will the heavens answer?`,
    `${ctx.agentId} raises their hands to the sky, seeking divine aid${faithStr}.`,
    `In a moment of desperation, ${ctx.agentId} turns to prayer${faithStr}. The gods are watching.`,
  ];

  return {
    title: `${ctx.agentId} prays`,
    body: pick(bodies, tick),
    importance: "major",
    tags: ["prayer", "faith", "divine"],
  };
}

export function prayerUnansweredTemplate(ctx: NarrativeContext, tick: number): TemplateResult {
  const lostStr = ctx.faithLost !== undefined ? ` (−${ctx.faithLost} faith)` : "";

  const bodies = [
    `${ctx.agentId}'s prayer goes unanswered. Doubt creeps in${lostStr}.`,
    `Silence from the heavens. ${ctx.agentId} lowers their hands, faith wavering${lostStr}.`,
    `No miracle comes. ${ctx.agentId} must face this alone${lostStr}.`,
  ];

  return {
    title: `Prayer unanswered`,
    body: pick(bodies, tick),
    importance: "minor",
    tags: ["prayer", "faith", "doubt"],
  };
}

export function miracleTemplate(ctx: NarrativeContext, tick: number): TemplateResult {
  const type = ctx.miracleType ?? "divine act";
  const target = ctx.miracleTargetId ? ` upon ${ctx.miracleTargetId}` : "";
  const cost = ctx.miracleCost !== undefined ? ` (${ctx.miracleCost} divine points)` : "";

  const bodies: Record<string, string[]> = {
    bless: [
      `The heavens shine${target}. Hunger fades, thirst is quenched${cost}.`,
      `A warm light descends${target}. The blessed one feels renewed${cost}.`,
    ],
    heal: [
      `Divine warmth wraps around${target ? ` ${ctx.miracleTargetId}` : " the faithful"}. Wounds close, cold retreats${cost}.`,
      `A healing miracle${target}. The body is restored${cost}.`,
    ],
    rain: [
      `The sky darkens. Rain falls across the land — the rivers and ponds swell with fresh water${cost}.`,
      `A divine rain washes over the world. The water of life returns${cost}.`,
    ],
    bounty: [
      `Berry bushes bloom where there was nothing. The earth answers the divine will${cost}.`,
      `A bounty from the heavens — food springs from the ground across the land${cost}.`,
    ],
  };

  const typeTemplates = bodies[type] ?? [`A ${type} miracle occurs${target}${cost}.`];

  return {
    title: `Miracle: ${type}`,
    body: pick(typeTemplates, tick),
    importance: "legendary",
    tags: ["miracle", "divine", type],
  };
}

export function pairBondedTemplate(ctx: NarrativeContext, tick: number): TemplateResult {
  const spouse = ctx.spouseId ?? "another";

  const bodies = [
    `${ctx.agentId} and ${spouse} have formed a bond. In ${ctx.tribeName ?? "the tribe"}, two hearts become one.`,
    `A pair bond is forged between ${ctx.agentId} and ${spouse}. Together, they face the world.`,
  ];

  return {
    title: `${ctx.agentId} bonds with ${spouse}`,
    body: pick(bodies, tick),
    importance: "minor",
    tags: ["pairing", "family", "social"],
  };
}

// ─── Template Registry ───────────────────────────────────────

export type TemplateId =
  | "ENTITY_BORN"
  | "ENTITY_DIED"
  | "SKILL_LEARNED"
  | "TECHNOLOGY_UNLOCKED"
  | "PRAYER_STARTED"
  | "PRAYER_UNANSWERED"
  | "MIRACLE_PERFORMED"
  | "PAIR_BONDED";

export const TEMPLATE_REGISTRY: Record<TemplateId, (ctx: NarrativeContext, tick: number) => TemplateResult> = {
  ENTITY_BORN: birthTemplate,
  ENTITY_DIED: deathTemplate,
  SKILL_LEARNED: inventionTemplate,
  TECHNOLOGY_UNLOCKED: techUnlockedTemplate,
  PRAYER_STARTED: prayerStartedTemplate,
  PRAYER_UNANSWERED: prayerUnansweredTemplate,
  MIRACLE_PERFORMED: miracleTemplate,
  PAIR_BONDED: pairBondedTemplate,
};
