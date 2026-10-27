import { NextResponse } from "next/server";
import { getSession } from "@/lib/controlt";

export const runtime = "nodejs";

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, email: s.email, name: s.name, idCompany: s.idCompany, exp: s.exp });
}
