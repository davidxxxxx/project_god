/**
 * Branded ID types — prevent accidental cross-assignment.
 * Usage: const id = "abc" as EntityId;
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type EntityId = Brand<string, "EntityId">;
export type TribeId = Brand<string, "TribeId">;
export type TileId = Brand<string, "TileId">;
export type ResourceNodeId = Brand<string, "ResourceNodeId">;
export type StructureId = Brand<string, "StructureId">;

/** Construct a TileId from grid coordinates. Canonical key format. */
export function tileKey(x: number, y: number): TileId {
  return `${x},${y}` as TileId;
}
