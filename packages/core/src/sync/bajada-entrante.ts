import type { SqlDriver } from "../db/driver.js";
import {
  normalizarBase,
  obtenerToken,
  type ConfigSincronizacionSaliente,
} from "./subida-saliente.js";

export type ConfigSincronizacionEntrante = ConfigSincronizacionSaliente;

export interface SincronizadorEntrante {
  sincronizar(): Promise<void>;
}

export interface OpcionesSincronizacionEntrante {
  tablas?: readonly string[];
  columnasPorTabla?: Readonly<Record<string, string>>;
}

export const TABLAS_ENTRANTES = [
  "negocio",
  "departamento",
  "proveedor",
  "cliente",
  "producto",
  "movimiento_inventario",
] as const;

export const OPCIONES_MODO_REMOTO: Required<OpcionesSincronizacionEntrante> = {
  tablas: [
    "negocio",
    "departamento",
    "proveedor",
    "usuario",
    "cliente",
    "producto",
    "factura",
    "factura_linea",
    "pago",
    "corte_caja",
    "movimiento_inventario",
    "compra",
    "compra_linea",
  ],
  columnasPorTabla: {
    usuario: "id,nombre,rol,activo,created_at,updated_at,deleted_at",
  },
};

const TAMANO_PAGINA = 500;

type FilaRemota = Record<string, unknown>;

async function pedirFilas(
  config: ConfigSincronizacionEntrante,
  token: string,
  tabla: string,
  columnas: string,
  cursor: string | null,
  desplazamiento: number,
  peticion: typeof fetch,
): Promise<FilaRemota[]> {
  const filtro = cursor ? `&updated_at=gte.${encodeURIComponent(cursor)}` : "";
  const pagina = `&limit=${TAMANO_PAGINA}&offset=${desplazamiento}`;
  const url = `${normalizarBase(config.supabaseUrl)}/rest/v1/${tabla}?select=${columnas}&order=updated_at.asc,id.asc${filtro}${pagina}`;
  const respuesta = await peticion(url, {
    headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) {
    throw new Error(`PostgREST respondió ${respuesta.status} al leer ${tabla}`);
  }
  return (await respuesta.json()) as FilaRemota[];
}

function aValorLocal(valor: unknown): unknown {
  if (typeof valor === "boolean") return valor ? 1 : 0;
  if (valor !== null && typeof valor === "object") return JSON.stringify(valor);
  return valor;
}

async function columnasLocales(db: SqlDriver, tabla: string): Promise<string[]> {
  const info = await db.all<{ name: string }>(`PRAGMA table_info(${tabla})`);
  return info.map((c) => c.name);
}

async function aplicarFila(
  db: SqlDriver,
  tabla: string,
  columnas: string[],
  fila: FilaRemota,
): Promise<void> {
  const existente = await db.get<{ updated_at: string }>(
    `SELECT updated_at FROM ${tabla} WHERE id=?`,
    [fila.id as string],
  );
  const usadas = columnas.filter((c) => c in fila);
  const valores = usadas.map((c) => aValorLocal(fila[c]));

  if (!existente) {
    if (fila.deleted_at) return;
    await db.run(
      `INSERT INTO ${tabla} (${usadas.join(",")}) VALUES (${usadas.map(() => "?").join(",")})`,
      valores,
    );
  } else if (esMasNueva(fila.updated_at, existente.updated_at)) {
    const editables = usadas.filter((c) => c !== "id");
    await db.run(`UPDATE ${tabla} SET ${editables.map((c) => `${c}=?`).join(",")} WHERE id=?`, [
      ...editables.map((c) => aValorLocal(fila[c])),
      fila.id as string,
    ]);
  } else {
    return;
  }
  await db.run("DELETE FROM sync_pendiente WHERE tabla=? AND id=?", [tabla, fila.id as string]);
}

async function leerCursor(db: SqlDriver, tabla: string): Promise<string | null> {
  const fila = await db.get<{ ultimo_updated_at: string }>(
    "SELECT ultimo_updated_at FROM sync_cursor WHERE tabla=?",
    [tabla],
  );
  return fila?.ultimo_updated_at ?? null;
}

async function guardarCursor(db: SqlDriver, tabla: string, valor: string): Promise<void> {
  await db.run("INSERT OR REPLACE INTO sync_cursor (tabla, ultimo_updated_at) VALUES (?, ?)", [
    tabla,
    valor,
  ]);
}

function esMasNueva(remota: unknown, local: unknown): boolean {
  return new Date(String(remota)).getTime() > new Date(String(local)).getTime();
}

async function sincronizarTabla(
  db: SqlDriver,
  config: ConfigSincronizacionEntrante,
  token: string,
  tabla: string,
  seleccion: string,
  peticion: typeof fetch,
): Promise<void> {
  const columnas = await columnasLocales(db, tabla);
  let cursor = await leerCursor(db, tabla);
  let desplazamiento = 0;
  for (;;) {
    const filas = await pedirFilas(
      config,
      token,
      tabla,
      seleccion,
      cursor,
      desplazamiento,
      peticion,
    );
    for (const fila of filas) await aplicarFila(db, tabla, columnas, fila);
    if (filas.length === 0) return;

    const ultima = String(filas[filas.length - 1].updated_at);
    await guardarCursor(db, tabla, ultima);
    if (filas.length < TAMANO_PAGINA) return;

    desplazamiento = ultima === cursor ? desplazamiento + filas.length : 0;
    cursor = ultima;
  }
}

export function crearSincronizadorEntrante(
  db: SqlDriver,
  config: ConfigSincronizacionEntrante,
  peticion: typeof fetch = fetch,
  opciones: OpcionesSincronizacionEntrante = {},
): SincronizadorEntrante {
  const tablas = opciones.tablas ?? TABLAS_ENTRANTES;
  return {
    async sincronizar(): Promise<void> {
      let token: string;
      try {
        token = await obtenerToken(config, peticion);
      } catch (error) {
        console.error("No se pudo autenticar la sincronización entrante con Supabase:", error);
        return;
      }
      for (const tabla of tablas) {
        try {
          const seleccion = opciones.columnasPorTabla?.[tabla] ?? "*";
          await sincronizarTabla(db, config, token, tabla, seleccion, peticion);
        } catch (error) {
          console.error(`No se pudo traer '${tabla}' desde Supabase:`, error);
        }
      }
    },
  };
}
