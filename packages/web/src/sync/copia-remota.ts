import { createClient } from "@supabase/supabase-js";
import { crearSincronizadorBidireccional, OPCIONES_MODO_REMOTO, type SqlDriver } from "@sfr/core";

const INTERVALO_MS = 30_000;
const ESPERA_PRIMERA_SINCRONIZACION_MS = 20_000;

export type ResultadoCopiaRemota = "listo" | "sin_sesion" | "sin_configuracion";

function conLimite(promesa: Promise<void>, milisegundos: number): Promise<void> {
  return Promise.race([
    promesa,
    new Promise<void>((resolver) => setTimeout(resolver, milisegundos)),
  ]);
}

export async function iniciarCopiaRemota(db: SqlDriver): Promise<ResultadoCopiaRemota> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "Copia remota sin configurar: faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.",
    );
    return "sin_configuracion";
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data } = await supabase.auth.getSession();
  if (!data.session) return "sin_sesion";

  const sincronizador = crearSincronizadorBidireccional(
    db,
    {
      supabaseUrl,
      supabaseAnonKey,
      proveedorToken: async () => {
        const { data: actual } = await supabase.auth.getSession();
        if (!actual.session) throw new Error("La sesión del panel remoto expiró.");
        return actual.session.access_token;
      },
    },
    fetch,
    OPCIONES_MODO_REMOTO,
  );

  await conLimite(sincronizador.sincronizar(), ESPERA_PRIMERA_SINCRONIZACION_MS);
  setInterval(() => void sincronizador.sincronizar(), INTERVALO_MS);
  return "listo";
}
