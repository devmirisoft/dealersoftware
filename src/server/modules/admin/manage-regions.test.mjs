import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync("src/components/layout/sidebar.tsx", "utf8");
const page = readFileSync("src/app/dashboard/admin/manage-regions/page.tsx", "utf8");
const route = readFileSync("src/app/api/admin/sales-regions/route.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20261113120000_dynamic_sales_regions/migration.sql", "utf8");
const staffAdd = readFileSync("src/app/dashboard/admin/staff/addstaff/page.tsx", "utf8");
const staffEdit = readFileSync("src/app/dashboard/admin/staff/[id]/page.tsx", "utf8");

test("admin sidebar exposes Manage Regions", () => {
  assert.match(sidebar, /label: "Manage Regions"/);
  assert.match(sidebar, /href: "\/dashboard\/admin\/manage-regions"/);
});

test("regions are a table, seeded with the nine original codes", () => {
  assert.match(schema, /model SalesRegion \{[\s\S]*code\s+String @id[\s\S]*label\s+String @unique/);
  assert.doesNotMatch(schema, /enum SalesRegion/);
  for (const code of ["NORTH_1", "NORTH_2", "SOUTH_1", "SOUTH_2", "WEST_1", "WEST_2", "EAST", "ROM", "CENTRAL"]) {
    assert.match(migration, new RegExp(`'${code}'`));
  }
  assert.match(migration, /DROP TYPE "SalesRegion"/);
});

test("admins create and delete regions; a region in use cannot be deleted", () => {
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /export async function (POST|DELETE)[\s\S]*requireAdminOnly\(\)/);
  assert.match(route, /staffProfile\.count[\s\S]*dealerProfile\.count[\s\S]*dealerRequest\.count[\s\S]*REGION_IN_USE[\s\S]*salesRegion\.delete/);
  assert.match(page, /"POST"/);
  assert.match(page, /"DELETE"/);
});

test("region pickers load the list instead of hardcoding it", () => {
  assert.match(staffAdd, /useSalesRegions\(\)/);
  assert.match(staffEdit, /useSalesRegions\(\)/);
  assert.doesNotMatch(page, /SALES_REGION_OPTIONS/);
});
