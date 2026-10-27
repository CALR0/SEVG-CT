// Ambient types for lib/engine.js
import type { TripResult, BitacoraRecord } from "./engine-types";

export const CONFIG: {
  version: string;
  retrasoMin: number;
  sec: Record<string, number>;
  ala: Record<string, number>;
  ignorarVelocidad: boolean;
  cierre: Array<[number, number]>;
};

export const CRIT: { sec: string; tie: string; ala: string; cie: string };
export const GN: Record<string, string>;
export const TAG_LABEL: Record<string, string>;
export const ACCIONES: Record<string, [string, string]>;
export const MARK_LABEL: Record<string, string>;
export function setIgnorarVelocidad(v: boolean): void;

export function norm(s: unknown): string;
export function toDate(v: unknown): Date | null;
export function markKey(tn: string): string | null;
export function calificacion(p: number): string;

export function parseWorkbook(wb: unknown, fileName: string, XLSX: unknown): Array<{
  id: string; file: string; placa: string; conductor: string;
  records: BitacoraRecord[]; missingCols: string[];
}>;
export function evaluateTrip(trip: {
  id: string; file: string; placa: string; conductor: string;
  records: BitacoraRecord[]; missingCols: string[];
}): TripResult;
export function accionesDe(R: TripResult): Array<[string, string]>;
export function tripFromBinnacle(
  binnacle: unknown[],
  info: Record<string, unknown> | null,
  manifest: string
): { id: string; file: string; placa: string; conductor: string; records: BitacoraRecord[]; missingCols: string[] };
