// GET  /api/history?month=YYYY-MM   → análisis guardados para ese mes
// DELETE /api/history?month=YYYY-MM → borra todos los análisis del mes
//
// Siempre scoped al email del usuario autenticado (nunca cruza datos entre
// supervisores).

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/controlt";
import { dbEnabled, deleteMonth, getMonth, currentMonth } from "@/lib/db";

export const runtime = "nodejs";

function parseMonth(req: NextRequest): string | null {
  const m = req.nextUrl.searchParams.get("month");
  if (!m) return currentMonth();
  if (!/^\d{4}-\d{2}$/.test(m)) return null;
  return m;
}

export async function GET(req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, enabled: false, items: [] }, { status: 200 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const month = parseMonth(req);
  if (!month) return NextResponse.json({ error: "Parámetro month inválido" }, { status: 400 });

  try {
    const items = await getMonth(session.email.toLowerCase(), month);
    return NextResponse.json({ ok: true, enabled: true, month, items });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!dbEnabled()) return NextResponse.json({ ok: false, deleted: 0 }, { status: 200 });

  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const month = parseMonth(req);
  if (!month) return NextResponse.json({ error: "Parámetro month inválido" }, { status: 400 });

  // Pequeña salvaguarda: nunca borrar el mes actual sin confirmación explícita.
  const confirm = req.nextUrl.searchParams.get("confirm") === "yes";
  if (month === currentMonth() && !confirm) {
    return NextResponse.json({ error: "Para borrar el mes actual envía confirm=yes" }, { status: 400 });
  }

  try {
    const deleted = await deleteMonth(session.email.toLowerCase(), month);
    return NextResponse.json({ ok: true, deleted, month });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
