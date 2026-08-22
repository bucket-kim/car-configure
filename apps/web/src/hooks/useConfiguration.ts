import type {
  BuildSelection,
  Catalog,
  Option,
  OptionGroup,
  OptionId,
  PriceBreakdown,
  ValidationResult,
} from "@car-config/core";
import {
  computeDisabledOptions,
  computePrice,
  initialBuildFor,
  validateBuild,
} from "@car-config/core";
import { useMemo } from "react";
import { usePriceQuery } from "../api/queries";
import { useGlobalState } from "../state/useGlobalState";

export interface ConfigurationView {
  catalog: Catalog;
  build: BuildSelection;
  groups: OptionGroup[];
  optionsByGroup: Record<string, Option[]>;
  selected: Set<OptionId>;
  disabled: Set<OptionId>;
  /** ruleId -> message, for explaining WHY something is unavailable. */
  reasons: Map<OptionId, string>;
  validation: ValidationResult;
  estimate: PriceBreakdown;
  /** Computed by Lambda from the same functions. Undefined until it lands. */
  servicePrice: PriceBreakdown | undefined;
  isPricePending: boolean;
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

  const { data: priceData, isPending: isPricePending } = usePriceQuery(build);

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
    const estimate = computePrice(catalog, build);

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
      build,
      catalog,
      groups,
      optionsByGroup,
      selected,
      disabled,
      reasons,
      validation,
      estimate,
      servicePrice: priceData?.price,
      isPricePending,
      selectOption,
      reset,
    };
  }, [build, selectOption, reset, catalog, priceData, isPricePending]);
}
