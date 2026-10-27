"use client";
import { memo, useEffect, useMemo, useState } from "react";
import type { TripResult, Finding } from "@/lib/engine-types";
import { TAG_LABEL } from "@/lib/engine.js";
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, DownloadIcon } from "@/components/icons";

const PAGE_SIZE = 10;

function hallazgosCortos(t: TripResult): string {
  const f = t.findings.filter((x) => x.nivel !== "ok");
  if (!f.length) return "Sin hallazgos detectados";
  const c: Record<string, number> = {};
  f.forEach((x) => { c[x.tag] = (c[x.tag] || 0) + 1; });
  return Object.entries(c)
    .sort((a, b) => (isCritTag(f, b[0]) ? 1 : 0) - (isCritTag(f, a[0]) ? 1 : 0) || b[1] - a[1])
    .slice(0, 3)
    .map(([k, n]) => (TAG_LABEL[k as keyof typeof TAG_LABEL] || k) + (n > 1 ? ` (${n})` : ""))
    .join("; ");
}
function isCritTag(f: Finding[], tag: string) {
  return (f.find((x) => x.tag === tag) || { nivel: "" }).nivel === "crit";
}

function TripsTableInner({
  trips, onOpen, onExportConsolidated, onExportZip,
}: {
  trips: TripResult[];
  onOpen: (t: TripResult) => void;
  onExportConsolidated: () => void;
  onExportZip: () => void;
}) {
  const [page, setPage] = useState(1);
  const [grade, setGrade] = useState("");
  const [op, setOp] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<"total" | "id" | "inicio" | "sec" | "tie" | "ala" | "cie">("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const h = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 180);
    return () => clearTimeout(h);
  }, [search]);

  const operators = useMemo(() => {
    const s = new Set<string>();
    for (const t of trips) for (const k of Object.keys(t.ops)) if (k) s.add(k);
    return Array.from(s).sort();
  }, [trips]);

  const valid = useMemo(() => trips.filter((t) => !t.excluded), [trips]);
  const excluded = useMemo(() => trips.filter((t) => t.excluded), [trips]);

  const filtered = useMemo(() => {
    let out = valid.slice();
    if (grade) out = out.filter((t) => labelize(t.calif) === grade);
    if (op) out = out.filter((t) => Object.keys(t.ops).includes(op));
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      out = out.filter((t) =>
        t.id.toLowerCase().includes(q) ||
        (t.placa || "").toLowerCase().includes(q) ||
        (t.conductor || "").toLowerCase().includes(q) ||
        t.records.some((r) => r.tipo.toLowerCase().includes(q) || r.gestion.toLowerCase().includes(q))
      );
    }
    out.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "id": return a.id.localeCompare(b.id) * dir;
        case "inicio": return ((a.inicio ? +a.inicio : 0) - (b.inicio ? +b.inicio : 0)) * dir;
        case "sec": return ((a.scores.sec || 0) - (b.scores.sec || 0)) * dir;
        case "tie": return ((a.scores.tie || 0) - (b.scores.tie || 0)) * dir;
        case "ala": return ((a.scores.ala || 0) - (b.scores.ala || 0)) * dir;
        case "cie": return ((a.scores.cie || 0) - (b.scores.cie || 0)) * dir;
        default: return (a.total - b.total) * dir;
      }
    });
    return out;
  }, [valid, grade, op, debouncedSearch, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(k: typeof sortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "id" ? "asc" : "desc"); }
  }

  const bestKey = valid.length > 1 ? valid.reduce((a, b) => a.total >= b.total ? a : b).key : null;
  const worstKey = valid.length > 1 ? valid.reduce((a, b) => a.total <= b.total ? a : b).key : null;

  return (
    <section className="card p-5 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] text-text-muted uppercase tracking-wider font-bold">Panel 2</div>
          <h2 className="text-lg font-extrabold mt-1">Ranking de viajes</h2>
          <p className="text-xs text-text-muted">Mejor a peor. Clic en una fila para abrir la tarjeta. Los excluidos aparecen aparte.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={onExportConsolidated} disabled={!trips.length} className="btn btn-subtle text-sm py-2 px-3">
            <DownloadIcon width={16} height={16} /> Consolidado .xlsx
          </button>
          <button onClick={onExportZip} disabled={!trips.length} className="btn btn-accent text-sm py-2 px-3">
            <DownloadIcon width={16} height={16} /> Bitácoras (ZIP)
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="col-span-2 md:col-span-1">
          <select value={grade} onChange={(e) => { setGrade(e.target.value); setPage(1); }} className="input py-2 text-sm">
            <option value="">Todas las calificaciones</option>
            {["Excelente", "Bueno", "Regular", "Deficiente", "Muy deficiente"].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <select value={op} onChange={(e) => { setOp(e.target.value); setPage(1); }} className="input py-2 text-sm">
          <option value="">Todos los operarios</option>
          {operators.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <div className="col-span-2 md:col-span-2 relative">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar manifiesto, placa, novedad…"
            className="input py-2 text-sm pl-9"
          />
          <FilterIcon width={16} height={16} className="absolute left-3 top-2.5 text-text-dim" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <SortTh label="Manifiesto" active={sortKey === "id"} dir={sortDir} onClick={() => toggleSort("id")} />
              <SortTh label="Inicio" active={sortKey === "inicio"} dir={sortDir} onClick={() => toggleSort("inicio")} />
              <SortTh label="Sec." active={sortKey === "sec"} dir={sortDir} onClick={() => toggleSort("sec")} align="right" />
              <SortTh label="Tiempos" active={sortKey === "tie"} dir={sortDir} onClick={() => toggleSort("tie")} align="right" />
              <SortTh label="Alarmas" active={sortKey === "ala"} dir={sortDir} onClick={() => toggleSort("ala")} align="right" />
              <SortTh label="Cierre" active={sortKey === "cie"} dir={sortDir} onClick={() => toggleSort("cie")} align="right" />
              <SortTh label="Total" active={sortKey === "total"} dir={sortDir} onClick={() => toggleSort("total")} align="right" />
              <th className="text-left px-3 py-2.5">Calificación</th>
              <th className="text-left px-3 py-2.5">Hallazgos</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 && (
              <tr><td colSpan={9} className="text-center text-text-dim py-10">Sin viajes válidos con los filtros actuales</td></tr>
            )}
            {pageItems.map((t) => {
              const edge = t.key === bestKey ? "border-l-4 border-ok" : t.key === worstKey ? "border-l-4 border-bad" : "";
              return (
                <tr key={t.key || t.id} onClick={() => onOpen(t)}
                    className={`border-t border-border hover:bg-surface-2 cursor-pointer transition ${edge}`}>
                  <td className="px-3 py-2.5 font-mono font-semibold text-brand-500">{t.id}</td>
                  <td className="px-3 py-2.5 text-text-muted whitespace-nowrap">{t.inicio ? fmtDate(t.inicio) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{(t.scores.sec || 0).toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{(t.scores.tie || 0).toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{(t.scores.ala || 0).toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{(t.scores.cie || 0).toFixed(1)}</td>
                  <td className="px-3 py-2.5 text-right font-extrabold tabular-nums">{t.total.toFixed(1)}</td>
                  <td className="px-3 py-2.5"><GradePill t={t} /></td>
                  <td className="px-3 py-2.5 text-xs text-text-muted max-w-[320px] truncate" title={hallazgosCortos(t)}>{hallazgosCortos(t)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-xs text-text-muted">
          {filtered.length === 0 ? "0" : `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filtered.length)}`} de <b>{filtered.length}</b>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="btn btn-ghost px-2 py-1.5 text-xs">
            <ChevronLeftIcon width={14} height={14} />
          </button>
          <PageNumbers total={totalPages} current={safePage} onPick={setPage} />
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="btn btn-ghost px-2 py-1.5 text-xs">
            <ChevronRightIcon width={14} height={14} />
          </button>
        </div>
      </div>

      {/* Excluded trips */}
      <div>
        <h3 className="text-sm font-bold mb-2">Registro administrativo de viajes excluidos</h3>
        {excluded.length ? (
          <div className="overflow-auto border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-surface-2 text-text-muted text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="text-left px-3 py-2">Manifiesto</th>
                  <th className="text-left px-3 py-2">Inicio</th>
                  <th className="text-left px-3 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {excluded.map((t) => (
                  <tr key={t.key || t.id} onClick={() => onOpen(t)} className="border-t border-border hover:bg-surface-2 cursor-pointer">
                    <td className="px-3 py-2 font-mono text-brand-500">{t.id}</td>
                    <td className="px-3 py-2 text-text-muted whitespace-nowrap">{t.inicio ? fmtDate(t.inicio) : "—"}</td>
                    <td className="px-3 py-2 text-text-muted">{capitalize(t.excluded!)} — "{t.excludedTipo}"</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-text-muted">No hay viajes excluidos.</p>
        )}
      </div>
    </section>
  );
}

const TripsTable = memo(TripsTableInner, (a, b) =>
  a.trips === b.trips &&
  a.onOpen === b.onOpen &&
  a.onExportConsolidated === b.onExportConsolidated &&
  a.onExportZip === b.onExportZip
);
export default TripsTable;

function PageNumbers({ total, current, onPick }: { total: number; current: number; onPick: (n: number) => void }) {
  const pages: (number | "…")[] = [];
  if (total <= 7) { for (let i = 1; i <= total; i++) pages.push(i); }
  else {
    pages.push(1);
    if (current > 3) pages.push("…");
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push("…");
    pages.push(total);
  }
  return (
    <>
      {pages.map((p, i) =>
        p === "…" ? (<span key={i} className="px-2 text-text-dim text-xs">…</span>)
        : (
          <button key={i} onClick={() => onPick(p)}
            className={`min-w-[30px] h-7 rounded-md text-xs font-bold transition ${p === current ? "bg-brand-500 text-white" : "hover:bg-surface-2 text-text-muted"}`}>
            {p}
          </button>
        )
      )}
    </>
  );
}

function SortTh({ label, active, dir, onClick, align }: { label: string; active?: boolean; dir: "asc" | "desc"; onClick: () => void; align?: "right" }) {
  return (
    <th className={`px-3 py-2.5 ${align === "right" ? "text-right" : "text-left"} cursor-pointer select-none whitespace-nowrap`} onClick={onClick}>
      <span className={active ? "text-brand-500" : ""}>{label}{active && (dir === "asc" ? " ▲" : " ▼")}</span>
    </th>
  );
}

function GradePill({ t }: { t: TripResult }) {
  const g = labelize(t.calif);
  const cls = g === "Excelente" || g === "Bueno" ? "pill-ok" : g === "Regular" ? "pill-warn" : "pill-bad";
  return <span className={`pill ${cls}`}>{g}</span>;
}

function labelize(g: string) { return g.charAt(0) + g.slice(1).toLowerCase(); }
function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmtDate(d: Date) {
  return d.toLocaleString("es-CO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
