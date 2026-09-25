import type { SqlDriver } from "../db/driver.js";

/**
 * Reemplazo de la integración de PowerSync (ver migración 95,
 * `sync_pendiente`, y el comentario de por qué se desactivó PowerSync en
 * packages/desktop/src-tauri). Sube a Supabase, vía PostgREST directo, las
 * filas que los triggers `trg_*_sync_*` marcaron pendientes — sin motor de
 * sync, sin base local aparte, mismo módulo para web y escritorio porque
 * ambos son apps Vite/webview con `fetch` disponible.
 *
 * Solo sube (local → Supabase). Bajar cambios del dueño remoto hacia el
 * registro es un problema distinto, fuera de alcance aquí.
 */

export interface ConfigSincronizacionSaliente {
  supabaseUrl: string;
  supabaseAnonKey: string;
  syncEmail: string;
  syncPassword: string;
}

export interface SincronizadorSaliente {
  /** Sube todo lo pendiente que pueda. Nunca lanza: registra el error y sigue. */
  sincronizar(): Promise<void>;
}

/**
 * Orden de subida por tabla: padres antes que hijos, según las FKs reales de
 * packages/api/db/schema.sql (factura_linea.factura_id, pago.factura_id,
 * compra_linea.compra_id, etc.). Mismas 13 tablas que antes cubría
 * packages/core/src/sync/esquema-sincronizacion.ts (ya retirado).
 */
export const ORDEN_TABLAS = [
  "negocio",
  "departamento",
  "proveedor",
  "cliente",
  "producto",
  "factura",
  "factura_linea",
  "pago",
  "corte_caja",
  "movimiento_inventario",
  "compra",
  "compra_linea",
  "comprobante_archivo",
] as const;

/** Límite de filas por lote: evita un payload gigante si se acumuló mucho pendiente offline. */
const TAMANO_LOTE = 200;

interface RespuestaTokenSupabase {
  access_token?: string;
}

export function normalizarBase(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function obtenerToken(
  config: ConfigSincronizacionSaliente,
  peticion: typeof fetch = fetch,
): Promise<string> {
  const url = `${normalizarBase(config.supabaseUrl)}/auth/v1/token?grant_type=password`;
  const respuesta = await peticion(url, {
    method: "POST",
    headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: config.syncEmail, password: config.syncPassword }),
  });
  if (!respuesta.ok) {
    throw new Error(
      `Supabase Auth respondió ${respuesta.status} al pedir el token de sincronización`,
    );
  }
  const cuerpo = (await respuesta.json()) as RespuestaTokenSupabase;
  if (!cuerpo.access_token) throw new Error("Supabase Auth no devolvió access_token");
  return cuerpo.access_token;
}

async function subirFilas(
  config: ConfigSincronizacionSaliente,
  token: string,
  tabla: string,
  filas: Record<string, unknown>[],
  peticion: typeof fetch,
): Promise<void> {
  const url = `${normalizarBase(config.supabaseUrl)}/rest/v1/${tabla}?on_conflict=id`;
  const respuesta = await peticion(url, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(filas),
  });
  if (!respuesta.ok) {
    const cuerpo = await respuesta.text();
    throw new Error(`PostgREST respondió ${respuesta.status} al sincronizar ${tabla}: ${cuerpo}`);
  }
}

async function limpiarPendientes(db: SqlDriver, tabla: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const marcadores = ids.map(() => "?").join(",");
  await db.run(`DELETE FROM sync_pendiente WHERE tabla=? AND id IN (${marcadores})`, [
    tabla,
    ...ids,
  ]);
}

/** Sube lo pendiente de UNA tabla. Devuelve `token` (recién pedido u obtenido antes) si hizo falta. */
async function sincronizarTabla(
  db: SqlDriver,
  config: ConfigSincronizacionSaliente,
  tabla: string,
  tokenActual: string | null,
  peticion: typeof fetch,
): Promise<string | null> {
  const pendientes = await db.all<{ id: string }>(
    "SELECT id FROM sync_pendiente WHERE tabla=? LIMIT ?",
    [tabla, TAMANO_LOTE],
  );
  if (pendientes.length === 0) return tokenActual;

  const idsPendientes = pendientes.map((p) => p.id);
  const marcadores = idsPendientes.map(() => "?").join(",");
  const filas = await db.all<Record<string, unknown>>(
    `SELECT * FROM ${tabla} WHERE id IN (${marcadores})`,
    idsPendientes,
  );

  // ids pendientes sin fila local (borrado duro fuera del flujo normal de
  // soft-delete, restauración parcial, etc.): nada que subir, pero tampoco
  // tiene sentido reintentarlos para siempre.
  const idsEncontrados = new Set(filas.map((f) => f.id as string));
  const idsHuerfanos = idsPendientes.filter((id) => !idsEncontrados.has(id));
  await limpiarPendientes(db, tabla, idsHuerfanos);

  if (filas.length === 0) return tokenActual;

  const token = tokenActual ?? (await obtenerToken(config, peticion));
  await subirFilas(config, token, tabla, filas, peticion);
  await limpiarPendientes(db, tabla, Array.from(idsEncontrados));
  return token;
}

export function crearSincronizadorSaliente(
  db: SqlDriver,
  config: ConfigSincronizacionSaliente,
  peticion: typeof fetch = fetch,
): SincronizadorSaliente {
  return {
    async sincronizar(): Promise<void> {
      let token: string | null = null;
      for (const tabla of ORDEN_TABLAS) {
        try {
          token = await sincronizarTabla(db, config, tabla, token, peticion);
        } catch (error) {
          // Una tabla fallando (red caída, token vencido, lo que sea) no debe
          // impedir que se intenten las demás — y nunca debe romper el
          // arranque offline de la app, que es quien llama a sincronizar().
          console.error(`No se pudo sincronizar '${tabla}' hacia Supabase:`, error);
          token = null; // por si el error fue de autenticación: pide uno nuevo la próxima tabla
        }
      }
    },
  };
}
