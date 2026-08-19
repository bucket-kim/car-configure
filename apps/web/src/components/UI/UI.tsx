import type { Catalog, GroupId } from "@car-config/core";
import { formatCents } from "@car-config/core";
import { useState, type FC } from "react";
import { useConfiguration } from "../../hooks/useConfiguration";
import { useGlobalState } from "../../state/useGlobalState";
import { UIStyleContainer } from "./UIStyleContainer";

interface UIProps {
  catalog: Catalog;
}

const UI: FC<UIProps> = ({ catalog }) => {
  const { groups, price, optionsByGroup, disabled, selected } = useConfiguration(catalog);

  const { selectOption, reset } = useGlobalState((state) => {
    return {
      selectOption: state.selectOption,
      reset: state.reset,
    };
  });

  const [openGroup, setOpenGroup] = useState(new Set<GroupId>());

  const toggleOption = (key: GroupId) => {
    setOpenGroup((prev) => (prev.has(key) ? new Set() : new Set([key])));
  };

  return (
    <UIStyleContainer>
      <h1>Config Panel</h1>
      <div>
        {groups.map((g) => {
          const isOpen = openGroup.has(g.id);
          return (
            <div key={g.id}>
              <button onClick={() => toggleOption(g.id)} aria-expanded={isOpen}>
                {g.label}
              </button>
              {isOpen &&
                optionsByGroup[g.id].map((option) => {
                  const isDisabled = disabled.has(option.id);
                  return (
                    <div key={option.id}>
                      <button
                        disabled={isDisabled}
                        aria-pressed={selected.has(option.id)}
                        onClick={() => selectOption(catalog, option.id)}
                      >
                        {option.label}
                      </button>
                      <p>- {formatCents(option.priceCents)}</p>
                    </div>
                  );
                })}
            </div>
          );
        })}
        <p>{formatCents(price.totalCents)}</p>
        <button onClick={() => reset(catalog)}>Reset</button>
      </div>
    </UIStyleContainer>
  );
};

export default UI;
