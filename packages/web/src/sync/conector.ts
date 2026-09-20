import type {
  CommonPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from "@powersync/common";
import { UpdateType } from "@powersync/common";

/**
 * Conector de PowerSync contra Supabase Auth + PostgREST para la PWA, misma
 * identidad fija de sincronización que la app de escritorio (ver
 * packages/desktop/src-tauri/src/sync/conector.rs, el conector Rust del que
 * este archivo es la versión JS/navegador — mismo flujo de auth, mismo
 * approach de subida vía PostgREST directo, sin backend propio de escritura).
 *
 * A propósito NO cachea el token entre llamadas: `fetchCredentials` es la
 * única función del SDK que promete "always fetch a fresh set of
 * credentials" (ver el `.d.ts` de `@powersync/common`), así que aquí pedir
 * uno nuevo cada vez es lo simple Y lo correcto, no una simplificación a
 * costa de algo.
 */

interface EntornoSincronizacion {
  supabaseUrl: string;
  supabaseAnonKey: string;
  powersyncUrl: string;
  syncEmail: string;
  syncPassword: string;
}

class ErrorVariableFaltante extends Error {
  constructor(nombre: string) {
    super(`Falta la variable de entorno ${nombre} (ver packages/web/.env.example)`);
    this.name = "ErrorVariableFaltante";
  }
}

function leerEntorno(): EntornoSincronizacion {
  function requerida(nombre: string, valor: string | undefined): string {
    if (!valor || !valor.trim()) throw new ErrorVariableFaltante(nombre);
    return valor;
  }

  return {
    supabaseUrl: requerida("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
    supabaseAnonKey: requerida("VITE_SUPABASE_ANON_KEY", import.meta.env.VITE_SUPABASE_ANON_KEY),
    powersyncUrl: requerida("VITE_POWERSYNC_URL", import.meta.env.VITE_POWERSYNC_URL),
    syncEmail: requerida("VITE_SYNC_EMAIL", import.meta.env.VITE_SYNC_EMAIL),
    syncPassword: requerida("VITE_SYNC_PASSWORD", import.meta.env.VITE_SYNC_PASSWORD),
  };
}

interface RespuestaTokenSupabase {
  access_token?: string;
}

async function obtenerToken(entorno: EntornoSincronizacion): Promise<string> {
  const url = `${entorno.supabaseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`;

  const respuesta = await fetch(url, {
    method: "POST",
    headers: {
      apikey: entorno.supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: entorno.syncEmail, password: entorno.syncPassword }),
  });

  if (!respuesta.ok) {
    throw new Error(`Supabase Auth respondió con estado ${respuesta.status} al pedir credenciales de sincronización`);
  }

  const cuerpo = (await respuesta.json()) as RespuestaTokenSupabase;
  if (!cuerpo.access_token) {
    throw new Error("Supabase Auth no devolvió access_token");
  }
  return cuerpo.access_token;
}

async function subirEntrada(entorno: EntornoSincronizacion, token: string, entrada: CrudEntry): Promise<void> {
  const base = entorno.supabaseUrl.replace(/\/+$/, "");
  const encabezadosComunes = {
    apikey: entorno.supabaseAnonKey,
    Authorization: `Bearer ${token}`,
  };

  switch (entrada.op) {
    case UpdateType.PUT:
    case UpdateType.PATCH: {
      const fila = { ...(entrada.opData ?? {}), id: entrada.id };
      const respuesta = await fetch(`${base}/rest/v1/${entrada.table}`, {
        method: "POST",
        headers: {
          ...encabezadosComunes,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(fila),
      });

      if (!respuesta.ok) {
        const cuerpo = await respuesta.text();
        throw new Error(
          `PostgREST respondió con estado ${respuesta.status} al sincronizar ${entrada.table}: ${cuerpo}`,
        );
      }
      break;
    }
    case UpdateType.DELETE: {
      const respuesta = await fetch(`${base}/rest/v1/${entrada.table}?id=eq.${entrada.id}`, {
        method: "DELETE",
        headers: encabezadosComunes,
      });

      if (!respuesta.ok && respuesta.status !== 404) {
        const cuerpo = await respuesta.text();
        throw new Error(
          `PostgREST respondió con estado ${respuesta.status} al sincronizar ${entrada.table}: ${cuerpo}`,
        );
      }
      break;
    }
  }
}

export function crearConectorSincronizacionSupabase(): PowerSyncBackendConnector {
  return {
    async fetchCredentials(): Promise<PowerSyncCredentials | null> {
      const entorno = leerEntorno();
      const token = await obtenerToken(entorno);
      return { endpoint: entorno.powersyncUrl, token };
    },

    async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
      const entorno = leerEntorno();
      const transaccion = await database.getNextCrudTransaction();
      if (!transaccion) return;

      const token = await obtenerToken(entorno);
      for (const entrada of transaccion.crud) {
        await subirEntrada(entorno, token, entrada);
      }

      await transaccion.complete();
    },
  };
}
