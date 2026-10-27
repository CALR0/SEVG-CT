"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import Header from "@/components/Header";
import InputPanel from "./components/InputPanel";
import AnalysisOverview from "./components/AnalysisOverview";
import TripsTable from "./components/TripsTable";
import TripModal from "./components/TripModal";
import OperatorPanel from "./components/OperatorPanel";
import CriteriaPanel from "./components/CriteriaPanel";
import CriticalPanel from "./components/CriticalPanel";
import MonthSelector, { type MonthSummary } from "./components/MonthSelector";
import { evaluateTrip, parseWorkbook, tripFromBinnacle, setIgnorarVelocidad } from "@/lib/engine.js";
import type { TripResult } from "@/lib/engine-types";
import { binnacleToXlsxBlob, type BinnacleRow, type TripInfo } from "@/lib/binnacle-xlsx";

const DEFAULT_CONCURRENCY = 5;

function pLimit(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => { active--; const r = queue.shift(); if (r) r(); };
  return <T,>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => { active++; fn().then((v) => { resolve(v); next(); }, (e) => { reject(e); next(); }); };
      if (active < n) run(); else queue.push(run);
    });
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type ResolveRow = { manifest: string; idWorkOrder?: number; tripNumber?: string; licensePlate?: string; error?: string };

type ApiEntry = {
  manifest: string;
  idWorkOrder: number;
  info: TripInfo | null;
  binnacleRaw: BinnacleRow[];
  result: TripResult;
};
type FileEntry = { name: string; raw: ArrayBuffer; results: TripResult[] };
type SavedEntry = { manifest: string; result: TripResult; analyzedAt: string };

// Shape que /api/history/save espera (coincide con lib/db.ts SavedTripInput).
type SavedTripInput = {
  id: string;
  file: string;
  placa: string;
  conductor: string;
  missingCols: string[];
  records: Array<Record<string, unknown>>;
};

export default function DashboardClient({ user }: { user: { email: string; name?: string; idCompany: number } }) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [apiEntries, setApiEntries] = useState<ApiEntry[]>([]);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [savedEntries, setSavedEntries] = useState<SavedEntry[]>([]);
  const [errorRows, setErrorRows] = useState<ResolveRow[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripResult | null>(null);
  const [ignorarVel, setIgnorarVel] = useState(true);
  // Persistencia
  const [dbEnabled, setDbEnabled] = useState<boolean | null>(null); // null = aún no consultado
  const [availableMonths, setAvailableMonths] = useState<MonthSummary[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth());
  const [monthLoading, setMonthLoading] = useState(false);

  const pushLog = useCallback((s: string) => {
    setLog((prev) => [new Date().toLocaleTimeString() + " — " + s, ...prev].slice(0, 200));
  }, []);

  // Carga inicial: lista de meses + histórico del mes actual.
  useEffect(() => {
    void loadMonths();
    void loadMonth(currentMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMonths() {
    try {
      const r = await fetch("/api/history/months");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      setDbEnabled(Boolean(j.enabled));
      if (j.enabled) setAvailableMonths(j.months || []);
    } catch (e) {
      setDbEnabled(false);
      pushLog(`Histórico deshabilitado: ${(e as Error).message}`);
    }
  }

  async function loadMonth(month: string) {
    setMonthLoading(true);
    try {
      const r = await fetch(`/api/history?month=${encodeURIComponent(month)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      if (!j.enabled) { setSavedEntries([]); return; }
      const rehydrated: SavedEntry[] = [];
      for (const item of (j.items || []) as Array<{ manifest: string; analyzedAt: string; tripInput: SavedTripInput }>) {
        try {
          // tripInput.records tiene Dates serializadas como strings → re-parsear
          const records = item.tripInput.records.map((r) => rehydrateRecord(r)) as unknown as import("@/lib/engine-types").BitacoraRecord[];
          const result = evaluateTrip({ ...item.tripInput, records });
          result.manifest = item.manifest;
          result.key = `saved:${item.manifest}`;
          rehydrated.push({ manifest: item.manifest, result, analyzedAt: item.analyzedAt });
        } catch (e) {
          pushLog(`${item.manifest}: no se pudo rehidratar (${(e as Error).message})`);
        }
      }
      setSavedEntries(rehydrated);
    } catch (e) {
      pushLog(`Cargar ${month}: ${(e as Error).message}`);
    } finally {
      setMonthLoading(false);
    }
  }

  const isCurrentMonth = selectedMonth === currentMonth();

  // Vista actual = memoria del mes actual + guardados del mes seleccionado.
  // Si se mira un mes pasado, los api/file "en memoria" NO cuentan (son del
  // mes actual) para no confundir al usuario.
  const trips: TripResult[] = useMemo(() => {
    if (isCurrentMonth) {
      const seen = new Set<string>();
      const out: TripResult[] = [];
      for (const e of apiEntries) { out.push(e.result); seen.add(e.result.id); }
      for (const f of fileEntries) for (const r of f.results) { if (!seen.has(r.id)) { out.push(r); seen.add(r.id); } }
      for (const s of savedEntries) if (!seen.has(s.result.id)) { out.push(s.result); seen.add(s.result.id); }
      return out;
    }
    return savedEntries.map((s) => s.result);
  }, [apiEntries, fileEntries, savedEntries, isCurrentMonth]);

  const validTrips = useMemo(() => trips.filter((t) => !t.excluded), [trips]);

  async function saveToDb(manifest: string, idWorkOrder: number | null, result: TripResult, tripInput: SavedTripInput) {
    if (!dbEnabled) return;
    try {
      const r = await fetch("/api/history/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifest,
          idWorkOrder,
          analyzedAt: new Date().toISOString(),
          scoreTotal: result.excluded ? null : result.total,
          calificacion: result.excluded ? null : result.calif,
          excludedReason: result.excluded || null,
          tripInput,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        pushLog(`Guardar ${manifest}: ${j.error || r.status}`);
      }
    } catch (e) {
      pushLog(`Guardar ${manifest}: ${(e as Error).message}`);
    }
  }

  function toggleIgnorarVel(v: boolean) {
    setIgnorarVel(v);
    setIgnorarVelocidad(v);
    setApiEntries((prev) => prev.map((e) => {
      const tripInput = tripFromBinnacle(e.binnacleRaw, e.info as unknown as Record<string, unknown>, e.manifest);
      const result = evaluateTrip(tripInput);
      result.manifest = e.manifest;
      result.key = `api:${e.manifest}`;
      return { ...e, result };
    }));
    setFileEntries((prev) => prev.map((f) => {
      try {
        const wb = XLSX.read(f.raw, { type: "array" });
        const tripsIn = parseWorkbook(wb, f.name, XLSX);
        const results: TripResult[] = [];
        for (const t of tripsIn) {
          const R = evaluateTrip(t);
          R.key = `file:${f.name}#${R.id}`;
          results.push(R);
        }
        return { ...f, results };
      } catch { return f; }
    }));
    // Re-evaluar también lo guardado del mes seleccionado.
    void loadMonth(selectedMonth);
    pushLog(`Regla "exceso de velocidad" ${v ? "ignorada" : "aplicada"} — re-evaluando`);
  }

  async function run(manifests: string[]) {
    if (!manifests.length || busy) return;
    setBusy(true); setErrorRows([]);
    const t0 = performance.now();
    try {
      pushLog(`Resolviendo ${manifests.length} manifiesto(s)…`);
      const r = await fetch("/api/trips/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifests }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      const resolved: ResolveRow[] = j.results;
      const errs = resolved.filter((x) => x.error);
      if (errs.length) setErrorRows((prev) => [...prev.filter((p) => !errs.find((e) => e.manifest === p.manifest)), ...errs]);
      errs.forEach((x) => pushLog(`${x.manifest}: ${x.error}`));

      const limit = pLimit(DEFAULT_CONCURRENCY) as <T>(fn: () => Promise<T>) => Promise<T>;
      const newEntries: ApiEntry[] = [];
      await Promise.all(
        resolved.filter((x) => x.idWorkOrder).map((row) =>
          limit(async () => {
            try {
              const resp = await fetch(`/api/trips/binnacle/${row.idWorkOrder}`);
              const data = await resp.json();
              if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
              const binnacleRaw: BinnacleRow[] = Array.isArray(data.binnacle) ? data.binnacle : [];
              const info = (data.info as TripInfo) || null;
              const tripInput = tripFromBinnacle(binnacleRaw, info as unknown as Record<string, unknown>, row.manifest);
              const result = evaluateTrip(tripInput);
              result.manifest = row.manifest;
              result.key = `api:${row.manifest}`;
              newEntries.push({ manifest: row.manifest, idWorkOrder: row.idWorkOrder!, info, binnacleRaw, result });
              pushLog(`${row.manifest}: ${binnacleRaw.length} eventos · ${result.excluded ? "excluido" : result.total.toFixed(1) + "/100"}`);
              void saveToDb(row.manifest, row.idWorkOrder!, result, serializeTripInput(tripInput));
            } catch (e) {
              pushLog(`${row.manifest}: ${(e as Error).message}`);
              setErrorRows((prev) => [...prev, { manifest: row.manifest, error: (e as Error).message }]);
            }
          })
        )
      );
      setApiEntries((prev) => {
        const idx = new Map(prev.map((x) => [x.manifest, x] as const));
        for (const n of newEntries) idx.set(n.manifest, n);
        return Array.from(idx.values());
      });
      setRaw("");
      pushLog(`Terminado en ${((performance.now() - t0) / 1000).toFixed(1)} s · ${newEntries.length} añadido(s)`);
      // Refrescar lista de meses (puede haber un mes nuevo si cruza frontera)
      void loadMonths();
      // Si estábamos viendo el mes actual, recargar guardados para evitar duplicar
      if (isCurrentMonth) void loadMonth(currentMonth());
    } catch (e) {
      pushLog(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const onImport = useCallback(async (files: File[]) => {
    const t0 = performance.now();
    const added: FileEntry[] = [];
    for (const f of files) {
      try {
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const tripsIn = parseWorkbook(wb, f.name, XLSX);
        const results: TripResult[] = [];
        for (const t of tripsIn) {
          const R = evaluateTrip(t);
          R.key = `file:${f.name}#${R.id}`;
          results.push(R);
          // Guardar también los importados — manifest = R.id
          if (R.id) void saveToDb(R.id, null, R, serializeTripInput(t));
        }
        added.push({ name: f.name, raw: buf, results });
      } catch (e) {
        pushLog(`${f.name}: ${(e as Error).message}`);
      }
    }
    setFileEntries((prev) => [...prev, ...added]);
    pushLog(`${added.length} archivo(s) importado(s) en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    void loadMonths();
    if (isCurrentMonth) void loadMonth(currentMonth());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushLog, dbEnabled, isCurrentMonth]);

  const openTrip = useCallback((t: TripResult) => setSelectedTrip(t), []);
  const closeTrip = useCallback(() => setSelectedTrip(null), []);

  function clearSession() {
    setApiEntries([]); setFileEntries([]); setErrorRows([]); setLog([]);
    pushLog("Memoria de sesión limpiada (histórico persiste)");
  }

  async function selectMonth(m: string) {
    setSelectedMonth(m);
    await loadMonth(m);
  }

  async function clearMonth(m: string) {
    const label = formatMonth(m);
    if (!confirm(`¿Eliminar permanentemente todos los análisis de ${label}? Esta acción no se puede deshacer.`)) return;
    if (!confirm(`Confirma de nuevo: se borrarán los datos de ${label}.`)) return;
    try {
      const r = await fetch(`/api/history?month=${encodeURIComponent(m)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Error");
      pushLog(`${label}: ${j.deleted || 0} registro(s) eliminados`);
      await loadMonths();
      if (m === selectedMonth) await loadMonth(selectedMonth);
    } catch (e) {
      pushLog(`Limpiar ${label}: ${(e as Error).message}`);
    }
  }

  function exportConsolidated() {
    if (!trips.length) return;
    const wb = XLSX.utils.book_new();
    const ranking: unknown[][] = [
      ["Manifiesto", "Placa", "Conductor", "Puntaje", "Secuencia", "Tiempos", "Alarmas", "Cierre", "Calificación", "Inicio", "Fin"],
      ...trips.map((t) => [
        t.id, t.placa, t.conductor,
        t.excluded ? "" : t.total,
        t.scores.sec ?? "", t.scores.tie ?? "", t.scores.ala ?? "", t.scores.cie ?? "",
        t.excluded ? `Excluido (${t.excluded})` : labelize(t.calif),
        t.inicio ? fmtExcelDate(t.inicio) : "",
        t.fin ? fmtExcelDate(t.fin) : "",
      ]),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ranking), "Ranking");
    const findingsRows: unknown[][] = [["Manifiesto", "Dimensión", "Nivel", "Tag", "Texto", "Operario", "Fecha"]];
    for (const t of trips) for (const f of t.findings) {
      findingsRows.push([t.id, f.crit, f.nivel, f.tag, f.texto, f.op || "", f.t ? fmtExcelDate(f.t) : ""]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(findingsRows), "Hallazgos");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    triggerDownload(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      `SEGV-CT_${selectedMonth}_consolidado.xlsx`);
  }

  function exportZip() {
    if (!apiEntries.length && !fileEntries.length) {
      pushLog("ZIP: solo disponible para análisis en memoria del mes actual");
      return;
    }
    const zip = new JSZip();
    for (const e of apiEntries) {
      const blob = binnacleToXlsxBlob(e.binnacleRaw, { info: e.info, manifest: e.manifest });
      zip.file(`api/bitacora_${e.manifest}.xlsx`, blob);
    }
    for (const f of fileEntries) zip.file(`locales/${f.name}`, f.raw);
    zip.generateAsync({ type: "blob" }).then((blob) => {
      triggerDownload(blob, `SEGV-CT_bitacoras_${stamp()}.zip`);
    });
  }

  return (
    <div className="min-h-screen">
      <Header email={user.email} />
      <main className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-5">
        {dbEnabled !== null && (
          <MonthSelector
            current={currentMonth()}
            selected={selectedMonth}
            months={availableMonths}
            loading={monthLoading}
            isPast={!isCurrentMonth}
            onSelect={selectMonth}
            onClearMonth={clearMonth}
          />
        )}

        {dbEnabled === false && (
          <section className="card p-3 text-xs text-text-muted border-[color:var(--warn)]/40 bg-[color:var(--warn-bg)]/30">
            Histórico mensual deshabilitado — no hay <code className="font-mono">DATABASE_URL</code> configurada. Los análisis se mantienen solo durante la sesión.
          </section>
        )}

        {isCurrentMonth && (
          <InputPanel
            raw={raw} setRaw={setRaw}
            busy={busy}
            onRun={run} onImport={onImport}
            totalTrips={trips.length} errorCount={errorRows.length} importedFiles={fileEntries.length}
            ignorarVel={ignorarVel} onToggleIgnorarVel={toggleIgnorarVel}
            onClear={clearSession}
          />
        )}

        {trips.length > 0 && (
          <>
            <AnalysisOverview trips={trips} />
            <TripsTable
              trips={trips}
              onOpen={openTrip}
              onExportConsolidated={exportConsolidated}
              onExportZip={exportZip}
            />
            <OperatorPanel valid={validTrips} onOpenTrip={openTrip} />
            <CriteriaPanel valid={validTrips} />
            <CriticalPanel valid={validTrips} onOpenTrip={openTrip} />
          </>
        )}

        {!isCurrentMonth && trips.length === 0 && !monthLoading && (
          <section className="card p-10 text-center text-text-muted">
            Sin análisis registrados en {formatMonth(selectedMonth)}.
          </section>
        )}

        {errorRows.length > 0 && (
          <section className="card p-4 border-[color:var(--bad)]/30">
            <h3 className="text-sm font-extrabold text-bad mb-2">Manifiestos con error ({errorRows.length})</h3>
            <ul className="text-xs text-text-muted space-y-1">
              {errorRows.map((r, i) => (
                <li key={i}><code className="font-mono text-text">{r.manifest}</code> — {r.error}</li>
              ))}
            </ul>
          </section>
        )}
        {log.length > 0 && (
          <section className="card p-4">
            <details>
              <summary className="font-bold text-sm cursor-pointer">Registro ({log.length})</summary>
              <div className="font-mono text-xs text-text-muted whitespace-pre-wrap max-h-48 overflow-auto mt-2 space-y-0.5">
                {log.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </details>
          </section>
        )}
      </main>
      <TripModal trip={selectedTrip} onClose={closeTrip} />
    </div>
  );
}

// ---- helpers ----

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}
function stamp() {
  const d = new Date(); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}
function labelize(g: string) { return g.charAt(0) + g.slice(1).toLowerCase(); }
function fmtExcelDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const names = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
  const label = names[(m - 1) % 12] || ym;
  return `${label} ${y}`;
}
// JSON.stringify convierte Date → string ISO. Al rehidratar los convertimos
// de vuelta en Date para que el motor compare timestamps correctamente.
function rehydrateRecord(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...r };
  for (const k of ["tAt", "tNov", "t"]) {
    const v = out[k];
    if (typeof v === "string") out[k] = new Date(v);
  }
  return out;
}
// Para guardar en DB: trimmed input (records serializables).
function serializeTripInput(trip: {
  id: string; file: string; placa: string; conductor: string;
  missingCols: string[]; records: Array<Record<string, unknown>>;
}): SavedTripInput {
  return {
    id: trip.id,
    file: trip.file,
    placa: trip.placa,
    conductor: trip.conductor,
    missingCols: trip.missingCols || [],
    records: trip.records,
  };
}
