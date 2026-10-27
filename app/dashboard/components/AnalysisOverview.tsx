"use client";
import { memo } from "react";
import type { TripResult } from "@/lib/engine-types";

function AnalysisOverviewInner({ trips }: { trips: TripResult[] }) {
  const evaluados = trips.filter((t) => !t.excluded);
  const excluidos = trips.filter((t) => t.excluded);
  const avg = evaluados.length
    ? evaluados.reduce((s, t) => s + t.total, 0) / evaluados.length
    : 0;

  const grades = ["EXCELENTE", "BUENO", "REGULAR", "DEFICIENTE", "MUY DEFICIENTE"] as const;
  const dist = Object.fromEntries(grades.map((g) => [g, 0])) as Record<string, number>;
  for (const t of evaluados) dist[t.calif]++;

  const dims = [
    { k: "sec", label: "Secuencia lógica", color: "bg-brand-500" },
    { k: "tie", label: "Tiempos logísticos", color: "bg-brand-400" },
    { k: "ala", label: "Gestión de alarmas", color: "bg-accent-500" },
    { k: "cie", label: "Cierre oportuno", color: "bg-brand-600" },
  ];
  const avgDim = (k: "sec" | "tie" | "ala" | "cie") =>
    evaluados.length ? evaluados.reduce((s, t) => s + (t.scores[k] || 0), 0) / evaluados.length : 0;

  return (
    <section className="card p-5 md:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider font-bold">Resumen</div>
          <h2 className="text-lg font-extrabold mt-1">Resultados del análisis</h2>
        </div>
        <div className="text-xs text-text-muted">
          {evaluados.length} evaluado(s) · {excluidos.length} excluido(s)
        </div>
      </div>

      {/* Big KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiBig label="Viajes" value={trips.length} />
        <KpiBig label="Promedio" value={avg.toFixed(1)} suffix="/100" accent />
        <KpiBig label="Excluidos" value={excluidos.length} />
        <KpiBig label="Operarios" value={countOps(evaluados)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Grade distribution */}
        <div>
          <h3 className="text-sm font-bold mb-2">Distribución por calificación</h3>
          <div className="space-y-2">
            {grades.map((g) => {
              const n = dist[g];
              const pct = evaluados.length ? (n / evaluados.length) * 100 : 0;
              const toneCls =
                g === "EXCELENTE" || g === "BUENO"
                  ? "bg-ok"
                  : g === "REGULAR"
                  ? "bg-warn"
                  : "bg-bad";
              return (
                <div key={g} className="grid grid-cols-[140px,1fr,40px] items-center gap-2 text-xs">
                  <span className="font-medium text-text-muted">{labelize(g)}</span>
                  <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className={`h-full ${toneCls} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <b className="text-right">{n}</b>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dimension averages */}
        <div>
          <h3 className="text-sm font-bold mb-2">Promedio por dimensión (sobre 25)</h3>
          <div className="space-y-2">
            {dims.map((d) => {
              const v = avgDim(d.k as "sec" | "tie" | "ala" | "cie");
              const pct = (v / 25) * 100;
              return (
                <div key={d.k} className="grid grid-cols-[140px,1fr,52px] items-center gap-2 text-xs">
                  <span className="font-medium text-text-muted">{d.label}</span>
                  <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className={`h-full ${d.color} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <b className="text-right">{v.toFixed(1)}</b>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiBig({ label, value, suffix, accent }: { label: string; value: string | number; suffix?: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl2 border p-4 ${accent ? "bg-gradient-to-br from-brand-500 to-brand-700 text-white border-transparent shadow-brand" : "bg-surface-2 border-border"}`}>
      <div className={`text-[11px] uppercase tracking-wider font-bold ${accent ? "text-white/70" : "text-text-muted"}`}>{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-3xl font-extrabold">{value}</span>
        {suffix && <span className={`text-xs ${accent ? "text-white/70" : "text-text-dim"}`}>{suffix}</span>}
      </div>
    </div>
  );
}

function labelize(g: string) {
  return g[0] + g.slice(1).toLowerCase();
}

function countOps(trips: TripResult[]) {
  const s = new Set<string>();
  for (const t of trips) for (const k of Object.keys(t.ops)) if (k) s.add(k);
  return s.size;
}

const AnalysisOverview = memo(AnalysisOverviewInner, (a, b) => a.trips === b.trips);
export default AnalysisOverview;
