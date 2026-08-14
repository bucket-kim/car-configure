import type { GlobalStateApiType } from "../../GlobalStateTypes";

export const UIModule = ({ set }: GlobalStateApiType) => {
  return {
    uiState: "idle",
    setUIState: (state: string) => {
      set({ uiState: state });
    },
  };
};
