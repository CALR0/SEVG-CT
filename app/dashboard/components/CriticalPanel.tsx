"use client";
import { memo, useMemo } from "react";
import type { TripResult, Finding } from "@/lib/engine-types";
import { TAG_LABEL } from "@/lib/engine.js";

function CriticalPanelInner({ valid, onOpenTrip }: { valid: TripResult[]; onOpenTrip: (t: TripResult) => void }) {
  const data = useMemo(() => {
    // Transversal patterns: tag with ≥2 trips AND ≥2 operators
    const byTag: Record<string, { trips: Set<TripResult>; ops: Set<string> }> = {};
    for (const t of valid) for (const f of t.findings) {
      if (f.nivel === "ok") continue;
      const b = byTag[f.tag] = byTag[f.tag] || { trips: new Set(), ops: new Set() };
      b.trips.add(t);
      if (f.op) b.ops.add(f.op);
    }
    const trans = Object.entries(byTag)
      .filter(([, b]) => b.trips.size >= 2 && b.ops.size >= 2)
      .sort((a, b) => b[1].trips.size - a[1].trips.size);

    // Risk alarms: golpe + alarmaSin
    const riesgo: Array<[TripResult, Finding]> = [];
    for (const t of valid) for (const f of t.findings) {
      if (["golpe", "alarmaSin"].includes(f.tag)) riesgo.push([t, f]);
    }

    // Trips without obligatory marks (tie === 0)
    const sinMarcas = valid.filter((t) => (t.scores.tie || 0) === 0);
    const prem = valid.filter((t) => t.prematuro);

    return { trans, riesgo, sinMarcas, prem };
  }, [valid]);

  const Empty = () => (
    <div className="text-xs bg-[color:var(--ok-bg)] text-ok border-l-4 border-ok rounded px-3 py-2">
      Ninguno con los filtros actuales.
    </div>
  );

  return (
    <section className="card p-5 md:p-6 space-y-4">
      <div>
        <div className="text-[11px] text-text-muted uppercase tracking-wider font-bold">Panel 5</div>
        <h2 className="text-lg font-extrabold mt-1">Hallazgos críticos transversales</h2>
        <p className="text-xs text-text-muted">Patrones del equipo y riesgos que requieren acción.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Transversal patterns */}
        <div>
          <h3 className="text-sm font-bold mb-2">Patrones del equipo (≥2 viajes y ≥2 operarios)</h3>
          {data.trans.length ? (
            <div className="space-y-2">
              {data.trans.map(([tag, b]) => (
                <div key={tag} className="border-l-4 border-bad bg-[color:var(--bad-bg)] rounded px-3 py-2 text-xs">
                  <div className="font-bold text-text">🔴 {TAG_LABEL[tag as keyof typeof TAG_LABEL] || tag}</div>
                  <div className="text-text-muted">
                    {b.trips.size} viaje(s) · {b.ops.size} operario(s): {Array.from(b.ops).join(", ")}
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty />}
        </div>

        {/* High-risk alarms */}
        <div>
          <h3 className="text-sm font-bold mb-2">Alarmas de mayor riesgo sin gestión o sin protocolo</h3>
          {data.riesgo.length ? (
            <div className="space-y-2">
              {data.riesgo.map(([t, f], i) => (
                <button key={i} onClick={() => onOpenTrip(t)}
                  className="w-full text-left border-l-4 border-bad bg-[color:var(--bad-bg)] rounded px-3 py-2 text-xs hover:bg-[color:var(--bad-bg)]/70">
                  <div className="font-bold text-text">🔴 Viaje <span className="font-mono">{t.id}</span></div>
                  <div className="text-text-muted">{f.texto}{f.op ? ` · ${f.op}` : ""}</div>
                </button>
              ))}
            </div>
          ) : <Empty />}
        </div>

        {/* Trips with missing marks */}
        <div>
          <h3 className="text-sm font-bold mb-2">Viajes con cargue o descargue sin documentar</h3>
          {data.sinMarcas.length ? (
            <div className="space-y-2">
              {data.sinMarcas.map((t) => {
                const main = t.findings.find((f) => f.tag === "faltante")?.texto || "";
                return (
                  <button key={t.key} onClick={() => onOpenTrip(t)}
                    className="w-full text-left border-l-4 border-bad bg-[color:var(--bad-bg)] rounded px-3 py-2 text-xs hover:bg-[color:var(--bad-bg)]/70">
                    <div className="font-bold text-text">🔴 Viaje <span className="font-mono">{t.id}</span></div>
                    <div className="text-text-muted">{main}</div>
                    {(t.faltantesOp || []).map((x, i) => (
                      <div key={i} className="text-text-muted mt-0.5">
                        • {x.marca}: {x.resp ? <>responsable <b className="text-text">{x.resp}</b> (registró {x.evid})</> : "sin evidencia para atribuir"}
                        {x.co && <> · corresponsable {x.co}</>}
                      </div>
                    ))}
                  </button>
                );
              })}
            </div>
          ) : <Empty />}
        </div>

        {/* Premature closures */}
        <div>
          <h3 className="text-sm font-bold mb-2">Viajes cerrados prematuramente</h3>
          {data.prem.length ? (
            <div className="space-y-2">
              {data.prem.map((t) => (
                <button key={t.key} onClick={() => onOpenTrip(t)}
                  className="w-full text-left border-l-4 border-bad bg-[color:var(--bad-bg)] rounded px-3 py-2 text-xs hover:bg-[color:var(--bad-bg)]/70">
                  <div className="font-bold text-text">🔴 Viaje <span className="font-mono">{t.id}</span></div>
                  <div className="text-text-muted">Viaje Finalizado {-(t.cierreMin || 0)} min antes de la entrega real</div>
                </button>
              ))}
            </div>
          ) : <Empty />}
        </div>
      </div>
    </section>
  );
}

const CriticalPanel = memo(CriticalPanelInner, (a, b) => a.valid === b.valid && a.onOpenTrip === b.onOpenTrip);
export default CriticalPanel;
