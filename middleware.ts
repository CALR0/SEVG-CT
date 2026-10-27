// Next.js middleware — runs on every matched request before the route handler.
// Responsibilities:
//   1. Enforce a strict set of security headers (CSP, HSTS, XFO, …) on every page.
//   2. Gate authenticated routes (/dashboard, /api/trips/*) with the session cookie.
//
// The actual JWT lives sealed inside the cookie; we only check for presence here,
// so decryption and validation stay in the route handlers (which have the key).

import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "ct_session";

const PROTECTED_API_PREFIX = "/api/trips";
const PROTECTED_PAGES = ["/dashboard"];
const PUBLIC_API = new Set(["/api/auth/login", "/api/auth/logout", "/api/auth/me"]);

function securityHeaders(): HeadersInit {
  // Content Security Policy — tight, since the app only loads Google Fonts and
  // its own origin. ControlT API calls go through our Next server, never the
  // browser, so we don't need to allow reports-api.controlt.io in connect-src.
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",             // Next needs inline for hydration bootstrap
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  return {
    "Content-Security-Policy": csp,
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "X-DNS-Prefetch-Control": "off",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}

function applyHeaders(res: NextResponse) {
  const headers = securityHeaders();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v as string);
  res.headers.delete("x-powered-by");
  return res;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  // Protected pages: redirect to /login when there's no session cookie.
  if (PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    if (!hasSession) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("from", pathname);
      return applyHeaders(NextResponse.redirect(url));
    }
  }

  // Protected API: return 401 JSON rather than redirect.
  if (pathname.startsWith(PROTECTED_API_PREFIX) && !hasSession) {
    return applyHeaders(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );
  }

  // If already signed in, bounce away from /login.
  if (pathname === "/login" && hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return applyHeaders(NextResponse.redirect(url));
  }

  // Public & authed happy path — just add headers and continue.
  const res = NextResponse.next();
  return applyHeaders(res);
}

export const config = {
  // Skip Next internals and public assets — they don't need the gating logic.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
