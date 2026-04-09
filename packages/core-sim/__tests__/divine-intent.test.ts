/**
 * divine-intent.test.ts — MVP-07C Divine intent parser tests.
 */

import { describe, it, expect } from "vitest";
import { parseDivineIntent, applyDoctrineShift } from "../src/systems/divine-intent";

describe("divine intent parser (MVP-07C)", () => {

  describe("miracle parsing", () => {
    it("parses 'bless entity_0' → miracle:bless with target", () => {
      const result = parseDivineIntent("bless entity_0");
      expect(result.type).toBe("miracle");
      expect(result.miracleType).toBe("bless");
      expect(result.targetId).toBe("entity_0");
    });

    it("parses 'heal entity_2' → miracle:heal with target", () => {
      const result = parseDivineIntent("heal entity_2");
      expect(result.type).toBe("miracle");
      expect(result.miracleType).toBe("heal");
      expect(result.targetId).toBe("entity_2");
    });

    it("parses 'rain' → miracle:rain without target", () => {
      const result = parseDivineIntent("rain");
      expect(result.type).toBe("miracle");
      expect(result.miracleType).toBe("rain");
      expect(result.targetId).toBeUndefined();
    });

    it("parses 'bounty' → miracle:bounty", () => {
      const result = parseDivineIntent("bounty");
      expect(result.type).toBe("miracle");
      expect(result.miracleType).toBe("bounty");
    });

    it("parses Chinese '降雨' → miracle:rain", () => {
      const result = parseDivineIntent("降雨");
      expect(result.type).toBe("miracle");
      expect(result.miracleType).toBe("rain");
    });

    it("parses Chinese '祝福 entity_1' → miracle:bless", () => {
      const result = parseDivineIntent("祝福 entity_1");
      expect(result.type).toBe("miracle");
      expect(result.miracleType).toBe("bless");
      expect(result.targetId).toBe("entity_1");
    });
  });

  describe("doctrine shift parsing", () => {
    it("parses 'forbid fire' → strengthen fire_sacred", () => {
      const result = parseDivineIntent("forbid fire");
      expect(result.type).toBe("doctrine_shift");
      expect(result.doctrineId).toBe("fire_sacred");
      expect(result.doctrineChange).toBe(20);
    });

    it("parses 'encourage sharing' → strengthen share_food", () => {
      const result = parseDivineIntent("encourage sharing");
      expect(result.type).toBe("doctrine_shift");
      expect(result.doctrineId).toBe("share_food");
      expect(result.doctrineChange).toBe(20);
    });

    it("parses '鼓励分享' → strengthen share_food", () => {
      const result = parseDivineIntent("鼓励分享");
      expect(result.type).toBe("doctrine_shift");
      expect(result.doctrineId).toBe("share_food");
      expect(result.doctrineChange).toBe(20);
    });

    it("parses 'stop sharing' → weaken share_food", () => {
      const result = parseDivineIntent("stop sharing");
      expect(result.type).toBe("doctrine_shift");
      expect(result.doctrineId).toBe("share_food");
      expect(result.doctrineChange).toBe(-20);
    });

    it("parses '火焰神圣' → strengthen fire_sacred", () => {
      const result = parseDivineIntent("火焰神圣");
      expect(result.type).toBe("doctrine_shift");
      expect(result.doctrineId).toBe("fire_sacred");
      expect(result.doctrineChange).toBe(20);
    });
  });

  describe("unknown input", () => {
    it("returns type:none for unrecognized text", () => {
      const result = parseDivineIntent("hello world");
      expect(result.type).toBe("none");
    });

    it("returns type:none for empty input", () => {
      const result = parseDivineIntent("");
      expect(result.type).toBe("none");
    });

    it("returns type:none for random gibberish", () => {
      const result = parseDivineIntent("xyzzy plugh");
      expect(result.type).toBe("none");
    });
  });

  describe("case insensitivity", () => {
    it("handles uppercase 'BLESS entity_0'", () => {
      const result = parseDivineIntent("BLESS entity_0");
      expect(result.type).toBe("miracle");
      expect(result.miracleType).toBe("bless");
    });

    it("handles mixed case 'Rain'", () => {
      const result = parseDivineIntent("Rain");
      expect(result.type).toBe("miracle");
      expect(result.miracleType).toBe("rain");
    });
  });

  describe("applyDoctrineShift", () => {
    it("increases doctrine strength", () => {
      const doctrines = [{ id: "fire_sacred", strength: 50 }];
      const result = applyDoctrineShift(doctrines, "fire_sacred", 20);
      expect(result).toBe(true);
      expect(doctrines[0].strength).toBe(70);
    });

    it("decreases doctrine strength", () => {
      const doctrines = [{ id: "fire_sacred", strength: 50 }];
      applyDoctrineShift(doctrines, "fire_sacred", -20);
      expect(doctrines[0].strength).toBe(30);
    });

    it("caps at 0 and 100", () => {
      const doctrines = [{ id: "fire_sacred", strength: 95 }];
      applyDoctrineShift(doctrines, "fire_sacred", 20);
      expect(doctrines[0].strength).toBe(100);

      applyDoctrineShift(doctrines, "fire_sacred", -200);
      expect(doctrines[0].strength).toBe(0);
    });

    it("returns false if doctrine not found", () => {
      const doctrines = [{ id: "fire_sacred", strength: 50 }];
      const result = applyDoctrineShift(doctrines, "nonexistent", 20);
      expect(result).toBe(false);
    });
  });
});
