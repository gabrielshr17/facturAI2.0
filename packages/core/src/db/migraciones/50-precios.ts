import type { Migration } from "./tipos.js";

/**
 * Banda 50-59 (PRECIOS). Primera migración real: `producto.precio_2` y
 * `cliente.nivel_precio`/`factura_linea.nivel_precio` ya existían (censo de
 * columnas de la banda 11-19, pre-provisionados explícitamente para esta
 * área) — solo faltaba `precio_3`, el tercer nivel de precio.
 */
export const migracionesPrecios: Migration[] = [
  {
    id: 50,
    nombre: "tercer_nivel_precio",
    sql: /* sql */ `
      ALTER TABLE producto ADD COLUMN precio_3 REAL;
    `,
  },
  {
    id: 51,
    nombre: "niveles_precio_por_defecto",
    sql: /* sql */ `
      UPDATE producto
         SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             precio_2 = CASE WHEN costo > 0 THEN MIN(ROUND(costo * 1.10, 2), precio_venta) ELSE precio_venta END
       WHERE precio_2 IS NULL;
      UPDATE producto
         SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             precio_3 = CASE WHEN costo > 0 THEN MIN(ROUND(costo * 1.05, 2), precio_venta) ELSE precio_venta END
       WHERE precio_3 IS NULL;
    `,
  },
];
