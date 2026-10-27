import { NextRequest, NextResponse } from "next/server";
import { fetchBinnacle, fetchTripInfo, getSession } from "@/lib/controlt";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    const [binnacle, info] = await Promise.all([
      fetchBinnacle(session, id),
      fetchTripInfo(session, id).catch(() => null),
    ]);
    return NextResponse.json({ idWorkOrder: id, info, binnacle });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
