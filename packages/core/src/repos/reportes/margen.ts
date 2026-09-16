import type { SqlDriver } from "../../db/driver.js";
import { redondear2 } from "../../dominio/dinero.js";
import type { ResumenGanancia } from "./tipos.js";

/**
 * Familia "margen": la ganancia es una ESTIMACIÓN con el costo ACTUAL del
 * producto (no hay costo histórico por línea todavía), así que si el costo
 * cambió después de la venta el número no es exacto.
 */
export function crearReportesMargen(db: SqlDriver) {
  return {
    async resumenGanancia(desde: string, hasta: string): Promise<ResumenGanancia> {
      const ingresos = await db.get<{ total: number | null }>(
        `SELECT SUM(fl.subtotal) as total
         FROM factura_linea fl JOIN factura f ON f.id = fl.factura_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND fl.deleted_at IS NULL
           AND date(f.fecha_hora) >= date(?) AND date(f.fecha_hora) <= date(?)`,
        [desde, hasta],
      );
      const costo = await db.get<{ total: number | null }>(
        `SELECT SUM(fl.cantidad * p.costo) as total
         FROM factura_linea fl
         JOIN factura f ON f.id = fl.factura_id
         JOIN producto p ON p.id = fl.producto_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND fl.deleted_at IS NULL
           AND date(f.fecha_hora) >= date(?) AND date(f.fecha_hora) <= date(?)`,
        [desde, hasta],
      );
      const sinCosto = await db.get<{ total: number | null }>(
        `SELECT SUM(fl.subtotal) as total
         FROM factura_linea fl JOIN factura f ON f.id = fl.factura_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND fl.deleted_at IS NULL
           AND fl.producto_id IS NULL
           AND date(f.fecha_hora) >= date(?) AND date(f.fecha_hora) <= date(?)`,
        [desde, hasta],
      );
      const ing = ingresos?.total ?? 0;
      const cos = costo?.total ?? 0;
      return {
        ingresos: redondear2(ing),
        costoEstimado: redondear2(cos),
        gananciaEstimada: redondear2(ing - cos),
        ingresosSinCosto: redondear2(sinCosto?.total ?? 0),
      };
    },
  };
}
