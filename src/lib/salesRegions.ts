// Regions live in the sales_regions table (Manage Regions). Server code loads
// them with listSalesRegions; admin pages with useSalesRegions.
export type SalesRegionOption = { value: string; label: string };

export function formatSalesRegionLabel(value?: string | null, regions: readonly SalesRegionOption[] = []) {
  if (!value) return "";
  const option = regions.find((entry) => entry.value === value);
  return option?.label ?? value.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

/** The stored code for a new region's name: "North 3" -> "NORTH_3". */
export function salesRegionCode(label: string) {
  return label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/** A region by its code or its name ("NORTH_1", "north 1", "North 1"). */
export function findSalesRegion(regions: readonly SalesRegionOption[], input: string) {
  const code = salesRegionCode(input);
  return regions.find((region) => region.value === code);
}
