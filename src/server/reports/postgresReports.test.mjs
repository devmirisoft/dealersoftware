import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const reportRoute = readFileSync("src/app/api/reports/dealer-category/route.ts", "utf8");
const dealersRoute = readFileSync("src/app/api/reports/dealer-category/dealers/route.ts", "utf8");
const accountantRoute = readFileSync("src/app/api/accountant/dashboard/route.ts", "utf8");
const accountantPage = readFileSync("src/app/dashboard/accountant/page.tsx", "utf8");
const service = readFileSync("src/server/reports/postgresReports.ts", "utf8");
const combinedActiveReports = [reportRoute, dealersRoute, accountantRoute, accountantPage, service].join("\n");

const forbiddenPhpTerms = [
  "mirisoft",
  "php-compat",
  "getMonthlyreporttopdealer",
  "dealercount",
  "dealerpegination",
  "staffDealers",
  "getdealer",
  "orderdatalist",
  "orderpegination",
];

test("active report paths contain no PHP report reads", () => {
  for (const term of forbiddenPhpTerms) {
    assert.equal(combinedActiveReports.includes(term), false, term);
  }
});

test("report routes use authenticated session identity only", () => {
  for (const source of [reportRoute, dealersRoute, accountantRoute]) {
    assert.match(source, /requireAuth\(\)/);
    assert.doesNotMatch(source, /x-dealersoftware-/);
  }
});

test("dealer category supports date, dealer, staff scope, pagination, and category aggregation", () => {
  assert.match(service, /orderDate/);
  assert.match(service, /dealerId: BigInt\(input\.dealerId\)/);
  assert.match(service, /staffAssignments: \{ some: \{ staffId: actor\.staffId, active: true \} \}/);
  assert.match(dealersRoute, /parsePositiveInt/);
  assert.match(service, /categorySnapshot/);
  assert.match(service, /finalPayableAmountPaise/);
  assert.match(service, /finalAmountPaise/);
});

test("accountant dashboard uses native PostgreSQL metrics and preserves UI aliases", () => {
  assert.match(accountantPage, /\/api\/accountant\/dashboard/);
  assert.match(service, /dealerCount/);
  assert.match(service, /PorderCount/);
  assert.match(service, /monthlyTotals/);
  assert.match(service, /financialSummary/);
  assert.match(service, /walletTransaction\.aggregate/);
  assert.match(service, /Dealer_Name/);
  assert.match(service, /order_net_amount/);
});

test("authorization denies dealers and keeps staff reports scoped", () => {
  assert.match(service, /isStaffLike\(actor\)/);
  assert.match(service, /return null/);
  assert.match(service, /actor\.role !== "ADMIN" && actor\.role !== "ACCOUNTANT"/);
  assert.match(accountantRoute, /status === 403/);
});

test("reports expose PostgreSQL-only source labeling", () => {
  assert.match(service, /PostgreSQL-only report; historical PHP orders are excluded/);
  assert.match(service, /historicalOrdersIncluded: false/);
  assert.match(service, /source: POSTGRES_REPORT_SOURCE/);
});
