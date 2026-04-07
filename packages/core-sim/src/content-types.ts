export interface NeedDef {
  max: number;
  initial: number;
  decayPerTick: number;
  deathThreshold: number;
  criticalThreshold: number;
}

export interface ResourceDef {
  displayName: string;
  gatherAmount: number;
  restoresNeed: Record<string, number>;
  maxQuantity: number;
  regenPerTick: number;
}

export interface ActionDef {
  range?: number;
  requiresInventory?: string;
}

export interface TerrainDef {
  displayName: string;
  moveCostMultiplier: number;
  passable: boolean;
  fertility: number;
}
