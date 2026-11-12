import assert from "node:assert/strict";
import test from "node:test";

const importer = await import("../../scripts/legacy-order-importer.mjs");

test("legacy order header maps PHP fields to PostgreSQL order fields", () => {
  const mapped = importer.buildOrderData({
    order_id: "3862",
    order_number: "DS/PHP/3862",
    order_dealer: "226",
    assignedstaff: "53",
    orderdata_datetime: "2024-01-02 03:04:05",
    ship_to: "Branch warehouse",
    ref_no: "REF-1",
    order_status: "approved",
    accept_order: "1",
    mtstatus: "InProcess",
    order_amount: "100.50",
    order_discount: "10.25",
    finalPayableAmount: "90.25",
    notes: "legacy note",
  }, 226n, 53n);

  assert.equal(mapped.legacyPhpId, "3862");
  assert.equal(mapped.orderNumber, "DS/PHP/3862");
  assert.equal(mapped.dealerId, 226n);
  assert.equal(mapped.assignedStaffId, 53n);
  assert.equal(mapped.shipTo, "Branch warehouse");
  assert.equal(mapped.refNo, "REF-1");
  assert.equal(mapped.status, "ACCEPTED");
  assert.equal(mapped.acceptanceStatus, "ACCEPTED");
  assert.equal(mapped.fulfilmentStatus, "IN_PROCESS");
  assert.equal(mapped.grossAmountPaise, 10050n);
  assert.equal(mapped.totalDiscountAmountPaise, 1025n);
  assert.equal(mapped.finalPayableAmountPaise, 9025n);
});

test("legacy item mapping preserves snapshot fields without requiring product variant", () => {
  const mapped = importer.buildItemData({
    orderdata_id: "9001",
    productname: "Beaker",
    catNo: "BK-100",
    sku: "SKU-BK",
    qty: "2",
    pack_size: "6",
    unitPrice: "10",
    order_amount: "120",
    discount_amount: "20",
    finalAmount: "100",
    remarks: "fragile",
    priority: "1",
  }, "3862", 0n);

  assert.equal(mapped.legacyPhpOrderItemId, "9001");
  assert.equal(mapped.productId, null);
  assert.equal(mapped.productVariantId, null);
  assert.equal(mapped.productNameSnapshot, "Beaker");
  assert.equal(mapped.catalogueNumberSnapshot, "BK-100");
  assert.equal(mapped.skuSnapshot, "SKU-BK");
  assert.equal(mapped.quantityPacks, 2);
  assert.equal(mapped.packSize, 6);
  assert.equal(mapped.totalPieces, 12);
  assert.equal(mapped.listPriceTotalPaise, 12000n);
  assert.equal(mapped.finalAmountPaise, 10000n);
  assert.equal(mapped.isPriority, true);
});

test("importOrder skips existing legacy orders before writing items", async () => {
  const calls = [];
  const prisma = {
    order: {
      findFirst: async () => ({ id: 1n, items: [{ id: 2n }] }),
    },
    dealerProfile: {
      findMany: async () => { calls.push("dealerProfile.findMany"); return []; },
    },
  };
  const result = await importer.importOrder({
    prisma,
    backendUrl: "http://legacy.test",
    header: { order_id: "3862", order_number: "DS/PHP/3862" },
    dryRun: true,
  });
  assert.equal(result.action, "skipped-existing");
  assert.deepEqual(calls, []);
});

test("unresolved dealer is reported instead of attached to another profile", async () => {
  const prisma = {
    order: {
      findFirst: async () => null,
    },
    dealerProfile: {
      findMany: async () => [{ id: 999n, dealerCode: "9999", businessName: "Wrong Dealer" }],
    },
    staffProfile: {
      findMany: async () => [],
    },
  };
  const result = await importer.importOrder({
    prisma,
    backendUrl: "http://legacy.test",
    header: { order_id: "3862", order_dealer: "226" },
    dryRun: true,
  });
  assert.equal(result.action, "unresolved-dealer");
  assert.equal(result.legacyDealerId, "226");
});

test("legacy parser accepts PHP warning HTML before JSON", () => {
  const parsed = importer.parsePossiblyNoisyJson('<div>PHP Warning</div>{"msg":"Success","data":[{"order_id":"9"}]}');
  assert.equal(parsed.msg, "Success");
  assert.equal(parsed.data[0].order_id, "9");
});

test("legacy item mapping supports live orderdata fields", () => {
  const mapped = importer.buildItemData({
    product_name: "Measuring Cylinders",
    product_price: "18",
    orderdata_id: "47",
    orderdata_cat_no: "662/1",
    orderdata_item_quantity: "12",
    orderdata_price: "269",
    orderdata_discount: "1614",
    orderdata_afterDisPrice: "1614",
    orderdata_totalprice: "3228",
    remarks: "Cat. No: 662/1",
    discount: "50",
  }, "9", 0n);

  assert.equal(mapped.productNameSnapshot, "Measuring Cylinders");
  assert.equal(mapped.catalogueNumberSnapshot, "662/1");
  assert.equal(mapped.quantityPacks, 12);
  assert.equal(mapped.packSize, 1);
  assert.equal(mapped.totalPieces, 12);
  assert.equal(mapped.packPricePaise, 26900n);
  assert.equal(mapped.listPriceTotalPaise, 322800n);
  assert.equal(mapped.discountAmountPaise, 161400n);
  assert.equal(mapped.finalAmountPaise, 161400n);
  assert.equal(mapped.discountPercent, "50.0000");
});
