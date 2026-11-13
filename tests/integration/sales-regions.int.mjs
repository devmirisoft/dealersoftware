// Integration test for admin-managed sales regions: the real API on the running dev
// server, against the real database. Every row it creates carries this run's tag
// and is deleted in after(), pass or fail.
//
// Run: npm run dev   (in another terminal), then   npm run test:regions:int
// Env: INT_BASE_URL (default http://localhost:3000), INT_ALLOW_PRODUCTION=1 to bypass the guard.
import assert from "node:assert/strict";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import path from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";
import { createJiti } from "jiti";
import { PrismaClient } from "../../scripts/prisma.mjs";

const jiti = createJiti(import.meta.url, { alias: { "@": path.resolve("src") } });
const { salesRegionCode } = await jiti.import(path.resolve("src/lib/salesRegions.ts"));

const BASE_URL = process.env.INT_BASE_URL || "http://localhost:3000";
const STATES_KEY = "sales_region_states";
const tag = `INT-${Date.now()}`;
const password = `${tag}-Password123!`;
const email = (who) => `${who}-${tag}@example.test`.toLowerCase();
const label = (suffix) => `${tag} ${suffix}`;
const scrypt = promisify(scryptCallback);
const prisma = new PrismaClient();

// ---- harness (same approach as scripts/simulate-postgres-backend.mjs) ----

async function hashPassword(raw) {
  const salt = randomBytes(16).toString("base64url");
  return `scrypt:${salt}:${(await scrypt(raw, salt, 64)).toString("hex")}`;
}

async function seedAdminLike(role, who) {
  const address = email(who);
  return prisma.user.create({
    data: {
      email: address, normalizedEmail: address, passwordHash: await hashPassword(password), role, status: "ACTIVE",
      adminProfile: { create: { displayName: `${tag} ${role}` } },
    },
    include: { adminProfile: true },
  });
}

/** One cookie jar per signed-in user; null for anonymous calls. */
async function api(jar, method, url, json) {
  const headers = {};
  if (jar?.size) headers.cookie = [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
  if (json !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${BASE_URL}${url}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) });
  for (const part of (response.headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,]+=)/)) {
    const [pair] = part.trim().split(";");
    const eq = pair.indexOf("=");
    if (jar && eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, body };
}

async function login(address) {
  const jar = new Map();
  const res = await api(jar, "POST", "/api/auth/login", { email: address, password });
  return { jar, res };
}

const regionsUrl = "/api/admin/sales-regions";
const listRegions = async (jar) => (await api(jar, "GET", regionsUrl)).body?.data ?? [];

async function cleanup() {
  const users = await prisma.user.findMany({ where: { normalizedEmail: { endsWith: `-${tag}@example.test`.toLowerCase() } }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  await prisma.authAuditLog.deleteMany({ where: { actorId: { in: userIds } } }).catch(() => undefined);
  await prisma.authAuditLog.deleteMany({ where: { metadata: { path: ["userId"], in: userIds.map(String) } } }).catch(() => undefined);
  await prisma.dealerRequest.deleteMany({ where: { dealerName: { startsWith: tag } } });
  await prisma.dealerProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.staffProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.adminProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.salesRegion.deleteMany({ where: { label: { startsWith: tag } } });
  const setting = await prisma.appSetting.findUnique({ where: { key: STATES_KEY } });
  if (setting) {
    const prefix = `${salesRegionCode(tag)}_`;
    const value = Object.fromEntries(Object.entries(setting.value ?? {}).filter(([code]) => !code.startsWith(prefix)));
    await prisma.appSetting.update({ where: { key: STATES_KEY }, data: { value } });
  }
}

// ---- shared state across the ordered tests below ----

const s = { admin: null, nsm: null, nsmProfileId: null, nsmLoggedIn: false, A: null, B: null, C: null };

before(async () => {
  const productionLike = /prod|production|vercel\.app|dealersoftware/i.test(process.env.DATABASE_URL || "");
  if (productionLike && !process.env.INT_ALLOW_PRODUCTION) throw new Error("Refusing to run against a production-like DATABASE_URL. Set INT_ALLOW_PRODUCTION=1 only if intended.");
  try {
    await fetch(`${BASE_URL}/api/auth/me`, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(`Dev server not reachable at ${BASE_URL}. Start \`npm run dev\` or set INT_BASE_URL.`);
  }
  await seedAdminLike("ADMIN", "admin");
  const nsm = await seedAdminLike("NSM", "nsm");
  s.nsmProfileId = String(nsm.adminProfile.id);

  const admin = await login(email("admin"));
  assert.equal(admin.res.status, 200, `admin login failed: ${JSON.stringify(admin.res.body)}`);
  s.admin = admin.jar;
  // NSMs get an email code when ENABLE_EMAIL_OTP is on; then the NSM checks are skipped.
  const nsmLogin = await login(email("nsm"));
  s.nsm = nsmLogin.jar;
  s.nsmLoggedIn = nsmLogin.res.status === 200 && !nsmLogin.res.body?.otpRequired && nsmLogin.res.body?.data?.otpRequired !== true;
});

after(async () => {
  try { await cleanup(); } finally { await prisma.$disconnect(); }
});

// ---- cases ----

test("1. auth: anonymous is refused; the NSM reads but cannot create or delete", async (t) => {
  assert.equal((await api(null, "GET", regionsUrl)).status, 401);
  if (!s.nsmLoggedIn) return t.skip("NSM login needs an email code (ENABLE_EMAIL_OTP is on)");
  assert.equal((await api(s.nsm, "GET", regionsUrl)).status, 200);
  assert.equal((await api(s.nsm, "POST", regionsUrl, { label: label("NSM") })).status, 403);
  assert.equal((await api(s.nsm, "DELETE", `${regionsUrl}?code=EAST`)).status, 403);
  assert.equal(await prisma.salesRegion.count({ where: { label: label("NSM") } }), 0);
});

test("2. create: admin adds a region; the code is derived from the name", async () => {
  for (const key of ["A", "B", "C"]) {
    const res = await api(s.admin, "POST", regionsUrl, { label: label(key) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.value, salesRegionCode(label(key)));
    assert.equal(res.body.data.label, label(key));
    s[key] = res.body.data.value;
  }
  assert.ok(await prisma.salesRegion.findUnique({ where: { code: s.A } }));
  const listed = (await listRegions(s.admin)).find((region) => region.value === s.A);
  assert.deepEqual(listed, { value: s.A, label: label("A"), states: [] });
});

test("3. create rejects duplicates and names with no usable code", async () => {
  assert.equal((await api(s.admin, "POST", regionsUrl, { label: label("a") })).status, 409, "same name, other case");
  assert.equal((await api(s.admin, "POST", regionsUrl, { label: `${tag}-a` })).status, 409, "different name, same code");
  for (const bad of ["!!", "उत्तर", "x".repeat(41), ""]) {
    assert.equal((await api(s.admin, "POST", regionsUrl, { label: bad })).status, 400, `label ${JSON.stringify(bad)}`);
  }
  assert.equal(await prisma.salesRegion.count({ where: { label: { startsWith: tag } } }), 3);
});

test("4. states: a region with no RSM keeps its own list; unknown regions and states are refused", async () => {
  const saved = await api(s.admin, "PUT", regionsUrl, { region: s.B, states: ["Haryana"] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual((await listRegions(s.admin)).find((region) => region.value === s.B)?.states, ["Haryana"]);

  const unknownRegion = await api(s.admin, "PUT", regionsUrl, { region: `${s.A}_NOPE`, states: [] });
  assert.equal(unknownRegion.status, 400);
  assert.equal(unknownRegion.body.error.code, "REGION_UNKNOWN");
  assert.equal((await api(s.admin, "PUT", regionsUrl, { region: s.B, states: ["Atlantis"] })).status, 400);
});

test("5. staff writes only accept existing regions", async () => {
  const rsm = (salesRegion) => ({
    name: `${tag} RSM`, email: email("rsm"), password, role: "RSM", salesRegion, reportingManagerId: s.nsmProfileId,
  });
  const refused = await api(s.admin, "POST", "/api/admin/staff", rsm(`${s.A}_NOPE`));
  assert.equal(refused.status, 400, JSON.stringify(refused.body));
  assert.equal(refused.body.error.code, "REGION_UNKNOWN");

  const created = await api(s.admin, "POST", "/api/admin/staff", rsm(s.A));
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const profile = await prisma.staffProfile.findFirst({ where: { user: { normalizedEmail: email("rsm") } }, select: { salesRegion: true } });
  assert.equal(profile?.salesRegion, s.A);
});

test("6. delete is blocked while staff, a dealer or a pending dealer request uses the region", async () => {
  await prisma.user.create({
    data: {
      email: email("dealer"), normalizedEmail: email("dealer"), passwordHash: await hashPassword(password), role: "DEALER", status: "ACTIVE",
      dealerProfile: { create: { businessName: `${tag} Dealer`, dealerCode: tag, region: s.B } },
    },
  });
  await prisma.dealerRequest.create({
    data: {
      requestIdentityKey: tag, status: "rsm_pending", dealerName: `${tag} Request`, dealerCode: `${tag}-R`, city: "Ambala",
      contactEmail: email("request"), contactPhone: "9999999999", assignedStaffNames: "", region: s.C,
      submittedById: "0", submittedByName: tag, formSnapshot: {}, submittedAt: new Date(),
    },
  });

  for (const [key, usage] of [["A", { staff: 1, dealers: 0, requests: 0 }], ["B", { staff: 0, dealers: 1, requests: 0 }], ["C", { staff: 0, dealers: 0, requests: 1 }]]) {
    const res = await api(s.admin, "DELETE", `${regionsUrl}?code=${encodeURIComponent(s[key])}`);
    assert.equal(res.status, 409, `${key}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.error.code, "REGION_IN_USE");
    assert.deepEqual({ staff: res.body.error.staff, dealers: res.body.error.dealers, requests: res.body.error.requests }, usage, key);
    assert.match(res.body.message, new RegExp(`^${label(key)} is in use by ${usage.staff} staff, ${usage.dealers} dealers and ${usage.requests} pending dealer requests`));
    assert.ok(await prisma.salesRegion.findUnique({ where: { code: s[key] } }), `${key} must survive`);
  }
});

test("7. delete succeeds once the region is free, and drops its stored states", async () => {
  await api(s.admin, "PUT", regionsUrl, { region: s.C, states: ["Punjab"] });
  await prisma.dealerRequest.deleteMany({ where: { dealerName: { startsWith: tag } } });

  const res = await api(s.admin, "DELETE", `${regionsUrl}?code=${encodeURIComponent(s.C)}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(await prisma.salesRegion.findUnique({ where: { code: s.C } }), null);
  const setting = await prisma.appSetting.findUnique({ where: { key: STATES_KEY } });
  assert.equal(s.C in (setting?.value ?? {}), false, "states key removed");
  assert.deepEqual(setting?.value?.[s.B], ["Haryana"], "other regions keep theirs");

  assert.equal((await api(s.admin, "DELETE", `${regionsUrl}?code=${encodeURIComponent(s.C)}`)).status, 404);
});

test("8. the admin dashboard follows the region list", async () => {
  const res = await api(s.admin, "GET", "/api/admin/dashboard");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const codes = res.body.data.regions.map((region) => region.value);
  for (const code of [s.A, s.B]) {
    assert.ok(codes.includes(code), `${code} listed`);
    assert.ok(Array.isArray(res.body.data.topDistributorsByRegion[code]), `${code} has a top-distributor list`);
  }
  assert.equal(codes.includes(s.C), false, "deleted region gone");
});
