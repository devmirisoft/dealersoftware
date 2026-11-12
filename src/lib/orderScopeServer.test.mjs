import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadModule() {
  const filePath = path.resolve("src/lib/orderScopeServer.ts");
  const scopeUrl = pathToFileURL(path.resolve("src/lib/staffOrderScope.js")).href;
  const prismaStubUrl = `data:text/javascript;base64,${Buffer.from(`export const prisma = { dealerStaffAssignment: { findMany: async () => [] } };`).toString("base64")}`;
  const source = (await fs.readFile(filePath, "utf8"))
    .replace(/from\s+["']@\/lib\/staffOrderScope\.js["']/g, `from "${scopeUrl}"`)
    .replace(/from\s+["']@\/server\/db\/prisma["']/g, `from "${prismaStubUrl}"`);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: filePath,
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const orderScope = await loadModule();

test("missing or unknown role never defaults to Admin", () => {
  assert.equal(orderScope.parseOrderActor({ role: "", actorId: "101" }), null);
  assert.equal(orderScope.parseOrderActor({ actorId: "101" }), null);
  assert.equal(orderScope.parseOrderActor({ role: "unknown", actorId: "101" }), null);
});

test("Dealer and Staff identities fail closed when missing", () => {
  assert.equal(orderScope.parseOrderActor({ role: "dealer", actorId: "" }), null);
  assert.equal(orderScope.parseOrderActor({ role: "staff", actorId: null }), null);
});

test("numeric and string actor IDs normalize to stable strings", () => {
  assert.deepEqual(orderScope.parseOrderActor({ role: "dealer", actorId: 101 }), {
    role: "dealer",
    actorId: "101",
  });
});


test("RSM sessions use regional staff approval scope", () => {
  assert.deepEqual(orderScope.orderActorFromAuth({ role: "RSM", staffId: 26n, profileId: 26n, userId: 126n }), {
    role: "staff",
    actorId: "26",
    isRsm: true,
    userId: "126",
  });
});
test("ASM sessions use assigned-dealer branch scope", () => {
  assert.deepEqual(orderScope.orderActorFromAuth({ role: "ASM", staffId: 42n, profileId: 42n }), {
    role: "staff",
    actorId: "42",
    isAsm: true,
  });
});
test("orders-data adapter requires authenticated session scope instead of query actor identity", async () => {
  const source = await fs.readFile(path.resolve("src/app/api/orders-data/route.ts"), "utf8");
  assert.match(source, /requireAuth\(\)/);
  assert.match(source, /orderActorFromAuth\(authActor\)/);
  assert.match(source, /NextResponse\.json\(serializePrismaValue\(/);
  assert.doesNotMatch(source, /searchParams\.get\("role"\)/);
  assert.doesNotMatch(source, /searchParams\.get\("id"\)/);
  assert.doesNotMatch(source, /requireAuth\(\)\.catch/);
  assert.doesNotMatch(source, /fallbackRole/);
});

test("order-access route ignores spoofed actor headers and query identity", async () => {
  const source = await fs.readFile(path.resolve("src/app/api/order-access/[id]/route.ts"), "utf8");
  assert.match(source, /requireAuth\(\)/);
  assert.match(source, /orderActorFromAuth\(authActor\)/);
  assert.match(source, /NextResponse\.json\(serializePrismaValue\(/);
  assert.doesNotMatch(source, /x-dealersoftware-actor-/);
  assert.doesNotMatch(source, /query\.get\("role"\)/);
  assert.doesNotMatch(source, /query\.get\("actor_id"\)/);
  assert.doesNotMatch(source, /query\.get\("dealer_id"\)/);
  assert.doesNotMatch(source, /requireAuth\(\)\.catch/);
});

test("Staff order scope uses PostgreSQL assignments and no PHP fallback", async () => {
  const source = await fs.readFile(path.resolve("src/lib/orderScopeServer.ts"), "utf8");
  assert.match(source, /prisma\.dealerStaffAssignment\.findMany/);
  assert.doesNotMatch(source, /staffDealers|BACKEND_URL|php-compat/);

  const originalFetch = globalThis.fetch;
  let calls = 0;
  orderScope.invalidateStaffAssignmentCache("29");
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("PHP fallback should not be called");
  };
  try {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => orderScope.fetchStaffAssignedDealerIds("29")),
    );
    assert.equal(calls, 0);
    assert.equal(results.every((ids) => ids.length === 0), true);
    assert.deepEqual(await orderScope.fetchStaffAssignedDealerIds("29"), []);
  } finally {
    orderScope.invalidateStaffAssignmentCache("29");
    globalThis.fetch = originalFetch;
  }
});
