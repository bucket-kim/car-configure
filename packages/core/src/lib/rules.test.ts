// src/lib/rules.test.ts
//
// Run with:  yarn vitest
//
// These tests are the specification. If they pass, your rules engine is
// correct for the catalog we designed. They also become the first thing
// GitHub Actions runs in Phase 6 — which is why writing logic as pure
// functions matters: pure functions are trivially testable, and testable
// code is what makes a CI pipeline worth having.

import { describe, it, expect } from "vitest";
import catalog from "../data/catalog.json";
import type { Catalog, BuildSelection } from "../types/config";
import {
  selectedOptionIds,
  validateBuild,
  computeDisabledOptions,
  applySelection,
} from "./rules";

const cat = catalog as unknown as Catalog;

/** A minimal valid build: cheapest choice in every required group. */
function baseBuild(): BuildSelection {
  return {
    modelId: "911-c4s",
    options: {
      "exterior-color": ["c-white"],
      wheels: ["w-carrera-s-20"],
      interior: ["i-black-leather"],
      packages: [],
    },
  };
}

function withPackages(...ids: string[]): BuildSelection {
  const b = baseBuild();
  b.options.packages = ids;
  return b;
}

/* ------------------------------------------------------------------ */

describe("selectedOptionIds", () => {
  it("flattens every group into one set", () => {
    const ids = selectedOptionIds(withPackages("p-sport-chrono"));
    expect(ids.has("c-white")).toBe(true);
    expect(ids.has("w-carrera-s-20")).toBe(true);
    expect(ids.has("p-sport-chrono")).toBe(true);
    expect(ids.size).toBe(4);
  });

  it("handles empty groups", () => {
    expect(selectedOptionIds(baseBuild()).size).toBe(3);
  });
});

/* ------------------------------------------------------------------ */

describe("validateBuild — group constraints", () => {
  it("accepts a complete base build", () => {
    expect(validateBuild(cat, baseBuild()).valid).toBe(true);
  });

  it("rejects a build missing a required group", () => {
    const b = baseBuild();
    b.options.wheels = [];
    expect(validateBuild(cat, b).valid).toBe(false);
  });

  it("rejects two options in a single-selection group", () => {
    const b = baseBuild();
    b.options["exterior-color"] = ["c-white", "c-black"];
    expect(validateBuild(cat, b).valid).toBe(false);
  });

  it("allows many options in a multiple-selection group", () => {
    const b = withPackages("p-sport-chrono", "p-sport-exhaust", "p-pasm-sport");
    expect(validateBuild(cat, b).valid).toBe(true);
  });
});

describe("validateBuild — requires rules", () => {
  it("flags PCCB on standard wheels", () => {
    const r = validateBuild(cat, withPackages("p-pccb"));
    expect(r.valid).toBe(false);
    expect(r.violations.map((v) => v.ruleId)).toContain(
      "r-pccb-wheel-clearance",
    );
  });

  it("accepts PCCB with RS Spyder wheels (one of several satisfies)", () => {
    const b = withPackages("p-pccb");
    b.options.wheels = ["w-rs-spyder-20"];
    expect(validateBuild(cat, b).valid).toBe(true);
  });

  it("accepts PCCB with Exclusive wheels (the other alternative)", () => {
    const b = withPackages("p-pccb");
    b.options.wheels = ["w-carrera-exclusive-20"];
    expect(validateBuild(cat, b).valid).toBe(true);
  });

  it("flags rear-axle steering without PASM", () => {
    const r = validateBuild(cat, withPackages("p-rear-axle-steer"));
    expect(r.violations.map((v) => v.ruleId)).toContain(
      "r-rear-steer-needs-pasm",
    );
  });

  it("accepts rear-axle steering with PASM", () => {
    const b = withPackages("p-rear-axle-steer", "p-pasm-sport");
    expect(validateBuild(cat, b).valid).toBe(true);
  });
});

describe("validateBuild — excludes rules", () => {
  it("flags sunroof combined with carbon roof", () => {
    const r = validateBuild(cat, withPackages("p-sunroof", "p-carbon-roof"));
    expect(r.valid).toBe(false);
    expect(r.violations.map((v) => v.ruleId)).toContain("r-roof-conflict");
  });

  it("allows either roof option alone", () => {
    expect(validateBuild(cat, withPackages("p-sunroof")).valid).toBe(true);
    expect(validateBuild(cat, withPackages("p-carbon-roof")).valid).toBe(true);
  });

  it("flags heated seats with full bucket seats", () => {
    const b = withPackages("p-heated-seats", "p-pasm-sport");
    b.options.interior = ["i-lightweight-buckets"];
    const r = validateBuild(cat, b);
    expect(r.violations.map((v) => v.ruleId)).toContain("r-buckets-no-heating");
  });
});

describe("validateBuild — violation payloads", () => {
  it("carries a human-readable message the UI can show", () => {
    const r = validateBuild(cat, withPackages("p-pccb"));
    const v = r.violations.find((x) => x.ruleId === "r-pccb-wheel-clearance");
    expect(v?.message).toMatch(/caliper clearance/i);
  });

  it("reports multiple independent violations at once", () => {
    const b = withPackages("p-pccb", "p-sunroof", "p-carbon-roof");
    expect(validateBuild(cat, b).violations.length).toBeGreaterThanOrEqual(2);
  });
});

/* ------------------------------------------------------------------ */

describe("computeDisabledOptions", () => {
  it("disables carbon roof once the sunroof is selected", () => {
    const disabled = computeDisabledOptions(cat, withPackages("p-sunroof"));
    expect(disabled).toContain("p-carbon-roof");
  });

  it("disables PCCB while standard wheels are selected", () => {
    const disabled = computeDisabledOptions(cat, baseBuild());
    expect(disabled).toContain("p-pccb");
  });

  it("stops disabling PCCB once compatible wheels are chosen", () => {
    const b = baseBuild();
    b.options.wheels = ["w-rs-spyder-20"];
    expect(computeDisabledOptions(cat, b)).not.toContain("p-pccb");
  });

  it("never disables an already-selected option", () => {
    const b = withPackages("p-sunroof");
    expect(computeDisabledOptions(cat, b)).not.toContain("p-sunroof");
  });

  it("leaves unconstrained options alone", () => {
    const disabled = computeDisabledOptions(cat, baseBuild());
    expect(disabled).not.toContain("c-gt-silver");
    expect(disabled).not.toContain("p-sport-chrono");
  });
});

/* ------------------------------------------------------------------ */

describe("applySelection", () => {
  it("replaces the choice in a single-selection group", () => {
    const next = applySelection(cat, baseBuild(), "c-shark-blue");
    expect(next.options["exterior-color"]).toEqual(["c-shark-blue"]);
  });

  it("adds to a multiple-selection group", () => {
    const next = applySelection(cat, baseBuild(), "p-sport-chrono");
    expect(next.options.packages).toContain("p-sport-chrono");
  });

  it("toggles off when an already-selected multi option is clicked", () => {
    const next = applySelection(
      cat,
      withPackages("p-sport-chrono"),
      "p-sport-chrono",
    );
    expect(next.options.packages).not.toContain("p-sport-chrono");
  });

  it("does not mutate the input build", () => {
    const before = baseBuild();
    const snapshot = JSON.stringify(before);
    applySelection(cat, before, "c-black");
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("returns a new object reference (Zustand depends on this)", () => {
    const before = baseBuild();
    expect(applySelection(cat, before, "c-black")).not.toBe(before);
  });
});
