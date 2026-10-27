// Server-side ControlT API client. Never import this from client components.
// Keeps the JWT inside the Next.js server; the browser only ever sees an
// httpOnly cookie that proxies to these calls.

import { cookies } from "next/headers";

export const SESSION_COOKIE = "ct_session";

const AUTH_BASE = process.env.CONTROLT_AUTH_BASE || "https://app.controlt.com.co";
const REPORTS_BASE = process.env.CONTROLT_REPORTS_BASE || "https://reports-api.controlt.io";
const DEFAULT_TZ = process.env.CONTROLT_TZ || "America/Bogota";

// Session payload we encrypt into the cookie. idCompany is needed for the
// resolver endpoint; it is returned by the login response.
export type Session = {
  token: string;
  idCompany: number;
  email: string;
  name?: string;
  exp?: number; // epoch seconds; purely for client UX, server still verifies on each call
};

// Minimal AES-GCM cookie seal so a stolen cookie by itself cannot be replayed
// without the server secret. The secret lives in SESSION_SECRET (set in Vercel).
async function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("SESSION_SECRET not set (must be at least 16 chars)");
  }
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode("ct-session-v1"), iterations: 100_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sealSession(s: Session): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(s));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return b64url(iv) + "." + b64url(cipher);
}
export async function unsealSession(blob: string): Promise<Session | null> {
  try {
    const [ivStr, cipherStr] = blob.split(".");
    if (!ivStr || !cipherStr) return null;
    const key = await getKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64urlDecode(ivStr) },
      key,
      b64urlDecode(cipherStr)
    );
    return JSON.parse(new TextDecoder().decode(plain)) as Session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const cookie = cookies().get(SESSION_COOKIE)?.value;
  if (!cookie) return null;
  return unsealSession(cookie);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Response("Unauthorized", { status: 401 });
  return s;
}

// --- ControlT API calls ---------------------------------------------------

export type LoginDiscovery = { authMethod: "password" | "oauth" | "sso" | string; raw: unknown };

export async function loginDiscover(email: string): Promise<Response> {
  const url = `${AUTH_BASE}/apipublic/api/login?email=${encodeURIComponent(email)}`;
  return fetch(url, { method: "GET", headers: { Accept: "application/json" } });
}

export async function loginPassword(username: string, password: string): Promise<Response> {
  // The SPA's AuthenticationService.login() posts to /apipublic/api/login/oauth
  // with {username, password} and gets back {access_token, token_type, expires_in}.
  // (The /sso endpoint is for the Cognito code-exchange flow, not direct password.)
  const url = `${AUTH_BASE}/apipublic/api/login/oauth`;
  return fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

function authHeaders(token: string): HeadersInit {
  return {
    Accept: "application/json, text/plain, */*",
    Authorization: `Bearer ${token}`,
    "Time-Zone": DEFAULT_TZ,
  };
}

export async function resolveManifest(session: Session, manifest: string): Promise<{ idWorkOrder: number; tripNumber: string; licensePlate: string } | null> {
  const url = `${REPORTS_BASE}/Tracking/AllFinished/ByIdCompany/${session.idCompany}/1/10?search=${encodeURIComponent(manifest)}`;
  const r = await fetch(url, { headers: authHeaders(session.token) });
  if (!r.ok) throw new Error(`resolve ${manifest}: ${r.status}`);
  const list = (await r.json()) as Array<{ idWorkOrder: number; tripNumber: string; licensePlate: string }>;
  const hit = list.find((x) => x.tripNumber === manifest) || list[0] || null;
  return hit;
}

export async function fetchBinnacle(session: Session, idWorkOrder: number): Promise<unknown[]> {
  const url = `${REPORTS_BASE}/Binnacle/${idWorkOrder}?size=0&page=0`;
  const r = await fetch(url, { headers: authHeaders(session.token) });
  if (!r.ok) throw new Error(`binnacle ${idWorkOrder}: ${r.status}`);
  return (await r.json()) as unknown[];
}

export async function fetchTripInfo(session: Session, idWorkOrder: number): Promise<Record<string, unknown>> {
  const url = `${REPORTS_BASE}/Tracking/InformationTracking/Finished/ByIdTracking/${idWorkOrder}`;
  const r = await fetch(url, { headers: authHeaders(session.token) });
  if (!r.ok) throw new Error(`info ${idWorkOrder}: ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}
