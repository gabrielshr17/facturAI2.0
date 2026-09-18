import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Único punto centralizado que crea el cliente de Supabase, siguiendo la
 * misma convención de "ApiClient centralizado, sin URLs sueltas" que el
 * resto del repo aplica a los fetch contra @sfr/api. Ningún otro archivo de
 * este paquete debe importar "@supabase/supabase-js" directo: todos
 * consumen este módulo.
 *
 * Esta app NO pasa por @sfr/core/SqlDriver: esa capa modela SQLite local
 * (exec/run/all/get sobre un archivo en la tienda) y no tiene sentido para
 * un cliente que habla PostgREST/Auth directo contra un proyecto Supabase
 * remoto — forzar el mismo contrato hubiera significado reimplementar un
 * driver de mentira solo para encajar en una interfaz que no aplica aquí.
 *
 * La clave usada es la publishable/anon key (VITE_SUPABASE_ANON_KEY, formato
 * "sb_publishable_..."): es segura de exponer en un navegador porque todo el
 * acceso real lo decide Row Level Security en Postgres
 * (packages/api/db/rls-policies.sql), ya verificado en producción.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copia packages/remoto/.env.example a .env y rellena los valores del proyecto Supabase.",
  );
}

export const supabase: SupabaseClient = createClient(url, anonKey);
