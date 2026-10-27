"use client";
import { memo, useMemo } from "react";
import type { TripResult } from "@/lib/engine-types";
import { TAG_LABEL } from "@/lib/engine.js";

const CRIT_TAGS = new Set([
  "faltanteOp", "faltante", "simultaneo", "tipoIncorrecto",
  "alarmaSin", "golpe", "sinVF", "prematuro", "falla", "duracion0",
]);
const VF_RX = /viaje finalizado|finaliza(cion)? (de(l)? )?viaje|fin de viaje/;

type OpStats = {
  name: string;
  trips: Set<TripResult>;
  regs: number;
  types: Record<string, number>;
  tags: Record<string, number>;
  crit: number;
  clave: Set<TripResult>;
  alarm: { n: number; ok: number; parcial: number; sin: number };
  prom: number;
  calif: "Bueno" | "Regular" | "Crítico";
};

function compute(valid: TripResult[]) {
  const ops: Record<string, OpStats> = {};
  for (const t of valid) {
    for (const r of t.records) {
      if (r.auto) continue;
      const key = r.atendida;
      const s = ops[key] = ops[key] || {
        name: key, trips: new Set(), regs: 0, types: {}, tags: {}, crit: 0, clave: new Set(),
        alarm: { n: 0, ok: 0, parcial: 0, sin: 0 }, prom: 0, calif: "Bueno",
      };
      s.trips.add(t);
      s.regs++;
      const tipo = r.tipo || "Sin tipo";
      s.types[tipo] = (s.types[tipo] || 0) + 1;
      if (r.mark || VF_RX.test(r.tipoN)) s.clave.add(t);
    }
    for (const a of t.alarmas || []) {
      const s = ops[a.r.atendida]; if (!s) continue;
      s.alarm.n++;
      s.alarm[a.q]++;
    }
    for (const f of t.findings) {
      if (!f.op || f.nivel === "ok" || !ops[f.op]) continue;
      ops[f.op].tags[f.tag] = (ops[f.op].tags[f.tag] || 0) + 1;
      if (f.nivel === "crit") ops[f.op].crit++;
    }
  }
  const list = Object.values(ops).map((s) => {
    const arr = Array.from(s.trips).map((t) => t.total);
    s.prom = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const cpv = s.crit / s.trips.size;
    const malas = s.alarm.parcial + s.alarm.sin;
    s.calif =
      cpv >= 1 || s.alarm.sin >= 3 || (s.alarm.n >= 4 && malas / s.alarm.n > 0.5)
        ? "Crítico"
        : s.crit === 0 && malas === 0
        ? "Bueno"
        : "Regular";
    return s;
  });
  list.sort((a, b) => b.trips.size - a.trips.size || b.regs - a.regs);
  return list;
}

function computeMarcasFaltantes(valid: TripResult[]) {
  const mf: Record<string, { r: number; c: number; trips: Set<TripResult>; marcas: Record<string, number> }> = {};
  let sinEv = 0;
  for (const t of valid) {
    for (const x of t.faltantesOp || []) {
      if (x.resp) {
        const o = mf[x.resp] = mf[x.resp] || { r: 0, c: 0, trips: new Set(), marcas: {} };
        o.r++; o.trips.add(t); o.marcas[x.marca] = (o.marcas[x.marca] || 0) + 1;
      }
      if (x.co) {
        const o = mf[x.co] = mf[x.co] || { r: 0, c: 0, trips: new Set(), marcas: {} };
        o.c++; o.trips.add(t);
      }
      if (!x.resp) sinEv++;
    }
  }
  return { mf, sinEv };
}

function OperatorPanelInner({ valid, onOpenTrip }: { valid: TripResult[]; onOpenTrip: (t: TripResult) => void }) {
  const ops = useMemo(() => compute(valid), [valid]);
  const { mf, sinEv } = useMemo(() => computeMarcasFaltantes(valid), [valid]);
  const mfRows = Object.entries(mf).sort((a, b) => b[1].r - a[1].r || b[1].c - a[1].c);

  return (
    <section className="card p-5 md:p-6 space-y-4">
      <div>
        <div className="text-[11px] text-text-muted uppercase tracking-wider font-bold">Panel 3</div>
        <h2 className="text-lg font-extrabold mt-1">Desempeño por operario</h2>
        <p className="text-xs text-text-muted">Solo incluye registros atribuidos a personas; los automáticos quedan fuera.</p>
      </div>

      {/* Marcas faltantes por operario */}
      <div>
        <h3 className="text-sm font-bold mb-2">Tiempos logísticos no gestionados (marcas faltantes)</h3>
        {mfRows.length ? (
          <div className="overflow-auto border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-text-muted text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">Operario</th>
                  <th className="text-right px-3 py-2">Responsable</th>
                  <th className="text-right px-3 py-2">Corresponsable</th>
                  <th className="text-left px-3 py-2">Marcas que no registró</th>
                  <th className="text-left px-3 py-2">Viajes</th>
                </tr>
              </thead>
              <tbody>
                {mfRows.map(([n, o]) => (
                  <tr key={n} className="border-t border-border">
                    <td className="px-3 py-2 font-bold">{n || "—"}</td>
                    <td className="px-3 py-2 text-right font-extrabold text-bad">{o.r}</td>
                    <td className="px-3 py-2 text-right">{o.c}</td>
                    <td className="px-3 py-2">{Object.entries(o.marcas).map(([m, c]) => `${m} ×${c}`).join(" · ") || "—"}</td>
                    <td className="px-3 py-2">
                      {Array.from(o.trips).map((t) => (
                        <button key={t.key} onClick={() => onOpenTrip(t)} className="text-brand-500 hover:underline mr-1 font-mono">
                          {t.id}
                        </button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-xs bg-[color:var(--ok-bg)] text-ok border-l-4 border-ok rounded px-3 py-2">
            Ningún operario con marcas faltantes atribuidas.
          </div>
        )}
        <p className="text-[11px] text-text-dim mt-2">
          Responsable: registró una novedad que demuestra que la operación ya había ocurrido y no dejó la marca.
          Corresponsable: atendió justo antes en esa etapa.
          {sinEv > 0 && ` · ${sinEv} marca(s) sin evidencia no se atribuyen a nadie.`}
        </p>
      </div>

      {/* Detalle por operario */}
      <div>
        <h3 className="text-sm font-bold mb-2">Detalle por operario</h3>
        {ops.length ? (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {ops.map((s) => {
              const tags = Object.entries(s.tags).sort((a, b) => b[1] - a[1]);
              const topTypes = Object.entries(s.types).sort((a, b) => b[1] - a[1]).slice(0, 5);
              const califCls =
                s.calif === "Crítico" ? "pill-bad" : s.calif === "Bueno" ? "pill-ok" : "pill-warn";
              return (
                <div key={s.name} className="card p-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="font-bold text-sm truncate">{s.name || "(sin asignar)"}</h4>
                    <span className={`pill ${califCls}`}>{s.calif}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2 text-[10px]">
                    <Tag>{s.trips.size} viaje(s)</Tag>
                    <Tag>{s.regs} reg.</Tag>
                    <Tag>{s.alarm.n} alarmas</Tag>
                    <Tag>Prom. {s.prom.toFixed(1)}</Tag>
                  </div>
                  <div className="text-xs text-text-muted mb-1">
                    <b className="text-text">Alarmas:</b>{" "}
                    <span className="text-ok">{s.alarm.ok} ok</span> · <span className="text-warn">{s.alarm.parcial} parciales</span> · <span className="text-bad">{s.alarm.sin} sin</span>
                  </div>
                  {topTypes.length > 0 && (
                    <div className="text-xs text-text-muted mb-1">
                      <b className="text-text">Novedades:</b> {topTypes.map(([k, v]) => `${k} (${v})`).join(" · ")}
                    </div>
                  )}
                  <div className="text-xs text-text-muted">
                    <b className="text-text">Hallazgos:</b>{" "}
                    {tags.length ? (
                      tags.map(([t, n]) => (
                        <span key={t} className="mr-1">
                          {CRIT_TAGS.has(t) ? "🔴" : "🟡"} {TAG_LABEL[t as keyof typeof TAG_LABEL] || t} ×{n}
                        </span>
                      ))
                    ) : (
                      <span className="text-ok">🟢 Sin hallazgos</span>
                    )}
                  </div>
                  {s.clave.size > 0 && (
                    <div className="text-xs text-text-muted mt-1">
                      <b className="text-text">Momentos clave:</b>{" "}
                      {Array.from(s.clave).map((t) => (
                        <button key={t.key} onClick={() => onOpenTrip(t)} className="text-brand-500 hover:underline font-mono mr-1">
                          {t.id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-text-muted">No hay registros de operarios para los filtros seleccionados.</p>
        )}
      </div>
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="bg-surface-2 border border-border rounded px-1.5 py-0.5">{children}</span>;
}

const OperatorPanel = memo(OperatorPanelInner, (a, b) => a.valid === b.valid && a.onOpenTrip === b.onOpenTrip);
export default OperatorPanel;
