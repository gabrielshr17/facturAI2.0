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
];
