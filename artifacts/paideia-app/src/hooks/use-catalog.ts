import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { RegionInfo } from "@/lib/types";

let cache: RegionInfo[] | null = null;
let inflight: Promise<RegionInfo[]> | null = null;

export function useCatalog() {
  const [regions, setRegions] = useState<RegionInfo[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    if (cache) return;
    if (!inflight) {
      inflight = api
        .get<{ regions: RegionInfo[] }>("/catalog")
        .then((r) => {
          cache = r.regions;
          return r.regions;
        })
        .finally(() => {
          inflight = null;
        });
    }
    inflight.then((r) => {
      setRegions(r);
      setLoading(false);
    });
  }, []);

  return { regions, loading };
}

export function regionOrFallback(regions: RegionInfo[], id: string): RegionInfo | undefined {
  return regions.find((r) => r.id === id);
}
