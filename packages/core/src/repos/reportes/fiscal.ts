import type { SqlDriver } from "../../db/driver.js";
import { redondear2 } from "../../dominio/dinero.js";
import type { ResumenItbis } from "./tipos.js";

/** Familia "fiscal": desglose de ITBIS de las ventas cobradas del período. */
export function crearReportesFiscal(db: SqlDriver) {
  return {
    async resumenItbis(desde: string, hasta: string): Promise<ResumenItbis> {
      const r = await db.get<{
        gravado: number | null;
        exento: number | null;
        itbis: number | null;
      }>(
        `SELECT SUM(subtotal_gravado) as gravado, SUM(subtotal_exento) as exento, SUM(total_itbis) as itbis
         FROM factura
         WHERE estado='cobrada' AND deleted_at IS NULL
           AND date(fecha_hora) >= date(?) AND date(fecha_hora) <= date(?)`,
        [desde, hasta],
      );
      return {
        totalGravado: redondear2(r?.gravado ?? 0),
        totalExento: redondear2(r?.exento ?? 0),
        totalItbis: redondear2(r?.itbis ?? 0),
      };
    },
  };
}
