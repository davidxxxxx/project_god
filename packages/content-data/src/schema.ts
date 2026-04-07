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
