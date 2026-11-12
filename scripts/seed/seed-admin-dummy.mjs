#!/usr/bin/env node
// Dummy data for the admin portal, previewed under the admin sidebar's section headers.
//
//   node scripts/seed/seed-admin-dummy.mjs            → preview only: prints the data, writes tmp/admin-dummy-preview.json
//   node scripts/seed/seed-admin-dummy.mjs --commit   → inserts it into DATABASE_URL (.env), one transaction; refuses if already seeded
//   node scripts/seed/seed-admin-dummy.mjs --remove   → deletes it again
//
// Deterministic (fixed seed + fixed TODAY): the preview is exactly what --commit inserts.
// Markers: every dummy user's email is @example.com (a reserved domain, so no mail is ever delivered);
// products/variants DM-*, category slugs dm-*. Rows here are linked by `key`; DB ids come at insert time.
import { createRequire } from "node:module";
import { randomBytes, scrypt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { getSlabPercent } = require("../../src/lib/discount.js");
const places = JSON.parse(readFileSync(new URL("../../public/data/places.json", import.meta.url), "utf8"));

const TODAY = new Date("2026-11-10T12:00:00+05:30");
const DAY = 86_400_000;

// ── deterministic helpers ───────────────────────────────────────────────────
let seed = 20261110; // mulberry32
const rand = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const pick = (a) => a[Math.floor(rand() * a.length)];
const chance = (p) => rand() < p;

const share = (paise, pct) => BigInt(Math.round(Number(paise) * pct / 100)); // same as src/lib/orderTotals.ts
const rupees = (n) => BigInt(Math.round(n * 100));
const toRupees = (paise) => Number(paise) / 100;
const inr = (paise) => "₹" + toRupees(paise).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const istDay = (daysAgo) => new Date(TODAY.getTime() - daysAgo * DAY + 330 * 60_000).toISOString().slice(0, 10);
const istAt = (daysAgo, hour, minute = 0) => new Date(`${istDay(daysAgo)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+05:30`);
const istDate = (d) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);
const dateOnly = (d) => new Date(`${istDate(d)}T00:00:00.000Z`); // @db.Date
const groupBy = (list, fn) => list.reduce((m, x) => ((m[fn(x)] ??= []).push(x), m), {}); // Object.groupBy is Node 21+
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const daysBetween = (a, b) => Math.floor((b.getTime() - a.getTime()) / DAY);
const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "");
const email = (name) => `${slug(name)}@example.com`;
let phoneSeq = 0;
const phone = () => `90000${String(10101 + 37 * phoneSeq++).padStart(5, "0")}`;

const cityOk = (state, city) => places.states.concat(places.union_territories ?? []).find((s) => s.name === state)?.cities?.includes(city);

// ── Staff › Staff List / Manage Regions ─────────────────────────────────────
const REGIONS = [
  { region: "NORTH_1", warehouse: "AMBALA", states: ["Haryana", "Punjab"],
    rsm: "Rajesh Malhotra", asm: "Gurpreet Sandhu", sm: ["Ankit Sharma", ["Ambala", "Ludhiana"]],
    dealers: [["Shiva Scientific Traders", "Ambala", "Haryana", "133001"], ["Northern Lab Supplies", "Ludhiana", "Punjab", "141001"],
      ["Amrit Lab Solutions", "Amritsar", "Punjab", "143001"], ["Karnal Chemicals & Glassware", "Karnal", "Haryana", "132001"]] },
  { region: "WEST_1", warehouse: "AHMEDABAD", states: ["Gujarat", "Rajasthan"],
    rsm: "Hitesh Patel", asm: "Vikram Rathore", sm: ["Nisha Desai", ["Ahmedabad", "Vadodara"]],
    dealers: [["Navkar Scientific", "Ahmedabad", "Gujarat", "380009"], ["Shreeji Lab Instruments", "Vadodara", "Gujarat", "390007"],
      ["Surat Lab Mart", "Surat", "Gujarat", "395003"], ["Pink City Scientific", "Jaipur", "Rajasthan", "302001"]] },
  { region: "SOUTH_1", warehouse: "AHMEDABAD", states: ["Karnataka", "Tamil Nadu"],
    rsm: "Suresh Iyer", asm: "Karthik Raman", sm: ["Deepa Nair", ["Bengaluru", "Chennai"]],
    dealers: [["Kaveri Scientific Co.", "Bengaluru", "Karnataka", "560058"], ["Deccan Lab House", "Mysuru", "Karnataka", "570001"],
      ["Coromandel Scientific", "Chennai", "Tamil Nadu", "600032"], ["Kongu Lab Supplies", "Coimbatore", "Tamil Nadu", "641001"]] },
  { region: "EAST", warehouse: "AMBALA", states: ["West Bengal", "Odisha"],
    rsm: "Arindam Banerjee", asm: "Sourav Ghosh", sm: ["Priyanka Das", ["Kolkata", "Bhubaneswar"]],
    dealers: [["Bengal Lab Suppliers", "Kolkata", "West Bengal", "700016"], ["Hooghly Scientific Works", "Durgapur", "West Bengal", "713201"],
      ["Kalinga Scientific", "Bhubaneswar", "Odisha", "751001"], ["Eastern Lab Agency", "Cuttack", "Odisha", "753001"]] },
];
const GST_STATE = { Haryana: "06", Punjab: "03", Gujarat: "24", Rajasthan: "08", Karnataka: "29", "Tamil Nadu": "33", "West Bengal": "19", Odisha: "21" };
const CONTACTS = ["Ramesh Gupta", "Sunil Mehta", "Kavita Joshi", "Harish Chawla", "Pooja Shah", "Mahesh Reddy", "Lakshmi Subramaniam",
  "Debashis Roy", "Sanjay Mishra", "Neha Arora", "Prakash Rao", "Asha Mohanty", "Vivek Jain", "Farhan Qureshi", "Meera Pillai", "Tapas Sen"];

const person = (name, extra) => ({ key: slug(name), name, email: email(name), mobileNo: phone(), ...extra });

const nsm = person("Sanjay Verma", { role: "NSM", designation: "NSM", location: "Ambala" });
const staff = [];
for (const r of REGIONS) {
  const rsm = person(r.rsm, { role: "RSM", staffRoleType: "RSM", designation: "RSM", salesRegion: r.region, assignedStates: r.states, reportsTo: nsm.key });
  const asm = person(r.asm, { role: "ASM", staffRoleType: "ASM", designation: "ASM", assignedStates: r.states, parentRsm: rsm.key });
  const [smName, cities] = r.sm;
  if (!cities.every((c) => r.states.some((s) => cityOk(s, c)))) throw new Error(`SM cities ${cities} not all in ${r.states}`);
  const smStates = r.states.filter((s) => cities.some((c) => cityOk(s, c)));
  const sm = person(smName, { role: "STAFF", staffRoleType: "1", designation: "SM", assignedCities: cities, assignedStates: smStates, parentAsm: asm.key, parentRsm: rsm.key });
  staff.push(rsm, asm, sm);
  Object.assign(r, { rsmKey: rsm.key, asmKey: asm.key, smKey: sm.key });
}
const warehouseStaff = [
  person("Manoj Kumar", { role: "STAFF", staffRoleType: "2", designation: "Staff", warehouse: "AMBALA", rsmLinks: [REGIONS[0].rsmKey, REGIONS[3].rsmKey] }),
  person("Jignesh Shah", { role: "STAFF", staffRoleType: "2", designation: "Staff", warehouse: "AHMEDABAD", rsmLinks: [REGIONS[1].rsmKey, REGIONS[2].rsmKey] }),
];
staff.push(...warehouseStaff);
for (const s of staff) {
  s.location = REGIONS.find((r) => [r.rsmKey, r.asmKey, r.smKey].includes(s.key))?.dealers[0][1] ?? (s.warehouse === "AMBALA" ? "Ambala" : "Ahmedabad");
}

// ── Accountants › Manage Accountants ────────────────────────────────────────
const accountants = [
  person("Meena Agarwal", { role: "ACCOUNTANT", designation: "Senior Accountant" }),
  person("Rohit Bansal", { role: "ACCOUNTANT", designation: "Accountant" }),
];

// ── Dealers › Dealer List / Terms Acceptance ────────────────────────────────
const dealers = [];
let contactIdx = 0;
for (const r of REGIONS) {
  r.dealers.forEach(([businessName, city, state, pincode], i) => {
    if (!cityOk(state, city)) throw new Error(`${city} is not a ${state} city in places.json`);
    const isNew = i === 3 && r.region !== "NORTH_1"; // 3 recently onboarded dealers: terms pending, no orders yet
    const n = dealers.length + 1;
    const createdAt = istAt(isNew ? int(10, 40) : int(355, 400), 11);
    dealers.push({
      key: slug(businessName), businessName, email: email(businessName), city, state, pincode,
      dealerCode: `DM${100 + n}`,
      address: `${int(4, 98)}, ${pick(["Industrial Area", "Main Market", "Station Road", "GIDC Estate", "Science Park Road"])}, ${city}`,
      phone: phone(), contactName: CONTACTS[contactIdx++],
      gstin: `${GST_STATE[state]}DUMMY${String(1000 + n)}A1Z${n % 10}`,
      region: r.region, rsmKey: r.rsmKey, smKey: r.smKey, warehouse: r.warehouse,
      discountPercent: pick([5, 8, 10, 10, 12]), creditDays: pick([30, 45, 60]),
      creditLimitPaise: rupees(int(5, 20) * 100_000), annualTargetPaise: rupees(int(15, 60) * 100_000),
      weight: isNew ? 0 : pick([1, 1, 2, 3, 4]),
      createdAt,
      termsAcceptedAt: isNew ? null : addDays(createdAt, 1),
    });
  });
}
const dealerByKey = new Map(dealers.map((d) => [d.key, d]));
const regionOf = (d) => REGIONS.find((r) => r.region === d.region);

// ── Products › Products ─────────────────────────────────────────────────────
const CATALOGUE = [
  ["Volumetric Glassware", [["Volumetric Flask 100 ml, Class A", "DM-VF-100", 2, 210], ["Measuring Cylinder 250 ml", "DM-MC-250", 2, 340], ["Burette 50 ml, PTFE Stopcock", "DM-BU-050", 1, 1150]]],
  ["Beakers & Flasks", [["Beaker 250 ml, Low Form", "DM-BK-250", 12, 85], ["Conical Flask 500 ml", "DM-CF-500", 10, 165], ["Round Bottom Flask 1000 ml", "DM-RB-1000", 1, 620]]],
  ["Syringe Filters", [["PTFE Syringe Filter 0.45 µm, 25 mm", "DM-SF-PT4525", 100, 38], ["Nylon Syringe Filter 0.22 µm, 13 mm", "DM-SF-NY2213", 100, 26], ["PVDF Syringe Filter 0.22 µm, 25 mm", "DM-SF-PV2225", 100, 42]]],
  ["Membrane & Capsule Filters", [["Nylon Membrane Filter 0.45 µm, 47 mm", "DM-MF-NY4547", 100, 31], ["PES Capsule Filter 0.2 µm, 10\"", "DM-CP-PES10", 1, 9800], ["PP Cartridge Filter 5 µm, 10\"", "DM-CT-PP0510", 1, 1450]]],
];
const categories = CATALOGUE.map(([name]) => ({ key: slug(name), name, slug: `dm-${slug(name).replace(/\./g, "-")}` }));
const products = CATALOGUE.flatMap(([cat, items]) => items.map(([name, sku, packSize, unit]) => ({
  key: sku, categoryKey: slug(cat), category: cat, name, productCode: sku, sku, catalogueNumber: sku,
  unitName: "piece", packSize, priceBasis: "piece", unitPricePaise: rupees(unit), packPricePaise: rupees(unit * packSize),
})));

// ── Orders › Order List / Pending Products ──────────────────────────────────
function lines(scale = 1) {
  const chosen = new Set();
  const count = int(1, 5);
  while (chosen.size < count) chosen.add(pick(products));
  return [...chosen].map((p) => {
    const target = int(5, 60) * 1000 * scale;
    const quantityPacks = Math.max(1, Math.round(target / toRupees(p.packPricePaise)));
    const listPriceTotalPaise = p.packPricePaise * BigInt(quantityPacks);
    return { productKey: p.key, productNameSnapshot: p.name, catalogueNumberSnapshot: p.sku, skuSnapshot: p.sku, categorySnapshot: p.category,
      quantityPacks, packSize: p.packSize, totalPieces: quantityPacks * p.packSize, priceBasis: p.priceBasis,
      unitPricePaise: p.unitPricePaise, packPricePaise: p.packPricePaise, listPriceTotalPaise };
  });
}

/** Mirrors orderTotals() in src/lib/orderTotals.ts: base, then custom (if approved) or slab. */
function priceOrder(items, basePercent, customPercent = null) {
  const grossAmountPaise = items.reduce((s, i) => s + i.listPriceTotalPaise, 0n);
  const baseDiscountAmountPaise = share(grossAmountPaise, basePercent);
  const postBaseAmountPaise = grossAmountPaise - baseDiscountAmountPaise;
  const customDiscountAmountPaise = customPercent === null ? 0n : share(grossAmountPaise, customPercent) - baseDiscountAmountPaise;
  const slabDiscountPercent = customPercent === null ? getSlabPercent(toRupees(postBaseAmountPaise)) : 0;
  const slabDiscountAmountPaise = share(postBaseAmountPaise, slabDiscountPercent);
  const additionalDiscountType = customPercent !== null ? "CUSTOM" : slabDiscountPercent > 0 ? "SLAB" : "NONE";
  const additionalDiscountAmountPaise = customPercent !== null ? customDiscountAmountPaise : slabDiscountAmountPaise;
  const totalDiscountAmountPaise = baseDiscountAmountPaise + additionalDiscountAmountPaise;
  const rowPercent = Math.max(basePercent, customPercent ?? 0);
  for (const i of items) {
    i.discountPercent = rowPercent;
    i.discountAmountPaise = share(i.listPriceTotalPaise, rowPercent);
    i.finalAmountPaise = i.listPriceTotalPaise - i.discountAmountPaise;
  }
  return {
    grossAmountPaise, allocatedDiscountPercent: basePercent, baseDiscountPercent: basePercent, baseDiscountAmountPaise, postBaseAmountPaise,
    additionalDiscountType, additionalDiscountAmountPaise, customDiscountAmountPaise, slabDiscountPercent, slabDiscountAmountPaise,
    totalDiscountAmountPaise, totalDiscountPercent: Number((Number(totalDiscountAmountPaise) * 100 / Number(grossAmountPaise)).toFixed(4)),
    finalPayableAmountPaise: grossAmountPaise - totalDiscountAmountPaise,
  };
}

function statusFor(daysAgo) {
  if (daysAgo <= 4) return "AWAITING_ACCEPTANCE";
  if (daysAgo <= 8) return "ACCEPTED";
  if (daysAgo <= 14) return chance(0.5) ? "PROCESSING" : "DISPATCHED";
  if (daysAgo <= 25) return chance(0.4) ? "DISPATCHED" : "COMPLETED";
  return chance(0.88) ? "COMPLETED" : chance(0.5) ? "CANCELLED" : "DECLINED";
}

const orderingDealers = dealers.filter((d) => d.weight > 0);
const weighted = orderingDealers.flatMap((d) => Array(d.weight).fill(d));
const orderDays = [
  ...Array.from({ length: 90 }, () => 15 + Math.floor(330 * (1 - Math.sqrt(rand())))), // more orders lately
  ...Array.from({ length: 12 }, () => int(0, 14)),
];

const orders = orderDays.map((daysAgo) => {
  const dealer = pick(weighted);
  const items = lines(chance(0.06) ? 4 : dealer.weight >= 3 ? 1.6 : 1);
  return buildOrder({ dealer, daysAgo, items, status: statusFor(daysAgo) });
});

function buildOrder({ dealer, daysAgo, items, status, customPercent = null }) {
  const r = regionOf(dealer);
  const placedAt = istAt(daysAgo, int(10, 17), int(0, 59));
  const o = {
    dealerKey: dealer.key, dealer: dealer.businessName, region: dealer.region,
    assignedStaffKey: warehouseStaff.find((s) => s.warehouse === dealer.warehouse).key, salesManagerKey: dealer.smKey,
    orderDate: placedAt, shipTo: `${dealer.businessName}, ${dealer.address}, ${dealer.state} ${dealer.pincode}`,
    refNo: `PO-${int(1000, 9999)}`, note: chance(0.2) ? pick(["Please pack syringe filters separately.", "Urgent — lab audit next week.", "Deliver before month end."]) : null,
    ...priceOrder(items, dealer.discountPercent, customPercent),
    status, acceptanceStatus: "AWAITING", rsmApprovalStatus: "ACCEPTED", fulfilmentStatus: "PENDING",
    rsmReviewedByKey: r.rsmKey, rsmReviewedAt: addDays(placedAt, 0.12),
    items, dispatches: false,
  };
  const reviewedAt = addDays(placedAt, 1);
  if (status === "AWAITING_ACCEPTANCE" && daysAgo < 1) Object.assign(o, { rsmApprovalStatus: "AWAITING", rsmReviewedByKey: null, rsmReviewedAt: null });
  if (["ACCEPTED", "PROCESSING", "DISPATCHED", "COMPLETED"].includes(status)) Object.assign(o, { acceptanceStatus: "ACCEPTED", acceptedAt: reviewedAt, acceptanceReviewedAt: reviewedAt });
  if (status === "PROCESSING") o.fulfilmentStatus = "IN_PROCESS";
  if (status === "DISPATCHED" || status === "COMPLETED") Object.assign(o, { fulfilmentStatus: status, dispatchedAt: addDays(placedAt, int(3, 6)), dispatches: true });
  if (status === "COMPLETED") o.completedAt = addDays(o.dispatchedAt, int(3, 8));
  if (status === "DECLINED") Object.assign(o, { acceptanceStatus: "DECLINED", acceptanceReviewedAt: reviewedAt, acceptanceNote: "Overdue bills on account — please clear dues and re-order." });
  if (status === "CANCELLED") Object.assign(o, { cancelledAt: reviewedAt, cancellationReason: pick(["Dealer cancelled — duplicate order.", "Customer requirement withdrawn."]) });
  return o;
}

// ── Orders › Discount Approvals ─────────────────────────────────────────────
// orderSnapshot uses the shape placeOrderForApprovedDiscount() reads, so approving a pending one places a real order.
const discountRequests = [];
function discountRequest({ dealerKey, daysAgo, requested, status, rsm = "APPROVED", nsm = null, note = null, linkOrder = false }) {
  const dealer = dealerByKey.get(dealerKey);
  const base = dealer.discountPercent;
  let items; do items = lines(3); while (items.reduce((s, i) => s + i.listPriceTotalPaise, 0n) < rupees(75_000)); // a special-discount ask is a sizeable order
  const gross = items.reduce((s, i) => s + i.listPriceTotalPaise, 0n);
  const createdAt = istAt(daysAgo, 12);
  const req = {
    dealerKey, dealer: dealer.businessName, staffKey: dealer.smKey, scope: "ORDER", status, rsmApprovalStatus: rsm,
    rsmReviewedByKey: rsm === "PENDING" ? null : dealer.rsmKey, rsmReviewedAt: rsm === "PENDING" ? null : addDays(createdAt, 0.2),
    nsmApprovalStatus: nsm, nsmReviewedAt: nsm ? addDays(createdAt, 0.5) : null, nsmNote: nsm === "REJECTED" ? note : null,
    currentDiscountPercent: base, requestedDiscountPercent: requested, requestedOrderDiscountPercent: requested,
    grossAmountPaise: gross, requestedDiscountAmountPaise: share(gross, requested) - share(gross, base), requestedNetPayableAmountPaise: gross - share(gross, requested),
    adminNote: status === "REJECTED" ? note : status === "APPROVED" ? "Approved for annual rate contract order." : null,
    reviewedAt: status === "PENDING" ? null : addDays(createdAt, 1), createdAt,
    orderSnapshot: {
      shipto: `${dealer.businessName}, ${dealer.address}`, refno: `PO-${int(1000, 9999)}`, orderNote: "Rate contract order — requesting special discount.",
      grossAmount: toRupees(gross), baseDiscountAmount: toRupees(share(gross, base)),
      products: items.map((i) => ({
        productName: i.productNameSnapshot, sku: i.skuSnapshot, catalogueNumber: i.catalogueNumberSnapshot, priceBasis: i.priceBasis,
        quantity: i.quantityPacks, packSize: i.packSize, totalPieces: i.totalPieces, unitPrice: toRupees(i.unitPricePaise), packPrice: toRupees(i.packPricePaise),
        grossAmount: toRupees(i.listPriceTotalPaise), baseDiscountPercent: base, baseDiscountAmount: toRupees(share(i.listPriceTotalPaise, base)),
        requestedCustomDiscountPercent: requested - base, requestedCustomDiscountAmount: toRupees(share(i.listPriceTotalPaise, requested - base)),
        finalAmount: toRupees(i.listPriceTotalPaise - share(i.listPriceTotalPaise, base) - share(i.listPriceTotalPaise, requested - base)),
      })),
    },
  };
  if (linkOrder) { // the order an approval placed
    const order = buildOrder({ dealer, daysAgo: daysAgo - 1, items, status: "PROCESSING", customPercent: requested });
    orders.push(order);
    req.orderRef = order;
  }
  discountRequests.push(req);
}
discountRequest({ dealerKey: "shiva.scientific.traders", daysAgo: 2, requested: dealerByKey.get("shiva.scientific.traders").discountPercent + 4, status: "PENDING" });
discountRequest({ dealerKey: "navkar.scientific", daysAgo: 1, requested: dealerByKey.get("navkar.scientific").discountPercent + 4, status: "PENDING" });
discountRequest({ dealerKey: "kaveri.scientific.co", daysAgo: 0, requested: dealerByKey.get("kaveri.scientific.co").discountPercent + 3, status: "PENDING", rsm: "PENDING" });
discountRequest({ dealerKey: "bengal.lab.suppliers", daysAgo: 12, requested: dealerByKey.get("bengal.lab.suppliers").discountPercent + 6, status: "APPROVED", nsm: "APPROVED", linkOrder: true });
discountRequest({ dealerKey: "northern.lab.supplies", daysAgo: 20, requested: dealerByKey.get("northern.lab.supplies").discountPercent + 10, status: "REJECTED", nsm: "REJECTED", note: "Too steep on this order value; best we can do is +4%." });

// Order numbers in placement order, per calendar year: MS/26/A001 … MS/26/A100, then MS/26/B001.
orders.sort((a, b) => a.orderDate - b.orderDate);
const orderSeq = {};
const seedOrderNumber = (year, seq) =>
  `MS/${String(year).slice(-2)}/${String.fromCharCode(65 + Math.floor((seq - 1) / 100))}${String((seq - 1) % 100 + 1).padStart(3, "0")}`;
orders.forEach((o, i) => {
  const year = Number(istDate(o.orderDate).slice(0, 4));
  orderSeq[year] = (orderSeq[year] ?? 0) + 1;
  o.orderNumber = seedOrderNumber(year, orderSeq[year]);
  o.idempotencyKey = `dummy-seed:${i + 1}`;
});

// ── Dealers › Dealer Ledger ─────────────────────────────────────────────────
// One GST invoice per dispatched order. A payment = record-only wallet CREDIT + bill.paidAmountPaise, as recordLedgerPayment() writes it.
const ledgerBills = [];
const payments = [];
orders.filter((o) => o.dispatches).forEach((o, i) => {
  const dealer = dealerByKey.get(o.dealerKey);
  const billDate = dateOnly(o.dispatchedAt);
  const billAmountPaise = (o.finalPayableAmountPaise * 118n / 100n + 50n) / 100n * 100n;
  const pastDue = daysBetween(addDays(billDate, dealer.creditDays), TODAY);
  const roll = rand();
  const paidShare = pastDue > 20 ? (roll < 0.85 ? 1 : 0.6) : pastDue > 0 ? (roll < 0.5 ? 1 : roll < 0.7 ? 0.5 : 0) : (roll < 0.25 ? 0.4 : 0);
  const paidAmountPaise = paidShare === 1 ? billAmountPaise : rupees(Math.round(toRupees(billAmountPaise) * paidShare));
  const fy = billDate.getUTCMonth() >= 3 ? billDate.getUTCFullYear() : billDate.getUTCFullYear() - 1;
  const bill = {
    dealerKey: o.dealerKey, dealer: o.dealer, orderNumber: o.orderNumber, billNumber: `INV/${String(fy).slice(-2)}-${String(fy + 1).slice(-2)}/${String(i + 1).padStart(4, "0")}`,
    billDate, billAmountPaise, gstPercent: 18, paidAmountPaise, dueDate: addDays(billDate, dealer.creditDays), pastDue,
    lastPaymentDate: null, orderRef: o,
  };
  if (paidAmountPaise > 0n) {
    const paidOn = new Date(Math.min(TODAY.getTime(), addDays(billDate, Math.max(5, dealer.creditDays - int(-5, 15))).getTime()));
    bill.lastPaymentDate = dateOnly(paidOn);
    payments.push({ dealerKey: o.dealerKey, billRef: bill, amountPaise: paidAmountPaise, paymentMode: pick(["NEFT", "RTGS", "Cheque", "UPI"]), paidOn });
  }
  ledgerBills.push(bill);
});
// Keep every dealer comfortably inside their limit (unpaid bills + open orders + ₹3L headroom), so approvals in the UI go through.
for (const d of dealers) {
  const unpaid = ledgerBills.filter((b) => b.dealerKey === d.key).reduce((s, b) => s + b.billAmountPaise - b.paidAmountPaise, 0n);
  const open = orders.filter((o) => o.dealerKey === d.key && ["AWAITING_ACCEPTANCE", "ACCEPTED", "PROCESSING"].includes(o.status)).reduce((s, o) => s + o.finalPayableAmountPaise, 0n);
  const needed = (unpaid + open + rupees(300_000) + rupees(99_999)) / rupees(100_000) * rupees(100_000);
  if (d.creditLimitPaise < needed) d.creditLimitPaise = needed;
}

// ── Dealers › Dealer Requests ───────────────────────────────────────────────
const dealerRequests = [
  ["Ganga Scientific Corporation", "Panipat", "Haryana", "132103", "NORTH_1", "pending", 3],
  ["Marina Lab Essentials", "Chennai", "Tamil Nadu", "600004", "SOUTH_1", "rsm_pending", 1],
  ["Rajkot Science House", "Rajkot", "Gujarat", "360001", "WEST_1", "rejected", 20],
].map(([name, city, state, pincode, region, status, daysAgo], i) => {
  if (!cityOk(state, city)) throw new Error(`${city} is not a ${state} city in places.json`);
  const r = REGIONS.find((x) => x.region === region);
  const sm = staff.find((s) => s.key === r.smKey);
  const submittedAt = istAt(daysAgo, 13);
  const contactPhone = phone();
  return {
    status, dealerName: name, dealerCode: `DM${200 + i}`, city, contactEmail: email(name), contactPhone, region,
    rsmKey: r.rsmKey, submittedByKey: sm.key, submittedByName: sm.name, assignedStaffNames: sm.name, submittedAt,
    reviewedAt: status === "rejected" ? addDays(submittedAt, 2) : null, rejectedAt: status === "rejected" ? addDays(submittedAt, 2) : null,
    rejectionReason: status === "rejected" ? "GSTIN matches an existing dealer — please verify before resubmitting." : "",
    formSnapshot: {
      name, email: email(name), whatsapp: contactPhone, priorityPerson: "primary", contactName: pick(CONTACTS), secondaryContactName: "", secondaryContactPhone: "",
      secondaryContactEmail: "", additionalContacts: [], city, state, address: `${int(5, 90)}, Main Market, ${city}`, pincode, dealerCode: `DM${200 + i}`,
      username: email(name), password: "(random at insert)", gstNo: `${GST_STATE[state]}DUMMY${2000 + i}A1Z${i}`, discount: "8", creditDays: "45",
      annualTarget: "2000000", currentLimit: "500000", notes: "Referred by area SM after a lab visit.", paymentType: "credit",
      staffNames: sm.name, region,
    },
  };
});

// ── Forms › Filter Requirement Forms ────────────────────────────────────────
const forms = [
  ["Sunshine Pharma Labs Pvt Ltd", "Ahmedabad, Gujarat", "Nisha Desai", 9, ["Syringe Filter"], "Pharma", "Sales Visit / Other", "Regular", "1 Month"],
  ["Greenfield Biotech", "Bengaluru, Karnataka", "Deepa Nair", 16, ["Syringe Filter", "Capsule"], "Biotech", "Exhibition", "Trial", "Immediate"],
  ["Northstar Analytical Services", "Ludhiana, Punjab", "Ankit Sharma", 27, ["Syringe Filter"], "Research", "Reference", "Regular", "3 Months"],
  ["Delta Water Testing Lab", "Kolkata, West Bengal", "Priyanka Das", 41, ["Capsule"], "Chemical", "Website", "Tender", "Future"],
].map(([companyName, cityState, smName, daysAgo, productsWanted, industry, source, reqType, timeline], i) => {
  const visitedDate = istAt(daysAgo, 11);
  return {
    leadNo: `DSL-${String(i + 1).padStart(3, "0")}`, companyName, products: productsWanted, submittedByKey: slug(smName), submittedByName: smName,
    submittedByRole: "STAFF", visitedDate, submittedAt: addDays(visitedDate, 0.3),
    customerDetails: { companyName, contactPerson: pick(CONTACTS), department: "QC Lab", designation: "Lab Manager", mobile: phone(), email: email(companyName),
      website: "", address: `Plot ${int(10, 200)}, Industrial Estate`, cityState, industryTypeOther: "", existingSupplier: pick(["Imported brand", "Local trader", "None"]),
      industryType: [industry], inquirySource: [source] },
    syringeFilter: productsWanted.includes("Syringe Filter") ? { filterDiameter: ["25mm"], poreSize: ["0.22um", "0.45um"], membraneType: ["PTFE", "Nylon"],
      housingMaterial: ["PP"], application: ["HPLC"], sampleType: ["Aqueous", "Organic"], individuallyPacked: "No", sterile: "Non Sterile",
      poreSizeOther: "", membraneTypeOther: "", housingMaterialOther: "", applicationOther: "", quantityRequired: "5000 pcs", monthlyConsumption: "2000 pcs",
      targetPrice: "₹30/pc", requiredDeliveryTime: "2 weeks" } : null,
    capsule: productsWanted.includes("Capsule") ? { capsuleSize: ["10\" Small"], membraneType: ["PES"], poreSize: ["0.22um"], connectionType: ["TC"],
      application: ["Liquid"], sterile: "Sterile", membraneTypeOther: "", poreSizeOther: "", connectionTypeOther: "", flowRateRequirement: "10 LPM",
      operatingPressure: "2 bar", validationRequirement: "Bacterial retention certificate", quantityRequired: "20 pcs", monthlyConsumption: "8 pcs",
      requiredDeliveryTime: "3 weeks" } : null,
    commercialInfo: { expectedOrderQty: "As per trial", expectedOrderValue: `₹${int(1, 8)} lakh`, followUpDate: istDay(daysAgo - 10),
      competitorBrandInUse: pick(["Imported brand", "None"]), sampleDetails: "Samples requested for trial", requirementType: reqType, purchaseTimeline: timeline,
      techApprovalRequired: "Yes", sampleRequired: "Yes",
      decisionMaker: { name: pick(CONTACTS), designation: "Head QC", phone: phone(), email: email(`${companyName} qc`) } },
  };
});

// ── preview ─────────────────────────────────────────────────────────────────
const staffName = (key) => [nsm, ...staff].find((s) => s.key === key)?.name ?? "";
const h1 = (t) => console.log(`\n\x1b[1m━━ ${t} ${"━".repeat(Math.max(0, 74 - t.length))}\x1b[0m`);
const h2 = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const table = (rows) => console.table(rows);
const statusCount = (list, field = "status") => Object.fromEntries(Object.entries(groupBy(list, (x) => x[field])).map(([k, v]) => [k, v.length]));

console.log(`Dummy data preview — TODAY = ${istDay(0)}, nothing written to the database.`);

h1("Overview › Dashboard (derived from the orders below, same math as /api/admin/dashboard)");
const monthly = groupBy(orders, (o) => istDate(o.orderDate).slice(0, 7));
console.log(`Dealers ${dealers.length} · Orders ${orders.length} · Awaiting acceptance ${orders.filter((o) => o.status === "AWAITING_ACCEPTANCE").length} · Discount approvals pending ${discountRequests.filter((d) => d.status === "PENDING").length}`);
table(Object.fromEntries(Object.entries(monthly).sort().map(([m, list]) => [m, { orders: list.length, total: inr(list.reduce((s, o) => s + o.finalPayableAmountPaise, 0n)) }])));
const byDealer = Object.entries(groupBy(orders, (o) => o.dealer)).map(([dealer, list]) => [dealer, list.reduce((s, o) => s + o.finalPayableAmountPaise, 0n)]).sort((a, b) => (b[1] > a[1] ? 1 : -1));
h2("Top dealers");
table(byDealer.slice(0, 10).map(([dealer, t]) => ({ dealer, total: inr(t) })));
h2("By region");
table(Object.fromEntries(REGIONS.map((r) => [r.region, inr(orders.filter((o) => o.region === r.region).reduce((s, o) => s + o.finalPayableAmountPaise, 0n))])));

h1("Dealers › Dealer List / Terms Acceptance / Dealer Rewards");
table(dealers.map((d) => ({ code: d.dealerCode, dealer: d.businessName, city: `${d.city}, ${d.state}`, region: d.region, RSM: staffName(d.rsmKey),
  "disc%": d.discountPercent, credit: `${d.creditDays}d / ${inr(d.creditLimitPaise)}`, target: inr(d.annualTargetPaise), terms: d.termsAcceptedAt ? "accepted" : "pending",
  orders: orders.filter((o) => o.dealerKey === d.key).length })));
console.log("Login emails: <dealer-name>@example.com, e.g.", dealers[0].email, "· GSTINs contain DUMMY · phones 90000xxxxx");

h1("Dealers › Dealer Ledger");
table(dealers.filter((d) => d.weight > 0).map((d) => {
  const bills = ledgerBills.filter((b) => b.dealerKey === d.key);
  const billed = bills.reduce((s, b) => s + b.billAmountPaise, 0n);
  const paid = bills.reduce((s, b) => s + b.paidAmountPaise, 0n);
  return { dealer: d.businessName, bills: bills.length, billed: inr(billed), paid: inr(paid), outstanding: inr(billed - paid),
    overdueBills: bills.filter((b) => b.pastDue > 0 && b.paidAmountPaise < b.billAmountPaise).length };
}));
console.log(`${ledgerBills.length} bills (GST 18%, one per dispatched order) · ${payments.length} payments`);

h1("Dealers › Dealer Requests");
table(dealerRequests.map((r) => ({ status: r.status, dealer: r.dealerName, code: r.dealerCode, city: r.city, region: r.region, submittedBy: r.submittedByName,
  submitted: istDate(r.submittedAt), reason: r.rejectionReason })));

h1("Staff › Staff List / Manage Regions");
table([nsm, ...staff].map((s) => ({ name: s.name, role: s.designation, region: s.salesRegion ?? "", scope: s.warehouse ? `warehouse ${s.warehouse}` : (s.assignedCities?.length ? s.assignedCities : s.assignedStates ?? ["all India"]).join(", "),
  reportsTo: staffName(s.reportsTo ?? s.parentAsm ?? s.parentRsm) || (s.rsmLinks ?? []).map(staffName).join(", "), email: s.email })));

h1("Products › Products");
table(products.map((p) => ({ category: p.category, product: p.name, sku: p.sku, pack: p.packSize, "₹/pc": toRupees(p.unitPricePaise), "₹/pack": toRupees(p.packPricePaise) })));

h1("Orders › Order List");
console.log("Status counts:", statusCount(orders));
table(orders.slice(-15).reverse().map((o) => ({ order: o.orderNumber, date: istDate(o.orderDate), dealer: o.dealer, status: o.status,
  lines: o.items.length, gross: inr(o.grossAmountPaise), discount: `${o.totalDiscountPercent}% ${o.additionalDiscountType === "NONE" ? "" : o.additionalDiscountType}`.trim(), payable: inr(o.finalPayableAmountPaise) })));
console.log(`(latest 15 of ${orders.length}; all in the JSON file)`);

h1("Orders › Pending Products");
const pendingLines = orders.filter((o) => ["AWAITING_ACCEPTANCE", "ACCEPTED", "PROCESSING"].includes(o.status)).flatMap((o) => o.items.map((i) => ({ order: o.orderNumber, dealer: o.dealer, product: i.productNameSnapshot, packs: i.quantityPacks })));
table(pendingLines.slice(0, 12));
console.log(`${pendingLines.length} open lines; dispatched/completed orders get full dispatch rows so they never show here.`);

h1("Orders › Discount Approvals");
table(discountRequests.map((d) => ({ dealer: d.dealer, status: d.status, RSM: d.rsmApprovalStatus, NSM: d.nsmApprovalStatus ?? "not needed",
  "base%": d.currentDiscountPercent, "asked%": d.requestedDiscountPercent, gross: inr(d.grossAmountPaise), net: inr(d.requestedNetPayableAmountPaise),
  order: d.orderRef?.orderNumber ?? "", note: d.adminNote ?? "" })));

h1("Forms › Filter Requirement Forms");
table(forms.map((f) => ({ lead: f.leadNo, company: f.companyName, city: f.customerDetails.cityState, products: f.products.join(", "), by: f.submittedByName,
  visited: istDate(f.visitedDate), type: f.commercialInfo.requirementType })));

h1("Accountants › Manage Accountants");
table(accountants.map((a) => ({ name: a.name, designation: a.designation, email: a.email })));

h1("Not seeded");
console.log(`Orders › Fund Requests       only wallet (advance-pay) dealers raise these; all dummy dealers are on credit terms
Orders › Courier Services    3 couriers already in the DB
Content › Slider / Hot Items / Today's Sale   need uploaded images / a live sale; set from the admin UI
Reports › Dealer Category    computed from the orders above
System › Audit Logs          116 rows already in the DB
All dummy accounts get an unusable random password (nobody can log in as them).`);

const out = { TODAY, nsm, staff, accountants, dealers, categories, products, orders, ledgerBills, payments, discountRequests, dealerRequests, forms };
mkdirSync(new URL("../../tmp/", import.meta.url), { recursive: true });
const file = new URL("../../tmp/admin-dummy-preview.json", import.meta.url);
writeFileSync(file, JSON.stringify(out, (k, v) => (typeof v === "bigint" ? v.toString() : k === "orderRef" ? v?.orderNumber : k === "billRef" ? v?.billNumber : v), 2));
console.log(`\nFull data: tmp/admin-dummy-preview.json`);

// ── write ───────────────────────────────────────────────────────────────────
const mode = process.argv.includes("--commit") ? "commit" : process.argv.includes("--remove") ? "remove" : "preview";
if (mode !== "preview") {
  const { PrismaClient } = await import("../prisma.mjs"); // loads .env
  const prisma = new PrismaClient();
  console.log(`\n${mode.toUpperCase()} → ${new URL(process.env.DATABASE_URL).hostname}`);
  try {
    await prisma.$transaction(async (tx) => {
      if (mode === "remove") return removeDummy(tx);
      if (await tx.user.count({ where: { normalizedEmail: { endsWith: "@example.com" } } })) throw new Error("Dummy data is already there; run --remove first.");
      await insertDummy(tx);
    }, { timeout: 600_000, maxWait: 30_000 });
  } finally {
    await prisma.$disconnect();
  }
}

function unusableHash() { // valid scrypt hash of a secret nobody keeps, same format as the app's hashPassword
  const salt = randomBytes(16).toString("base64url");
  return new Promise((ok, fail) => scrypt(randomBytes(32).toString("base64url"), salt, 64, (e, key) => (e ? fail(e) : ok(`scrypt:${salt}:${key.toString("hex")}`))));
}

async function insertDummy(tx) {
  const admin = await tx.user.findFirst({ where: { role: "ADMIN", deletedAt: null }, orderBy: { id: "asc" }, include: { adminProfile: true } });
  if (!admin) throw new Error("No admin user to stamp as reviewer.");
  const adminName = admin.adminProfile?.displayName || "Admin";
  const people = [nsm, ...staff, ...accountants];
  const userIdOf = (key) => people.find((p) => p.key === key).userId;
  const passwordHash = await unusableHash();
  const log = (what, n) => console.log(`  ${what.padEnd(28)} ${n}`);

  const users = await tx.user.createManyAndReturn({
    data: [...people.map((p) => ({ email: p.email, role: p.role, createdAt: istAt(400, 10) })), ...dealers.map((d) => ({ email: d.email, role: "DEALER", createdAt: d.createdAt }))]
      .map((u) => ({ ...u, normalizedEmail: u.email, username: u.email, normalizedUsername: u.email, passwordHash, status: "ACTIVE" })),
    select: { id: true, email: true },
  });
  const uid = new Map(users.map((u) => [u.email, u.id]));
  for (const x of [...people, ...dealers]) x.userId = uid.get(x.email);
  log("users", users.length);

  const nsmProfile = await tx.adminProfile.create({ data: { userId: nsm.userId, displayName: nsm.name, phone: nsm.mobileNo, mobileNo: nsm.mobileNo, location: nsm.location, nationality: "Indian" } });
  const sid = new Map(); // staff key → staff profile id
  for (const tier of ["RSM", "ASM", "1", "2"]) { // parents before children
    const rows = staff.filter((s) => s.staffRoleType === tier);
    const created = await tx.staffProfile.createManyAndReturn({
      data: rows.map((s) => ({
        userId: s.userId, displayName: s.name, designation: s.designation, location: s.location, mobileNo: s.mobileNo, nationality: "Indian",
        staffRoleType: s.staffRoleType, salesRegion: s.salesRegion ?? null, warehouse: s.warehouse ?? null, assignedStates: s.assignedStates ?? [], assignedCities: s.assignedCities ?? [],
        reportingManagerId: s.reportsTo ? nsmProfile.id : null, parentRsmId: s.parentRsm ? sid.get(s.parentRsm) : null, parentAsmId: s.parentAsm ? sid.get(s.parentAsm) : null,
      })),
      select: { id: true, userId: true },
    });
    for (const c of created) sid.set(rows.find((s) => s.userId === c.userId).key, c.id);
  }
  await tx.staffRsmLink.createMany({ data: warehouseStaff.flatMap((s) => s.rsmLinks.map((rsmKey) => ({ staffId: sid.get(s.key), rsmId: sid.get(rsmKey) }))) });
  await tx.accountantProfile.createMany({ data: accountants.map((a) => ({ userId: a.userId, displayName: a.name, designation: a.designation })) });
  log("NSM / staff / accountants", `1 / ${sid.size} / ${accountants.length}`);

  const dealerRows = await tx.dealerProfile.createManyAndReturn({
    data: dealers.map((d) => ({
      userId: d.userId, dealerCode: d.dealerCode, businessName: d.businessName, phone: d.phone, city: d.city, state: d.state, address: d.address, pincode: d.pincode,
      gstin: d.gstin, discountPercent: d.discountPercent, creditDays: d.creditDays, creditLimitPaise: d.creditLimitPaise, annualTargetPaise: d.annualTargetPaise,
      contactName: d.contactName, termsAcceptedAt: d.termsAcceptedAt, region: d.region, rsmUserId: userIdOf(d.rsmKey), createdByUserId: admin.id, createdAt: d.createdAt,
    })),
    select: { id: true, userId: true },
  });
  for (const r of dealerRows) dealers.find((d) => d.userId === r.userId).id = r.id;
  // SM ("1") then warehouse Staff ("2"): what resolveOrderStaffStamp reads for salesManagerId / assignedStaffId.
  await tx.dealerStaffAssignment.createMany({ data: dealers.flatMap((d) => [d.smKey, warehouseStaff.find((s) => s.warehouse === d.warehouse).key]
    .map((key, i) => ({ dealerId: d.id, staffId: sid.get(key), assignedByUserId: admin.id, assignedAt: new Date(d.createdAt.getTime() + i * 1000) }))) });
  log("dealers (+2 assignments each)", dealerRows.length);

  const cats = await tx.productCategory.createManyAndReturn({ data: categories.map((c) => ({ name: c.name, slug: c.slug })), select: { id: true, slug: true } });
  const catId = new Map(cats.map((c) => [c.slug, c.id]));
  const prods = await tx.product.createManyAndReturn({
    data: products.map((p) => ({ productCode: p.productCode, name: p.name, categoryId: catId.get(categories.find((c) => c.key === p.categoryKey).slug) })),
    select: { id: true, productCode: true },
  });
  for (const r of prods) products.find((p) => p.productCode === r.productCode).productId = r.id;
  const variants = await tx.productVariant.createManyAndReturn({
    data: products.map((p) => ({ productId: p.productId, sku: p.sku, catalogueNumber: p.catalogueNumber, unitName: p.unitName, packSize: p.packSize,
      unitPricePaise: p.unitPricePaise, packPricePaise: p.packPricePaise, priceBasis: p.priceBasis })),
    select: { id: true, sku: true },
  });
  for (const r of variants) products.find((p) => p.sku === r.sku).variantId = r.id;
  log("categories / products", `${cats.length} / ${prods.length}`);

  const PRICE = ["grossAmountPaise", "allocatedDiscountPercent", "baseDiscountPercent", "baseDiscountAmountPaise", "postBaseAmountPaise", "additionalDiscountType",
    "additionalDiscountAmountPaise", "customDiscountAmountPaise", "slabDiscountPercent", "slabDiscountAmountPaise", "totalDiscountPercent", "totalDiscountAmountPaise", "finalPayableAmountPaise"];
  const orderRows = await tx.order.createManyAndReturn({
    data: orders.map((o) => ({
      orderNumber: o.orderNumber, idempotencyKey: o.idempotencyKey, dealerId: dealerByKey.get(o.dealerKey).id, createdByUserId: dealerByKey.get(o.dealerKey).userId,
      assignedStaffId: sid.get(o.assignedStaffKey), salesManagerId: sid.get(o.salesManagerKey),
      orderDate: o.orderDate, createdAt: o.orderDate, shipTo: o.shipTo, refNo: o.refNo, note: o.note,
      ...Object.fromEntries(PRICE.map((k) => [k, o[k]])),
      status: o.status, acceptanceStatus: o.acceptanceStatus, rsmApprovalStatus: o.rsmApprovalStatus, fulfilmentStatus: o.fulfilmentStatus,
      rsmReviewedByUserId: o.rsmReviewedByKey ? userIdOf(o.rsmReviewedByKey) : null, rsmReviewedByName: o.rsmReviewedByKey ? staffName(o.rsmReviewedByKey) : null, rsmReviewedAt: o.rsmReviewedAt,
      acceptanceReviewedByUserId: o.acceptanceReviewedAt ? admin.id : null, acceptanceReviewedByName: o.acceptanceReviewedAt ? adminName : null,
      acceptanceReviewedAt: o.acceptanceReviewedAt ?? null, acceptanceNote: o.acceptanceNote ?? null,
      acceptedAt: o.acceptedAt ?? null, dispatchedAt: o.dispatchedAt ?? null, completedAt: o.completedAt ?? null, cancelledAt: o.cancelledAt ?? null, cancellationReason: o.cancellationReason ?? null,
    })),
    select: { id: true, orderNumber: true },
  });
  const oid = new Map(orderRows.map((r) => [r.orderNumber, r.id]));
  const productOf = new Map(products.map((p) => [p.key, p]));
  const itemRows = await tx.orderItem.createManyAndReturn({
    data: orders.flatMap((o) => o.items.map((i) => ({
      orderId: oid.get(o.orderNumber), productId: productOf.get(i.productKey).productId, productVariantId: productOf.get(i.productKey).variantId,
      productNameSnapshot: i.productNameSnapshot, catalogueNumberSnapshot: i.catalogueNumberSnapshot, skuSnapshot: i.skuSnapshot, categorySnapshot: i.categorySnapshot,
      quantityPacks: i.quantityPacks, packSize: i.packSize, totalPieces: i.totalPieces, priceBasis: i.priceBasis, unitPricePaise: i.unitPricePaise, packPricePaise: i.packPricePaise,
      listPriceTotalPaise: i.listPriceTotalPaise, discountPercent: i.discountPercent, discountAmountPaise: i.discountAmountPaise, finalAmountPaise: i.finalAmountPaise, createdAt: o.orderDate,
    }))),
    select: { id: true, orderId: true, quantityPacks: true },
  });
  // Dispatched/completed orders ship every line in full, so they never count as pending products.
  const shipped = new Map(orders.filter((o) => o.dispatches).map((o) => [oid.get(o.orderNumber), o]));
  const dispatchRows = itemRows.filter((i) => shipped.has(i.orderId)).map((i) => {
    const o = shipped.get(i.orderId);
    return { orderId: i.orderId, orderItemId: i.id, quantity: i.quantityPacks, status: "DISPATCHED", actorUserId: userIdOf(o.assignedStaffKey), actorRole: "STAFF", createdAt: o.dispatchedAt };
  });
  await tx.orderItemDispatch.createMany({ data: dispatchRows });
  log("orders / items / dispatches", `${orderRows.length} / ${itemRows.length} / ${dispatchRows.length}`);

  await tx.customDiscountRequest.createMany({
    data: discountRequests.map((r) => ({
      dealerId: dealerByKey.get(r.dealerKey).id, staffId: sid.get(r.staffKey), orderId: r.orderRef ? oid.get(r.orderRef.orderNumber) : null, scope: r.scope, status: r.status,
      rsmApprovalStatus: r.rsmApprovalStatus, rsmReviewedByUserId: r.rsmReviewedByKey ? userIdOf(r.rsmReviewedByKey) : null,
      rsmReviewedByName: r.rsmReviewedByKey ? staffName(r.rsmReviewedByKey) : null, rsmReviewedAt: r.rsmReviewedAt,
      nsmApprovalStatus: r.nsmApprovalStatus, nsmReviewedByUserId: r.nsmApprovalStatus ? nsm.userId : null, nsmReviewedByName: r.nsmApprovalStatus ? nsm.name : null,
      nsmReviewedAt: r.nsmReviewedAt, nsmNote: r.nsmNote,
      currentDiscountPercent: r.currentDiscountPercent, requestedDiscountPercent: r.requestedDiscountPercent, requestedOrderDiscountPercent: r.requestedOrderDiscountPercent,
      grossAmountPaise: r.grossAmountPaise, requestedDiscountAmountPaise: r.requestedDiscountAmountPaise, requestedNetPayableAmountPaise: r.requestedNetPayableAmountPaise,
      orderSnapshot: r.orderSnapshot, adminNote: r.adminNote,
      reviewedByUserId: r.status === "APPROVED" ? admin.id : r.status === "REJECTED" ? nsm.userId : null, reviewedAt: r.reviewedAt, createdAt: r.createdAt,
    })),
  });
  log("discount requests", discountRequests.length);

  const bills = await tx.ledgerBill.createManyAndReturn({
    data: ledgerBills.map((b) => ({ dealerId: dealerByKey.get(b.dealerKey).id, orderId: oid.get(b.orderNumber), orderNumber: b.orderNumber, billNumber: b.billNumber,
      billAmountPaise: b.billAmountPaise, gstPercent: b.gstPercent, billDate: b.billDate, paidAmountPaise: b.paidAmountPaise, lastPaymentDate: b.lastPaymentDate, createdAt: b.billDate })),
    select: { id: true, billNumber: true },
  });
  const billId = new Map(bills.map((b) => [b.billNumber, b.id]));
  // A ledger payment as recordLedgerPayment writes it for a credit-terms dealer: record-only CREDIT on an INACTIVE wallet.
  const wallets = await tx.dealerWallet.createManyAndReturn({
    data: [...new Set(payments.map((p) => p.dealerKey))].map((k) => ({ dealerId: dealerByKey.get(k).id, status: "INACTIVE" })),
    select: { id: true, dealerId: true },
  });
  const walletOf = new Map(wallets.map((w) => [w.dealerId, w.id]));
  const acct = accountants[0];
  await tx.walletTransaction.createMany({
    data: payments.map((p, i) => {
      const dealerId = dealerByKey.get(p.dealerKey).id;
      return {
        dealerId, walletId: walletOf.get(dealerId), type: "CREDIT", amountPaise: p.amountPaise, balanceBeforePaise: 0n, balanceAfterPaise: 0n,
        idempotencyKey: `dummy-seed:payment:${i + 1}`, reference: p.billRef.orderNumber, note: `Payment received - ${p.paymentMode}`, createdAt: p.paidOn,
        metadata: { ledgerPayment: true, billId: billId.get(p.billRef.billNumber).toString(), orderNumber: p.billRef.orderNumber, paymentMode: p.paymentMode,
          paymentDate: istDate(p.paidOn), creditNote: false, actorUserId: acct.userId.toString(), actorRole: "ACCOUNTANT", actorName: acct.name },
      };
    }),
  });
  log("ledger bills / payments", `${bills.length} / ${payments.length}`);

  for (const r of dealerRequests) {
    const smId = String(sid.get(r.submittedByKey)); // a staff actor's actorId is its staff profile id
    const snapshot = { ...r.formSnapshot, password: randomBytes(18).toString("base64url"), assignedStaffIds: [smId], rsmUserId: String(userIdOf(r.rsmKey)) };
    const identity = [smId, snapshot.dealerCode, snapshot.username, snapshot.email].join("::").toLowerCase(); // buildDealerRequestIdentityKey
    const row = await tx.dealerRequest.create({ data: {
      requestIdentityKey: identity, openRequestKey: r.status === "rejected" ? null : identity, status: r.status,
      dealerName: r.dealerName, dealerCode: r.dealerCode, city: r.city, contactEmail: r.contactEmail, contactPhone: r.contactPhone,
      assignedStaffIds: [smId], assignedStaffNames: r.assignedStaffNames, region: r.region, rsmUserId: userIdOf(r.rsmKey),
      submittedById: smId, submittedByName: r.submittedByName,
      reviewedById: r.status === "rejected" ? String(admin.id) : "", reviewedByName: r.status === "rejected" ? adminName : "",
      rejectionReason: r.rejectionReason, lastRejectionReason: r.rejectionReason, formSnapshot: snapshot,
      submittedAt: r.submittedAt, reviewedAt: r.reviewedAt, rejectedAt: r.rejectedAt, createdAt: r.submittedAt,
    } });
    await tx.dealerRequest.update({ where: { id: row.id }, data: { requestReference: `DLR-${row.id.toString().slice(-8).toUpperCase()}` } });
  }
  log("dealer requests", dealerRequests.length);

  await tx.formSubmission.createMany({
    data: forms.map((f) => ({ leadNo: f.leadNo, products: f.products, customerDetails: f.customerDetails, syringeFilter: f.syringeFilter ?? undefined, capsule: f.capsule ?? undefined,
      commercialInfo: f.commercialInfo, companyName: f.companyName, submittedByUserId: userIdOf(f.submittedByKey), submittedByName: f.submittedByName,
      submittedByRole: f.submittedByRole, visitedDate: f.visitedDate, submittedAt: f.submittedAt, createdAt: f.submittedAt })),
  });
  log("forms", forms.length);

  // Counters past the numbers used here, so the next real order / lead never collides.
  const bump = async (model, where, used) => {
    const row = await tx[model].findUnique({ where });
    const lastValue = BigInt(Math.max(Number(row?.lastValue ?? 0), used));
    await tx[model].upsert({ where, create: { ...where, lastValue }, update: { lastValue } });
    log(`${model} ${Object.values(where)[0]}`, lastValue);
  };
  for (const [year, list] of Object.entries(groupBy(orders, (o) => istDate(o.orderDate).slice(0, 4)))) await bump("orderSequence", { year: Number(year) }, list.length);
  await bump("formLeadSequence", { id: "leadNo" }, forms.length);
}

async function removeDummy(tx) {
  const userIds = (await tx.user.findMany({ where: { normalizedEmail: { endsWith: "@example.com" } }, select: { id: true } })).map((u) => u.id);
  const dealerIds = (await tx.dealerProfile.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((d) => d.id);
  const staffIds = (await tx.staffProfile.findMany({ where: { userId: { in: userIds } }, select: { id: true } })).map((s) => s.id);
  const byDealer = { where: { dealerId: { in: dealerIds } } };
  const counts = {};
  const del = async (model, args) => { counts[model] = (await tx[model].deleteMany(args)).count; };
  // ponytail: covers what --commit writes; rows added later through the UI on dummy dealers (notes, invoices, shipments…)
  // make a Restrict FK fail, and the whole transaction rolls back — extend this list when that happens.
  await del("walletTransaction", byDealer);
  await del("dealerWallet", byDealer);
  await del("ledgerBill", byDealer);
  await del("customDiscountRequest", byDealer);
  await del("order", byDealer); // items and dispatches cascade
  await del("dealerStaffAssignment", byDealer);
  await del("dealerProfile", { where: { id: { in: dealerIds } } });
  await del("formSubmission", { where: { submittedByUserId: { in: userIds } } });
  await del("dealerRequest", { where: { submittedById: { in: staffIds.map(String) } } });
  await tx.staffProfile.updateMany({ where: { id: { in: staffIds } }, data: { parentRsmId: null, parentAsmId: null } });
  await del("staffProfile", { where: { id: { in: staffIds } } }); // rsm links cascade
  await del("accountantProfile", { where: { userId: { in: userIds } } });
  await del("adminProfile", { where: { userId: { in: userIds } } });
  await del("authSession", { where: { userId: { in: userIds } } });
  await del("user", { where: { id: { in: userIds } } });
  await del("productVariant", { where: { sku: { startsWith: "DM-" } } });
  await del("product", { where: { productCode: { startsWith: "DM-" } } });
  await del("productCategory", { where: { slug: { startsWith: "dm-" } } });
  console.table(counts);
}
