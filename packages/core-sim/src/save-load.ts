/**
 * save-load.ts — Save/Load v1 for world state persistence.
 *
 * Based on docs/architecture/save-format.md schema v1.0.0.
 * Only serializes WorldState. Does NOT serialize runner internals
 * (tickHistory, metricsHistory) — those are transient debug data.
 */

import type { WorldState } from "@project-god/shared";

// ── Save Format ─────────────────────────────────────────────

/** Current save format version. */
export const SAVE_VERSION = "1.0.0";

export interface SaveFile {
  version: string;
  seed: number;
  gameTime: number;
  worldState: WorldState;
}

// ── Save ────────────────────────────────────────────────────

/**
 * Serialize the current world state into a SaveFile.
 * Produces a deep clone to avoid reference leaks.
 */
export function saveWorld(world: WorldState): SaveFile {
  return {
    version: SAVE_VERSION,
    seed: world.seed,
    gameTime: world.tick,
    worldState: structuredClone(world),
  };
}

/**
 * Serialize a SaveFile to a JSON string.
 */
export function saveToString(world: WorldState): string {
  return JSON.stringify(saveWorld(world));
}

// ── Load ────────────────────────────────────────────────────

export class SaveLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveLoadError";
  }
}

/**
 * Deserialize and validate a SaveFile, returning the WorldState.
 * Throws SaveLoadError on version mismatch or structural issues.
 */
export function loadWorld(data: unknown): WorldState {
  if (typeof data !== "object" || data === null) {
    throw new SaveLoadError("Save data must be a non-null object");
  }

  const obj = data as Record<string, unknown>;

  // ── Version check ───────────────────────────────────────
  if (typeof obj.version !== "string") {
    throw new SaveLoadError("Missing 'version' field in save data");
  }
  if (obj.version !== SAVE_VERSION) {
    throw new SaveLoadError(
      `Unsupported save version '${obj.version}', expected '${SAVE_VERSION}'`
    );
  }

  // ── Structural checks ──────────────────────────────────
  if (typeof obj.worldState !== "object" || obj.worldState === null) {
    throw new SaveLoadError("Missing or invalid 'worldState' in save data");
  }

  const world = obj.worldState as WorldState;

  if (typeof world.tick !== "number") {
    throw new SaveLoadError("worldState.tick must be a number");
  }
  if (typeof world.seed !== "number") {
    throw new SaveLoadError("worldState.seed must be a number");
  }
  if (typeof world.entities !== "object" || world.entities === null) {
    throw new SaveLoadError("worldState.entities must be an object");
  }
  if (typeof world.tiles !== "object" || world.tiles === null) {
    throw new SaveLoadError("worldState.tiles must be an object");
  }
  if (typeof world.resourceNodes !== "object" || world.resourceNodes === null) {
    throw new SaveLoadError("worldState.resourceNodes must be an object");
  }

  return structuredClone(world);
}

/**
 * Parse a JSON string into a WorldState.
 */
export function loadFromString(jsonStr: string): WorldState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new SaveLoadError("Invalid JSON in save data");
  }
  return loadWorld(parsed);
}
