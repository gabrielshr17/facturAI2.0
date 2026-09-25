import type { Migration } from "./tipos.js";

/**
 * Banda 95-99 (CORRECCIONES). Cola de sincronización saliente: reemplaza la
 * integración de PowerSync (desactivada, ver packages/desktop/src-tauri —
 * mantenía su propia base local separada de la que usan los repos, así que
 * nunca subía nada de verdad). `sync_pendiente` es una tabla de seguimiento
 * aparte, no una columna en cada tabla sincronizada: así ningún repo
 * necesita cambiar una sola línea — los triggers capturan cada INSERT/UPDATE
 * automáticamente, incluyendo los que nadie recuerde cablear a mano después.
 *
 * `INSERT OR REPLACE` en vez de `INSERT`: si una fila ya estaba pendiente
 * (aún no subida) y se vuelve a escribir, se reemplaza su marca de tiempo en
 * vez de fallar por PK duplicada — sigue pendiente, con o sin el REPLACE.
 *
 * El backfill (segundo INSERT OR REPLACE de cada bloque) marca como
 * pendiente todo lo que ya existía antes de esta migración, para que la
 * primera sincronización suba el histórico completo y no solo lo nuevo.
 *
 * Lista de 13 tablas: la misma que ya tenía
 * packages/core/src/sync/esquema-sincronizacion.ts (con RLS ya aplicada en
 * Supabase para lectura del dueño remoto). El orden de subida real (que
 * respeta FKs) lo decide packages/core/src/sync/subida-saliente.ts, no esta
 * migración — aquí el orden de los bloques no importa.
 */
const TABLAS_SINCRONIZADAS = [
  "negocio",
  "departamento",
  "producto",
  "cliente",
  "factura",
  "factura_linea",
  "pago",
  "corte_caja",
  "movimiento_inventario",
  "proveedor",
  "compra",
  "compra_linea",
  "comprobante_archivo",
] as const;

function bloqueTabla(tabla: string): string {
  return `
      CREATE TRIGGER trg_${tabla}_sync_insert
      AFTER INSERT ON ${tabla}
      BEGIN
        INSERT OR REPLACE INTO sync_pendiente (tabla, id, marcado_en)
        VALUES ('${tabla}', NEW.id, datetime('now'));
      END;

      CREATE TRIGGER trg_${tabla}_sync_update
      AFTER UPDATE ON ${tabla}
      BEGIN
        INSERT OR REPLACE INTO sync_pendiente (tabla, id, marcado_en)
        VALUES ('${tabla}', NEW.id, datetime('now'));
      END;

      INSERT OR REPLACE INTO sync_pendiente (tabla, id, marcado_en)
        SELECT '${tabla}', id, datetime('now') FROM ${tabla};
  `;
}

export const migracionesSync: Migration[] = [
  {
    id: 95,
    nombre: "cola_sincronizacion_saliente",
    sql: /* sql */ `
      CREATE TABLE sync_pendiente (
        tabla       TEXT NOT NULL,
        id          TEXT NOT NULL,
        marcado_en  TEXT NOT NULL,
        PRIMARY KEY (tabla, id)
      );

      ${TABLAS_SINCRONIZADAS.map(bloqueTabla).join("\n")}
    `,
  },
  {
    id: 96,
    nombre: "cursor_sincronizacion_entrante",
    sql: /* sql */ `
      CREATE TABLE sync_cursor (
        tabla              TEXT PRIMARY KEY,
        ultimo_updated_at  TEXT NOT NULL
      );
    `,
  },
];
