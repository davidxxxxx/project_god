/**
 * Content loaders — read JSON files, validate with Zod, return typed data.
 * Any validation failure throws immediately. No silent fallbacks.
 */

import * as fs from "fs";
import * as path from "path";
import {
  NeedsFileSchema,
  ResourcesFileSchema,
  AttributesFileSchema,
  ActionsFileSchema,
  TerrainFileSchema,
  InventoryConfigFileSchema,
  StructuresFileSchema,
  SkillsFileSchema,
  TechnologiesFileSchema,
  type NeedDef,
  type ResourceDef,
  type AttributeDef,
  type ActionDef,
  type TerrainDef,
  type InventoryConfig,
  type StructureContentDef,
  type SkillContentDef,
  type TechnologyContentDef,
} from "./schema";

const DATA_DIR = path.resolve(__dirname, "../data");

function loadAndParse<T>(filename: string, schema: { parse: (d: unknown) => T }): T {
  const filePath = path.join(DATA_DIR, filename);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return schema.parse(raw);
}

export function loadNeeds(): Record<string, NeedDef> {
  return loadAndParse("needs.json", NeedsFileSchema);
}

export function loadResources(): Record<string, ResourceDef> {
  return loadAndParse("resources.json", ResourcesFileSchema);
}

export function loadAttributes(): Record<string, AttributeDef> {
  return loadAndParse("attributes.json", AttributesFileSchema);
}

export function loadActions(): Record<string, ActionDef> {
  return loadAndParse("actions.json", ActionsFileSchema);
}

export function loadTerrain(): Record<string, TerrainDef> {
  return loadAndParse("terrain.json", TerrainFileSchema);
}

export function loadInventoryConfig(): InventoryConfig {
  return loadAndParse("inventory.json", InventoryConfigFileSchema);
}

export function loadStructures(): Record<string, StructureContentDef> {
  return loadAndParse("structures.json", StructuresFileSchema);
}

export function loadSkills(): Record<string, SkillContentDef> {
  return loadAndParse("skills.json", SkillsFileSchema);
}

export function loadTechnologies(): Record<string, TechnologyContentDef> {
  return loadAndParse("technologies.json", TechnologiesFileSchema);
}

/** Load and validate ALL content. Throws on first failure. */
export function loadAllContent() {
  return {
    needs: loadNeeds(),
    resources: loadResources(),
    attributes: loadAttributes(),
    actions: loadActions(),
    terrain: loadTerrain(),
    inventory: loadInventoryConfig(),
    structures: loadStructures(),
    skills: loadSkills(),
    technologies: loadTechnologies(),
  };
}
