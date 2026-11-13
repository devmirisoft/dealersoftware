import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("src") } });
const { listSalesRegions, assertSalesRegion, getRegionStates, saveRegionStates } = await jiti.import(path.resolve("src/server/sales-region-states.ts"));
const { AdminRouteError } = await jiti.import(path.resolve("src/server/admin/admin-route-error.ts"));

const KEY = "sales_region_states";

// In-memory stand-in for the three tables sales-region-states.ts reads and writes.
function createDb({ regions = [], setting, rsms = [] } = {}) {
  const calls = [];
  const settings = new Map(setting === undefined ? [] : [[KEY, structuredClone(setting)]]);
  const db = {
    calls,
    settings,
    salesRegion: {
      async findMany(args) {
        calls.push(["salesRegion.findMany", args]);
        return regions.map((row) => ({ ...row }));
      },
      async findUnique({ where }) {
        calls.push(["salesRegion.findUnique", where]);
        return regions.find((row) => row.code === where.code) ?? null;
      },
    },
    appSetting: {
      async findUnique({ where }) {
        return settings.has(where.key) ? { key: where.key, value: structuredClone(settings.get(where.key)) } : null;
      },
      async upsert({ where, create, update }) {
        calls.push(["appSetting.upsert", settings.has(where.key) ? "update" : "create"]);
        settings.set(where.key, structuredClone(settings.has(where.key) ? update.value : create.value));
      },
    },
    staffProfile: {
      async findMany() {
        return rsms.map((row) => ({ ...row }));
      },
    },
  };
  return db;
}

test("listSalesRegions maps rows to options, ordered by name", async () => {
  const db = createDb({ regions: [{ code: "EAST", label: "East" }, { code: "NORTH_1", label: "North 1" }] });
  assert.deepEqual(await listSalesRegions(db), [{ value: "EAST", label: "East" }, { value: "NORTH_1", label: "North 1" }]);
  assert.deepEqual(db.calls[0], ["salesRegion.findMany", { orderBy: { label: "asc" } }]);
});

test("assertSalesRegion skips an empty region without a query", async () => {
  const db = createDb();
  db.salesRegion.findUnique = async () => { throw new Error("must not query"); };
  for (const empty of [undefined, null, ""]) await assertSalesRegion(db, empty);
});

test("assertSalesRegion passes a known region and rejects an unknown one", async () => {
  const db = createDb({ regions: [{ code: "EAST", label: "East" }] });
  await assertSalesRegion(db, "EAST");
  await assert.rejects(assertSalesRegion(db, "NO_SUCH"), (error) => {
    assert.ok(error instanceof AdminRouteError);
    assert.equal(error.code, "INVALID_REQUEST");
    assert.equal(error.details?.code, "REGION_UNKNOWN");
    assert.equal(error.details?.region, "NO_SUCH");
    return true;
  });
});

test("getRegionStates overlays an RSM's states on the stored list", async () => {
  const db = createDb({
    setting: { EAST: ["Bihar"], NORTH_1: ["Punjab"] },
    rsms: [{ salesRegion: "NORTH_1", assignedStates: ["Haryana"] }, { salesRegion: "WEST_1", assignedStates: ["Gujarat"] }],
  });
  assert.deepEqual(await getRegionStates(db), { EAST: ["Bihar"], NORTH_1: ["Haryana"], WEST_1: ["Gujarat"] });
});

test("getRegionStates is empty with no stored list and no RSMs", async () => {
  assert.deepEqual(await getRegionStates(createDb()), {});
});

test("saveRegionStates creates the setting on first save", async () => {
  const db = createDb();
  await saveRegionStates(db, "EAST", ["Bihar"]);
  assert.deepEqual(db.settings.get(KEY), { EAST: ["Bihar"] });
  assert.deepEqual(db.calls.at(-1), ["appSetting.upsert", "create"]);
});

test("saveRegionStates replaces one region and keeps the others", async () => {
  const db = createDb({ setting: { EAST: ["Bihar"], WEST_1: ["Gujarat"] } });
  await saveRegionStates(db, "EAST", ["Odisha", "West Bengal"]);
  assert.deepEqual(db.settings.get(KEY), { EAST: ["Odisha", "West Bengal"], WEST_1: ["Gujarat"] });
});

test("saveRegionStates with null drops the region's key (region deleted)", async () => {
  const db = createDb({ setting: { EAST: ["Bihar"], WEST_1: ["Gujarat"] } });
  await saveRegionStates(db, "EAST", null);
  assert.deepEqual(db.settings.get(KEY), { WEST_1: ["Gujarat"] });
});
