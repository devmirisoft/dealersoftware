"use client";

import DateInput from "@/components/ui/date-input";
import { formatDisplayOrderNumber } from '@/lib/orderDisplay';
import { formatPeriodLabel } from "@/lib/salesPeriods";
import Link from "next/link";
import { Users, Wallet, Calendar, CalendarCheck, CreditCard, IndianRupee, FileText, ArrowUp, ArrowDown, ArrowRight, ShoppingCart, UserRound, Percent, ChartColumn, Globe, LayoutGrid, MapPin, Trophy, TrendingUp, Download } from 'lucide-react';

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QueryClient,
  QueryClientProvider,
  keepPreviousData,
  useQuery,
  useQueries,
  useInfiniteQuery,
} from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { fetchDealerStatusOverrides, normalizeDealerStatus, type DealerStatusDocument } from "@/lib/dealerStatus";
import PendingProductsPreview from "@/components/dashboard/PendingProductsPreview";
import { refreshCurrentUser } from "@/lib/currentUser";
import { staffRoleBadge } from "@/lib/staffRoleLabel";
import { SegmentedDropdown, type SegItem } from "@/components/SegmentedTabs";


const year = new Date().getFullYear();

type Item = {
  order_id: string;
  total: string;
};

type Dealer = {
  Dealer_Name: string;
  total: string;
};

type SalesRegionKey = "NORTH_1" | "NORTH_2" | "SOUTH_1" | "SOUTH_2" | "WEST_1" | "WEST_2" | "EAST" | "ROM" | "CENTRAL";

type SalesGranularity = "day" | "month" | "quarter" | "half" | "year";

type RegionalSalesPoint = { period: string } & Record<SalesRegionKey, number>;

type RegionalPerformanceEntry = { month: string; period?: string } & Record<SalesRegionKey, string>;

type RegionalDistributor = {
  dealerId?: string;
  dealerName: string;
  total: string;
};

type AdminDashboardApiResponse = {
  success: boolean;
  data?: {
    summary?: {
      dealerCount?: number;
      orderCount?: number;
    };
    monthlyPerformance?: Array<{
      month: string;
      total: string;
    }>;
    topDealers?: Array<{
      dealerId?: string;
      dealerName: string;
      total: string;
    }>;
    regionalGranularity?: SalesGranularity;
    regionalPerformance?: RegionalPerformanceEntry[];
    topDistributorsByRegion?: Partial<Record<SalesRegionKey, Array<{
      dealerId?: string;
      dealerName: string;
      total: string;
    }>>>;
    warnings?: string[];
  };
  message?: string;
};

type AdminStats = {
  dealerCount: number;
  staffCount: number;
  orderCount: number;
  PorderCount: number;
};

type DealerSummary = {
  Dealer_Id: string;
  Dealer_Name: string;
  Dealer_City: string;
  Dealer_Region?: string;
  state?: string;
  Dealer_Number?: string;
  Dealer_Dealercode?: string;
  status: string;
  assignedstaff?: string;
  staffname?: string;
  currentlimit: string;
};

type DealerPaginationResponse = {
  data: DealerSummary[];
  total?: number;
  last_page?: number;
  lastPage?: number;
};

type StaffSummary = {
  staff_roletype: string;
  role?: string;
  sales_region?: string;
};

type DiscountApproval = {
  status: string;
};

type PendingOrderRecord = {
  order_id: string;
  Dealer_Name?: string;
  order_date?: string;
  orderDate?: string;
  order_amount?: string | number;
  total?: string | number;
  outstandingDate?: string;
  order_status?: string;
  accept_order?: string;
};

const SALES_REGIONS: SalesRegionKey[] = ["NORTH_1", "NORTH_2", "SOUTH_1", "SOUTH_2", "WEST_1", "WEST_2", "EAST", "ROM", "CENTRAL"];
const REGION_META: Record<SalesRegionKey, { label: string; color: string; soft: string }> = {
  NORTH_1: { label: "North 1", color: "#4f8fcb", soft: "#dbeafe" },
  NORTH_2: { label: "North 2", color: "#2563eb", soft: "#dbeafe" },
  SOUTH_1: { label: "South 1", color: "#f2cf5b", soft: "#fef3c7" },
  SOUTH_2: { label: "South 2", color: "#d97706", soft: "#fef3c7" },
  WEST_1: { label: "West 1", color: "#c084fc", soft: "#f3e8ff" },
  WEST_2: { label: "West 2", color: "#7c3aed", soft: "#f3e8ff" },
  EAST: { label: "East", color: "#6fd08c", soft: "#dcfce7" },
  ROM: { label: "ROM", color: "#0f766e", soft: "#ccfbf1" },
  CENTRAL: { label: "Central", color: "#f97316", soft: "#ffedd5" },
};

function formatRegionLabel(region: SalesRegionKey) {
  return REGION_META[region].label;
}

const DEFAULT_GRANULARITY: SalesGranularity = "month";

const GRANULARITY_OPTIONS: Array<{ value: SalesGranularity; label: string; sub: string }> = [
  { value: "day", label: "Day", sub: "Daily net sales by regional sales manager zone" },
  { value: "month", label: "Month", sub: "Monthly net sales by regional sales manager zone" },
  { value: "quarter", label: "Quarter", sub: "Quarterly net sales by regional sales manager zone" },
  { value: "half", label: "Half Year", sub: "Half-yearly net sales by regional sales manager zone" },
  { value: "year", label: "Year", sub: "Yearly net sales by regional sales manager zone" },
];

function mapRegionalPerformance(entries: RegionalPerformanceEntry[] | undefined): RegionalSalesPoint[] {
  return (entries ?? []).map((entry) => ({
    period: entry.period ?? entry.month,
    ...Object.fromEntries(SALES_REGIONS.map((region) => [region, Number((entry as Record<string, unknown>)[region] ?? 0)])),
  }) as RegionalSalesPoint);
}

function createEmptyRegionalDistributorMap(): Record<SalesRegionKey, RegionalDistributor[]> {
  return SALES_REGIONS.reduce((acc, region) => {
    acc[region] = [];
    return acc;
  }, {} as Record<SalesRegionKey, RegionalDistributor[]>);
}

type AsmOption = { id: string; name: string; assigned_states?: string[]; role?: string };

/** Sales filters cascade: an ASM belongs to a region, a city to an ASM's states. */

type SaleSummaryResponse = {
  data: {
    /** Oldest accepted order in the current scope, or null when there is none. */
    earliest: string | null;
    from: string | null;
    to: string | null;
    granularity: SalesGranularity;
    orderCount: number;
    total: number;
    /** Ledger bills the accountant added, and the payments recorded against them, in scope. */
    billed: number;
    paid: number;
    series: Array<{ period: string; total: number }>;
  };
};

const ASM_PAGE_SIZE = 20;

type FinPeriod = "month" | "quarter" | "year" | "all";
const FIN_PERIODS: Array<{ value: FinPeriod; label: string; previous: string }> = [
  { value: "month", label: "This Month", previous: "last month" },
  { value: "quarter", label: "This Quarter", previous: "last quarter" },
  { value: "year", label: "This Year", previous: "last year" },
  { value: "all", label: "All Time", previous: "" },
];
const FIN_PERIOD_MONTHS = { month: 1, quarter: 3, year: 12 } as const;

/** Local calendar day; toISOString is UTC and would put the 1st of a month in the previous one in IST. */
function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The period to date, `back` periods ago. A previous period stops on the same day, so the comparison is like for like. */
function finRange(period: Exclude<FinPeriod, "all">, back: number) {
  const now = new Date();
  const shift = FIN_PERIOD_MONTHS[period] * back;
  const startMonth = period === "month" ? now.getMonth() : period === "quarter" ? now.getMonth() - (now.getMonth() % 3) : 0;
  const endMonth = now.getMonth() - shift;
  const lastDay = new Date(now.getFullYear(), endMonth + 1, 0).getDate();
  return {
    from: localDay(new Date(now.getFullYear(), startMonth - shift, 1)),
    to: localDay(new Date(now.getFullYear(), endMonth, Math.min(now.getDate(), lastDay))),
  };
}

function inr(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

/** Axis ticks: 2Cr, 50L, 75K. */
function shortInr(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1e7) return `${+(value / 1e7).toFixed(1)}Cr`;
  if (abs >= 1e5) return `${+(value / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${+(value / 1e3).toFixed(1)}K`;
  return String(value);
}

function pctChange(current: number, previous: number | undefined) {
  return previous ? ((current - previous) / previous) * 100 : null;
}

function FinDelta({ change, vs, unit = "%" }: { change: number | null; vs: string; unit?: string }) {
  if (change === null || !vs) return null;
  const up = change >= 0;
  return (
    <span className={`fin-delta ${up ? "up" : "down"}`}>
      {up ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
      <b>{up ? "+" : ""}{change.toFixed(1)}{unit}</b>
      <span className="fin-vs">vs. {vs}</span>
    </span>
  );
}

const dashboardQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 2,
    },
  },
});

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  return parseJsonResponse<T>(res);
}

async function fetchAllDistributors(): Promise<DealerPaginationResponse> {
  const data: DealerSummary[] = [];
  const seenDealerIds = new Set<string>();
  let reportedTotal = 0;
  let reportedLastPage = 0;

  for (let page = 1; page <= 500; page += 1) {
    const response = await fetchJson<DealerPaginationResponse>(
      `/api/admin/dealers?page=${page}&limit=100&search=`,
    );
    const rows = Array.isArray(response.data) ? response.data : [];
    let newRows = 0;

    for (const dealer of rows) {
      const dealerId = String(dealer.Dealer_Id ?? "").trim();
      if (!dealerId || seenDealerIds.has(dealerId)) continue;
      seenDealerIds.add(dealerId);
      data.push(dealer);
      newRows += 1;
    }

    reportedTotal = Math.max(reportedTotal, Number(response.total) || 0);
    reportedLastPage = Math.max(
      reportedLastPage,
      Number(response.last_page ?? response.lastPage) || 0,
    );

    if (
      rows.length === 0 ||
      newRows === 0 ||
      (reportedTotal > 0 && data.length >= reportedTotal) ||
      (reportedLastPage > 0 && page >= reportedLastPage)
    ) {
      break;
    }
  }

  return {
    data,
    total: Math.max(reportedTotal, data.length),
    last_page: reportedLastPage || undefined,
  };
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    // The admin error mapper puts the real cause in error.detail outside prod.
    const detail = (() => { try { return JSON.parse(text)?.error?.detail || JSON.parse(text)?.message; } catch { return null; } })();
    throw new Error(detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`);
  }
  if (/^\s*</.test(text)) throw new Error("Expected JSON but received HTML");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid JSON response");
  }
}

export default function AdminDashboard() {
  return (
    <QueryClientProvider client={dashboardQueryClient}>
      <AdminDashboardInner />
    </QueryClientProvider>
  );
}

function AdminDashboardInner() {
  const router = useRouter();

  const [data, setData] = useState<Item[]>([]);
  const [dealerData, setDealerData] = useState<Dealer[]>([]);
  const [regionalSalesData, setRegionalSalesData] = useState<RegionalSalesPoint[]>([]);
  const [regionalTopDistributors, setRegionalTopDistributors] = useState<Record<SalesRegionKey, RegionalDistributor[]>>(createEmptyRegionalDistributorMap);
  const [selectedRegion, setSelectedRegion] = useState<SalesRegionKey>("NORTH_1");
  const [regionalGranularity, setRegionalGranularity] = useState<SalesGranularity>(DEFAULT_GRANULARITY);
  const [regionalSalesLoading, setRegionalSalesLoading] = useState(false);
  const [adminData, setAdminData] = useState<AdminStats>({
    dealerCount: 0,
    staffCount: 0,
    orderCount: 0,
    PorderCount: 0,
  });
  const [loading, setLoading] = useState(true);
  // Sales overview opens on this month; picking dates by hand switches it to a custom range.
  const [salePeriod, setSalePeriod] = useState<FinPeriod | "custom">("month");
  const [saleFrom, setSaleFrom] = useState(() => finRange("month", 0).from);
  const [saleTo, setSaleTo] = useState(() => finRange("month", 0).to);
  // Local day, so the default "this month" range never ends past the calendar's max.
  const today = useMemo(() => localDay(new Date()), []);
  const [saleRegion, setSaleRegion] = useState("");
  const [saleAsm, setSaleAsm] = useState("");
  const [saleCity, setSaleCity] = useState("");

  // Fetch dashboard data
  useEffect(() => {
    async function fetchData() {
      try {
        const [activeOrdersRes, activePendingRes, dashboardRes] = await Promise.all([
          fetch(`/api/admin/orders?page=1&limit=100&search=`, { credentials: "include" }),
          fetch(`/api/admin/orders?page=1&limit=1&status=AWAITING_ACCEPTANCE`, { credentials: "include" }),
          fetch(`/api/admin/dashboard?granularity=${DEFAULT_GRANULARITY}`, { credentials: "include" }),
        ]);

        if (dashboardRes.status === 401) {
          void refreshCurrentUser();
          router.push("/auth/login");
          return;
        }

        if (dashboardRes.status === 403) {
          throw new Error("Forbidden");
        }

        const activeOrdersJson = await parseJsonResponse<any>(activeOrdersRes);
        const activePendingJson = await parseJsonResponse<any>(activePendingRes);
        const dashboardJson = await parseJsonResponse<AdminDashboardApiResponse>(dashboardRes);

        const activeOrders = (activeOrdersJson.data || []) as Array<Record<string, unknown>>;
        setData(activeOrders
          .map((order) => ({ order_id: String(order.orderNumber || order.id || ""), total: String(order.finalPayableAmountPaise ?? 0) }))
          .sort((left, right) => Number(right.total) - Number(left.total))
          .slice(0, 10));
        setDealerData((dashboardJson.data?.topDealers ?? []).map((dealer) => ({
          Dealer_Name: dealer.dealerName,
          total: dealer.total,
        }) as Dealer));
        setRegionalSalesData(mapRegionalPerformance(dashboardJson.data?.regionalPerformance));
        const distributorsByRegion = createEmptyRegionalDistributorMap();
        for (const region of SALES_REGIONS) {
          distributorsByRegion[region] = (dashboardJson.data?.topDistributorsByRegion?.[region] ?? []).map((dealer) => ({
            dealerId: dealer.dealerId,
            dealerName: dealer.dealerName,
            total: dealer.total,
          }));
        }
        setRegionalTopDistributors(distributorsByRegion);

        setAdminData({
          dealerCount: Number(dashboardJson.data?.summary?.dealerCount ?? 0),
          staffCount: 0,
          orderCount: Number(dashboardJson.data?.summary?.orderCount ?? activeOrdersJson.total ?? activeOrders.length),
          PorderCount: Number(activePendingJson.total ?? 0),
        });
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [router]);

  // Re-fetch only the regional series when the granularity filter changes.
  // Skipped on first render because the initial load already covers the default granularity.
  const initialGranularityLoad = useRef(true);
  useEffect(() => {
    if (initialGranularityLoad.current) {
      initialGranularityLoad.current = false;
      return;
    }

    const controller = new AbortController();
    setRegionalSalesLoading(true);

    (async () => {
      try {
        const res = await fetch(`/api/admin/dashboard?granularity=${regionalGranularity}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const json = await parseJsonResponse<AdminDashboardApiResponse>(res);
        setRegionalSalesData(mapRegionalPerformance(json.data?.regionalPerformance));
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        console.error("Error fetching regional sales:", error);
      } finally {
        if (!controller.signal.aborted) setRegionalSalesLoading(false);
      }
    })();

    return () => controller.abort();
  }, [regionalGranularity]);

  const [
    outstandingOrdersQ,
    discountApprovalsQ,
    dealersQ,
    staffQ,
  ] = useQueries({
    queries: [
      {
        queryKey: ["adminSidebarSummary", "outstandingOrders"],
        queryFn: async () => {
          const result = await fetchJson<{ data: PendingOrderRecord[]; total?: number }>(`/api/admin/orders?page=1&limit=100&status=AWAITING_ACCEPTANCE`);
          return result;
        },
      },
      {
        queryKey: ["adminSidebarSummary", "discountApprovals"],
        queryFn: () => fetchJson<{ data: DiscountApproval[] }>("/api/custom-discount-requests?limit=200"),
      },
      {
        queryKey: ["adminSidebarSummary", "dealers"],
        queryFn: fetchAllDistributors,
      },
      {
        queryKey: ["adminSidebarSummary", "staff"],
        queryFn: () => fetchJson<{ data: StaffSummary[]; count?: number }>(`/api/admin/staff?page=1&limit=100&search=`),
      },
    ],
  });

  const { data: statusOverrides } = useQuery<DealerStatusDocument[]>({
    queryKey: ["adminSidebarSummary", "dealerStatuses"],
    queryFn: fetchDealerStatusOverrides,
    staleTime: 5 * 60 * 1000,
  });

  const summaryLoading = [outstandingOrdersQ, discountApprovalsQ, dealersQ, staffQ].some(q => q.isLoading);
  const summaryError = [outstandingOrdersQ, discountApprovalsQ, dealersQ, staffQ].find(q => q.isError);
  const retrySummary = () => {
    outstandingOrdersQ.refetch();
    discountApprovalsQ.refetch();
    dealersQ.refetch();
    staffQ.refetch();
  };

  // ASMs are paged into the dropdown as it scrolls rather than fetched all at once.
  const asmQ = useInfiniteQuery({
    queryKey: ["adminDashboardAsms", saleRegion],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchJson<{ data: AsmOption[]; total?: number }>(`/api/admin/staff?role=ASM&region=${saleRegion}&page=${pageParam}&limit=${ASM_PAGE_SIZE}&search=`),
    getNextPageParam: (lastPage, pages) => (pages.flatMap((page) => page.data ?? []).length < (lastPage.total ?? 0) ? pages.length + 1 : undefined),
    staleTime: 5 * 60 * 1000,
  });

  const asmOptions = useMemo(() => (asmQ.data?.pages ?? []).flatMap((page) => page.data ?? []), [asmQ.data]);
  const asmStates = useMemo(
    () => asmOptions.find((asm) => asm.id === saleAsm)?.assigned_states ?? [],
    [asmOptions, saleAsm],
  );

  const saleQuery = `from=${saleFrom}&to=${saleTo}&region=${saleRegion}&asm=${saleAsm}&city=${encodeURIComponent(saleCity)}`;

  const saleSummaryQ = useQuery<SaleSummaryResponse>({
    queryKey: ["adminSaleSummary", saleQuery],
    queryFn: () => fetchJson<SaleSummaryResponse>(`/api/admin/sales-summary?${saleQuery}`),
    placeholderData: keepPreviousData,
  });

  // The same span one period back, with the same filters, for the "vs last month" delta.
  const salePrevious = salePeriod === "all" || salePeriod === "custom" ? null : finRange(salePeriod, 1);
  const salePrevQ = useQuery<SaleSummaryResponse>({
    queryKey: ["adminSaleSummary", "previous", salePrevious?.from, salePrevious?.to, saleRegion, saleAsm, saleCity],
    queryFn: () => fetchJson<SaleSummaryResponse>(`/api/admin/sales-summary?from=${salePrevious?.from}&to=${salePrevious?.to}&region=${saleRegion}&asm=${saleAsm}&city=${encodeURIComponent(saleCity)}`),
    enabled: salePrevious !== null,
  });
  const saleChange = salePrevious && !saleSummaryQ.isPlaceholderData
    ? pctChange(saleSummaryQ.data?.data.total ?? 0, salePrevQ.data?.data.total)
    : null;
  const saleVs = FIN_PERIODS.find((period) => period.value === salePeriod)?.previous ?? "";
  const pickSalePeriod = (next: string) => {
    const period = next as FinPeriod | "custom";
    setSalePeriod(period);
    if (period === "custom") return;
    const range = period === "all" ? { from: "", to: "" } : finRange(period, 0);
    setSaleFrom(range.from);
    setSaleTo(range.to);
  };

  // Financial overview: the chosen period to date, and the same span one period back for the deltas.
  const [finPeriod, setFinPeriod] = useState<FinPeriod>("month");
  const finCurrent = finPeriod === "all" ? { from: "", to: "" } : finRange(finPeriod, 0);
  const finPrevious = finPeriod === "all" ? null : finRange(finPeriod, 1);
  const finQ = useQuery<SaleSummaryResponse>({
    queryKey: ["adminFinance", finCurrent.from, finCurrent.to],
    queryFn: () => fetchJson<SaleSummaryResponse>(`/api/admin/sales-summary?from=${finCurrent.from}&to=${finCurrent.to}`),
    placeholderData: keepPreviousData,
  });
  const finPrevQ = useQuery<SaleSummaryResponse>({
    queryKey: ["adminFinance", finPrevious?.from, finPrevious?.to],
    queryFn: () => fetchJson<SaleSummaryResponse>(`/api/admin/sales-summary?from=${finPrevious?.from}&to=${finPrevious?.to}`),
    enabled: finPrevious !== null,
  });
  const fin = finQ.data?.data;
  const finPrev = finPrevious ? finPrevQ.data?.data : undefined;
  const finVs = FIN_PERIODS.find((period) => period.value === finPeriod)?.previous ?? "";
  const finShow = (value: number | undefined) => (finQ.isPending ? "—" : inr(value ?? 0));
  const finCollected = fin?.billed ? (fin.paid / fin.billed) * 100 : 0;
  const finPrevCollected = finPrev?.billed ? (finPrev.paid / finPrev.billed) * 100 : null;
  const finTiles = [
    { label: "Total Billed", value: finShow(fin?.billed), change: pctChange(fin?.billed ?? 0, finPrev?.billed), unit: "%", icon: <IndianRupee size={16} />, tone: "green" },
    { label: "Total Booking", value: finShow(fin?.total), change: pctChange(fin?.total ?? 0, finPrev?.total), unit: "%", icon: <CalendarCheck size={16} />, tone: "purple" },
    { label: "Total Payment", value: finShow(fin?.paid), change: pctChange(fin?.paid ?? 0, finPrev?.paid), unit: "%", icon: <CreditCard size={16} />, tone: "blue" },
    // Share of the billed amount already paid; its change is in percentage points.
    { label: "Payment / Billed", value: finQ.isPending ? "—" : `${finCollected.toFixed(1)}%`, change: finPrevCollected === null ? null : finCollected - finPrevCollected, unit: " pts", icon: <FileText size={16} />, tone: "orange" },
  ];

  // The oldest accepted order in the current scope: how far back the calendar goes.
  const saleEarliest = saleSummaryQ.data?.data.earliest ?? undefined;

  const saleSeries = useMemo(() => {
    const granularity = saleSummaryQ.data?.data.granularity ?? "day";
    return (saleSummaryQ.data?.data.series ?? []).map((point) => ({
      label: formatPeriodLabel(point.period, granularity),
      total: point.total,
    }));
  }, [saleSummaryQ.data]);

  const saleRegionItems: SegItem[] = useMemo(() => [
    { value: "", label: "All regions", tone: "neutral" as const },
    ...SALES_REGIONS.map((region) => ({ value: region, label: formatRegionLabel(region), tone: "emerald" as const })),
  ], []);

  const asmItems: SegItem[] = useMemo(() => [
    { value: "", label: "All ASMs", tone: "neutral" as const },
    ...asmOptions.map((asm) => {
      const states = (asm.assigned_states ?? []).join(", ");
      return {
        value: asm.id,
        label: asm.name || `ASM ${asm.id}`,
        sublabel: states || "No states assigned",
        tone: "amber" as const,
        title: states,
      };
    }),
  ], [asmOptions]);

  const outstandingOrders = (outstandingOrdersQ.data?.data ?? []).filter((o) => o.order_status === "0" || o.accept_order === "0");
  const totalPendingOrders = outstandingOrdersQ.data?.total ?? outstandingOrders.length;
  const pendingApprovals = (discountApprovalsQ.data?.data ?? []).filter(r => r.status === "pending").length;
  const statusMap = useMemo(() => new Map(
    (statusOverrides ?? []).map((row) => [String(row.dealerId), normalizeDealerStatus(row.status)])
  ), [statusOverrides]);
  const dealerRows = useMemo(() => (dealersQ.data?.data ?? []).map((dealer) => ({
    ...dealer,
    status: statusMap.get(String(dealer.Dealer_Id)) ?? normalizeDealerStatus(dealer.status),
  })), [dealersQ.data?.data, statusMap]);

  // Cities come from the dealers already loaded for the tiles, narrowed to whichever
  // region and ASM territory is selected.
  const saleCityOptions = useMemo(() => {
    const inScope = dealerRows.filter((dealer) => {
      if (saleRegion && dealer.Dealer_Region !== saleRegion) return false;
      if (saleAsm && !asmStates.some((state) => state.toLowerCase() === String(dealer.state ?? "").toLowerCase())) return false;
      return true;
    });
    return [...new Set(inScope.map((dealer) => (dealer.Dealer_City ?? "").trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
  }, [dealerRows, saleRegion, saleAsm, asmStates]);

  const saleCityItems: SegItem[] = useMemo(() => [
    { value: "", label: "All cities", tone: "neutral" as const },
    ...saleCityOptions.map((city) => ({ value: city, label: city, tone: "emerald" as const })),
  ], [saleCityOptions]);

  const activeDealers = dealerRows.filter(d => normalizeDealerStatus(d.status) === "active").length;
  const inactiveDealers = dealerRows.filter(d => normalizeDealerStatus(d.status) !== "active").length;
  const staffRows = staffQ.data?.data ?? [];
  const roleCounts = staffRows.reduce((acc, s) => {
    acc[s.staff_roletype || "unknown"] = (acc[s.staff_roletype || "unknown"] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  // Role-wise counts keyed by label (e.g. "West RSM", "ASM", "Sales Manager").
  const staffByRole = Object.entries(staffRows.reduce((acc, s) => {
    const label = staffRoleBadge({ role: s.role, staffRoleType: s.staff_roletype, salesRegion: s.sales_region }).label;
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>)).sort(([a], [b]) => a.localeCompare(b));
  const totalDistributors = adminData.dealerCount || dealersQ.data?.total || dealerRows.length;
  const regionalLineData = useMemo(() => regionalSalesData.map((point) => ({
    ...point,
    label: formatPeriodLabel(point.period, regionalGranularity),
  })), [regionalSalesData, regionalGranularity]);
  const regionalGranularitySub = GRANULARITY_OPTIONS.find((option) => option.value === regionalGranularity)?.sub
    ?? GRANULARITY_OPTIONS[1].sub;
  const selectedRegionalDistributors = regionalTopDistributors[selectedRegion] ?? [];
  const hasRegionalSales = regionalSalesData.some((point) => SALES_REGIONS.some((region) => point[region] > 0));

  const staffTotal = adminData.staffCount || staffQ.data?.count || staffRows.length;
  const kpis = [
    {
      label: "Pending Orders",
      icon: <ShoppingCart size={24} aria-hidden />,
      value: totalPendingOrders,
      href: "/Pages/Ordermanagement/outstandingorders",
      action: "Review pending orders",
      meta: <span className="status-inline"><span className="status-dot orange" />{totalPendingOrders} awaiting review</span>,
    },
    {
      label: "Total Distributors",
      icon: <Users size={24} aria-hidden />,
      value: totalDistributors,
      href: "/dashboard/admin/dealer/DealerList",
      action: "Open distributor list",
      meta: (
        <>
          <span className="status-inline"><span className="status-dot green" />{activeDealers} active</span>
          <span className="status-inline"><span className="status-dot red" />{inactiveDealers} inactive</span>
        </>
      ),
    },
    {
      label: "Staff",
      icon: <UserRound size={24} aria-hidden />,
      value: staffTotal,
      href: "/dashboard/admin/staff/stafflist",
      action: "View staff list",
      meta: (
        <>
          <span className="status-inline"><span className="status-dot purple" />{roleCounts["1"] ?? 0} sales manager</span>
          <span className="status-inline"><span className="status-dot blue" />{roleCounts["2"] ?? 0} field</span>
        </>
      ),
    },
    {
      label: "Discount Approvals",
      icon: <Percent size={24} aria-hidden />,
      value: pendingApprovals,
      href: "/dashboard/admin/custom-discount-approvals",
      action: "Review discount approvals",
      meta: <span className="status-inline"><span className={`status-dot ${pendingApprovals > 0 ? "orange" : "green"}`} />{pendingApprovals > 0 ? "Needs attention" : "All clear"}</span>,
    },
  ];

  const tooltipStyle = { backgroundColor: "#fff", border: "1px solid #e8ecf4", borderRadius: "12px", boxShadow: "0 10px 30px rgba(15,23,42,.10)", color: "#0f172a", fontSize: "12px" };
  const axisTick = { fontSize: 11, fill: "#94a3b8" };

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; }
        button, input { font: inherit; }

        .root {
          --db-bg: #f4f6fb;
          --db-surface: #ffffff;
          --db-text: #0f172a;
          --db-secondary: #64748b;
          --db-tertiary: #94a3b8;
          --db-line: #e8ecf4;
          --db-navy: #0f1f45;
          --db-brand: #1e3a8a;
          --db-brand-soft: #e8eefb;
          --db-shadow: 0 1px 2px rgba(15,23,42,.04), 0 6px 20px rgba(15,23,42,.05);
          min-height: 100vh;
          background: var(--db-bg);
          color: var(--db-text);
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        .dashboard-shell {
          width: min(100%, 1840px);
          margin: 0 auto;
          padding: 32px 32px 48px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          /* Styles here are px, so the root font-size scale misses them; shrink 25%. */
          zoom: .75;
        }

        .card {
          min-width: 0;
          padding: 22px;
          background: var(--db-surface);
          border: 1px solid var(--db-line);
          border-radius: 12px;
          box-shadow: var(--db-shadow);
        }

        .summary-error {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border: 1px solid #fecaca;
          background: #fff5f5;
          border-radius: 14px;
          color: #b42318;
          font-size: 13px;
        }
        .retry-button { margin-left: auto; border: 0; background: transparent; color: var(--db-brand); cursor: pointer; font-weight: 650; padding: 4px 7px; }

        /* KPI cards: the arrow link's ::after covers the card, so the whole card is the link. */
        .kpi-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px; }
        .kpi { position: relative; display: flex; align-items: flex-start; gap: 16px; transition: transform .18s ease, box-shadow .18s ease; }
        .kpi:hover { transform: translateY(-1px); box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 12px 28px rgba(15,23,42,.08); }
        .icon-tile { display: grid; place-items: center; flex-shrink: 0; width: 54px; height: 54px; border-radius: 10px; background: var(--db-brand-soft); color: var(--db-brand); }
        .kpi-body { flex: 1; min-width: 0; }
        .kpi-label { color: var(--db-secondary); font-size: 14px; font-weight: 600; }
        .kpi-value { margin-top: 6px; font-size: 34px; line-height: 1.1; font-weight: 750; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
        .kpi-meta { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 10px; color: var(--db-secondary); font-size: 12.5px; }
        .kpi-go {
          align-self: flex-end; flex-shrink: 0;
          display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px;
          background: var(--db-brand-soft); color: var(--db-brand);
          transition: background .16s, color .16s;
        }
        .kpi-go::after { content: ""; position: absolute; inset: 0; }
        .kpi:hover .kpi-go { background: var(--db-brand); color: #fff; }
        .kpi-go:focus-visible { outline: 2px solid var(--db-brand); outline-offset: 2px; }

        .status-inline { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
        .status-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--db-tertiary); }
        .status-dot.green { background: #22c55e; }
        .status-dot.orange { background: #f59e0b; }
        .status-dot.red { background: #ef4444; }
        .status-dot.blue { background: #3b82f6; }
        .status-dot.purple { background: #8b5cf6; }

        /* Staff by role: one scrolling row of pills. */
        .staff-roles { display: flex; align-items: center; gap: 14px; padding: 12px 18px; }
        .staff-roles .kpi-label { flex-shrink: 0; }
        .role-pills { display: flex; gap: 10px; overflow-x: auto; scrollbar-width: thin; }
        .role-pill {
          flex-shrink: 0; display: inline-flex; align-items: center; gap: 10px;
          padding: 4px 4px 4px 14px; border-radius: 999px;
          border: 1px solid var(--db-line); background: #f8fafc;
          color: var(--db-text); font-size: 13px; font-weight: 600; text-decoration: none; white-space: nowrap;
          transition: background .15s, border-color .15s;
        }
        .role-pill:hover { background: var(--db-brand-soft); border-color: #c7d2fe; }
        .role-count { display: inline-grid; place-items: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 999px; background: var(--db-brand); color: #fff; font-size: 12px; font-variant-numeric: tabular-nums; }

        .panel-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 18px; margin-bottom: 18px; }
        .panel-heading { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .icon-chip { display: grid; place-items: center; flex-shrink: 0; width: 38px; height: 38px; border-radius: 11px; background: var(--db-brand-soft); color: var(--db-brand); }
        .panel-title { font-size: 18px; font-weight: 700; letter-spacing: -.02em; }
        .panel-sub { margin-top: 3px; color: var(--db-secondary); font-size: 12.5px; }

        .btn-primary {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 9px 16px; border-radius: 999px;
          background: var(--db-navy); color: #fff;
          font-size: 13px; font-weight: 650; text-decoration: none; white-space: nowrap;
          transition: background .16s;
        }
        .btn-primary:hover { background: var(--db-brand); }

        /* Sales overview */
        .sale-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
        .sale-field { display: flex; align-items: center; gap: 8px; color: var(--db-secondary); font-size: 12.5px; font-weight: 600; }
        .sale-field input { padding: 6px 10px; border: 1px solid var(--db-line); border-radius: 10px; background: #fff; color: var(--db-text); font-weight: 600; }
        .sales-body { display: grid; grid-template-columns: minmax(300px, 1fr) minmax(0, 2.2fr); gap: 28px; }
        .sales-summary { display: flex; flex-direction: column; gap: 8px; padding-right: 28px; border-right: 1px solid var(--db-line); }
        .sale-total-label { font-size: 15px; font-weight: 650; }
        .sale-total { font-size: 40px; line-height: 1.1; font-weight: 750; letter-spacing: -.035em; font-variant-numeric: tabular-nums; }
        .sale-total-meta { color: var(--db-tertiary); font-size: 12px; line-height: 1.45; }
        .sale-filters { display: flex; flex-wrap: wrap; gap: 14px 18px; margin-top: auto; padding-top: 18px; border-top: 1px solid var(--db-line); }
        .sale-filter { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .sale-filter > span { display: inline-flex; align-items: center; gap: 6px; color: var(--db-secondary); font-size: 12px; font-weight: 600; }
        .sale-chart { min-height: 300px; }

        .fin-delta { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 3px; font-size: 12.5px; }
        .fin-delta b { font-weight: 650; }
        .fin-delta.up { color: #16a34a; }
        .fin-delta.down { color: #dc2626; }
        .fin-vs { margin-left: 4px; color: var(--db-tertiary); }

        .row-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 20px; }
        .row-grid.wide-left { grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr); }

        /* Financial overview */
        .fin-overview { display: flex; flex-direction: column; gap: 16px; container-type: inline-size; }
        .fin-overview .panel-header { margin-bottom: 0; }
        .fin-pairs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .fin-pair { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 14px; border: 1px solid; }
        .fin-pair.blue { background: #f3f6fd; border-color: #dfe6f7; --fin-tone: var(--db-brand); }
        .fin-pair.green { background: #f1faf4; border-color: #d6efdf; --fin-tone: #15803d; }
        .fin-pair-head { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 650; }
        .fin-pair .fin-chip { border-radius: 10px; color: #fff; background: var(--fin-tone); }
        .fin-pair-value { font-size: 24px; font-weight: 750; letter-spacing: -.03em; line-height: 1.15; font-variant-numeric: tabular-nums; }
        .fin-pair-value span { color: var(--db-tertiary); font-weight: 500; }
        .fin-split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .fin-split > div { display: flex; flex-direction: column; gap: 4px; }
        .fin-split > div + div { padding-left: 12px; border-left: 1px solid var(--db-line); }
        .fin-split span { color: var(--db-secondary); font-size: 11.5px; }
        .fin-split strong { font-size: 14px; font-variant-numeric: tabular-nums; }
        .fin-trend { padding: 8px 10px; border-radius: 10px; background: rgba(255,255,255,.7); }
        .fin-chip { display: inline-grid; place-items: center; flex-shrink: 0; width: 34px; height: 34px; border-radius: 999px; }
        .fin-chip.green { color: #15803d; background: #dcfce7; }
        .fin-chip.purple { color: #7e22ce; background: #f3e8ff; }
        .fin-chip.blue { color: var(--db-brand); background: var(--db-brand-soft); }
        .fin-chip.orange { color: #c2410c; background: #ffedd5; }
        .fin-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding-top: 14px; border-top: 1px solid var(--db-line); }
        .fin-tile { display: flex; gap: 10px; min-width: 0; padding: 0 12px; }
        .fin-tile:first-child { padding-left: 0; }
        .fin-tile + .fin-tile { border-left: 1px solid var(--db-line); }
        .fin-tile-label { color: var(--db-secondary); font-size: 11.5px; }
        .fin-tile-value { margin: 2px 0 4px; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
        @container (max-width: 520px) {
          .fin-pairs { grid-template-columns: 1fr; }
          .fin-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 14px; }
          .fin-tile:nth-child(odd) { padding-left: 0; border-left: 0; }
        }

        /* Tabs: a light rail with the active option filled navy. */
        .pill-tabs { display: flex; gap: 4px; max-width: 100%; overflow-x: auto; scrollbar-width: none; padding: 4px; margin-bottom: 16px; border-radius: 12px; background: #f1f4f9; }
        .pill-tabs.fit { display: inline-flex; }
        .pill-tabs::-webkit-scrollbar { display: none; }
        .pill-tab {
          flex-shrink: 0; border: 0; border-radius: 9px; background: transparent;
          color: var(--db-secondary); padding: 7px 13px;
          font-size: 12.5px; font-weight: 600; cursor: pointer;
          transition: background .16s, color .16s;
        }
        .pill-tab:hover:not(:disabled) { color: var(--db-text); }
        .pill-tab.active { background: var(--db-navy); color: #fff; }
        .pill-tab:disabled { cursor: default; opacity: .55; }

        .legend { display: flex; flex-wrap: wrap; gap: 6px 12px; }
        .leg { display: inline-flex; align-items: center; gap: 5px; color: var(--db-secondary); font-size: 11.5px; white-space: nowrap; }
        .leg-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; }

        .chart-canvas { width: 100%; height: 300px; }

        .empty-state {
          width: 100%; height: 100%; min-height: 220px;
          display: grid; place-items: center; align-content: center; gap: 14px;
          color: var(--db-tertiary); font-size: 13px; text-align: center;
        }
        .empty-state svg { color: #cbd5e1; }

        .ranking-list { display: flex; flex-direction: column; }
        .ranking-row { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 13px 4px; border-top: 1px solid var(--db-line); }
        .ranking-row:first-child { border-top: 0; }
        .rank-number { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 50%; background: #f1f4f9; color: var(--db-secondary); font-size: 12px; font-weight: 700; }
        .rank-number.top { background: var(--db-brand-soft); color: var(--db-brand); }
        .ranking-name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: 14px; font-weight: 600; }
        .ranking-meta { margin-top: 2px; color: var(--db-tertiary); font-size: 11.5px; }
        .ranking-value { font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }

        /* Reports */
        .reports-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
        .report-column { border: 1px solid var(--db-line); border-radius: 12px; overflow: hidden; }
        .report-column-title { padding: 10px 14px; background: #f6f8fc; border-bottom: 1px solid var(--db-line); font-size: 13px; font-weight: 700; }
        .report-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 42px; padding: 0 14px; border-top: 1px solid var(--db-line); font-size: 13px; }
        .report-column-title + .report-item { border-top: 0; }
        .report-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--db-secondary); }
        .report-value { font-weight: 650; font-variant-numeric: tabular-nums; }
        .report-loading { padding: 18px 14px; color: var(--db-tertiary); font-size: 13px; }

        @media (max-width: 1000px) {
          .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 900px) {
          .row-grid, .row-grid.wide-left, .sales-body { grid-template-columns: minmax(0, 1fr); }
          .sales-summary { padding-right: 0; border-right: 0; }
        }
        @media (max-width: 560px) {
          .dashboard-shell { padding: 20px 16px 32px; gap: 14px; }
          .kpi-grid, .reports-grid { grid-template-columns: minmax(0, 1fr); }
          .card { padding: 18px; }
          .sale-total { font-size: 32px; }
          .chart-canvas { height: 250px; }
        }
      `}</style>

      <div className="root">
        <main className="dashboard-shell">
          {summaryError && (
            <div className="summary-error">
              Some summary data failed to load.
              <button type="button" className="retry-button" onClick={retrySummary}>Retry</button>
            </div>
          )}

          <section className="kpi-grid" aria-label="Dashboard summary">
            {kpis.map((kpi) => (
              <article key={kpi.label} className="card kpi">
                <span className="icon-tile">{kpi.icon}</span>
                <div className="kpi-body">
                  <div className="kpi-label">{kpi.label}</div>
                  <div className="kpi-value">{summaryLoading ? "—" : kpi.value}</div>
                  <div className="kpi-meta">{kpi.meta}</div>
                </div>
                <Link href={kpi.href} className="kpi-go" aria-label={kpi.action}><ArrowRight size={16} aria-hidden /></Link>
              </article>
            ))}
          </section>

          <section className="card staff-roles" aria-label="Staff by role">
            <div className="kpi-label">Staff by role</div>
            <div className="role-pills">
              {summaryLoading ? <span className="report-loading">Loading…</span>
                : staffByRole.length === 0 ? <span className="report-loading">No staff yet.</span>
                : staffByRole.map(([label, count]) => (
                  <Link key={label} href="/dashboard/admin/staff/stafflist" className="role-pill">
                    <span>{label}</span>
                    <span className="role-count">{count}</span>
                  </Link>
                ))}
            </div>
          </section>

          <section className="card" aria-label="Sales overview">
            <header className="panel-header">
              <div className="panel-heading">
                <span className="icon-chip"><ChartColumn size={18} aria-hidden /></span>
                <div className="panel-title">Sales Overview</div>
              </div>
              <div className="sale-controls">
                <label className="sale-field">
                  <span>From</span>
                  <DateInput value={saleFrom} min={saleEarliest} max={saleTo || today} onChange={(event) => { setSaleFrom(event.target.value); setSalePeriod("custom"); }} />
                </label>
                <label className="sale-field">
                  <span>To</span>
                  <DateInput value={saleTo} min={saleFrom} max={today} onChange={(event) => { setSaleTo(event.target.value); setSalePeriod("custom"); }} />
                </label>
                <SegmentedDropdown
                  label="Sales period"
                  value={salePeriod}
                  onChange={pickSalePeriod}
                  items={[...FIN_PERIODS, { value: "custom", label: "Custom range" }].map((period) => ({ value: period.value, label: period.label, icon: <Calendar size={13} aria-hidden /> }))}
                />
                <a className="btn-primary" href={`/api/admin/sales-summary?${saleQuery}&format=xlsx`}>
                  <Download size={14} aria-hidden /> Download report
                </a>
              </div>
            </header>

            <div className="sales-body">
              <div className="sales-summary">
                <div className="sale-total-label">Total Sales</div>
                <div className="sale-total">{saleSummaryQ.isPending ? "—" : inr(saleSummaryQ.data?.data.total ?? 0)}</div>
                <FinDelta change={saleChange} vs={saleVs} />
                <div className="sale-total-meta">
                  {saleSummaryQ.isError
                    ? "Sales summary failed to load."
                    : `${saleSummaryQ.data?.data.orderCount ?? 0} accepted orders · ${saleFrom || saleTo ? `${saleFrom || "start"} to ${saleTo || "today"}` : "all time"}${saleAsm ? ` · ${asmStates.join(", ") || "no states assigned"}` : ""}${saleCity ? ` · ${saleCity}` : ""}`}
                </div>
                <div className="sale-filters">
                  <div className="sale-filter">
                    <span><Globe size={13} aria-hidden /> Region</span>
                    <SegmentedDropdown
                      label="Region"
                      value={saleRegion}
                      onChange={(next) => { setSaleRegion(next); setSaleAsm(""); setSaleCity(""); }}
                      items={saleRegionItems}
                    />
                  </div>
                  <div className="sale-filter">
                    <span><LayoutGrid size={13} aria-hidden /> ASM</span>
                    <SegmentedDropdown
                      label="ASM"
                      value={saleAsm}
                      onChange={(next) => { setSaleAsm(next); setSaleCity(""); }}
                      items={asmItems}
                      onLoadMore={() => { if (asmQ.hasNextPage && !asmQ.isFetchingNextPage) asmQ.fetchNextPage(); }}
                      loadingMore={asmQ.isFetchingNextPage}
                    />
                  </div>
                  <div className="sale-filter">
                    <span><MapPin size={13} aria-hidden /> City</span>
                    <SegmentedDropdown
                      label="City"
                      value={saleCity}
                      onChange={setSaleCity}
                      items={saleCityItems}
                      disabled={saleCityOptions.length === 0}
                    />
                  </div>
                </div>
              </div>

              <div className="sale-chart">
                {saleSummaryQ.isPending ? (
                  <div className="empty-state">Loading sales…</div>
                ) : saleSeries.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={saleSeries} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                      <defs>
                        <linearGradient id="saleFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1e3a8a" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#1e3a8a" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#eef1f6" vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                      <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={shortInr} />
                      <Tooltip
                        cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: "#64748b", marginBottom: "5px" }}
                        formatter={(value) => [inr(Number(value ?? 0)), "Net sale"]}
                      />
                      <Area type="monotone" dataKey="total" stroke="#1e3a8a" strokeWidth={2.5} fill="url(#saleFill)" activeDot={{ r: 5, fill: "#1e3a8a", stroke: "#fff", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">No accepted sales in this range.</div>
                )}
              </div>
            </div>
          </section>

          <section className="row-grid">
            <article className="card fin-overview" aria-label="Financial overview">
              <header className="panel-header">
                <div className="panel-heading">
                  <span className="icon-chip"><Wallet size={18} aria-hidden /></span>
                  <div className="panel-title">Financial Overview</div>
                </div>
                <SegmentedDropdown
                  label="Period"
                  value={finPeriod}
                  onChange={(next) => setFinPeriod(next as FinPeriod)}
                  className="shrink-0"
                  items={FIN_PERIODS.map((period) => ({ value: period.value, label: period.label, icon: <Calendar size={13} aria-hidden /> }))}
                />
              </header>

              {finQ.isError && <div className="summary-error">Financial summary failed to load.</div>}

              {/* Shown as "X / Y" pairs, not ratios. */}
              <div className="fin-pairs">
                <section className="fin-pair blue">
                  <div className="fin-pair-head"><span className="fin-chip"><FileText size={17} aria-hidden /></span>Billed / Booking</div>
                  <div className="fin-pair-value">{finShow(fin?.billed)} <span>/</span> {finShow(fin?.total)}</div>
                  <div className="fin-split">
                    <div><span>Total Billed</span><strong>{finShow(fin?.billed)}</strong></div>
                    <div><span>Total Booking</span><strong>{finShow(fin?.total)}</strong></div>
                  </div>
                  {finTiles[0].change !== null && finVs && (
                    <div className="fin-trend"><FinDelta change={finTiles[0].change} vs={finVs} /></div>
                  )}
                </section>
                <section className="fin-pair green">
                  <div className="fin-pair-head"><span className="fin-chip"><CreditCard size={17} aria-hidden /></span>Payment / Billed</div>
                  <div className="fin-pair-value">{finShow(fin?.paid)} <span>/</span> {finShow(fin?.billed)}</div>
                  <div className="fin-split">
                    <div><span>Total Payment</span><strong>{finShow(fin?.paid)}</strong></div>
                    <div><span>Total Billed</span><strong>{finShow(fin?.billed)}</strong></div>
                  </div>
                  {finTiles[2].change !== null && finVs && (
                    <div className="fin-trend"><FinDelta change={finTiles[2].change} vs={finVs} /></div>
                  )}
                </section>
              </div>

              <div className="fin-tiles">
                {finTiles.map((tile) => (
                  <div key={tile.label} className="fin-tile">
                    <span className={`fin-chip ${tile.tone}`}>{tile.icon}</span>
                    <div>
                      <div className="fin-tile-label">{tile.label}</div>
                      <div className="fin-tile-value">{tile.value}</div>
                      <FinDelta change={tile.change} vs={finVs} unit={tile.unit} />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="card">
              <header className="panel-header">
                <div className="panel-heading">
                  <span className="icon-chip"><Trophy size={18} aria-hidden /></span>
                  <div>
                    <div className="panel-title">Top Distributors by Region</div>
                    <div className="panel-sub">Select a zone to review its highest net sales distributors</div>
                  </div>
                </div>
              </header>

              <div className="pill-tabs" role="group" aria-label="Region">
                {SALES_REGIONS.map((region) => (
                  <button
                    key={region}
                    type="button"
                    className={`pill-tab${selectedRegion === region ? " active" : ""}`}
                    aria-pressed={selectedRegion === region}
                    onClick={() => setSelectedRegion(region)}
                  >
                    {formatRegionLabel(region)}
                  </button>
                ))}
              </div>

              <div className="ranking-list">
                {loading ? (
                  <div className="empty-state">Loading distributors…</div>
                ) : selectedRegionalDistributors.length > 0 ? (
                  selectedRegionalDistributors.map((dealer, index) => (
                    <div key={`${selectedRegion}-${dealer.dealerId || dealer.dealerName}-${index}`} className="ranking-row">
                      <span className={`rank-number${index < 3 ? " top" : ""}`}>{index + 1}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="ranking-name">{dealer.dealerName}</div>
                        <div className="ranking-meta">{formatRegionLabel(selectedRegion)} region</div>
                      </div>
                      <div className="ranking-value">{inr(Number(dealer.total))}</div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <Trophy size={72} strokeWidth={1.25} aria-hidden />
                    No distributors found for the {formatRegionLabel(selectedRegion).toLowerCase()} region.
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className="row-grid wide-left">
            <article className="card">
              <header className="panel-header">
                <div className="panel-heading">
                  <span className="icon-chip"><TrendingUp size={18} aria-hidden /></span>
                  <div>
                    <div className="panel-title">Regional Performance</div>
                    <div className="panel-sub">{regionalGranularitySub}</div>
                  </div>
                </div>
                <div className="legend">
                  {SALES_REGIONS.map((region) => (
                    <span key={region} className="leg">
                      <span className="leg-dot" style={{ background: REGION_META[region].color }} />
                      {formatRegionLabel(region)}
                    </span>
                  ))}
                </div>
              </header>

              <div className="pill-tabs fit" role="group" aria-label="Net sales period">
                {GRANULARITY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`pill-tab${regionalGranularity === option.value ? " active" : ""}`}
                    aria-pressed={regionalGranularity === option.value}
                    disabled={regionalSalesLoading}
                    onClick={() => setRegionalGranularity(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="chart-canvas">
                {loading || regionalSalesLoading ? (
                  <div className="empty-state">Loading regional sales…</div>
                ) : hasRegionalSales ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={regionalLineData} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                      <CartesianGrid stroke="#eef1f6" vertical={false} />
                      <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
                      <YAxis tick={axisTick} axisLine={false} tickLine={false} width={52} tickFormatter={shortInr} />
                      <Tooltip
                        cursor={{ stroke: "#cbd5e1", strokeWidth: 1 }}
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: "#64748b", marginBottom: "5px" }}
                        formatter={(value, _name, item) => {
                          const region = String(item?.dataKey ?? "") as SalesRegionKey;
                          return [inr(Number(value ?? 0)), formatRegionLabel(region)];
                        }}
                      />
                      {SALES_REGIONS.map((region) => (
                        <Line
                          key={region}
                          type="monotone"
                          dataKey={region}
                          stroke={REGION_META[region].color}
                          strokeWidth={2.25}
                          dot={{ r: 3, strokeWidth: 0, fill: REGION_META[region].color }}
                          activeDot={{ r: 5, fill: "#fff", stroke: REGION_META[region].color, strokeWidth: 2 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="empty-state">No regional sales data available yet.</div>
                )}
              </div>
            </article>

            <article className="card">
              <header className="panel-header">
                <div className="panel-heading">
                  <span className="icon-chip"><Users size={18} aria-hidden /></span>
                  <div>
                    <div className="panel-title">Top Distributors</div>
                    <div className="panel-sub">Distributor performance by total value</div>
                  </div>
                </div>
              </header>
              <div className="ranking-list">
                {loading ? (
                  <div className="empty-state">Loading distributors…</div>
                ) : dealerData.length > 0 ? (
                  dealerData.slice(0, 5).map((dealer, index) => (
                    <div key={`${dealer.Dealer_Name}-${index}`} className="ranking-row">
                      <span className={`rank-number${index < 3 ? " top" : ""}`}>{index + 1}</span>
                      <div className="ranking-name">{dealer.Dealer_Name}</div>
                      <div className="ranking-value">{inr(Number(dealer.total))}</div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">No distributor data available.</div>
                )}
              </div>
            </article>
          </section>

          <section className="card" aria-label="Reports">
            <header className="panel-header">
              <div className="panel-heading">
                <span className="icon-chip"><FileText size={18} aria-hidden /></span>
                <div>
                  <div className="panel-title">Reports</div>
                  <div className="panel-sub">Quick ranked view of your strongest orders and distributors</div>
                </div>
              </div>
              <Link href="/dashboard/admin/reports/dealer-category" className="btn-primary">
                View All Reports <ArrowRight size={14} aria-hidden />
              </Link>
            </header>

            <div className="reports-grid">
              <div className="report-column">
                <div className="report-column-title">Top orders</div>
                {loading ? (
                  <div className="report-loading">Loading…</div>
                ) : data.length > 0 ? (
                  data.map((item) => (
                    <div key={item.order_id} className="report-item">
                      <span className="report-name">{formatDisplayOrderNumber(item.order_id)}</span>
                      <span className="report-value">{inr(Number(item.total))}</span>
                    </div>
                  ))
                ) : (
                  <div className="report-loading">No order data available.</div>
                )}
              </div>

              <div className="report-column">
                <div className="report-column-title">Top distributors</div>
                {loading ? (
                  <div className="report-loading">Loading…</div>
                ) : dealerData.length > 0 ? (
                  dealerData.map((dealer, index) => (
                    <div key={`${dealer.Dealer_Name}-${index}`} className="report-item">
                      <span className="report-name">{dealer.Dealer_Name}</span>
                      <span className="report-value">{inr(Number(dealer.total))}</span>
                    </div>
                  ))
                ) : (
                  <div className="report-loading">No distributor data available.</div>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
