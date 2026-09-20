/**
 * Configuración del backend (§ Multi-caja/multiusuario). Cuando
 * `packages/api/.env` trae `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` reales
 * (ya es el caso del proyecto en producción), `supabaseConfigurado` queda en
 * `true` y el proceso corre completamente conectado — auth vía Supabase Auth
 * (`plugins/auth.ts`), RLS aplicado en la base. Sin esas variables (dev sin
 * `.env`), arranca en modo scaffold: sirve rutas pero autentica todo como
 * usuario de desarrollo (ver el warning en `server.ts`).
 *
 * Nada de esto se usa en el modo 100% local (SQLite en el cliente); el
 * backend solo entra en juego para el modo multi-caja/multiusuario y para
 * el endpoint de transmisión e-CF (ver plan.md, "Flujo de datos y modos").
 */
export interface ConfigApi {
  puerto: number;
  supabaseUrl: string | null;
  supabaseServiceRoleKey: string | null;
  powersyncUrl: string | null;
  /** true si todas las credenciales de Supabase están presentes. */
  supabaseConfigurado: boolean;
  /** orígenes CORS permitidos (vacío = modo scaffold/desarrollo: refleja cualquier origen). */
  allowedOrigins: string[];
}

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): ConfigApi {
  const supabaseUrl = env.SUPABASE_URL || null;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || null;
  const allowedOrigins = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    puerto: Number(env.PORT) || 3001,
    supabaseUrl,
    supabaseServiceRoleKey,
    powersyncUrl: env.POWERSYNC_URL || null,
    supabaseConfigurado: Boolean(supabaseUrl && supabaseServiceRoleKey),
    allowedOrigins,
  };
}
