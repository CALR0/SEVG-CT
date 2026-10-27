// POST /api/history/save
//
// Guarda (o actualiza) un análisis en Neon. El cliente envía el input que ya
// usó para evaluar — así, al recargar, podemos re-ejecutar el motor con las
// reglas vigentes y mantener la paridad con el motor en memoria.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/controlt";
import { dbEnabled, saveAnalysis, type SavedAnalysis, type SavedTripInput } from "@/lib/db";

export const runtime = "nodejs";

type Body = {
  manifest?: string;
  idWorkOrder?: number | null;
  analyzedAt?: string;
  scoreTotal?: number | null;
  calificacion?: string | null;
  excludedReason?: string | null;
  tripInput?: SavedTripInput;
};

export async function POST(req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, skipped: "db-not-configured" }, { status: 200 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 }); }

  const manifest = String(body.manifest || "").trim();
  if (!manifest || manifest.length > 32 || !/^[0-9A-Za-z\-]+$/.test(manifest)) {
    return NextResponse.json({ error: "Manifiesto inválido" }, { status: 400 });
  }
  if (!body.tripInput || !Array.isArray(body.tripInput.records)) {
    return NextResponse.json({ error: "tripInput requerido" }, { status: 400 });
  }
  if (body.tripInput.records.length > 5000) {
    return NextResponse.json({ error: "Demasiados registros" }, { status: 413 });
  }

  const toSave: SavedAnalysis = {
    manifest,
    idWorkOrder: body.idWorkOrder ?? null,
    analyzedAt: body.analyzedAt || new Date().toISOString(),
    scoreTotal: body.scoreTotal ?? null,
    calificacion: body.calificacion ?? null,
    excludedReason: body.excludedReason ?? null,
    tripInput: {
      id: String(body.tripInput.id || manifest),
      file: String(body.tripInput.file || ""),
      placa: String(body.tripInput.placa || ""),
      conductor: String(body.tripInput.conductor || ""),
      missingCols: Array.isArray(body.tripInput.missingCols) ? body.tripInput.missingCols : [],
      records: body.tripInput.records,
    },
  };

  try {
    await saveAnalysis(session.email.toLowerCase(), toSave);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
