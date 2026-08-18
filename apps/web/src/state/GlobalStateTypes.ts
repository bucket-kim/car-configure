import type { Draft } from "immer";
import type { UIModuleTypes } from "./modules/UIModule/UIModuleTypes";
import type { DataModuleTypes } from "./modules/DataModule/DataModuleTypes";

export interface GlobalStateTypes extends UIModuleTypes, DataModuleTypes {}

export interface SetState<T> {
  (partial: Partial<T> | ((state: Draft<T>) => void), replace?: false): void;
  (partial: T | ((state: Draft<T>) => void), replace: true): void;
}

export type GetState<T> = () => T;

export interface GlobalStateApiType {
  set: SetState<GlobalStateTypes>;
  get: GetState<GlobalStateTypes>;
}
