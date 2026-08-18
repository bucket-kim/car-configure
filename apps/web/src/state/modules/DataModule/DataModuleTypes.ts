import type {
  BuildSelection,
  Catalog,
  ModelId,
  OptionId,
} from "@car-config/core";

export interface DataModuleTypes {
  build: BuildSelection | null;
  selectOption: (catalog: Catalog, optionId: OptionId) => void;
  setModel: (catalog: Catalog, modelId: ModelId) => void;
  reset: (catalog: Catalog) => void;
}
