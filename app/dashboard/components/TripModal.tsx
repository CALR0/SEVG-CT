"use client";
import { memo, useEffect } from "react";
import type { TripResult, Finding } from "@/lib/engine-types";
import { accionesDe, CRIT, TAG_LABEL } from "@/lib/engine.js";
import { XIcon } from "@/components/icons";

function TripModalInner({ trip, onClose }: { trip: TripResult | null; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = trip ? "hidden" : "";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [trip, onClose]);

  if (!trip) return null;
  const T = trip;
  const grade = T.excluded ? "Excluido" : labelize(T.calif);
  const gradeClass =
    grade === "Excelente" || grade === "Bueno" ? "from-ok to-ok"
    : grade === "Regular" ? "from-warn to-warn"
    : grade === "Excluido" ? "from-text-dim to-text-muted"
    : "from-bad to-bad";

  const findingsByCrit = (c: Finding["crit"]) => T.findings.filter((f) => f.crit === c);
  const acciones = accionesDe(T) as [string, string][];

  return (
    <div className="fixed inset-0 z-40 flex items-start md:items-center justify-center p-3 md:p-6 bg-black/70 fade-in overflow-auto"
         onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
           className="w-full max-w-5xl bg-bg rounded-xl3 overflow-hidden shadow-pop">
        {/* Banner */}
        <div className={`bg-gradient-to-r ${gradeClass} text-white p-5 md:p-6 flex items-start justify-between flex-wrap gap-3 relative`}>
          <div>
            <div className="text-[11px] uppercase tracking-widest opacity-80">Manifiesto</div>
            <div className="text-2xl md:text-3xl font-extrabold font-mono">{T.id}</div>
            <div className="text-sm opacity-90 mt-1">
              <b>{T.placa || "—"}</b> · {T.conductor || "—"}
              {T.inicio && <> · {fmtDate(T.inicio)}</>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-widest opacity-80">
              {T.excluded ? "Estado" : "Puntaje total"}
            </div>
            {T.excluded ? (
              <div className="text-xl font-extrabold mt-1">{T.excluded}</div>
            ) : (
              <>
                <div className="text-4xl md:text-5xl font-extrabold leading-none mt-1">{T.total.toFixed(1)}</div>
                <div className="text-sm opacity-90 mt-1">{grade}</div>
              </>
            )}
          </div>
          <button onClick={onClose} className="absolute top-3 right-3 bg-white/20 hover:bg-white/30 w-8 h-8 rounded-full grid place-items-center">
            <XIcon width={16} height={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 md:p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
          {T.excluded ? (
            <div className="card p-5 text-sm text-text-muted">
              Este viaje fue excluido del análisis por <b className="text-text">{T.excluded}</b>
              {T.excludedTipo && <> · ({T.excludedTipo})</>}.
            </div>
          ) : (
            <>
              {/* Scores by dimension */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["sec", "tie", "ala", "cie"] as const).map((k) => {
                  const v = T.scores[k] || 0;
                  const pct = (v / 25) * 100;
                  const tone = pct >= 80 ? "ok" : pct >= 50 ? "warn" : "bad";
                  return (
                    <div key={k} className="card p-3">
                      <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold">{CRIT[k]}</div>
                      <div className="text-2xl font-extrabold mt-1">{v.toFixed(1)}<span className="text-xs text-text-dim">/25</span></div>
                      <div className="h-1.5 bg-surface-2 rounded-full mt-2 overflow-hidden">
                        <div className={`h-full bg-${tone}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Durations */}
              {(T.durCargue != null || T.durDescargue != null || T.cierreMin != null) && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {T.durCargue != null && <MiniKpi label="Duración cargue" value={`${T.durCargue} min`} />}
                  {T.durDescargue != null && <MiniKpi label="Duración descargue" value={`${T.durDescargue} min`} />}
                  {T.cierreMin != null && (
                    <MiniKpi
                      label="Cierre"
                      value={`${T.cierreMin >= 0 ? "+" : ""}${T.cierreMin} min`}
                      tone={T.cierreMin < 0 ? "bad" : T.cierreMin <= 60 ? "ok" : T.cierreMin <= 120 ? "warn" : "bad"}
                    />
                  )}
                </div>
              )}

              {/* Findings tabs by criterion */}
              <div className="space-y-3">
                {(["sec", "tie", "ala", "cie"] as const).map((k) => {
                  const list = findingsByCrit(k);
                  if (!list.length) return null;
                  return (
                    <div key={k} className="card p-4">
                      <h3 className="text-sm font-extrabold mb-2 flex items-center justify-between">
                        <span>{CRIT[k]}</span>
                        <span className="text-xs text-text-muted font-medium">{list.length} hallazgo(s)</span>
                      </h3>
                      <ul className="space-y-1.5">
                        {list.map((f, i) => (
                          <li key={i} className={`text-sm pl-3 border-l-4 py-1.5 ${
                            f.nivel === "crit" ? "border-bad bg-[color:var(--bad-bg)]"
                            : f.nivel === "warn" ? "border-warn bg-[color:var(--warn-bg)]"
                            : "border-ok bg-[color:var(--ok-bg)]"
                          }`}>
                            <span className="text-xs text-text-muted mr-1">[{TAG_LABEL[f.tag as keyof typeof TAG_LABEL] || f.tag}]</span>
                            {f.texto}
                            {f.op && <span className="text-xs text-text-muted ml-1">· {f.op}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              {acciones.length > 0 && (
                <div className="card p-4">
                  <h3 className="text-sm font-extrabold mb-2">Acciones recomendadas</h3>
                  <ul className="space-y-2">
                    {acciones.map(([lvl, txt], i) => {
                      const tone = lvl === "Crítico" ? "bad" : lvl === "Importante" ? "warn" : lvl === "Buena práctica" ? "ok" : "neutral";
                      return (
                        <li key={i} className="flex gap-2 items-start text-sm">
                          <span className={`pill pill-${tone === "neutral" ? "neutral" : tone} flex-shrink-0`}>{lvl}</span>
                          <span>{txt}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Operators */}
              {Object.keys(T.ops).length > 0 && (
                <div className="card p-4">
                  <h3 className="text-sm font-extrabold mb-2">Operarios del viaje</h3>
                  <div className="grid md:grid-cols-2 gap-2">
                    {Object.entries(T.ops).map(([name, agg]) => (
                      <div key={name} className="bg-surface-2 rounded-lg p-3">
                        <div className="font-bold text-sm">{name || "—"}</div>
                        <div className="text-xs text-text-muted">{agg.n} registro(s)</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Array.from(agg.marcas).map((m) => (
                            <span key={m} className="text-[10px] bg-brand-50 text-brand-500 px-1.5 py-0.5 rounded">{m}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniKpi({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const bg = tone === "ok" ? "bg-ok" : tone === "warn" ? "bg-warn" : tone === "bad" ? "bg-bad" : "";
  return (
    <div className="card p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-bold">{label}</div>
      <div className={`text-xl font-extrabold mt-1 ${tone ? `inline-block px-2 py-0.5 rounded text-white ${bg}` : ""}`}>{value}</div>
    </div>
  );
}

function fmtDate(d: Date) {
  return d.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function labelize(g: string) {
  return g.charAt(0) + g.slice(1).toLowerCase();
}

const TripModal = memo(TripModalInner, (a, b) => a.trip === b.trip && a.onClose === b.onClose);
export default TripModal;
