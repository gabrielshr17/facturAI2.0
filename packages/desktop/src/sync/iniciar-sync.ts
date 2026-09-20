import { PowerSyncTauriDatabase } from "@powersync/tauri-plugin";
import { appDataDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { esquemaSincronizacion } from "@sfr/core";

/**
 * Arranca la sincronización PowerSync en segundo plano. Se llama UNA vez al
 * iniciar la app de escritorio (ver packages/desktop/src/main.tsx), fuera de
 * `ProveedorSesion`/`Acceso` a propósito: la sincronización remota no tiene
 * relación con el PIN del cajero (packages/ui/src/sesion/contexto.tsx) y debe
 * seguir corriendo sin importar quién esté (o no esté) autenticado
 * localmente.
 *
 * `connect()` de PowerSync solo puede invocarse desde Rust en el SDK alpha de
 * Tauri (ver packages/desktop/src-tauri/src/sync/conector.rs), por eso este
 * módulo abre la base en JS y le pasa el `rustHandle` al comando
 * `iniciar_sincronizacion`, que hace el `connect()` real.
 *
 * Los errores se registran pero nunca se propagan hacia arriba: un fallo de
 * sincronización remota (credenciales vencidas, sin red, PowerSync caído) no
 * debe impedir que el registro siga vendiendo offline.
 */
export async function iniciarSincronizacionEnSegundoPlano(): Promise<void> {
  try {
    const db = new PowerSyncTauriDatabase({
      schema: esquemaSincronizacion,
      database: {
        dbFilename: "powersync.db",
        dbLocationAsync: appDataDir,
      },
    });

    await db.init();
    await invoke("iniciar_sincronizacion", { handle: db.rustHandle });
  } catch (error) {
    console.error("No se pudo iniciar la sincronización en segundo plano:", error);
  }
}
