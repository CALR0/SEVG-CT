import { NextRequest, NextResponse } from "next/server";
import { loginDiscover, loginPassword, sealSession, SESSION_COOKIE, type Session } from "@/lib/controlt";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

type Body = { email?: string; password?: string };
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Walk a JSON blob and pull out the first value whose key matches `names`.
function pick(obj: unknown, names: string[]): unknown {
  const want = new Set(names.map((n) => n.toLowerCase()));
  const seen = new Set<unknown>();
  const q: unknown[] = [obj];
  while (q.length) {
    const v = q.shift();
    if (!v || typeof v !== "object") continue;
    if (seen.has(v)) continue;
    seen.add(v);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (want.has(k.toLowerCase()) && val != null) return val;
      if (val && typeof val === "object") q.push(val);
    }
  }
  return undefined;
}

export async function POST(req: NextRequest) {
  // Per-IP rate limit — stops brute-force attempts against the login proxy.
  const ip = clientIp(req.headers);
  const rl = rateLimit(`login:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Demasiados intentos. Intenta más tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 }); }
  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  if (!email || !password) return NextResponse.json({ error: "Email y contraseña son obligatorios" }, { status: 400 });
  if (email.length > 254 || password.length > 256) return NextResponse.json({ error: "Longitud inválida" }, { status: 400 });
  if (!EMAIL_RX.test(email)) return NextResponse.json({ error: "Email inválido" }, { status: 400 });

  // Optional pre-flight: the SPA calls GET /apipublic/api/login?email= first to find
  // out whether to show a password field or redirect to Microsoft OAuth. We only
  // handle password here; OAuth is deferred.
  try {
    const d = await loginDiscover(email);
    if (d.ok) {
      const info = await d.json().catch(() => null);
      const method = (pick(info, ["authMethod", "method", "type", "provider"]) as string | undefined) || "";
      if (/oauth|microsoft|azure|sso\b/i.test(method)) {
        return NextResponse.json(
          { error: `Este usuario usa inicio de sesión con Microsoft. Soporte OAuth aún no implementado.` },
          { status: 400 }
        );
      }
    }
  } catch {}

  const r = await loginPassword(email, password);
  const text = await r.text();
  let json: unknown; try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    const msg = (pick(json, ["message", "error", "detail"]) as string | undefined) || `Login falló (${r.status})`;
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const token =
    (pick(json, ["access_token", "accessToken", "token", "jwt"]) as string | undefined) || "";
  if (!token || !/^eyJ[A-Za-z0-9_\-]+\./.test(token)) {
    return NextResponse.json({ error: "Respuesta de login sin token reconocible" }, { status: 502 });
  }
  const expiresIn = Number(pick(json, ["expires_in", "expiresIn"]) || 0);

  // Decode JWT payload (no signature verification — the API verifies on each call).
  // The ControlT JWT carries user data as a stringified JSON under the `infoUser`
  // claim: payload = { exp, infoUser: "{\"idUser\":…,\"idCompany\":…}" }.
  let idCompany = 0; let exp: number | undefined; let name: string | undefined;
  try {
    const cleanToken = token.replace(/['"]+/g, "");
    const payload = JSON.parse(Buffer.from(cleanToken.split(".")[1], "base64url").toString("utf8"));
    exp = payload.exp;
    let info: Record<string, unknown> = {};
    if (payload.infoUser) {
      info = typeof payload.infoUser === "string" ? JSON.parse(payload.infoUser) : payload.infoUser;
    }
    idCompany = Number(
      info.idCompany || info.id_company || info.companyId ||
      payload.idCompany || payload.id_company || payload.companyId || 0
    );
    name =
      (info.name as string) || (info.fullName as string) || (info.nameUser as string) ||
      (payload.name as string) || (payload.given_name as string);
  } catch {}
  if (!idCompany) idCompany = Number(pick(json, ["idCompany", "id_company", "companyId", "company_id"]) || 0);
  if (!idCompany) {
    return NextResponse.json({ error: "Login OK pero no se pudo determinar idCompany" }, { status: 502 });
  }

  const session: Session = { token, idCompany, email, name, exp };
  const sealed = await sealSession(session);
  const res = NextResponse.json({ ok: true, email, name, idCompany, exp });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: sealed,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge:
      exp ? Math.max(60, exp - Math.floor(Date.now() / 1000))
      : expiresIn ? Math.max(60, expiresIn)
      : 60 * 60 * 8,
  });
  return res;
}
