import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { createClient } from "@supabase/supabase-js";
import { cargarConfig, type ConfigApi } from "../config.js";

export interface UsuarioAutenticado {
  id: string;
  correo: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    usuario: UsuarioAutenticado | null;
  }
}

/**
 * Llama a `supabase.auth.getUser(token)` y traduce el resultado a
 * `UsuarioAutenticado`. Vive separada de `registrarAuth` para poder probarla
 * con un mock de `@supabase/supabase-js` sin levantar Fastify ni un proyecto
 * real de Supabase (ver `auth.test.ts`).
 *
 * Devuelve `null` tanto si el token es inválido como si la llamada a
 * Supabase falla (red caída, proyecto pausado, etc.): en ningún caso hay que
 * decidir "confiar por defecto" ante un fallo de verificación — el llamador
 * responde 401 en los dos casos. El error de red sí se registra con el
 * logger recibido para no dejarlo pasar en silencio.
 */
export async function verificarToken(
  token: string,
  config: Pick<ConfigApi, "supabaseUrl" | "supabaseServiceRoleKey">,
  log: Pick<FastifyBaseLogger, "error">,
): Promise<UsuarioAutenticado | null> {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    return null;
  }

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      return null;
    }
    return { id: data.user.id, correo: data.user.email ?? null };
  } catch (error) {
    log.error(error, "Fallo de red al verificar el token contra Supabase Auth.");
    return null;
  }
}

/**
 * Verifica el JWT de Supabase Auth en el header `Authorization`.
 *
 * - Sin `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`: cada solicitud pasa como
 *   un usuario de desarrollo fijo. Es lo esperado en modo 100% local/scaffold
 *   — NUNCA debe llegar así a producción.
 * - Con las variables presentes: se exige `Authorization: Bearer <token>` y
 *   se valida contra Supabase Auth (`verificarToken`). Token ausente,
 *   inválido, o fallo al verificarlo → 401 explícito; nunca se asume válido.
 *
 * Se registra llamando a esta función directamente sobre la instancia raíz
 * de Fastify (NO vía `app.register(...)`) — un plugin registrado con
 * `.register()` crea su propio contexto encapsulado, y un hook agregado ahí
 * adentro nunca llegaría a rutas hermanas (`/health`, `/fiscal/...`, etc.)
 * registradas cada una en su propio contexto. Un hook agregado directamente
 * sobre la instancia raíz, en cambio, sí se hereda por los contextos hijos
 * que se registren después.
 */
export function registrarAuth(app: FastifyInstance): void {
  const config = cargarConfig();
  app.decorateRequest("usuario", null);

  app.addHook("onRequest", async (request, reply) => {
    if (!config.supabaseConfigurado) {
      request.usuario = { id: "dev-local", correo: null };
      return;
    }

    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      await reply.code(401).send({ error: "Falta el token de autenticación." });
      return;
    }

    const token = auth.slice("Bearer ".length);
    const usuario = await verificarToken(token, config, app.log);
    if (!usuario) {
      await reply.code(401).send({ error: "Token inválido o expirado." });
      return;
    }
    request.usuario = usuario;
  });
}
