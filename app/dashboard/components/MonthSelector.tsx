"use client";
import { memo } from "react";
import { SpinnerIcon } from "@/components/icons";

export type MonthSummary = { month: string; count: number };

function format(ym: string): string {
  // "2026-10" → "octubre 2026"
  const [y, m] = ym.split("-").map(Number);
  const names = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const label = names[(m - 1) % 12] || ym;
  return `${label.charAt(0).toUpperCase() + label.slice(1)} ${y}`;
}

function MonthSelectorInner({
  current, selected, months, loading, isPast, onSelect, onClearMonth,
}: {
  current: string;
  selected: string;
  months: MonthSummary[];
  loading: boolean;
  isPast: boolean;
  onSelect: (m: string) => void;
  onClearMonth: (m: string) => void;
}) {
  // Siempre incluir el mes actual, aunque no tenga datos aún.
  const options = [...months];
  if (!options.find((x) => x.month === current)) options.unshift({ month: current, count: 0 });
  options.sort((a, b) => (a.month < b.month ? 1 : -1));

  const selectedSummary = options.find((o) => o.month === selected);

  return (
    <section className="card p-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-[11px] text-text-muted uppercase tracking-wider font-bold">Mes</label>
        <select
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="input py-2 text-sm min-w-[200px]"
        >
          {options.map((o) => (
            <option key={o.month} value={o.month}>
              {format(o.month)}
              {o.count > 0 && ` · ${o.count} viaje${o.count === 1 ? "" : "s"}`}
              {o.month === current && " (actual)"}
            </option>
          ))}
        </select>
        {loading && <SpinnerIcon width={16} height={16} className="text-brand-500" />}
        {selectedSummary && !loading && (
          <span className="text-xs text-text-muted">
            {selectedSummary.count} análisis acumulado{selectedSummary.count === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {isPast && selectedSummary && selectedSummary.count > 0 && (
        <button
          onClick={() => onClearMonth(selected)}
          className="btn btn-ghost text-xs py-1.5 px-3 border border-[color:var(--bad)]/30 text-bad hover:bg-[color:var(--bad-bg)]"
          title={`Elimina los ${selectedSummary.count} análisis de ${format(selected)}`}
        >
          Limpiar {format(selected)}
        </button>
      )}
    </section>
  );
}

const MonthSelector = memo(MonthSelectorInner);
export default MonthSelector;
