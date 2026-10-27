"use client";
import { useMemo, useRef } from "react";
import { PlayIcon, UploadIcon, SpinnerIcon, SearchIcon, AlertIcon } from "@/components/icons";

export type ManifestParseResult = {
  valid: string[];
  duplicates: Array<{ normalized: string; variants: string[]; count: number }>;
};

// Two manifests are "the same" if their numeric body (leading zeros stripped) is
// equal — the user confirmed `0101224058` and `101224058` represent one trip.
export function parseManifests(raw: string): ManifestParseResult {
  const tokens = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const groups = new Map<string, string[]>(); // normalized → raw occurrences
  for (const t of tokens) {
    const key = t.replace(/^0+/, "") || "0";
    const arr = groups.get(key) || [];
    arr.push(t);
    groups.set(key, arr);
  }
  const valid: string[] = [];
  const duplicates: ManifestParseResult["duplicates"] = [];
  for (const [k, variants] of groups) {
    const first = variants.reduce((a, b) => (a.length >= b.length ? a : b));
    valid.push(first);
    if (variants.length > 1 || variants.some((v) => v !== first)) {
      const uniq = Array.from(new Set(variants));
      if (variants.length > 1) duplicates.push({ normalized: k, variants: uniq, count: variants.length });
    }
  }
  return { valid, duplicates };
}

export default function InputPanel({
  raw, setRaw, busy, onRun, onImport, totalTrips, errorCount, importedFiles,
  ignorarVel, onToggleIgnorarVel, onClear,
}: {
  raw: string;
  setRaw: (s: string) => void;
  busy: boolean;
  onRun: (list: string[]) => void;
  onImport: (files: File[]) => void;
  totalTrips: number;
  errorCount: number;
  importedFiles: number;
  ignorarVel: boolean;
  onToggleIgnorarVel: (v: boolean) => void;
  onClear: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { valid, duplicates } = useMemo(() => parseManifests(raw), [raw]);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length) onImport(files);
  }

  const canRun = valid.length > 0 && duplicates.length === 0 && !busy;

  return (
    <section className="card p-5 md:p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted uppercase tracking-wider font-bold">
            <SearchIcon width={14} height={14} /> Entrada
          </div>
          <h2 className="text-lg font-extrabold mt-1">Analizar viajes finalizados</h2>
          <p className="text-sm text-text-muted">Pega manifiestos de ControlT o importa bitácoras .xlsx locales.</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <KpiPill label="Viajes analizados" value={totalTrips} tone="brand" />
          {errorCount > 0 && <KpiPill label="Con error" value={errorCount} tone="bad" />}
          {importedFiles > 0 && <KpiPill label="Archivos locales" value={importedFiles} tone="accent" />}
        </div>
      </div>

      <div className="grid md:grid-cols-[1fr,260px] gap-4 items-start">
        <div>
          <label className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Manifiestos</span>
            <span className="text-[11px] text-text-dim">{valid.length} único(s)</span>
          </label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={6}
            spellCheck={false}
            placeholder={"0101225290\n0101225326\n0101225327"}
            className="input mt-1.5 font-mono text-sm resize-y w-full"
          />
          <div className="flex items-center justify-between text-xs text-text-muted mt-2">
            <span>
              {valid[0] ? <>Primero <code className="font-mono text-brand-500">{valid[0]}</code></> : "Separa por espacio, coma o salto de línea"}
            </span>
          </div>

          {duplicates.length > 0 && (
            <div className="mt-3 bg-[color:var(--warn-bg)] border border-warn/40 rounded-lg px-3 py-2.5 flex items-start gap-2 fade-in">
              <AlertIcon width={18} height={18} className="text-warn mt-0.5 flex-shrink-0" />
              <div className="text-xs text-text">
                <b>Hay {duplicates.length} manifiesto(s) repetido(s).</b> Quítalos para poder analizar:
                <ul className="mt-1 space-y-0.5">
                  {duplicates.map((d) => (
                    <li key={d.normalized} className="font-mono">
                      {d.variants.join(" / ")} <span className="text-text-muted">— ×{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2.5 md:pt-[22px]">
          <button
            onClick={() => onRun(valid)}
            disabled={!canRun}
            className="btn btn-primary w-full py-3"
          >
            {busy ? (
              <><SpinnerIcon width={18} height={18} /> Analizando…</>
            ) : (
              <><PlayIcon width={18} height={18} /> Analizar {valid.length || ""}</>
            )}
          </button>

          <button onClick={() => fileRef.current?.click()} className="btn btn-ghost w-full py-3">
            <UploadIcon width={18} height={18} /> Importar bitácoras .xlsx
          </button>
          <input ref={fileRef} type="file" multiple accept=".xlsx,.xls" onChange={handleFiles} className="hidden" />

          {totalTrips > 0 && (
            <button onClick={onClear} className="btn btn-ghost w-full py-2 text-xs text-text-muted">
              Limpiar sesión
            </button>
          )}
        </div>
      </div>

      {/* Reglas de evaluación (mirror of the HTML's checkbox) */}
      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-4 flex-wrap">
        <label className="flex items-center gap-2.5 cursor-pointer select-none text-sm">
          <input
            type="checkbox"
            checked={ignorarVel}
            onChange={(e) => onToggleIgnorarVel(e.target.checked)}
            className="w-4 h-4 accent-[color:var(--brand-500)]"
          />
          <span>
            <b>No castigar exceso de velocidad</b>
            <span className="text-text-muted"> — las alarmas de velocidad con gestión parcial o sin gestión no restan puntaje.</span>
          </span>
        </label>
        <span className="text-[11px] text-text-dim">
          Analizando sobre JSON de la API · importar .xlsx es opcional
        </span>
      </div>
    </section>
  );
}

function KpiPill({ label, value, tone }: { label: string; value: number | string; tone: "brand" | "accent" | "bad" }) {
  const toneCls =
    tone === "brand"
      ? "bg-brand-50 text-brand-500 border-brand-100"
      : tone === "accent"
      ? "bg-[color:var(--accent-500)]/10 text-accent-500 border-accent-500/30"
      : "bg-[color:var(--bad-bg)] text-bad border-[color:var(--bad)]/30";
  return (
    <div className={`border rounded-xl px-3 py-2 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold">{label}</div>
      <div className="text-xl font-extrabold leading-none mt-0.5">{value}</div>
    </div>
  );
}
