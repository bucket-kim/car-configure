import type { Catalog } from "@car-config/core";
import { useQuery } from "@tanstack/react-query";
import { fetchJSON } from "./client";

export function useCatalogQuery() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: () => fetchJSON<Catalog>("/catalog"),
    staleTime: 5 * 60 * 1000,
  });
}

// export function usePriceQuery() {
//   return useQuery({
//     queryKey: ["catalog"],
//     queryFn: () => fetchJSON<Catalog>("/price", {
//         method: "POST",
//         body: JSON.stringify(build)
//     }),
//     staleTime: 5 * 60 * 1000,
//   });
// }
