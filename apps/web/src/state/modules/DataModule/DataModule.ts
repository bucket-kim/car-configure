import type { BuildSelection, Catalog, ModelId, OptionId } from "@car-config/core";
import { applySelection, initialBuildFor } from "@car-config/core";
import type { GlobalStateApiType } from "../../GlobalStateTypes";

// const catalog = catalogJson as unknown as Catalog;

export const DataModule = ({ set }: GlobalStateApiType) => {
  return {
    build: null as BuildSelection | null,
    setModel: (catalog: Catalog, modelId: ModelId) => {
      set((state) => {
        state.build = initialBuildFor(catalog, modelId);
      });
    },
    selectOption: (catalog: Catalog, optionId: OptionId) => {
      set((state) => {
        if (!state.build) return;
        state.build = applySelection(catalog, state.build, optionId);
      });
    },
    reset: (catalog: Catalog) =>
      set((state) => {
        if (!state.build) return;
        state.build = initialBuildFor(catalog, state.build.modelId);
      }),
  };
};
