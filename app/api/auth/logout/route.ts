import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/controlt";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return res;
}
