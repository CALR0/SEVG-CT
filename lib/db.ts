// Persistencia opcional en Neon Postgres. Si DATABASE_URL no está definida
// la webapp funciona en modo "solo memoria" (histórico deshabilitado).
//
// Decisión de diseño: guardamos el INPUT del motor (records parseados), no el
// output. Así, cualquier cambio futuro al motor v8.x reevalúa el histórico con
// la lógica nueva al cargarlo, sin migraciones.

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export type SavedTripInput = {
  id: string;
  file: string;
  placa: string;
  conductor: string;
  missingCols: string[];
  records: Array<Record<string, unknown>>; // records parseados (lo que recibe evaluateTrip)
};

export type SavedAnalysis = {
  manifest: string;
  idWorkOrder: number | null;
  analyzedAt: string;        // ISO
  scoreTotal: number | null; // null si excluido
  calificacion: string | null;
  excludedReason: string | null;
  tripInput: SavedTripInput;
};

export type MonthSummary = { month: string; count: number };

let _sql: NeonQueryFunction<false, false> | null = null;
let _initPromise: Promise<void> | null = null;

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getSql(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }
  if (!_sql) _sql = neon(process.env.DATABASE_URL);
  return _sql;
}

/**
 * Crea la tabla la primera vez que se usa. Idempotente — las subsecuentes
 * invocaciones son no-ops instantáneas.
 */
async function ensureSchema(): Promise<void> {
  if (_initPromise) return _initPromise;
  const sql = getSql();
  _initPromise = (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS analyses (
        id BIGSERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        manifest TEXT NOT NULL,
        id_work_order BIGINT,
        analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        month TEXT GENERATED ALWAYS AS (to_char(analyzed_at AT TIME ZONE 'UTC', 'YYYY-MM')) STORED,
        score_total NUMERIC(5,2),
        calificacion TEXT,
        excluded_reason TEXT,
        trip_input JSONB NOT NULL,
        CONSTRAINT uq_user_manifest_month UNIQUE (user_email, manifest, month)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_analyses_user_month ON analyses (user_email, month DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_analyses_user_date ON analyses (user_email, analyzed_at DESC)`;
  })().catch((e) => {
    _initPromise = null; // permite reintentar en la próxima llamada
    throw e;
  });
  return _initPromise;
}

export async function saveAnalysis(userEmail: string, a: SavedAnalysis): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql`
    INSERT INTO analyses (
      user_email, manifest, id_work_order, analyzed_at,
      score_total, calificacion, excluded_reason, trip_input
    ) VALUES (
      ${userEmail}, ${a.manifest}, ${a.idWorkOrder}, ${a.analyzedAt},
      ${a.scoreTotal}, ${a.calificacion}, ${a.excludedReason}, ${JSON.stringify(a.tripInput)}::jsonb
    )
    ON CONFLICT (user_email, manifest, month)
    DO UPDATE SET
      id_work_order    = EXCLUDED.id_work_order,
      analyzed_at      = EXCLUDED.analyzed_at,
      score_total      = EXCLUDED.score_total,
      calificacion     = EXCLUDED.calificacion,
      excluded_reason  = EXCLUDED.excluded_reason,
      trip_input       = EXCLUDED.trip_input
  `;
}

export async function listMonths(userEmail: string): Promise<MonthSummary[]> {
  await ensureSchema();
  const sql = getSql();
  const rows = (await sql`
    SELECT month, COUNT(*)::int AS count
    FROM analyses
    WHERE user_email = ${userEmail}
    GROUP BY month
    ORDER BY month DESC
  `) as Array<{ month: string; count: number }>;
  return rows;
}

export async function getMonth(userEmail: string, month: string): Promise<SavedAnalysis[]> {
  await ensureSchema();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month format");
  const sql = getSql();
  const rows = (await sql`
    SELECT manifest, id_work_order, analyzed_at, score_total, calificacion, excluded_reason, trip_input
    FROM analyses
    WHERE user_email = ${userEmail} AND month = ${month}
    ORDER BY analyzed_at DESC
  `) as Array<{
    manifest: string;
    id_work_order: number | null;
    analyzed_at: string;
    score_total: string | number | null;
    calificacion: string | null;
    excluded_reason: string | null;
    trip_input: SavedTripInput;
  }>;
  return rows.map((r) => ({
    manifest: r.manifest,
    idWorkOrder: r.id_work_order,
    analyzedAt: typeof r.analyzed_at === "string" ? r.analyzed_at : new Date(r.analyzed_at).toISOString(),
    scoreTotal: r.score_total == null ? null : Number(r.score_total),
    calificacion: r.calificacion,
    excludedReason: r.excluded_reason,
    tripInput: r.trip_input,
  }));
}

export async function deleteMonth(userEmail: string, month: string): Promise<number> {
  await ensureSchema();
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Invalid month format");
  const sql = getSql();
  const result = (await sql`
    DELETE FROM analyses
    WHERE user_email = ${userEmail} AND month = ${month}
    RETURNING id
  `) as Array<{ id: number }>;
  return result.length;
}

export function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
