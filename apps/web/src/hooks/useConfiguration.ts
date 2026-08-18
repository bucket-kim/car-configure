import { useMemo } from "react";
import type {
  Catalog,
  Option,
  OptionGroup,
  OptionId,
  PriceBreakdown,
  ValidationResult,
} from "@car-config/core";
import {
  computeDisabledOptions,
  initialBuildFor,
  validateBuild,
} from "@car-config/core";
import { computePrice } from "@car-config/core";
import { useGlobalState } from "../state/useGlobalState";
/**
 * The single place derived configuration state is computed.
 *
 * Why a hook rather than fields in the Zustand store: price, validity and
 * disabled options are all pure functions of `build`. Storing them would mean
 * every action has to remember to recompute all three, and the day one of them
 * is forgotten the UI shows a price that doesn't match the car. Deriving them
 * at render makes that class of bug impossible.
 *
 * Why one hook rather than three: the three derivations share inputs and are
 * always needed together. One memo keyed on `build` recomputes them as a set,
 * so they can never disagree with each other.
 */
export interface ConfigurationView {
  catalog: Catalog;
  groups: OptionGroup[];
  optionsByGroup: Record<string, Option[]>;
  selected: Set<OptionId>;
  disabled: Set<OptionId>;
  /** ruleId -> message, for explaining WHY something is unavailable. */
  reasons: Map<OptionId, string>;
  validation: ValidationResult;
  price: PriceBreakdown;
}

export function useConfiguration(catalog: Catalog): ConfigurationView {
  // Subscribe narrowly. Pulling the whole store here would re-render the
  // configurator on unrelated UI state changes.

  const storeBuild = useGlobalState((s) => s.build);

  const { selectOption, reset } = useGlobalState((s) => {
    return {
      selectOption: s.selectOption,
      reset: s.reset,
    };
  });

  const build = useMemo(
    () => storeBuild ?? initialBuildFor(catalog, catalog.models[0].id),
    [storeBuild, catalog],
  );

  return useMemo(() => {
    const groups = [...catalog.groups].sort((a, b) => a.order - b.order);

    const optionsByGroup: Record<string, Option[]> = {};
    for (const group of groups) {
      optionsByGroup[group.id] = catalog.options.filter(
        (o) => o.groupId === group.id && o.availableOn.includes(build.modelId),
      );
    }

    const selected = new Set(Object.values(build.options).flat());
    const disabled = new Set(computeDisabledOptions(catalog, build));
    const validation = validateBuild(catalog, build);
    const price = computePrice(catalog, build);

    // Map each disabled option to the rule message that explains it, so the UI
    // can say "not available with the sliding sunroof" instead of silently
    // greying a button out. Most real configurators fail at this.
    const reasons = new Map<OptionId, string>();
    for (const optionId of disabled) {
      const rule = catalog.rules.find(
        (r) => r.when.includes(optionId) || r.then.includes(optionId),
      );
      if (rule) reasons.set(optionId, rule.message);
    }

    return {
      catalog,
      groups,
      optionsByGroup,
      selected,
      disabled,
      reasons,
      validation,
      price,
      selectOption,
      reset,
    };
  }, [build, selectOption, reset, catalog]);
}
