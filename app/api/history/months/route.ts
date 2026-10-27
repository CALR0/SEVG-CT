// GET /api/history/months → lista de meses con datos para el usuario.
// Usa el server para alimentar el dropdown del dashboard.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/controlt";
import { dbEnabled, listMonths } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ ok: false, enabled: false, months: [] });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const months = await listMonths(session.email.toLowerCase());
    return NextResponse.json({ ok: true, enabled: true, months });
  } catch (e) {
    const err = e as Error;
    console.error("[/api/history/months] DB error:", err.message, err.stack);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
