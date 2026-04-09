import { z } from "zod";

// ─── needs.json ──────────────────────────────────────────────

export const NeedDefSchema = z.object({
  max: z.number().positive(),
  initial: z.number().nonnegative(),
  decayPerTick: z.number().nonnegative(),
  deathThreshold: z.number(),
  criticalThreshold: z.number().nonnegative(),
});
export const NeedsFileSchema = z.record(z.string(), NeedDefSchema);
export type NeedDef = z.infer<typeof NeedDefSchema>;

// ─── resources.json ──────────────────────────────────────────

export const ResourceDefSchema = z.object({
  displayName: z.string().min(1),
  gatherAmount: z.number().int().positive(),
  restoresNeed: z.record(z.string(), z.number().nonnegative()),
  maxQuantity: z.number().int(),
  regenPerTick: z.number().nonnegative(),
});
export const ResourcesFileSchema = z.record(z.string(), ResourceDefSchema);
export type ResourceDef = z.infer<typeof ResourceDefSchema>;

// ─── attributes.json ─────────────────────────────────────────

export const AttributeDefSchema = z.object({
  displayName: z.string().min(1),
  min: z.number(),
  max: z.number(),
  defaultValue: z.number(),
}).refine((a) => a.min <= a.defaultValue && a.defaultValue <= a.max, {
  message: "defaultValue must be within [min, max]",
});
export const AttributesFileSchema = z.record(z.string(), AttributeDefSchema);
export type AttributeDef = z.infer<typeof AttributeDefSchema>;

// ─── actions.json ────────────────────────────────────────────

export const ActionDefSchema = z.object({
  range: z.number().int().nonnegative().optional(),
  requiresInventory: z.string().optional(),
});
export const ActionsFileSchema = z.record(z.string(), ActionDefSchema);
export type ActionDef = z.infer<typeof ActionDefSchema>;

// ─── terrain.json ────────────────────────────────────────────

export const TerrainDefSchema = z.object({
  displayName: z.string().min(1),
  moveCostMultiplier: z.number().min(1),
  passable: z.boolean(),
  fertility: z.number().nonnegative(),
});
export const TerrainFileSchema = z.record(z.string(), TerrainDefSchema);
export type TerrainDef = z.infer<typeof TerrainDefSchema>;

// ─── inventory.json ──────────────────────────────────────────

export const ItemDefSchema = z.object({
  displayName: z.string().min(1),
  weight: z.number().positive(),
  stackLimit: z.number().int().positive(),
});
export type ItemDef = z.infer<typeof ItemDefSchema>;

export const InventoryConfigSchema = z.object({
  /** Default carrying capacity for entities. */
  defaultCapacity: z.number().int().positive(),
  items: z.record(z.string(), ItemDefSchema),
});
export const InventoryConfigFileSchema = InventoryConfigSchema;
export type InventoryConfig = z.infer<typeof InventoryConfigSchema>;

// ─── structures.json ─────────────────────────────────────────

export const StructureDefSchema = z.object({
  displayName: z.string().min(1),
  /** Items consumed from inventory to build. key = item type, value = quantity. */
  requiredItems: z.record(z.string(), z.number().int().positive()),
  /** Manhattan range from entity for build placement. 0 = build at own position. */
  buildRange: z.number().int().nonnegative(),
  /** Starting durability (fuel ticks for fire-type structures). */
  initialDurability: z.number().int().positive(),
  /** Durability consumed per tick while active. */
  fuelPerTick: z.number().nonnegative(),
  /** Manhattan radius for area effects. */
  effectRadius: z.number().int().nonnegative(),
  /** Status effects applied to nearby entities. */
  effects: z.array(z.string()),
  /** Whether this structure acts as a focal point for rituals/spiritual gathering. */
  isSpiritualCenter: z.boolean().optional(),
});
export const StructuresFileSchema = z.record(z.string(), StructureDefSchema);
export type StructureContentDef = z.infer<typeof StructureDefSchema>;

// ─── skills.json (MVP-02-D) ──────────────────────────────────

export const SkillDefSchema = z.object({
  displayName: z.string().min(1),
  description: z.string().optional(),
  /** How this skill is acquired. */
  learnMethod: z.enum(["observation", "practice", "innate"]),
  /** Ticks of observation/practice needed to learn. */
  learnTicks: z.number().int().positive(),
  /** Proficiency level when first learned (0–1). */
  initialProficiency: z.number().min(0).max(1),
  /** Maximum proficiency (0–1). */
  maxProficiency: z.number().min(0).max(1),
});
export const SkillsFileSchema = z.record(z.string(), SkillDefSchema);
export type SkillContentDef = z.infer<typeof SkillDefSchema>;

// ─── technologies.json (MVP-02-D) ────────────────────────────

export const TechnologyDefSchema = z.object({
  displayName: z.string().min(1),
  description: z.string().optional(),
  /** Skill id that tribe members need to contribute. */
  requiredSkill: z.string().min(1),
  /** Minimum number of skilled members to unlock. */
  minSkilledMembers: z.number().int().positive(),
  /** Structures that become buildable once unlocked. */
  unlocksStructures: z.array(z.string()),
});
export const TechnologiesFileSchema = z.record(z.string(), TechnologyDefSchema);
export type TechnologyContentDef = z.infer<typeof TechnologyDefSchema>;
