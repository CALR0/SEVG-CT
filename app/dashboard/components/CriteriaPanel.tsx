"use client";
import { memo, useMemo } from "react";
import type { TripResult } from "@/lib/engine-types";
import { CRIT, TAG_LABEL } from "@/lib/engine.js";

const CRIT_KEYS = ["sec", "tie", "ala", "cie"] as const;

function CriteriaPanelInner({ valid }: { valid: TripResult[] }) {
  const { averages, worst, freq, maxFreq, affectedCountByWorst } = useMemo(() => {
    const averages = CRIT_KEYS.map((k) => {
      const vs = valid.map((t) => t.scores[k] || 0);
      return [k, vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0] as const;
    });
    const worst = averages.length ? averages.reduce((a, b) => (a[1] <= b[1] ? a : b)) : null;
    const freq: Record<string, number> = {};
    for (const t of valid) {
      const tags = new Set(t.findings.filter((f) => f.nivel !== "ok").map((f) => f.tag));
      for (const tag of tags) freq[tag] = (freq[tag] || 0) + 1;
    }
    const maxFreq = Math.max(1, ...Object.values(freq));
    const affectedCountByWorst = worst ? valid.filter((t) => (t.scores[worst[0]] || 0) < 25).length : 0;
    return { averages, worst, freq, maxFreq, affectedCountByWorst };
  }, [valid]);

  const sortedFreq = Object.entries(freq).sort((a, b) => b[1] - a[1]);

  return (
    <section className="card p-5 md:p-6 space-y-4">
      <div>
        <div className="text-[11px] text-text-muted uppercase tracking-wider font-bold">Panel 4</div>
        <h2 className="text-lg font-extrabold mt-1">Análisis por criterio</h2>
        <p className="text-xs text-text-muted">Hallazgos detectados en los viajes válidos del filtro actual.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div>
          <h3 className="text-sm font-bold mb-2">Promedio por criterio (sobre 25)</h3>
          <div className="space-y-2">
            {averages.map(([k, v]) => {
              const pct = (v / 25) * 100;
              const tone = pct >= 80 ? "bg-ok" : pct >= 50 ? "bg-warn" : "bg-bad";
              return (
                <div key={k} className="grid grid-cols-[140px,1fr,52px] items-center gap-2 text-xs">
                  <span className="font-medium text-text-muted">{CRIT[k]}</span>
                  <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                    <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
                  </div>
                  <b className="text-right tabular-nums">{v.toFixed(1)}</b>
                </div>
              );
            })}
          </div>
          {worst && (
            <div className="mt-3 text-xs bg-[color:var(--warn-bg)] text-text border-l-4 border-warn rounded px-3 py-2">
              <b>Criterio que más falla:</b> {CRIT[worst[0]]} — promedio {worst[1].toFixed(1)}/25, con pérdida en {affectedCountByWorst} de {valid.length} viajes.
            </div>
          )}
        </div>

        <div>
          <h3 className="text-sm font-bold mb-2">Frecuencia de hallazgos (viajes afectados)</h3>
          {sortedFreq.length ? (
            <div className="space-y-2 max-h-80 overflow-auto pr-1">
              {sortedFreq.map(([tag, n]) => {
                const pct = (n / maxFreq) * 100;
                return (
                  <div key={tag} className="grid grid-cols-[160px,1fr,36px] items-center gap-2 text-xs">
                    <span className="font-medium text-text-muted truncate" title={TAG_LABEL[tag as keyof typeof TAG_LABEL] || tag}>
                      {TAG_LABEL[tag as keyof typeof TAG_LABEL] || tag}
                    </span>
                    <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
                      <div className="h-full bg-bad" style={{ width: `${pct}%` }} />
                    </div>
                    <b className="text-right tabular-nums">{n}</b>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs bg-[color:var(--ok-bg)] text-ok border-l-4 border-ok rounded px-3 py-2">
              Sin hallazgos en los viajes filtrados.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const CriteriaPanel = memo(CriteriaPanelInner, (a, b) => a.valid === b.valid);
export default CriteriaPanel;
