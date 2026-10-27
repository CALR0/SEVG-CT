"use client";
import { useCallback, useMemo, useState } from "react";
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

type ResolveRow = { manifest: string; idWorkOrder?: number; tripNumber?: string; licensePlate?: string; error?: string };
// We keep the raw inputs for every analyzed trip so a config toggle (e.g. "no
// castigar exceso de velocidad") can re-run evaluateTrip without re-fetching.
type ApiEntry = {
  manifest: string;
  idWorkOrder: number;
  info: TripInfo | null;
  binnacleRaw: BinnacleRow[];
  result: TripResult;
};
type FileEntry = { name: string; raw: ArrayBuffer; results: TripResult[] };

export default function DashboardClient({ user }: { user: { email: string; name?: string; idCompany: number } }) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [apiEntries, setApiEntries] = useState<ApiEntry[]>([]);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [errorRows, setErrorRows] = useState<ResolveRow[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<TripResult | null>(null);
  const [ignorarVel, setIgnorarVel] = useState(true); // mirrors CONFIG.ignorarVelocidad default

  const pushLog = useCallback((s: string) => {
    setLog((prev) => [new Date().toLocaleTimeString() + " — " + s, ...prev].slice(0, 200));
  }, []);

  const trips: TripResult[] = useMemo(() => {
    const out: TripResult[] = apiEntries.map((e) => e.result);
    for (const f of fileEntries) out.push(...f.results);
    return out;
  }, [apiEntries, fileEntries]);
  const validTrips = useMemo(() => trips.filter((t) => !t.excluded), [trips]);

  function toggleIgnorarVel(v: boolean) {
    setIgnorarVel(v);
    setIgnorarVelocidad(v);
    // Re-evaluate everything with the new rule, without re-downloading or re-reading.
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
    pushLog(`Regla "exceso de velocidad" ${v ? "ignorada" : "aplicada"} — re-evaluando ${apiEntries.length + fileEntries.length} fuente(s)`);
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
      setRaw(""); // leave the textarea clean; results accumulate below
      pushLog(`Terminado en ${((performance.now() - t0) / 1000).toFixed(1)} s · ${newEntries.length} añadido(s) · total acumulado ${apiEntries.length + newEntries.length + fileEntries.reduce((s, f) => s + f.results.length, 0)}`);
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
        }
        added.push({ name: f.name, raw: buf, results });
      } catch (e) {
        pushLog(`${f.name}: ${(e as Error).message}`);
      }
    }
    setFileEntries((prev) => [...prev, ...added]);
    pushLog(`${added.length} archivo(s) importado(s) en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }, [pushLog]);

  const openTrip = useCallback((t: TripResult) => setSelectedTrip(t), []);
  const closeTrip = useCallback(() => setSelectedTrip(null), []);

  function clearAll() {
    setApiEntries([]); setFileEntries([]); setErrorRows([]); setLog([]);
    pushLog("Sesión limpiada");
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
      `SEGV-CT_analisis_${stamp()}.xlsx`);
  }

  function exportZip() {
    if (!apiEntries.length && !fileEntries.length) return;
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
        <InputPanel
          raw={raw} setRaw={setRaw}
          busy={busy}
          onRun={run} onImport={onImport}
          totalTrips={trips.length} errorCount={errorRows.length} importedFiles={fileEntries.length}
          ignorarVel={ignorarVel} onToggleIgnorarVel={toggleIgnorarVel}
          onClear={clearAll}
        />
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
