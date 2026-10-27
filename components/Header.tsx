"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TruckIcon, SunIcon, MoonIcon, LogoutIcon, SpinnerIcon } from "./icons";
import { useTheme } from "./ThemeToggle";

export default function Header({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = (email.match(/[a-zA-Z]/g)?.slice(0, 2).join("") || "??").toUpperCase();

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Give the user a sense of transition even on fast nets
      setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 300);
    }
  }

  return (
    <>
      {busy && <FullscreenLoader label="Cerrando sesión…" />}
      <header className="sticky top-0 z-30 bg-[color:var(--bg-elev)] border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white grid place-items-center shadow-brand">
              <TruckIcon width={22} height={22} />
            </div>
            <div className="leading-tight">
              <div className="text-base md:text-lg font-extrabold tracking-tight">SEGV-CT</div>
              <div className="text-[11px] text-text-muted hidden sm:block">Seguimiento y evaluación de viajes · ControlT</div>
            </div>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 text-white font-bold grid place-items-center shadow-elev hover:scale-105 transition"
              title={email}
            >
              {initials}
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-64 card-elev rounded-xl2 overflow-hidden fade-in">
                <div className="px-4 py-3 border-b border-border bg-surface-2">
                  <div className="text-[11px] text-text-dim uppercase tracking-wider">Sesión</div>
                  <div className="text-sm font-semibold truncate">{email}</div>
                </div>
                <button
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-surface-2 transition"
                >
                  <span className="flex items-center gap-3">
                    {theme === "dark" ? <SunIcon /> : <MoonIcon />}
                    Modo {theme === "dark" ? "claro" : "oscuro"}
                  </span>
                  <span className={`w-9 h-5 rounded-full border border-border-strong relative transition ${theme === "dark" ? "bg-brand-500" : "bg-surface-2"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${theme === "dark" ? "left-[18px]" : "left-0.5"}`} />
                  </span>
                </button>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-bad hover:bg-[color:var(--bad-bg)] transition border-t border-border"
                >
                  <LogoutIcon />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

export function FullscreenLoader({ label }: { label: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[color:var(--bg)]/80 backdrop-blur-sm fade-in">
      <div className="card-elev rounded-xl2 px-6 py-5 flex items-center gap-3 shadow-pop">
        <SpinnerIcon className="text-brand-500" width={22} height={22} />
        <span className="font-semibold">{label}</span>
      </div>
    </div>
  );
}
