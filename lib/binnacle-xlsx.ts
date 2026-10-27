// Converts the Binnacle JSON that reports-api returns into an .xlsx workbook
// whose columns match the one Control T builds client-side when the user clicks
// the Excel icon on the Bitácora panel. This keeps the current v8.8 dashboard
// parser happy (it looks up headers like "Tipo de novedad", "Atención", etc.).

import * as XLSX from "xlsx";

export type BinnacleRow = {
  id_monitoring_order?: number;
  trip_number?: string | null;
  license_plate?: string | null;
  travel_status?: string | null;
  type_location?: string | null;
  description?: string | null;
  address?: string | null;
  alarm?: string | null;
  date_novelty_utc?: string | null;
  date_novelty_ct?: string | null;
  date_attend_utc?: string | null;
  date_attend_ct?: string | null;
  username?: string | null;
  type_novelty?: string | null;
  management?: string | null;
  temperature?: number | null;
  hasImage?: boolean;
  email_content?: string | null;
  type_services?: string | null;
  trackingPhoto?: string | null;
};

export type TripInfo = {
  idMonitoringOrder?: number;
  tripNumber?: string;
  identificationDriver?: string;
  nameDriver?: string;
  licensePlate?: string;
  origin?: string;
  destiny?: string;
  dateCreated?: string;
  typeOperation?: string;
  typeTrip?: string;
};

// Control T emits dates like "10/27/2026T02:00:26" (MM/DD/YYYY'T'HH:mm:ss) in
// the local time zone. We rewrite them to a standard "DD/MM/YYYY HH:mm:ss" that
// both the v8.8 engine's toDate() and Excel itself can parse unambiguously.
function reformatCTDate(s: string | null | undefined): string {
  if (!s) return "";
  const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return String(s);
  const [, mo, d, y, hh, mm, ss = "00"] = m;
  return `${d.padStart(2, "0")}/${mo.padStart(2, "0")}/${y} ${hh}:${mm}:${ss}`;
}

export type BuildOptions = { info?: TripInfo | null; manifest?: string };

export function binnacleToSheetAoA(rows: BinnacleRow[], opts: BuildOptions = {}): unknown[][] {
  const info = opts.info || null;
  const tripNumber = opts.manifest || info?.tripNumber || rows[0]?.trip_number || "";
  const licensePlate = info?.licensePlate || rows[0]?.license_plate || "";
  const driver = info?.nameDriver || "";

  const header = [
    "No. Viaje",
    "Placa",
    "Conductor",
    "Tipo de novedad",
    "Fecha-Hora Novedad",
    "Fecha-Hora Atención",
    "Alarma",
    "Atendida por",
    "Gestión",
    "Descripción de la ubicación",
    "Tipo de ubicación",
    "Dirección",
    "Tipo de servicio",
  ];

  const data = rows.map((r) => [
    tripNumber || r.trip_number || "",
    licensePlate || r.license_plate || "",
    driver,
    r.type_novelty || "",
    reformatCTDate(r.date_novelty_ct),
    reformatCTDate(r.date_attend_ct),
    r.alarm || "",
    r.username || "",
    (r.management || "").replace(/\r?\n/g, " "),
    r.description || "",
    r.type_location || "",
    r.address || "",
    r.type_services || "",
  ]);

  return [header, ...data];
}

export function binnacleToWorkbook(rows: BinnacleRow[], opts: BuildOptions = {}): XLSX.WorkBook {
  const aoa = binnacleToSheetAoA(rows, opts);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // widths that read well in Excel
  (ws as XLSX.WorkSheet)["!cols"] = [
    { wch: 12 }, { wch: 10 }, { wch: 28 }, { wch: 26 }, { wch: 20 }, { wch: 20 },
    { wch: 22 }, { wch: 24 }, { wch: 60 }, { wch: 40 }, { wch: 16 }, { wch: 36 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bitácora");
  return wb;
}

export function binnacleToXlsxBlob(rows: BinnacleRow[], opts: BuildOptions = {}): Blob {
  const wb = binnacleToWorkbook(rows, opts);
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
