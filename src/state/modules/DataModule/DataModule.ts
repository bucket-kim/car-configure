import type {
  BuildSelection,
  Catalog,
  GroupId,
  ModelId,
  OptionId,
} from "../../../types/config";
import type { GlobalStateApiType } from "../../GlobalStateTypes";
import catalogJson from "../../../data/catalog.json";
import { applySelection } from "../../../lib/rules";

const catalog = catalogJson as unknown as Catalog;

const initialBuildFor = (modelId: ModelId): BuildSelection => {
  const options: Record<GroupId, OptionId[]> = {};
  for (const group of catalog.groups) {
    const first = catalog.options.find(
      (o) => o.groupId === group.id && o.availableOn.includes(modelId),
    );
    options[group.id] = group.required && first ? [first.id] : [];
  }

  return { modelId, options };
};

export const DataModule = ({ set }: GlobalStateApiType) => {
  return {
    build: initialBuildFor("911-c4s"),
    setModel: (modelId: ModelId) => {
      set((state) => {
        state.build = initialBuildFor(modelId);
      });
    },
    selectOption: (optionId: OptionId) => {
      set((state) => {
        state.build = applySelection(catalog, state.build, optionId);
      });
    },
    reset: () =>
      set((state) => {
        state.build = initialBuildFor(state.build.modelId);
      }),
  };
};
