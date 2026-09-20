import type { SqlDriver } from "../db/driver.js";
import {
  ORDEN_TABLAS,
  normalizarBase,
  obtenerToken,
  type ConfigSincronizacionSaliente,
} from "./subida-saliente.js";

/**
 * Espejo de subida-saliente.ts en la otra dirección: baja de Supabase todo
 * lo que ya subió el registro local (o el panel remoto), para repoblar una
 * instalación local nueva/vacía — el caso "se dañó la PC del cliente,
 * llegó una nueva, ¿cómo recupera el negocio sus datos?". Reusa la misma
 * identidad de sincronización, el mismo orden de tablas (padres antes que
 * hijos, ya probado en producción para el sentido contrario) y la misma
 * filosofía de "una tabla fallando no debe tumbar el resto".
 *
 * No requiere transacción real del driver (a diferencia de
 * backup-repo.ts/importarTodo): el caso común es restaurar sobre una base
 * vacía, así que INSERT OR REPLACE no tiene con qué chocar, y en un
 * reintento simplemente sobrescribe con los mismos datos — resumible sin
 * limpieza manual.
 */

const TAMANO_PAGINA = 1000;

export interface ResultadoRestauracion {
  /** Filas restauradas con éxito, por tabla. */
  filasPorTabla: Record<string, number>;
  /** Tablas que fallaron (con el mensaje de error), para que la UI avise. */
  tablasConError: Record<string, string>;
}

export interface RestauradorNube {
  restaurar(): Promise<ResultadoRestauracion>;
}

interface RespuestaLote {
  filas: Record<string, unknown>[];
  totalEnLaPagina: number;
}

async function descargarPagina(
  config: ConfigSincronizacionSaliente,
  token: string,
  tabla: string,
  desde: number,
): Promise<RespuestaLote> {
  const hasta = desde + TAMANO_PAGINA - 1;
  const url = `${normalizarBase(config.supabaseUrl)}/rest/v1/${tabla}?select=*&order=id`;
  const respuesta = await fetch(url, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      Range: `${desde}-${hasta}`,
    },
  });
  if (!respuesta.ok && respuesta.status !== 206) {
    const cuerpo = await respuesta.text();
    throw new Error(`PostgREST respondió ${respuesta.status} al descargar ${tabla}: ${cuerpo}`);
  }
  const filas = (await respuesta.json()) as Record<string, unknown>[];
  return { filas, totalEnLaPagina: filas.length };
}

/**
 * Postgres devuelve booleans reales (true/false) y TIMESTAMPTZ como texto
 * ISO8601 con offset numérico ("...+00:00"). SQLite guarda booleans como
 * 0/1, y el resto del código local siempre escribe timestamps vía
 * `new Date().toISOString()` (con sufijo "Z"). Sin normalizar, filas
 * restauradas quedarían con un formato distinto al de filas creadas
 * localmente — arriesgando comparaciones de rango por fecha que dependen
 * de que el formato de texto sea consistente.
 */
export function normalizarValor(valor: unknown): unknown {
  if (typeof valor === "boolean") return valor ? 1 : 0;
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor)) {
    const fecha = new Date(valor);
    if (!Number.isNaN(fecha.getTime())) return fecha.toISOString();
  }
  return valor;
}

async function insertarFilas(
  db: SqlDriver,
  tabla: string,
  filas: Record<string, unknown>[],
): Promise<void> {
  for (const fila of filas) {
    const columnas = Object.keys(fila);
    const marcadores = columnas.map(() => "?").join(",");
    const valores = columnas.map((col) => normalizarValor(fila[col]));
    await db.run(
      `INSERT OR REPLACE INTO ${tabla} (${columnas.join(",")}) VALUES (${marcadores})`,
      valores,
    );
  }
}

async function restaurarTabla(
  db: SqlDriver,
  config: ConfigSincronizacionSaliente,
  tabla: string,
  token: string,
): Promise<number> {
  let total = 0;
  let desde = 0;
  for (;;) {
    const { filas, totalEnLaPagina } = await descargarPagina(config, token, tabla, desde);
    if (filas.length > 0) {
      await insertarFilas(db, tabla, filas);
      total += filas.length;
    }
    if (totalEnLaPagina < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }
  return total;
}

export function crearRestauradorNube(
  db: SqlDriver,
  config: ConfigSincronizacionSaliente,
): RestauradorNube {
  return {
    async restaurar(): Promise<ResultadoRestauracion> {
      const filasPorTabla: Record<string, number> = {};
      const tablasConError: Record<string, string> = {};

      const token = await obtenerToken(config);
      for (const tabla of ORDEN_TABLAS) {
        try {
          filasPorTabla[tabla] = await restaurarTabla(db, config, tabla, token);
        } catch (error) {
          tablasConError[tabla] = error instanceof Error ? error.message : String(error);
        }
      }

      // Todo lo que se acaba de escribir ya existe en Supabase (de ahí
      // vino) — sin esto, la sincronización saliente normal (cada 25s)
      // intentaría re-subir cada fila que se acaba de bajar.
      await db.run("DELETE FROM sync_pendiente");

      return { filasPorTabla, tablasConError };
    },
  };
}
