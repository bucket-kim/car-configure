// src/lib/rules.ts
//
// YOUR IMPLEMENTATION GOES HERE.
//
// Constraints on this file — they are not style preferences, they are what
// lets the identical code run inside a Lambda in Phase 4:
//   - no React, no Zustand, no Three.js, no AWS SDK imports
//   - no reading from a global store — everything arrives as arguments
//   - no side effects: same inputs always produce the same outputs
//
// Run `yarn vitest` and make rules.test.ts pass.

import type {
  BuildSelection,
  Catalog,
  OptionId,
  ValidationResult,
} from "../types/config.ts";

/* ------------------------------------------------------------------ */
/* Helper                                                              */
/* ------------------------------------------------------------------ */

/**
 * Flatten a BuildSelection's grouped options into a flat Set of option ids.
 *
 * Why a Set: rule evaluation asks "is this option selected?" constantly.
 * Array.includes is O(n) per lookup; Set.has is O(1). With ~5 rules and ~20
 * options that difference is irrelevant — but a real OEM catalog has
 * thousands of options and tens of thousands of rules, and this is the
 * kind of choice that decides whether the engine runs in 2ms or 2s.
 * Say that out loud in an interview.
 */
export function selectedOptionIds(build: BuildSelection): Set<OptionId> {
  // TODO: implement
  return new Set(Object.values(build.options).flat());
  // throw new Error("not implemented");
}

/* ------------------------------------------------------------------ */
/* Rule semantics — read carefully before implementing                 */
/* ------------------------------------------------------------------ */
//
// A rule FIRES when every option in `when` is currently selected.
// A rule that has not fired is irrelevant and produces nothing.
//
// When fired:
//   "requires" → AT LEAST ONE option in `then` must also be selected.
//                If none is, that's a violation.
//                (e.g. PCCB requires Exclusive OR RS Spyder wheels)
//
//   "excludes" → NONE of the options in `then` may be selected.
//                Any that is, is a violation.
//                (e.g. sunroof excludes carbon roof)
//
//   "includes" → reserved for later. Ignore it for now, but don't crash on it.

/* ------------------------------------------------------------------ */
/* 1. Validation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Check a build against every rule in the catalog.
 *
 * Also enforce the group-level constraints, which are NOT in `rules`:
 *   - a group with required=true must have at least one option selected
 *   - a group with selection="single" must not have more than one
 *
 * Leave `disabledOptionIds` as an empty array here — that's the next function.
 */
export function validateBuild(catalog: Catalog, build: BuildSelection): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    violations: [],
    disabledOptionIds: [],
  };

  const selected = selectedOptionIds(build);

  // --- Group-level constraints (not expressed as rules) ---------------
  for (const group of catalog.groups) {
    const chosen = build.options[group.id] ?? [];
    if (group.required && chosen.length === 0) {
      result.violations.push({
        ruleId: `group-required:${group.id}`,
        message: `${group.label} is required.`,
        optionIds: [],
      });
    }
    if (group.selection === "single" && chosen.length > 1) {
      result.violations.push({
        ruleId: `group-single:${group.id}`,
        message: `${group.label} allows only one selection.`,
        optionIds: chosen,
      });
    }
  }

  // --- Declarative rules ----------------------------------------------
  for (const rule of catalog.rules) {
    // A rule fires only when ALL of `when` are currently selected.
    const fired = rule.when.every((id) => selected.has(id));
    if (!fired) continue;

    if (rule.type === "requires") {
      // At least one option in `then` must also be selected.
      const satisfied = rule.then.some((id) => selected.has(id));
      if (!satisfied) {
        result.violations.push({
          ruleId: rule.id,
          message: rule.message,
          optionIds: [...rule.when, ...rule.then],
        });
      }
    } else if (rule.type === "excludes") {
      // None of the options in `then` may be selected.
      const conflicting = rule.then.filter((id) => selected.has(id));
      if (conflicting.length > 0) {
        result.violations.push({
          ruleId: rule.id,
          message: rule.message,
          optionIds: [...rule.when, ...conflicting],
        });
      }
    }
    // "includes" is reserved — ignore for now.
  }

  result.valid = result.violations.length === 0;
  return result;
}

/* ------------------------------------------------------------------ */
/* 2. Forward-looking availability — the part that makes the UI good   */
/* ------------------------------------------------------------------ */

/**
 * Given the CURRENT build, which options should the UI disable?
 *
 * An option is disabled if selecting it would create a violation.
 *
 * The naive implementation — and the one I want you to write first — is:
 * for each option not yet selected, hypothetically add it to the build,
 * run validateBuild, and if the result is worse than it is now, disable it.
 *
 * Two things to think about while you write it:
 *
 *  (a) "Worse than it is now" is doing real work in that sentence. A build
 *      mid-configuration is often already invalid (nothing selected yet in a
 *      required group). So you cannot test `valid === false` — you have to
 *      compare violation sets, or only consider violations that the new
 *      option participates in. Decide which, and be able to defend it.
 *
 *  (b) This is O(options x rules) on every keystroke. Fine at this size.
 *      Note in a comment what you'd do if the catalog were 100x bigger —
 *      that comment is interview material.
 *
 * Return option ids only; the UI decides how to present them. And because
 * every violation carries a `message`, the UI can explain WHY an option is
 * unavailable instead of silently greying it out. Most real configurators
 * fail at this. Yours shouldn't.
 */
export function computeDisabledOptions(
  catalog: Catalog,
  build: BuildSelection,
): OptionId[] {
  // TODO: implement
  const selected = selectedOptionIds(build);
  const current = validateBuild(catalog, build);
  const currentRuleIds = new Set(current.violations.map((v) => v.ruleId));
  const disabled: OptionId[] = [];

  for (const option of catalog.options) {
    if (selected.has(option.id)) continue;
    if (!option.availableOn.includes(build.modelId)) continue;

    const candidate = applySelection(catalog, build, option.id);
    const after = validateBuild(catalog, candidate);

    const introducesNew = after.violations.some((v) => !currentRuleIds.has(v.ruleId));
    if (introducesNew) disabled.push(option.id);
  }

  return disabled;
  throw new Error("not implemented");
}

/* ------------------------------------------------------------------ */
/* 3. Selection resolution — what happens on a click                   */
/* ------------------------------------------------------------------ */

/**
 * Apply a user's click to a build and return the NEW build.
 *
 * Pure: do not mutate `build`, return a new object. (Zustand relies on
 * reference changes to know when to re-render.)
 *
 * Behaviour:
 *   - group is "single"   → replace whatever was selected in that group
 *   - group is "multiple" → toggle the option in/out of that group
 *
 * Design question you must answer, and it's the interesting one:
 * if the new selection breaks a rule, do you
 *   (A) refuse the click,
 *   (B) accept it and let validateBuild report the violation, or
 *   (C) accept it and auto-deselect whatever now conflicts?
 *
 * Real configurators do (C) for some cases and (A) for others. Pick one,
 * implement it, and write your reasoning in the decisions log in
 * PROJECT_BRIEF.md. There is no single right answer — but there IS a wrong
 * answer, which is not having thought about it.
 */
export function applySelection(
  catalog: Catalog,
  build: BuildSelection,
  optionId: OptionId,
): BuildSelection {
  const option = catalog.options.find((o) => o.id === optionId);
  if (!option) return build;

  const group = catalog.groups.find((g) => g.id === option.groupId);
  if (!group) return build;

  const currentInGroup = build.options[group.id] ?? [];

  const nextGroup =
    group.selection === "single"
      ? [option.id]
      : currentInGroup.includes(optionId)
        ? currentInGroup.filter((id) => id !== optionId)
        : [...currentInGroup, optionId];

  return { ...build, options: { ...build.options, [group.id]: nextGroup } };
  // TODO: implement
  throw new Error("not implemented");
}
