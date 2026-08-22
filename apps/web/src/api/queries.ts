import type { BuildSelection, Catalog, PriceResponse } from "@car-config/core";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchJSON } from "./client";

export function useCatalogQuery() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: () => fetchJSON<Catalog>("/catalog"),
    staleTime: 5 * 60 * 1000,
  });
}

export function usePriceQuery(build: BuildSelection) {
  return useQuery({
    queryKey: ["price", build],
    queryFn: () =>
      fetchJSON<PriceResponse>("/price", {
        method: "POST",
        body: JSON.stringify(build),
      }),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
}
