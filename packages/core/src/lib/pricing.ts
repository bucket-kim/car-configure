// src/lib/pricing.ts
//
// Same constraints as rules.ts: no React, no Zustand, no Three.js, no AWS SDK.
// This exact file runs unchanged inside a Lambda in Phase 4 — that is the
// whole point of keeping it pure.
//
// Run `yarn test` and make pricing.test.ts pass.

import type {
  BuildSelection,
  Catalog,
  PriceBreakdown,
  PriceLineItem,
} from "../types/config";
import { selectedOptionIds } from "./rules";

/* ------------------------------------------------------------------ */
/* The pipeline                                                        */
/* ------------------------------------------------------------------ */
//
// Price is not a sum — it is an ordered pipeline of stages. Order matters
// because later stages can depend on earlier ones (a percentage-based tax
// stage would need the subtotal above it).
//
//   1. base            — the model's starting price
//   2. options         — every selected option's priceCents
//   3. bundleDiscounts — negative line items when a required set is all present
//   4. fees            — destination, processing, etc.
//
// Adding a stage later (regional tax, a used-car mileage modifier, a
// promotional code) means inserting a step here — not restructuring
// anything. That is what "composable rule pipeline" means in the brief,
// and it is why that claim is honest rather than hand-waving.

/**
 * Compute the full price breakdown for a build.
 *
 * Return line items in pipeline order: base first, fees last. The UI renders
 * this array directly, so the order IS the receipt the user sees.
 *
 * Notes:
 *  - Every amount is integer cents. No floats anywhere, ever.
 *  - Include zero-cost selected options as line items (a $0 "White" line is
 *    informative on a receipt — it tells the user the choice was free rather
 *    than leaving them wondering whether it was counted).
 *  - Discounts are NEGATIVE amounts, so the total is always a plain sum of
 *    every line item. Resist the urge to special-case discounts; if the sign
 *    lives in the data, the arithmetic stays trivial.
 *  - Set `authoritative: false`. Only the Lambda gets to set it true.
 *    This field is not decoration — it is how the UI knows whether it is
 *    displaying an estimate or a real quote.
 */
export function computePrice(catalog: Catalog, build: BuildSelection): PriceBreakdown {
  // TODO: implement
  const lineItems: PriceLineItem[] = [];

  const model = catalog.models.find((m) => m.id === build.modelId);

  if (!model) throw new Error(`Unknown model: ${build.modelId}`);

  lineItems.push({ label: model.name, amountCents: model.basePriceCents });

  const selected = selectedOptionIds(build);

  for (const option of catalog.options) {
    if (!selected.has(option.id)) continue;
    lineItems.push({ label: option.label, amountCents: option.priceCents });
  }

  for (const rule of catalog.priceRules) {
    if (rule.kind !== "bundleDiscount") continue;
    if (!rule.requires.every((id) => selected.has(id))) continue;
    lineItems.push({ label: rule.label, amountCents: rule.amountCents });
  }

  for (const rule of catalog.priceRules) {
    if (rule.kind !== "fee") continue;
    lineItems.push({ label: rule.label, amountCents: rule.amountCents });
  }

  const totalCents = lineItems.reduce((sum, l) => sum + l.amountCents, 0);
  return { lineItems, totalCents, authoritative: false };
  throw new Error("not implemented");
}

/**
 * Format integer cents for display: 13710000 -> "$137,100"
 *
 * Keep formatting OUT of computePrice. The Lambda returns numbers; only the
 * UI turns them into strings. Mixing the two is how you end up unable to
 * change currency or locale later.
 *
 * Use Intl.NumberFormat rather than hand-rolling commas.
 */
export function formatCents(cents: number, locale = "en-US", currency = "USD"): string {
  // TODO: implement
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
  throw new Error("not implemented");
}

/* ------------------------------------------------------------------ */
/* Design question to answer before you write it                       */
/* ------------------------------------------------------------------ */
//
// Should computePrice refuse to price an INVALID build?
//
// Arguments for pricing it anyway: the user is mid-configuration almost all
// of the time, and a price that vanishes whenever the build is temporarily
// invalid is a terrible experience.
//
// Arguments for refusing: quoting a price for a car that cannot be built is
// arguably worse than showing nothing, especially once a build becomes a
// lead a salesperson acts on.
//
// Real configurators show a running price continuously and gate the SUBMIT
// action on validity. Consider doing the same — price freely, but let the
// UI refuse to save or share an invalid build.
//
// Whatever you choose: write it in the decisions log in PROJECT_BRIEF.md.
