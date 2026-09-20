import type { SqlDriver } from "../../db/driver.js";
import type { ProductoVendido, ResumenPorMetodo, VentaPorDia } from "./tipos.js";

/**
 * Familia "ventas": conteos y totales BRUTOS del período — no descuentan
 * devoluciones. Un área que agregue un reporte nuevo crea su propio archivo
 * de familia en vez de tocar este.
 */
export function crearReportesVentas(db: SqlDriver) {
  return {
    async ventasPorDia(desde: string, hasta: string): Promise<VentaPorDia[]> {
      return db.all<VentaPorDia>(
        `SELECT date(fecha_hora) as fecha, SUM(total) as totalVentas, COUNT(*) as cantidadFacturas
         FROM factura
         WHERE estado='cobrada' AND deleted_at IS NULL
           AND date(fecha_hora) >= date(?) AND date(fecha_hora) <= date(?)
         GROUP BY date(fecha_hora)
         ORDER BY fecha`,
        [desde, hasta],
      );
    },

    async productosMasVendidos(
      desde: string,
      hasta: string,
      limite = 20,
    ): Promise<ProductoVendido[]> {
      return db.all<ProductoVendido>(
        `SELECT fl.producto_id as productoId, fl.descripcion as descripcion,
                SUM(fl.cantidad) as cantidadVendida, SUM(fl.subtotal) as totalVendido
         FROM factura_linea fl
         JOIN factura f ON f.id = fl.factura_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND fl.deleted_at IS NULL
           AND date(f.fecha_hora) >= date(?) AND date(f.fecha_hora) <= date(?)
         GROUP BY fl.producto_id, fl.descripcion
         ORDER BY cantidadVendida DESC
         LIMIT ?`,
        [desde, hasta, limite],
      );
    },

    async ventasPorMetodoPago(desde: string, hasta: string): Promise<ResumenPorMetodo[]> {
      return db.all<ResumenPorMetodo>(
        `SELECT p.metodo as metodo, SUM(p.monto) as total
         FROM pago p JOIN factura f ON f.id = p.factura_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND p.deleted_at IS NULL
           AND date(f.fecha_hora) >= date(?) AND date(f.fecha_hora) <= date(?)
         GROUP BY p.metodo
         ORDER BY total DESC`,
        [desde, hasta],
      );
    },
  };
}
