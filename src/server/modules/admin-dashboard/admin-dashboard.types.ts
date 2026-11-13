import type { SalesRegionOption } from "@/lib/salesRegions";

// A sales_regions code; regions are admin-managed.
export type SalesRegionKey = string;

export type SalesGranularity = "day" | "month" | "quarter" | "half" | "year";

export type AdminDashboardMonthlyPerformance = {
  month: string;
  total: string;
};

/**
 * `month` is kept for backwards compatibility and always mirrors `period`.
 * The period key format depends on the requested granularity:
 * day `YYYY-MM-DD`, month `YYYY-MM`, quarter `YYYY-Q1`, half `YYYY-H1`, year `YYYY`.
 */
export type AdminDashboardRegionalPerformance = {
  month: string;
  period: string;
} & Record<SalesRegionKey, string>;

export type AdminDashboardTopDealer = {
  dealerId: string;
  dealerName: string;
  total: string;
};

export type AdminDashboardResult = {
  summary: {
    dealerCount: number;
    orderCount: number;
  };
  monthlyPerformance: AdminDashboardMonthlyPerformance[];
  /** The regions the regional series and top-distributor lists are keyed by. */
  regions: SalesRegionOption[];
  regionalGranularity: SalesGranularity;
  regionalPerformance: AdminDashboardRegionalPerformance[];
  topDealers: AdminDashboardTopDealer[];
  topDistributorsByRegion: Record<SalesRegionKey, AdminDashboardTopDealer[]>;
  warnings: string[];
};
