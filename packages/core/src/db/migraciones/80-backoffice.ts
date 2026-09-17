import type { Migration } from "./tipos.js";

/**
 * Banda 80-89 (BACKOFFICE). negocio.desfase_horario_min ya lo agregó
 * CENSO-COLUMNAS en la banda 11-19 (nullable, sin default): esta migración
 * NO la toca. Solo agrega los índices que el panel del dueño necesita para
 * no forzar un scan completo de factura en cada agregado por rango de
 * fecha (ver dominio/periodo.ts, que expresa cualquier filtro de fecha
 * como un rango de instante UTC en vez de date(fecha_hora)).
 */
export const migracionesBackoffice: Migration[] = [
  {
    id: 80,
    nombre: "indices_factura",
    sql: /* sql */ `
      -- Rango de instante UTC (ver dominio/periodo.ts): sargable, a
      -- diferencia de date(fecha_hora)
      CREATE INDEX ix_factura_fecha_hora ON factura(fecha_hora);
      -- Cortes de caja y reportes que filtran por estado y periodo a la vez
      CREATE INDEX ix_factura_estado_fecha ON factura(estado, fecha_hora);
      -- Productos más vendidos / margen por producto agrupan por producto_id
      CREATE INDEX ix_factura_linea_producto ON factura_linea(producto_id);
    `,
  },
];
