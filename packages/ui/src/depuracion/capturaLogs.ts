import type { LogDevEntry } from "@sfr/core";

/**
 * Captura de logs técnicos en tiempo de ejecución (errores/advertencias), para
 * poder generar el reporte HTML de depuración sin depender de que DevTools
 * estuviera abierto en el momento del error. Vive en `packages/ui` porque
 * necesita `console`/`window`, que no existen en `@sfr/core` (pensado para
 * correr también fuera del navegador). Best-effort: si `localStorage` no está
 * disponible, el registro sigue funcionando solo en memoria para la sesión.
 */
const CLAVE_ALMACENAMIENTO = "sfr:logs-depuracion";
const MAX_ENTRADAS = 200;

let buffer: LogDevEntry[] = cargarDesdeAlmacenamiento();
let instalado = false;

function cargarDesdeAlmacenamiento(): LogDevEntry[] {
  try {
    const crudo = localStorage.getItem(CLAVE_ALMACENAMIENTO);
    return crudo ? (JSON.parse(crudo) as LogDevEntry[]) : [];
  } catch {
    return [];
  }
}

function guardarEnAlmacenamiento() {
  try {
    localStorage.setItem(CLAVE_ALMACENAMIENTO, JSON.stringify(buffer));
  } catch {
    // Sin almacenamiento disponible: el registro sigue vivo en memoria para esta sesión.
  }
}

function procesarArgumentos(args: unknown[]): { mensaje: string; detalle: string | null } {
  const partes: string[] = [];
  let detalle: string | null = null;
  for (const a of args) {
    if (a instanceof Error) {
      partes.push(a.message);
      detalle = a.stack ?? a.message;
    } else if (typeof a === "string") {
      partes.push(a);
    } else {
      try { partes.push(JSON.stringify(a)); } catch { partes.push(String(a)); }
    }
  }
  return { mensaje: partes.join(" "), detalle };
}

function registrar(nivel: LogDevEntry["nivel"], mensaje: string, detalle: string | null) {
  buffer.push({ nivel, mensaje, detalle, timestamp: new Date().toISOString() });
  if (buffer.length > MAX_ENTRADAS) buffer = buffer.slice(-MAX_ENTRADAS);
  guardarEnAlmacenamiento();
}

export function obtenerLogsDev(): LogDevEntry[] {
  return [...buffer];
}

export function limpiarLogsDev() {
  buffer = [];
  guardarEnAlmacenamiento();
}

/** Instala los hooks globales una sola vez (console.error/warn, error no
 *  atrapado, promesa rechazada sin manejar). Llamar una vez al iniciar la app. */
export function instalarCapturaLogsDev() {
  if (instalado) return;
  instalado = true;

  const consoleErrorOriginal = console.error.bind(console);
  const consoleWarnOriginal = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    const { mensaje, detalle } = procesarArgumentos(args);
    registrar("error", mensaje, detalle);
    consoleErrorOriginal(...args);
  };
  console.warn = (...args: unknown[]) => {
    const { mensaje, detalle } = procesarArgumentos(args);
    registrar("warn", mensaje, detalle);
    consoleWarnOriginal(...args);
  };

  window.addEventListener("error", (evento) => {
    registrar("error", evento.message, evento.error?.stack ?? null);
  });
  window.addEventListener("unhandledrejection", (evento) => {
    const razon = evento.reason;
    const esError = razon instanceof Error;
    registrar("error", esError ? razon.message : String(razon), esError ? (razon.stack ?? null) : null);
  });
}
