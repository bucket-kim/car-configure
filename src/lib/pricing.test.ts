// src/lib/pricing.test.ts
//
// Run with: yarn test

import { describe, it, expect } from "vitest";
import catalog from "../data/catalog.json";
import type { Catalog, BuildSelection } from "../types/config";
import { computePrice, formatCents } from "./pricing";

const cat = catalog as unknown as Catalog;

const BASE = 13_710_000; // 911 Carrera 4S
const FEE = 165_000; // delivery, processing and handling

function baseBuild(): BuildSelection {
  return {
    modelId: "911-c4s",
    options: {
      "exterior-color": ["c-white"], // $0
      wheels: ["w-carrera-s-20"], // $0
      interior: ["i-black-leather"], // $0
      packages: [],
    },
  };
}

function withPackages(...ids: string[]): BuildSelection {
  const b = baseBuild();
  b.options.packages = ids;
  return b;
}

const total = (b: BuildSelection) => computePrice(cat, b).totalCents;

/* ------------------------------------------------------------------ */

describe("computePrice — totals", () => {
  it("prices a base build as base + fee", () => {
    expect(total(baseBuild())).toBe(BASE + FEE);
  });

  it("adds a single paid option", () => {
    const b = baseBuild();
    b.options["exterior-color"] = ["c-gt-silver"]; // 84_000
    expect(total(b)).toBe(BASE + 84_000 + FEE);
  });

  it("adds several paid options across groups", () => {
    const b = withPackages("p-sport-chrono"); // 279_000
    b.options["exterior-color"] = ["c-shark-blue"]; // 327_000
    b.options.wheels = ["w-rs-spyder-20"]; // 360_000
    expect(total(b)).toBe(BASE + 327_000 + 360_000 + 279_000 + FEE);
  });

  it("prices the most expensive configuration correctly", () => {
    const b = withPackages("p-pccb", "p-carbon-roof"); // 897_000 + 390_000
    b.options["exterior-color"] = ["c-pts-rubystone"]; // 1_283_000
    b.options.wheels = ["w-rs-spyder-20"]; // 360_000
    b.options.interior = ["i-bordeaux-leather"]; // 233_000
    expect(total(b)).toBe(
      BASE + 1_283_000 + 360_000 + 233_000 + 897_000 + 390_000 + FEE,
    );
  });
});

describe("computePrice — bundle discount", () => {
  const CHRONO = 279_000;
  const EXHAUST = 295_000;
  const PASM = 151_000;
  const SAVING = 120_000;

  it("applies the discount when all three sport options are present", () => {
    const b = withPackages("p-sport-chrono", "p-sport-exhaust", "p-pasm-sport");
    expect(total(b)).toBe(BASE + CHRONO + EXHAUST + PASM - SAVING + FEE);
  });

  it("does not apply when only two of the three are present", () => {
    const b = withPackages("p-sport-chrono", "p-sport-exhaust");
    expect(total(b)).toBe(BASE + CHRONO + EXHAUST + FEE);
  });

  it("appears as a negative line item, not a special case", () => {
    const b = withPackages("p-sport-chrono", "p-sport-exhaust", "p-pasm-sport");
    const { lineItems } = computePrice(cat, b);
    const discount = lineItems.find((l) => l.amountCents < 0);
    expect(discount).toBeDefined();
    expect(discount!.amountCents).toBe(-SAVING);
  });
});

describe("computePrice — line items", () => {
  it("starts with the base price", () => {
    const { lineItems } = computePrice(cat, baseBuild());
    expect(lineItems[0].amountCents).toBe(BASE);
  });

  it("ends with the fee", () => {
    const { lineItems } = computePrice(cat, baseBuild());
    expect(lineItems[lineItems.length - 1].amountCents).toBe(FEE);
  });

  it("includes zero-cost selected options for transparency", () => {
    const { lineItems } = computePrice(cat, baseBuild());
    expect(lineItems.some((l) => l.label.includes("White"))).toBe(true);
  });

  it("total always equals the sum of every line item", () => {
    const b = withPackages("p-sport-chrono", "p-sport-exhaust", "p-pasm-sport");
    const { lineItems, totalCents } = computePrice(cat, b);
    const sum = lineItems.reduce((acc, l) => acc + l.amountCents, 0);
    expect(sum).toBe(totalCents);
  });

  it("uses integers only — no floating point anywhere", () => {
    const b = withPackages("p-sport-chrono", "p-sport-exhaust", "p-pasm-sport");
    const { lineItems, totalCents } = computePrice(cat, b);
    expect(Number.isInteger(totalCents)).toBe(true);
    lineItems.forEach((l) =>
      expect(Number.isInteger(l.amountCents)).toBe(true),
    );
  });
});

describe("computePrice — authority", () => {
  it("marks client-side results as non-authoritative", () => {
    expect(computePrice(cat, baseBuild()).authoritative).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe("formatCents", () => {
  it("formats whole dollars with separators", () => {
    expect(formatCents(13_710_000)).toBe("$137,100");
  });

  it("formats zero", () => {
    expect(formatCents(0)).toBe("$0");
  });

  it("formats negative amounts for discounts", () => {
    expect(formatCents(-120_000)).toBe("-$1,200");
  });
});
