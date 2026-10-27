// Shape of what evaluateTrip() returns (the engine stays in JS; this is the type
// surface React components use).

export type BitacoraRecord = {
  viaje: string;
  ubic: string;
  i: number;
  tAt: Date | null;
  tNov: Date | null;
  t: Date | null;
  tipo: string;
  tipoN: string;
  alarma: string;
  alarmaN: string;
  atendida: string;
  auto: boolean;
  gestion: string;
  gestionN: string;
  mark?: string[] | null;
};

export type Finding = {
  crit: "sec" | "tie" | "ala" | "cie";
  nivel: "ok" | "warn" | "crit";
  tag: string;
  texto: string;
  rec: BitacoraRecord | null;
  op: string | null;
  t: Date | null;
};

export type OperatorAggregate = { n: number; marcas: Set<string> };

export type FaltanteOp = {
  marca: string;
  resp: string | null;
  evid: string | null;
  co: string | null;
  coTipo: string | null;
};

export type Alarma = {
  r: BitacoraRecord;
  tipo: string;
  q: "ok" | "parcial" | "sin";
  masiva: boolean;
};

export type Grade = "EXCELENTE" | "BUENO" | "REGULAR" | "DEFICIENTE" | "MUY DEFICIENTE";

export type TripResult = {
  id: string;
  file: string;
  placa: string;
  conductor: string;
  missingCols: string[];
  records: BitacoraRecord[];
  findings: Finding[];
  excluded: string | null;
  excludedTipo?: string;
  scores: { sec?: number; tie?: number; ala?: number; cie?: number };
  ops: Record<string, OperatorAggregate>;
  inicio: Date | null;
  fin: Date | null;
  clientes: number;
  faltantesOp: FaltanteOp[];
  durCargue: number | null;
  durDescargue: number | null;
  alarmas: Alarma[];
  velIgnoradas?: number;
  cierreMin?: number;
  prematuro?: boolean;
  total: number;
  calif: Grade;
  key?: string;
  manifest?: string;
};
