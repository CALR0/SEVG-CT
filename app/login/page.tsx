"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TruckIcon, SpinnerIcon, AlertIcon } from "@/components/icons";
import { FullscreenLoader } from "@/components/Header";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      setRedirecting(true);
      // Smoother perceived transition
      setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 450);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      {redirecting && <FullscreenLoader label="Entrando al panel SEGV-CT…" />}
      <main className="min-h-screen grid lg:grid-cols-2">
        {/* Hero side */}
        <section className="hero-gradient hidden lg:flex relative text-white px-10 xl:px-16 py-14 flex-col justify-between">
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 border border-white/20 grid place-items-center backdrop-blur-sm">
              <TruckIcon width={24} height={24} />
            </div>
            <div>
              <div className="text-xl font-extrabold tracking-tight">SEGV-CT</div>
              <div className="text-[11px] text-white/60 uppercase tracking-widest">ControlT · Seguimiento</div>
            </div>
          </div>

          <div className="relative z-10 space-y-6 max-w-md">
            <h1 className="text-4xl xl:text-5xl font-extrabold leading-tight">
              Seguimiento y evaluación
              <span className="text-accent-500"> de viajes finalizados.</span>
            </h1>
            <p className="text-white/70 text-base leading-relaxed">
              Centraliza las bitácoras de viajes finalizados, evalúa trazabilidad y gestiona la calidad del
              monitoreo con un solo motor de análisis.
            </p>
          </div>

          <div className="relative z-10 text-[11px] text-white/40">
            © 2026 Elogia Soluciones Logísticas
          </div>
        </section>

        {/* Form side */}
        <section className="flex items-center justify-center p-6 md:p-12 bg-bg">
          <div className="w-full max-w-md fade-in">
            <div className="lg:hidden flex items-center gap-3 mb-8">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white grid place-items-center shadow-brand">
                <TruckIcon width={24} height={24} />
              </div>
              <div>
                <div className="text-lg font-extrabold">SEGV-CT</div>
                <div className="text-[11px] text-text-muted">ControlT · Seguimiento</div>
              </div>
            </div>

            <h2 className="text-2xl font-extrabold mb-1">Iniciar sesión</h2>
            <p className="text-text-muted text-sm mb-7">Usa tu cuenta de ControlT para acceder al panel.</p>

            <form onSubmit={submit} className="space-y-4" autoComplete="on">
              <label className="block">
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Correo electrónico</span>
                <input
                  type="email" required autoFocus autoComplete="username"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="input mt-1.5"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Contraseña</span>
                <input
                  type="password" required autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input mt-1.5"
                />
              </label>

              {err && (
                <div className="flex items-start gap-2 bg-[color:var(--bad-bg)] text-bad border border-[color:var(--bad)] rounded-lg px-3 py-2.5 text-sm fade-in">
                  <AlertIcon width={18} height={18} className="flex-shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              )}

              <button type="submit" disabled={busy} className="btn btn-primary w-full py-3">
                {busy ? (
                  <>
                    <SpinnerIcon width={18} height={18} /> Verificando credenciales…
                  </>
                ) : (
                  "Iniciar sesión"
                )}
              </button>
            </form>

          </div>
        </section>
      </main>
    </>
  );
}
