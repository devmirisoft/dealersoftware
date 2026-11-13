import "server-only";

import { prisma } from "@/server/db/prisma";
import { listSalesRegions } from "@/server/sales-region-states";
import type {
  AdminDashboardResult,
  AdminDashboardTopDealer,
  SalesGranularity,
  SalesRegionKey,
} from "./admin-dashboard.types";

const TOP_DEALER_LIMIT = 10;
const TOP_REGION_DEALER_LIMIT = 5;
const SALES_GRANULARITIES: SalesGranularity[] = ["day", "month", "quarter", "half", "year"];
const DEFAULT_GRANULARITY: SalesGranularity = "month";

type RankedDealer = AdminDashboardTopDealer & {
  region: SalesRegionKey | null;
};

function monthKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function normalizeGranularity(value: unknown): SalesGranularity {
  const candidate = String(value ?? "").trim().toLowerCase();
  return SALES_GRANULARITIES.includes(candidate as SalesGranularity)
    ? (candidate as SalesGranularity)
    : DEFAULT_GRANULARITY;
}

/**
 * Bucket key for a date at the requested granularity. Keys are chosen so that
 * a plain lexicographic sort is also chronological.
 */
export function periodKey(date: Date, granularity: SalesGranularity) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  switch (granularity) {
    case "day":
      return `${year}-${String(month).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
    case "quarter":
      return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
    case "half":
      return `${year}-H${month <= 6 ? 1 : 2}`;
    case "year":
      return `${year}`;
    case "month":
    default:
      return monthKey(date);
  }
}

function paiseToRupeeString(value: bigint | number | null | undefined) {
  const paise = typeof value === "bigint" ? value : BigInt(Math.trunc(Number(value ?? 0)));
  return (paise / BigInt(100)).toString();
}

function createEmptyRegionalTotals(regions: SalesRegionKey[]) {
  return Object.fromEntries(regions.map((region) => [region, BigInt(0)])) as Record<SalesRegionKey, bigint>;
}

function stripRegion(dealer: RankedDealer): AdminDashboardTopDealer {
  return {
    dealerId: dealer.dealerId,
    dealerName: dealer.dealerName,
    total: dealer.total,
  };
}

export async function getPostgresAdminDashboard(
  options: { regionalGranularity?: SalesGranularity | string } = {},
): Promise<AdminDashboardResult> {
  const regionalGranularity = normalizeGranularity(options.regionalGranularity);
  const [regions, dealerCount, orderCount, ordersForRegionalTotals, dealerSalesGroups] = await Promise.all([
    listSalesRegions(prisma),
    prisma.dealerProfile.count(),
    prisma.order.count(),
    prisma.order.findMany({
      select: {
        orderDate: true,
        finalPayableAmountPaise: true,
        dealer: {
          select: {
            region: true,
          },
        },
      },
      orderBy: {
        orderDate: "asc",
      },
    }),
    prisma.order.groupBy({
      by: ["dealerId"],
      _sum: {
        finalPayableAmountPaise: true,
      },
      orderBy: {
        _sum: {
          finalPayableAmountPaise: "desc",
        },
      },
    }),
  ]);

  const SALES_REGIONS = regions.map((region) => region.value);
  const isSalesRegion = (value: unknown): value is SalesRegionKey => typeof value === "string" && SALES_REGIONS.includes(value);
  const monthlyTotals = new Map<string, bigint>();
  const regionalMonthlyTotals = new Map<string, Record<SalesRegionKey, bigint>>();

  for (const order of ordersForRegionalTotals) {
    const key = monthKey(order.orderDate);
    monthlyTotals.set(key, (monthlyTotals.get(key) ?? BigInt(0)) + order.finalPayableAmountPaise);

    const regionalKey = periodKey(order.orderDate, regionalGranularity);
    const bucket = regionalMonthlyTotals.get(regionalKey) ?? createEmptyRegionalTotals(SALES_REGIONS);
    const region = order.dealer?.region;
    if (isSalesRegion(region)) bucket[region] += order.finalPayableAmountPaise;
    regionalMonthlyTotals.set(regionalKey, bucket);
  }

  const dealerIds = dealerSalesGroups.map((group) => group.dealerId);
  const dealers = await prisma.dealerProfile.findMany({
    where: {
      id: {
        in: dealerIds,
      },
    },
    select: {
      id: true,
      businessName: true,
      dealerCode: true,
      region: true,
    },
  });
  const dealerById = new Map(dealers.map((dealer) => [dealer.id.toString(), dealer]));

  const rankedDealers: RankedDealer[] = dealerSalesGroups.map((group) => {
    const dealer = dealerById.get(group.dealerId.toString());
    return {
      dealerId: group.dealerId.toString(),
      dealerName: dealer?.businessName || dealer?.dealerCode || `Dealer ${group.dealerId.toString()}`,
      total: paiseToRupeeString(group._sum?.finalPayableAmountPaise),
      region: isSalesRegion(dealer?.region) ? dealer.region : null,
    };
  });

  const topDealers = rankedDealers.slice(0, TOP_DEALER_LIMIT).map(stripRegion);
  const topDistributorsByRegion = Object.fromEntries(
    SALES_REGIONS.map((region) => [
      region,
      rankedDealers
        .filter((dealer) => dealer.region === region)
        .slice(0, TOP_REGION_DEALER_LIMIT)
        .map(stripRegion),
    ]),
  ) as Record<SalesRegionKey, AdminDashboardTopDealer[]>;

  return {
    summary: {
      dealerCount,
      orderCount,
    },
    monthlyPerformance: Array.from(monthlyTotals.entries()).map(([month, total]) => ({
      month,
      total: paiseToRupeeString(total),
    })),
    regions,
    regionalGranularity,
    regionalPerformance: Array.from(regionalMonthlyTotals.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([period, totals]) => {
        const point = SALES_REGIONS.reduce((acc, region) => {
          acc[region] = paiseToRupeeString(totals[region]);
          return acc;
        }, { month: period, period } as AdminDashboardResult["regionalPerformance"][number]);
        return point;
      }),
    topDealers,
    topDistributorsByRegion,
    warnings: [],
  };
}
