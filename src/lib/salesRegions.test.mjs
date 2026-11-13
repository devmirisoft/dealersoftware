import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("src") } });
const { salesRegionCode, findSalesRegion, formatSalesRegionLabel } = await jiti.import(path.resolve("src/lib/salesRegions.ts"));

const regions = [
  { value: "NORTH_1", label: "North 1" },
  { value: "ROM", label: "ROM" },
];

test("a region name becomes an upper snake-case code", () => {
  assert.equal(salesRegionCode("North 3"), "NORTH_3");
  assert.equal(salesRegionCode("  NCR - Delhi "), "NCR_DELHI");
  assert.equal(salesRegionCode("Zone-1/A"), "ZONE_1_A");
});

test("a name with no Latin letter or digit has no code, so the API rejects it", () => {
  assert.equal(salesRegionCode("!!"), "");
  assert.equal(salesRegionCode("उत्तर"), "");
  assert.equal(salesRegionCode(""), "");
});

test("a region is found by its code or its name, in any case", () => {
  assert.equal(findSalesRegion(regions, "NORTH_1")?.value, "NORTH_1");
  assert.equal(findSalesRegion(regions, "north 1")?.value, "NORTH_1");
  assert.equal(findSalesRegion(regions, "north_1")?.value, "NORTH_1");
  assert.equal(findSalesRegion(regions, "rom")?.value, "ROM");
  assert.equal(findSalesRegion(regions, "South 9"), undefined);
});

test("labels come from the region list, else a title-cased code", () => {
  assert.equal(formatSalesRegionLabel("ROM", regions), "ROM");
  assert.equal(formatSalesRegionLabel("NORTH_1", regions), "North 1");
  assert.equal(formatSalesRegionLabel("NEW_ZONE"), "New Zone");
  assert.equal(formatSalesRegionLabel(""), "");
  assert.equal(formatSalesRegionLabel(null), "");
  assert.equal(formatSalesRegionLabel(undefined), "");
});
