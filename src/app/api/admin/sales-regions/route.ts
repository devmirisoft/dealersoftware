import { NextRequest, NextResponse } from "next/server";
import { adminDetailResponse, adminMutationResponse } from "@/server/admin/admin-response";
import { AdminRouteError, adminErrorResponse } from "@/server/admin/admin-errors";
import { requireAdmin, requireAdminOnly } from "@/server/admin/admin-route";
import { normalizeSalesRegion } from "@/server/auth/sales-scope";
import { prisma } from "@/server/db/prisma";
import { assertSalesRegion, getRegionStates, listSalesRegions, saveRegionStates } from "@/server/sales-region-states";
import { salesRegionCode } from "@/lib/salesRegions";
import { STATE_OPTIONS } from "@/lib/places";

export const runtime = "nodejs";

// Every region with its states: its RSM's, or the list kept for a region with no RSM.
export async function GET() {
  try {
    await requireAdmin();
    const [regions, states] = await Promise.all([listSalesRegions(prisma), getRegionStates(prisma)]);
    const data = regions.map((region) => ({ ...region, states: states[region.value] ?? [] }));
    return NextResponse.json(adminDetailResponse(data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[GET /api/admin/sales-regions]", error);
    return adminErrorResponse(error, "Regions are unavailable");
  }
}

// Creates a region from its name; the code is derived ("North 3" -> NORTH_3).
export async function POST(request: NextRequest) {
  try {
    await requireAdminOnly();
    const body = await request.json().catch(() => ({}));
    const label = String(body?.label ?? "").trim().replace(/\s+/g, " ");
    const code = salesRegionCode(label);
    if (!code || label.length > 40) throw new AdminRouteError("INVALID_REQUEST", "Region name must be 1-40 characters with a letter or number");
    const taken = await prisma.salesRegion.findFirst({ where: { OR: [{ code }, { label: { equals: label, mode: "insensitive" } }] } });
    if (taken) throw new AdminRouteError("CONFLICT", `Region "${taken.label}" already exists`);
    const region = await prisma.salesRegion.create({ data: { code, label } });
    return NextResponse.json(adminMutationResponse("Region created", { value: region.code, label: region.label, states: [] }));
  } catch (error) {
    console.error("[POST /api/admin/sales-regions]", error);
    return adminErrorResponse(error, "Region could not be created");
  }
}

// Deletes a region nobody uses. Staff, live dealers and open dealer requests block it.
export async function DELETE(request: NextRequest) {
  try {
    await requireAdminOnly();
    const code = normalizeSalesRegion(request.nextUrl.searchParams.get("code"));
    if (!code) throw new AdminRouteError("INVALID_REQUEST", "A region is required");
    await prisma.$transaction(async (tx) => {
      const region = await tx.salesRegion.findUnique({ where: { code } });
      if (!region) throw new AdminRouteError("NOT_FOUND", "Region not found");
      const [staff, dealers, requests] = await Promise.all([
        tx.staffProfile.count({ where: { salesRegion: code, user: { deletedAt: null } } }),
        tx.dealerProfile.count({ where: { region: code, deletedAt: null } }),
        tx.dealerRequest.count({ where: { region: code, status: { in: ["pending", "rsm_pending"] } } }),
      ]);
      if (staff || dealers || requests) {
        throw new AdminRouteError(
          "CONFLICT",
          `${region.label} is in use by ${staff} staff, ${dealers} dealers and ${requests} pending dealer requests. Move them to another region first.`,
          { code: "REGION_IN_USE", staff, dealers, requests },
        );
      }
      await tx.salesRegion.delete({ where: { code } });
      await saveRegionStates(tx, code, null);
    });
    return NextResponse.json(adminMutationResponse("Region deleted", { value: code }));
  } catch (error) {
    console.error("[DELETE /api/admin/sales-regions]", error);
    return adminErrorResponse(error, "Region could not be deleted");
  }
}

// Sets the states of a region that has no RSM. A region with an RSM is edited on the RSM row.
export async function PUT(request: NextRequest) {
  try {
    await requireAdminOnly();
    const body = await request.json().catch(() => ({}));
    const region = normalizeSalesRegion(body?.region);
    if (!region) throw new AdminRouteError("INVALID_REQUEST", "A valid region is required");
    await assertSalesRegion(prisma, region);
    const states = Array.isArray(body?.states) ? [...new Set(body.states.map(String))].sort() as string[] : null;
    if (!states || states.some((state) => !(STATE_OPTIONS as readonly string[]).includes(state))) {
      throw new AdminRouteError("INVALID_REQUEST", "States must be a list of known states");
    }
    const rsm = await prisma.staffProfile.findFirst({ where: { salesRegion: region, user: { role: "RSM", deletedAt: null } }, select: { id: true } });
    if (rsm) throw new AdminRouteError("CONFLICT", "This region has an RSM; its states are the RSM's states");
    await saveRegionStates(prisma, region, states);
    return NextResponse.json(adminMutationResponse("Region states saved", { region, states }));
  } catch (error) {
    console.error("[PUT /api/admin/sales-regions]", error);
    return adminErrorResponse(error, "Region states could not be saved");
  }
}
