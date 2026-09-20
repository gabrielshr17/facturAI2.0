import { crearSincronizadorSaliente, type SqlDriver } from "@sfr/core";

/**
 * Cada 25s intenta subir lo pendiente (ver migración 95 / `sync_pendiente`
 * en @sfr/core). No hay push ni tiempo real: para una caja registradora,
 * unos segundos de retraso es aceptable y evita mantener una conexión
 * persistente abierta. Si faltan variables de entorno (instalación sin
 * sincronización configurada) o la red falla, no rompe nada — la PWA sigue
 * 100% funcional offline.
 */
const INTERVALO_MS = 25_000;

export function iniciarSincronizacionEnSegundoPlano(db: SqlDriver): void {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const syncEmail = import.meta.env.VITE_SYNC_EMAIL;
  const syncPassword = import.meta.env.VITE_SYNC_PASSWORD;

  if (!supabaseUrl || !supabaseAnonKey || !syncEmail || !syncPassword) {
    console.warn(
      "Sincronización hacia Supabase desactivada: faltan variables VITE_SUPABASE_URL / " +
        "VITE_SUPABASE_ANON_KEY / VITE_SYNC_EMAIL / VITE_SYNC_PASSWORD (ver packages/web/.env.example).",
    );
    return;
  }

  const sincronizador = crearSincronizadorSaliente(db, {
    supabaseUrl,
    supabaseAnonKey,
    syncEmail,
    syncPassword,
  });

  void sincronizador.sincronizar();
  setInterval(() => void sincronizador.sincronizar(), INTERVALO_MS);
}
