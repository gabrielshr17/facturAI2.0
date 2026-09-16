import type { SqlDriver } from "../../db/driver.js";
import { crearReportesVentas } from "./ventas.js";
import { crearReportesMargen } from "./margen.js";
import { crearReportesFiscal } from "./fiscal.js";

export * from "./tipos.js";

/**
 * Compone las familias en un solo repo. Cada área nueva (turnos, cliente,
 * caja) agrega su propio archivo de familia y una línea aquí; ninguna edita
 * los archivos de otra área.
 */
export function crearReportesRepo(db: SqlDriver) {
  return {
    ...crearReportesVentas(db),
    ...crearReportesMargen(db),
    ...crearReportesFiscal(db),
  };
}

export type ReportesRepo = ReturnType<typeof crearReportesRepo>;
