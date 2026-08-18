import { immer } from "zustand/middleware/immer";
import type {
  GetState,
  GlobalStateApiType,
  GlobalStateTypes,
  SetState,
} from "./GlobalStateTypes";
import { UIModule } from "./modules/UIModule/UIModule";
import { create, useStore } from "zustand";
import { useShallow } from "zustand/shallow";
import { DataModule } from "./modules/DataModule/DataModule";

export const modules: ((
  args: GlobalStateApiType,
) => Partial<GlobalStateTypes>)[] = [UIModule, DataModule];

const createInitialStore = (
  set: SetState<GlobalStateTypes>,
  get: GetState<GlobalStateTypes>,
) =>
  modules.reduce((acc: GlobalStateTypes, module) => {
    return { ...acc, ...module({ set, get }) };
  }, {} as GlobalStateTypes);

const storeModules = (
  set: SetState<GlobalStateTypes>,
  get: GetState<GlobalStateTypes>,
) => {
  const initialState = createInitialStore(set, get);

  return {
    ...initialState,
    resetState: () => set(() => initialState),
  };
};

const immerWrapper = immer<GlobalStateTypes>((set, get) => {
  return storeModules(set, get);
});

export const useImmer = create(immerWrapper);

export const getGlobalState = () => useImmer.getState();

export const useGlobalState = <T>(selector: (state: GlobalStateTypes) => T) =>
  useStore(useImmer, useShallow(selector));
