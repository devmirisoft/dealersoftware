"use client";

import { useEffect, useState } from "react";
import type { SalesRegionOption } from "@/lib/salesRegions";

// The admin-managed region list (Manage Regions), for admin/NSM pages.
export function useSalesRegions() {
  const [regions, setRegions] = useState<SalesRegionOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/sales-regions", { credentials: "include" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled || !Array.isArray(json?.data)) return;
        setRegions(json.data.map((row: SalesRegionOption) => ({ value: row.value, label: row.label })));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return regions;
}
