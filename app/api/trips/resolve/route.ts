import { NextRequest, NextResponse } from "next/server";
import { getSession, resolveManifest } from "@/lib/controlt";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { manifests?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 }); }
  const manifests = Array.from(new Set(
    (body.manifests || [])
      .map((s) => String(s).trim())
      .filter((s) => s.length > 0 && s.length <= 32 && /^[0-9A-Za-z\-]+$/.test(s))
  ));
  if (!manifests.length) return NextResponse.json({ error: "Lista de manifiestos vacía" }, { status: 400 });
  if (manifests.length > 200) return NextResponse.json({ error: "Máximo 200 manifiestos por lote" }, { status: 413 });

  // Serial to keep well within ControlT's rate limits; manifest resolution is tiny.
  const results: Array<{ manifest: string; idWorkOrder?: number; tripNumber?: string; licensePlate?: string; error?: string }> = [];
  for (const m of manifests) {
    try {
      const hit = await resolveManifest(session, m);
      if (!hit) results.push({ manifest: m, error: "No encontrado" });
      else results.push({ manifest: m, idWorkOrder: hit.idWorkOrder, tripNumber: hit.tripNumber, licensePlate: hit.licensePlate });
    } catch (e) {
      results.push({ manifest: m, error: (e as Error).message });
    }
  }
  return NextResponse.json({ results });
}
