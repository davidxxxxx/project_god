/**
 * environment.test.ts — Unit tests for MVP-03-A environment system.
 *
 * Tests:
 * - Temperature calculation (sinusoidal day/night cycle)
 * - Time of day detection
 * - Exposure decay rules (cold, warming, sheltered)
 * - Exposure recovery rules (warm weather)
 * - Exposure death
 * - ENVIRONMENT_CHANGED event emission
 */

import { describe, it, expect } from "vitest";
import { createWorld, type WorldConfig } from "../src/create-world";
import { tickWorld } from "../src/tick";
import {
  calculateTemperature,
  calculateTimeOfDay,
  DEFAULT_DAY_LENGTH,
  COLD_THRESHOLD,
} from "../src/systems/environment-tick";
import type { EntityState, TickContext } from "@project-god/shared";

const BASE_NEEDS = {
  hunger: { max: 100, initial: 80, decayPerTick: 1, deathThreshold: 0, criticalThreshold: 25 },
  thirst: { max: 100, initial: 80, decayPerTick: 2, deathThreshold: 0, criticalThreshold: 25 },
  exposure: { max: 100, initial: 100, decayPerTick: 0, deathThreshold: 0, criticalThreshold: 30 },
};

const BASE_CONFIG: WorldConfig = {
  seed: 42, width: 10, height: 10, entityCount: 1,
  terrain: { grass: { passable: true } },
  needs: BASE_NEEDS,
};

const BASE_CTX: TickContext = {
  needs: BASE_NEEDS, // includes exposure
  resources: {},
  actions: {},
  terrain: { grass: { displayName: "Grass", moveCostMultiplier: 1, passable: true, fertility: 0.5 } },
};

// ── Temperature calculation ────────────────────────────────────

describe("temperature calculation (MVP-03-A)", () => {
  it("returns ~60 at quarter-cycle (day peak)", () => {
    // sin(π/2)=1 → 42.5 + 17.5 = 60
    const temp = calculateTemperature(DEFAULT_DAY_LENGTH / 4, DEFAULT_DAY_LENGTH);
    expect(temp).toBeCloseTo(60, 0);
  });

  it("returns ~25 at three-quarter-cycle (night low)", () => {
    // sin(3π/2)=-1 → 42.5 - 17.5 = 25
    const temp = calculateTemperature((3 * DEFAULT_DAY_LENGTH) / 4, DEFAULT_DAY_LENGTH);
    expect(temp).toBeCloseTo(25, 0);
  });

  it("returns ~42.5 at tick 0 (neutral)", () => {
    const temp = calculateTemperature(0, DEFAULT_DAY_LENGTH);
    expect(temp).toBeCloseTo(42.5, 0);
  });

  it("all temperatures are in range 25-60", () => {
    for (let tick = 0; tick < DEFAULT_DAY_LENGTH * 3; tick++) {
      const temp = calculateTemperature(tick, DEFAULT_DAY_LENGTH);
      expect(temp).toBeGreaterThanOrEqual(24);
      expect(temp).toBeLessThanOrEqual(61);
    }
  });

  it("temperature < COLD_THRESHOLD during night", () => {
    // Night is when sin < 0, i.e. ticks 20-40 (second half of cycle)
    for (let tick = 21; tick <= 39; tick++) {
      const temp = calculateTemperature(tick, DEFAULT_DAY_LENGTH);
      expect(temp).toBeLessThan(COLD_THRESHOLD);
    }
  });
});

describe("time of day (MVP-03-A)", () => {
  it("is day at quarter-cycle (peak temperature)", () => {
    expect(calculateTimeOfDay(DEFAULT_DAY_LENGTH / 4, DEFAULT_DAY_LENGTH)).toBe("day");
  });

  it("is night at three-quarter-cycle (low temperature)", () => {
    expect(calculateTimeOfDay((3 * DEFAULT_DAY_LENGTH) / 4, DEFAULT_DAY_LENGTH)).toBe("night");
  });
});

// ── Exposure mechanics ─────────────────────────────────────────

describe("exposure decay (MVP-03-A)", () => {
  it("exposure does NOT decay during warm daytime ticks", () => {
    const world = createWorld(BASE_CONFIG);
    // Tick 4: sin(2π*4/40)=sin(0.2π)>0 → day, temp ~56 (warm)
    world.tick = 4; // will advance to 5
    // Advance to tick 5 (still day, warm temp ~58)

    const entity = Object.values(world.entities)[0] as EntityState;
    entity.needs.exposure = 80;

    tickWorld(world, [], BASE_CTX);
    // Tick 5 is day with warm temp → exposure should recover (+1)
    const afterEntity = world.entities[entity.id] as EntityState;
    expect(afterEntity.needs.exposure).toBeGreaterThan(80);
  });

  it("exposure decays by 2 per tick when cold and no protection", () => {
    const world = createWorld(BASE_CONFIG);
    // Set world.tick to mid-night minus 1: sin(2π*30/40)=sin(1.5π)<0 → night/cold
    // world.tick=29 → after increment becomes 30 → cold night
    world.tick = 29;

    const entity = Object.values(world.entities)[0] as EntityState;
    entity.needs.exposure = 80;
    entity.needs.hunger = 90;
    entity.needs.thirst = 90;
    entity.statuses = [];

    tickWorld(world, [], BASE_CTX);

    const afterEntity = world.entities[entity.id] as EntityState;
    // Night cold, no shelter → -2 per tick
    expect(afterEntity.needs.exposure).toBe(78);
  });

  it("exposure decays by only 1 per tick with warming status", () => {
    const world = createWorld(BASE_CONFIG);
    // Use mid-night tick: 29 → 30 after increment (cold night)
    world.tick = 29;

    const entity = Object.values(world.entities)[0] as EntityState;
    entity.needs.exposure = 80;
    entity.needs.hunger = 90;
    entity.needs.thirst = 90;
    entity.statuses = ["warming"]; // has warming from fire pit

    tickWorld(world, [], BASE_CTX);

    const afterEntity = world.entities[entity.id] as EntityState;
    // Warming halves decay: -1 instead of -2
    expect(afterEntity.needs.exposure).toBe(79);
  });

  it("exposure does NOT decay with sheltered status", () => {
    const world = createWorld(BASE_CONFIG);
    // Mid-night: tick 29 → 30
    world.tick = 29;

    const entity = Object.values(world.entities)[0] as EntityState;
    entity.needs.exposure = 80;
    entity.needs.hunger = 90;
    entity.needs.thirst = 90;
    entity.statuses = ["sheltered"]; // has lean_to shelter

    tickWorld(world, [], BASE_CTX);

    const afterEntity = world.entities[entity.id] as EntityState;
    expect(afterEntity.needs.exposure).toBe(80); // no change
  });

  it("exposure = 0 causes entity death", () => {
    const world = createWorld(BASE_CONFIG);
    // Mid-night: tick 29 → 30
    world.tick = 29;

    const entity = Object.values(world.entities)[0] as EntityState;
    entity.needs.exposure = 1; // one tick from death (-2 in cold)
    entity.needs.hunger = 90;
    entity.needs.thirst = 90;
    entity.statuses = []; // no protection

    tickWorld(world, [], BASE_CTX);

    const afterEntity = world.entities[entity.id] as EntityState;
    expect(afterEntity.alive).toBe(false);
    expect(afterEntity.needs.exposure).toBe(0);
  });
});

describe("ENVIRONMENT_CHANGED event (MVP-03-A)", () => {
  it("emits ENVIRONMENT_CHANGED when time of day transitions", () => {
    const world = createWorld(BASE_CONFIG);
    // sin(2π*tick/40): sin > 0 = day, sin <= 0 = night
    // Transition day→night happens between tick 20 (sin(π)≈0+, still day) and tick 21 (sin(1.05π)<0, night)
    // Set world.tick = 20 (will advance to 21 on tickWorld call, which is night)
    world.tick = 20;
    world.environment!.temperature = calculateTemperature(20, DEFAULT_DAY_LENGTH);
    world.environment!.timeOfDay = calculateTimeOfDay(20, DEFAULT_DAY_LENGTH);
    expect(world.environment!.timeOfDay).toBe("day"); // tick 20: sin(π)≈0+ → day

    const result = tickWorld(world, [], BASE_CTX);
    // After tick: world.tick = 21, sin(1.05π) < 0 → night
    const envEvent = result.events.find((e) => e.type === "ENVIRONMENT_CHANGED");
    expect(envEvent).toBeDefined();
    expect((envEvent as any).timeOfDay).toBe("night");
  });

  it("does NOT emit ENVIRONMENT_CHANGED when time of day unchanged", () => {
    const world = createWorld(BASE_CONFIG);
    // Mid-day, no transition: tick 5 → 6, both day
    world.tick = 5;
    world.environment!.timeOfDay = calculateTimeOfDay(5, DEFAULT_DAY_LENGTH);
    world.environment!.temperature = calculateTemperature(5, DEFAULT_DAY_LENGTH);

    const result = tickWorld(world, [], BASE_CTX);
    const envEvents = result.events.filter((e) => e.type === "ENVIRONMENT_CHANGED");
    expect(envEvents.length).toBe(0);
  });
});

describe("EXPOSURE_WARNING event (MVP-03-A)", () => {
  it("emits EXPOSURE_WARNING when exposure crosses critical threshold", () => {
    const world = createWorld(BASE_CONFIG);
    // Use mid-night tick: 29 → 30 (cold)
    world.tick = 29;

    const entity = Object.values(world.entities)[0] as EntityState;
    // exposure = 32, will decay by 2 → 30 (hits criticalThreshold=30)
    entity.needs.exposure = 32;
    entity.statuses = [];
    entity.needs.hunger = 90;
    entity.needs.thirst = 90;

    const result = tickWorld(world, [], BASE_CTX);
    const warnEvent = result.events.find((e) => e.type === "EXPOSURE_WARNING");
    expect(warnEvent).toBeDefined();
    expect((warnEvent as any).entityId).toBe(entity.id);
  });
});
