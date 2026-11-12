import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const dealerStatusRoute = read("src/app/api/dealer-status/route.ts");
const hotItemsRoute = read("src/app/api/hot-items/route.ts");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260809200000_hot_items_postgres/migration.sql");

test("dealer-status route is PostgreSQL-only and session-authorized", () => {
  assert.match(dealerStatusRoute, /requireAuth\(\)/);
  assert.match(dealerStatusRoute, /prisma\.dealerProfile/);
  assert.match(dealerStatusRoute, /user:\s*\{\s*select:\s*\{\s*status/);
  assert.match(dealerStatusRoute, /prisma\.dealerStaffAssignment/);
  assert.match(dealerStatusRoute, /actor\.role !== "ADMIN"/);
  assert.doesNotMatch(dealerStatusRoute, /@\/lib\/mongodb|getDb|getMongoClient|collection\("dealer_statuses"\)|php-compat|actorFromRequestHeaders|x-dealersoftware-actor/i);
});

test("dealer-status preserves response aliases and mutation shape", () => {
  assert.match(dealerStatusRoute, /dealerId:\s*row\.id\.toString\(\)/);
  assert.match(dealerStatusRoute, /status:\s*userStatusToDealerStatus/);
  assert.match(dealerStatusRoute, /updatedAt:\s*row\.user\.updatedAt\.toISOString\(\)/);
  assert.match(dealerStatusRoute, /dealerIds\.length > 0 \? data : data\[0\]/);
  assert.match(dealerStatusRoute, /DEALER_STATUS_COMPAT_CHANGED/);
});

test("hot-items route is manually curated in PostgreSQL", () => {
  assert.match(hotItemsRoute, /export async function PUT/);
  assert.match(hotItemsRoute, /requireAuth\(\)/);
  assert.match(hotItemsRoute, /actor\.role !== "ADMIN"/);
  assert.match(hotItemsRoute, /prisma\.hotItem\.findMany/);
  assert.match(hotItemsRoute, /tx\.hotItem\.deleteMany/);
  assert.match(hotItemsRoute, /tx\.hotItem\.createMany/);
  assert.doesNotMatch(hotItemsRoute, /@\/lib\/mongodb|getDb|getMongoClient|homepage_content|collection\(|php-compat|actorFromRequestHeaders|x-dealersoftware-actor/i);
});

test("hot-items handles inactive products and preserves API aliases", () => {
  assert.match(hotItemsRoute, /product:\s*\{ active:\s*true \}/);
  assert.match(hotItemsRoute, /variant:\s*\{ active:\s*true \}/);
  assert.match(hotItemsRoute, /Active PostgreSQL product not found/);
  for (const alias of ["SKU", "name", "specs", "image", "badge", "active", "isDefault"]) {
    assert.match(hotItemsRoute, new RegExp(alias));
  }
});

test("HotItem schema and migration keep curated ordering and provenance", () => {
  assert.match(schema, /model HotItem/);
  for (const field of ["productId", "variantId", "position", "isActive", "createdByUserId", "createdAt", "updatedAt"]) {
    assert.match(schema, new RegExp(field));
  }
  assert.match(schema, /@@map\("hot_items"\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS hot_items/);
  assert.match(migration, /product_id BIGINT NOT NULL REFERENCES products\(id\)/);
  assert.match(migration, /variant_id BIGINT REFERENCES product_variants\(id\)/);
  assert.match(migration, /created_by_user_id BIGINT NOT NULL REFERENCES users\(id\)/);
});
