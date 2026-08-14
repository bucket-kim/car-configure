// src/types/config.ts
//
// The spine of the project. Every other module — UI, rules engine, pricing,
// Lambda handlers, DynamoDB items — speaks these shapes.
//
// Design rule: this file must not import React, Three.js, or any AWS SDK.
// It has to be equally valid in a browser bundle and in a Node Lambda.

/* ------------------------------------------------------------------ */
/* IDs — branded strings so you can't pass a ColorId where a WheelId   */
/* is expected. Cheap trick, catches real bugs in a rules engine.      */
/* ------------------------------------------------------------------ */

export type ModelId = string;
export type OptionId = string;
export type GroupId = string;

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

/**
 * A category of choices: "Exterior Colour", "Wheels", "Interior".
 * `selection` decides UI *and* validation semantics:
 *   - "single"   → exactly one option must be chosen (colour)
 *   - "multiple" → zero or more may be chosen (option packages, extras)
 */
export interface OptionGroup {
  id: GroupId;
  label: string;
  selection: "single" | "multiple";
  /** If true, the build is invalid until something in this group is chosen. */
  required: boolean;
  /** Display order in the UI. */
  order: number;
}

/**
 * How an option changes the 3D scene. Keeping this *in the data* means the
 * viewer never hardcodes "if colorId === 'gt-silver'". Add a colour = add a row.
 */
/**
 * Note on `targetMaterial` vs the `targetMesh` this used to say:
 *
 * The real GLB paints the car across SEVEN meshes that all share one material
 * named "paint" (boot008, boot002, boot001, boot005, Plane004, Plane003,
 * Plane002). Targeting by mesh would mean listing all seven here and cloning
 * seven materials — and the list would break the moment an artist re-splits
 * the body. The material name is the stable identifier the DCC tool and the
 * app can both agree on, so that is the contract.
 */
export type VisualEffect =
  | {
      kind: "paint";
      targetMaterial: string;
      hex: string;
      metallic: number;
      roughness: number;
    }
  | { kind: "swapMesh"; hide: string[]; show: string[] }
  | { kind: "material"; targetMaterial: string; materialName: string }
  | { kind: "none" };

export interface Option {
  id: OptionId;
  groupId: GroupId;
  label: string;
  /** Price delta in cents. Integers only — never use floats for money. */
  priceCents: number;
  /** Marketing copy for the detail panel. */
  description?: string;
  /** Small image for the picker button. */
  thumbnailUrl?: string;
  visual: VisualEffect;
  /**
   * Set when `visual.kind === "none"` only because the current GLB lacks the
   * geometry the option needs. Distinguishes "intentionally invisible"
   * (Sport Chrono) from "not yet renderable" (sunroof) so the gap is
   * inspectable rather than silently forgotten.
   */
  visualTodo?: string;
  /** Which models offer this option at all. */
  availableOn: ModelId[];
}

export interface CarModel {
  id: ModelId;
  name: string;
  /** Starting price in cents, before any options. */
  basePriceCents: number;
  /** Path to the GLB, relative to the CDN root. */
  modelUrl: string;
  powertrain: {
    layout: string; // "Rear-engine, AWD"
    engine: string; // "3.0L twin-turbo flat-six"
    horsepower: number;
    transmission: string;
  };
}

/* ------------------------------------------------------------------ */
/* Rules — the differentiator                                          */
/* ------------------------------------------------------------------ */

/**
 * Declarative constraint. Read as: "WHEN all of `when` are selected,
 * THEN `then` must (requires) / must not (excludes) be selected."
 *
 * Why declarative data instead of if-statements in code:
 *   - a new constraint is a new row, not a deploy
 *   - the same rules run client-side (instant UI feedback) and server-side
 *     (authoritative validation) from one definition
 *   - rules are inspectable: you can render "why is this greyed out?"
 */
export interface Rule {
  id: string;
  type: "requires" | "excludes" | "includes";
  /** Trigger: rule applies when ALL of these options are selected. */
  when: OptionId[];
  /** Target options the rule acts on. */
  then: OptionId[];
  /** Shown to the user when the rule blocks something. Write it human-readable. */
  message: string;
}

/**
 * Pricing is a *pipeline of rules*, not a sum. This is what makes the
 * "a used-car mileage modifier would slot in without an architectural
 * change" claim in the brief actually true.
 */
export type PriceRule =
  | { kind: "base"; modelId: ModelId; amountCents: number }
  | { kind: "option"; optionId: OptionId; amountCents: number }
  | {
      kind: "bundleDiscount";
      requires: OptionId[];
      amountCents: number;
      label: string;
    }
  | { kind: "fee"; label: string; amountCents: number };

export interface Catalog {
  models: CarModel[];
  groups: OptionGroup[];
  options: Option[];
  rules: Rule[];
  priceRules: PriceRule[];
}

/* ------------------------------------------------------------------ */
/* Build — what the user is making, and what crosses the network       */
/* ------------------------------------------------------------------ */

/**
 * IDs only. This is the entire payload sent to the API, and exactly what a
 * build code resolves back to. Note there is no price field — price is
 * derived, never stored on the client.
 */
export interface BuildSelection {
  modelId: ModelId;
  /** groupId -> selected option id(s). Arrays keep single/multi groups uniform. */
  options: Record<GroupId, OptionId[]>;
}

/* ------------------------------------------------------------------ */
/* Engine outputs — computed, never stored                             */
/* ------------------------------------------------------------------ */

export interface RuleViolation {
  ruleId: string;
  message: string;
  /** Options involved, so the UI can highlight them. */
  optionIds: OptionId[];
}

export interface ValidationResult {
  valid: boolean;
  violations: RuleViolation[];
  /** Options the UI should disable given the current selection. */
  disabledOptionIds: OptionId[];
}

export interface PriceLineItem {
  label: string;
  amountCents: number;
}

export interface PriceBreakdown {
  lineItems: PriceLineItem[];
  totalCents: number;
  /** Set by the server only. The client's own calc leaves this false. */
  authoritative: boolean;
}
