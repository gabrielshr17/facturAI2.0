import { PowerSyncDatabase } from "@powersync/web";
import { esquemaSincronizacion } from "@sfr/core";
import { crearConectorSincronizacionSupabase } from "./conector.js";

/**
 * Arranca la sincronización PowerSync en segundo plano para la PWA. Se llama
 * UNA vez al iniciar la app (ver packages/web/src/main.tsx), fuera de
 * `ProveedorSesion`/`Acceso` a propósito: la sincronización remota no tiene
 * relación con el PIN del cajero (packages/ui/src/sesion/contexto.tsx) y debe
 * seguir corriendo sin importar quién esté (o no esté) autenticado
 * localmente.
 *
 * A diferencia de la app de escritorio (packages/desktop/src/sync/iniciar-sync.ts),
 * aquí no hay plugin de Tauri ni comando de Rust: el SDK `@powersync/web` es
 * JS/WASM puro y `connect()` se llama directo desde el navegador.
 *
 * Los errores se registran pero nunca se propagan hacia arriba: falta de
 * variables de entorno, sin red o PowerSync caído no debe impedir que el
 * registro siga vendiendo 100% offline con sql.js/IndexedDB.
 */
export async function iniciarSincronizacionEnSegundoPlano(): Promise<void> {
  try {
    const db = new PowerSyncDatabase({
      schema: esquemaSincronizacion,
      database: {
        dbFilename: "sfr-powersync.db",
      },
    });

    const conector = crearConectorSincronizacionSupabase();
    await db.connect(conector);
  } catch (error) {
    console.error("No se pudo iniciar la sincronización en segundo plano:", error);
  }
}
