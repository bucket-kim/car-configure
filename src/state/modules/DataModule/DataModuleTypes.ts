import type { BuildSelection, ModelId, OptionId } from "../../../types/config";

export interface DataModuleTypes {
  build: BuildSelection;
  setModel: (modelId: ModelId) => void;
  selectOption: (optionId: OptionId) => void;
  reset: () => void;
}
