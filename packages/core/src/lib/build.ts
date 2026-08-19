import type {
  BuildSelection,
  Catalog,
  GroupId,
  ModelId,
  OptionId,
} from "../types/config";

export const initialBuildFor = (catalog: Catalog, modelId: ModelId): BuildSelection => {
  const options: Record<GroupId, OptionId[]> = {};
  for (const group of catalog.groups) {
    const first = catalog.options.find(
      (o) => o.groupId === group.id && o.availableOn.includes(modelId),
    );
    options[group.id] = group.required && first ? [first.id] : [];
  }

  return { modelId, options };
};
