/**
 * factura.fecha_hora se guarda en UTC (ids.ts: now() = toISOString()), pero
 * "hoy" y "este mes" son conceptos de fecha LOCAL del negocio. En RD
 * (UTC-4) toda venta después de las 8:00 pm local cae en el día UTC
 * siguiente, así que compararla con date(fecha_hora) (que SQLite interpreta
 * en UTC) la deja fuera de "vendido hoy". Este módulo es la única fuente de
 * verdad para pasar de "día local" a "rango de instante UTC" y viceversa:
 * funciones puras, sin Date.now() escondido (la hora actual siempre entra
 * como parámetro con default) y sin Intl.DateTimeFormat ni librerías de
 * fecha, porque el mismo bundle corre en Node, en el navegador y en el
 * WebView de Tauri, que no comparten zona horaria de proceso.
 *
 * Se prohíbe expresamente datetime(fecha_hora,'localtime') en SQL: depende
 * de la zona del proceso que ejecuta SQLite, distinta en cada entorno. En
 * su lugar, todo filtro de fecha se expresa como
 * `fecha_hora >= ? AND fecha_hora < ?` con los instantes que calcula
 * `rangoUtc`, y solo cuando hay que AGRUPAR por día u hora local se usa
 * `modificadorSqlite` dentro de un `strftime(..., ?)`.
 */

const MIN_A_MS = 60_000;
const DIA_MS = 24 * 60 * MIN_A_MS;

export const DESFASE_RD_MIN = -240;

interface FechaLocal {
  anio: number;
  mes: number;
  dia: number;
}

function parsearFechaLocal(fechaLocal: string): FechaLocal {
  const [anio, mes, dia] = fechaLocal.split("-").map(Number);
  return { anio: anio!, mes: mes!, dia: dia! };
}

function formatearFechaLocal(f: FechaLocal): string {
  const anio = String(f.anio).padStart(4, "0");
  const mes = String(f.mes).padStart(2, "0");
  const dia = String(f.dia).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/** Instante UTC (ms desde época) de la medianoche local de `fechaLocal`. */
function inicioDiaUtcMs(fechaLocal: string, desfaseMin: number): number {
  const { anio, mes, dia } = parsearFechaLocal(fechaLocal);
  const localTargetMs = Date.UTC(anio, mes - 1, dia, 0, 0, 0, 0);
  return localTargetMs - desfaseMin * MIN_A_MS;
}

/** Fecha local ('YYYY-MM-DD') a la que pertenece un instante UTC ISO. */
export function fechaLocalDeInstante(isoUtc: string, desfaseMin: number): string {
  const desplazadoMs = new Date(isoUtc).getTime() + desfaseMin * MIN_A_MS;
  const d = new Date(desplazadoMs);
  return formatearFechaLocal({
    anio: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
  });
}

/** Hora local (0..23) a la que pertenece un instante UTC ISO. */
export function horaLocalDeInstante(isoUtc: string, desfaseMin: number): number {
  const desplazadoMs = new Date(isoUtc).getTime() + desfaseMin * MIN_A_MS;
  return new Date(desplazadoMs).getUTCHours();
}

/** Instante ISO UTC del comienzo (00:00:00.000 local) de `fechaLocal`. */
export function inicioDiaUtc(fechaLocal: string, desfaseMin: number): string {
  return new Date(inicioDiaUtcMs(fechaLocal, desfaseMin)).toISOString();
}

/**
 * Instante ISO UTC del comienzo del día local SIGUIENTE a `fechaLocal`.
 * Es el límite EXCLUSIVO de un rango que cubre el día completo: usar
 * `fecha_hora < finDiaUtcExclusivo(...)`, nunca `<=`.
 */
export function finDiaUtcExclusivo(fechaLocal: string, desfaseMin: number): string {
  return new Date(inicioDiaUtcMs(fechaLocal, desfaseMin) + DIA_MS).toISOString();
}

/**
 * Rango de instantes UTC que cubre, día local completo, desde `desde` hasta
 * `hasta` inclusive. `finExclusivo` es el comienzo del día SIGUIENTE a
 * `hasta`, para que el último día entre entero con `<` en vez de `<=`.
 */
export function rangoUtc(
  desde: string,
  hasta: string,
  desfaseMin: number,
): { inicio: string; finExclusivo: string } {
  return {
    inicio: inicioDiaUtc(desde, desfaseMin),
    finExclusivo: finDiaUtcExclusivo(hasta, desfaseMin),
  };
}

/**
 * Modificador de `strftime` para agrupar por día u hora local en SQLite,
 * p.ej. `strftime('%Y-%m-%d', fecha_hora, ?)`. Solo para GROUP BY: el
 * filtrado por rango siempre pasa por `rangoUtc`, nunca por este modificador.
 */
export function modificadorSqlite(desfaseMin: number): string {
  const signo = desfaseMin >= 0 ? "+" : "-";
  return `${signo}${Math.abs(desfaseMin)} minutes`;
}

/** Fecha local de hoy, con la hora actual siempre inyectable. */
export function hoyLocal(desfaseMin: number, ahora: Date = new Date()): string {
  return fechaLocalDeInstante(ahora.toISOString(), desfaseMin);
}

/** Primer día del mes local en curso, con la hora actual siempre inyectable. */
export function primerDiaDelMesLocal(desfaseMin: number, ahora: Date = new Date()): string {
  const { anio, mes } = parsearFechaLocal(hoyLocal(desfaseMin, ahora));
  return formatearFechaLocal({ anio, mes, dia: 1 });
}

function diasDesdeEpoca(fechaLocal: string): number {
  const { anio, mes, dia } = parsearFechaLocal(fechaLocal);
  return Math.round(Date.UTC(anio, mes - 1, dia) / DIA_MS);
}

function fechaLocalDesdeDiasDesdeEpoca(dias: number): string {
  const d = new Date(dias * DIA_MS);
  return formatearFechaLocal({
    anio: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
  });
}

/**
 * Ventana del mismo largo (en días), inmediatamente anterior a `desde`, para
 * comparar un período contra el que le precede (p.ej. "vs. semana pasada").
 */
export function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const largoDias = diasDesdeEpoca(hasta) - diasDesdeEpoca(desde) + 1;
  const nuevoHastaDias = diasDesdeEpoca(desde) - 1;
  const nuevoDesdeDias = nuevoHastaDias - (largoDias - 1);
  return {
    desde: fechaLocalDesdeDiasDesdeEpoca(nuevoDesdeDias),
    hasta: fechaLocalDesdeDiasDesdeEpoca(nuevoHastaDias),
  };
}

/**
 * Mes calendario completo anterior al mes al que pertenece `fechaLocal`
 * (para "vs. mes anterior"), cruzando el año correctamente en enero.
 */
export function mesAnteriorDe(fechaLocal: string): { desde: string; hasta: string } {
  const { anio, mes } = parsearFechaLocal(fechaLocal);
  const primerDiaMesActualMs = Date.UTC(anio, mes - 1, 1);
  const ultimoDiaMesAnteriorMs = primerDiaMesActualMs - DIA_MS;
  const ultimoDiaMesAnterior = new Date(ultimoDiaMesAnteriorMs);
  const anioAnterior = ultimoDiaMesAnterior.getUTCFullYear();
  const mesAnterior = ultimoDiaMesAnterior.getUTCMonth() + 1;
  return {
    desde: formatearFechaLocal({ anio: anioAnterior, mes: mesAnterior, dia: 1 }),
    hasta: formatearFechaLocal({
      anio: anioAnterior,
      mes: mesAnterior,
      dia: ultimoDiaMesAnterior.getUTCDate(),
    }),
  };
}
