import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";

/**
 * `verificarToken` es la única pieza de `plugins/auth.ts` que habla con un
 * servicio externo (Supabase Auth): se mockea `@supabase/supabase-js` entero
 * para no depender de un proyecto real, siguiendo la misma idea que
 * `packages/core` usa para no depender de un driver SQLite real en sus tests
 * de dominio puro.
 */
const getUserMock = vi.fn();
const createClientMock = vi.fn((_url: string, _key: string) => ({
  auth: { getUser: getUserMock },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: (url: string, key: string) => createClientMock(url, key),
}));

const { verificarToken, registrarAuth } = await import("../src/plugins/auth.js");

const configConCredenciales = {
  supabaseUrl: "https://proyecto.supabase.co",
  supabaseServiceRoleKey: "clave-de-servicio",
};

const logSilencioso = { error: vi.fn() };

beforeEach(() => {
  getUserMock.mockReset();
  createClientMock.mockClear();
  logSilencioso.error.mockClear();
});

describe("verificarToken", () => {
  it("con token válido, devuelve id y correo del usuario de Supabase Auth", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "usuario-123", email: "dueno@negocio.com" } },
      error: null,
    });

    const usuario = await verificarToken("token-valido", configConCredenciales, logSilencioso);

    expect(usuario).toEqual({ id: "usuario-123", correo: "dueno@negocio.com" });
    expect(createClientMock).toHaveBeenCalledWith(
      configConCredenciales.supabaseUrl,
      configConCredenciales.supabaseServiceRoleKey,
    );
    expect(getUserMock).toHaveBeenCalledWith("token-valido");
  });

  it("con token válido pero sin correo (usuario sin email), correo queda null", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { id: "usuario-456", email: null } },
      error: null,
    });

    const usuario = await verificarToken("token-valido", configConCredenciales, logSilencioso);

    expect(usuario).toEqual({ id: "usuario-456", correo: null });
  });

  it("con token inválido (Supabase devuelve error), devuelve null", async () => {
    getUserMock.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid JWT" },
    });

    const usuario = await verificarToken("token-invalido", configConCredenciales, logSilencioso);

    expect(usuario).toBeNull();
  });

  it("con fallo de red al llamar a Supabase, devuelve null y registra el error", async () => {
    getUserMock.mockRejectedValue(new Error("fetch failed"));

    const usuario = await verificarToken("token-cualquiera", configConCredenciales, logSilencioso);

    expect(usuario).toBeNull();
    expect(logSilencioso.error).toHaveBeenCalledTimes(1);
  });

  it("sin credenciales configuradas, no llama a Supabase y devuelve null", async () => {
    const usuario = await verificarToken(
      "token-cualquiera",
      { supabaseUrl: null, supabaseServiceRoleKey: null },
      logSilencioso,
    );

    expect(usuario).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(getUserMock).not.toHaveBeenCalled();
  });
});

/**
 * `registrarAuth` lee `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` de
 * `process.env` en cada llamada (vía `cargarConfig`), así que estos tests
 * los manipulan directamente en vez de inyectar config — es el mismo
 * contrato que usa `server.ts` en producción.
 */
describe("registrarAuth (hook onRequest)", () => {
  const envOriginal = { ...process.env };

  afterEach(() => {
    process.env = { ...envOriginal };
  });

  it("sin credenciales configuradas, autentica como dev-local sin llamar a Supabase", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const app = Fastify();
    registrarAuth(app);
    app.get("/privado", async (request) => ({ usuario: request.usuario }));

    const respuesta = await app.inject({ method: "GET", url: "/privado" });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({ usuario: { id: "dev-local", correo: null } });
    expect(createClientMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("con credenciales configuradas y sin header Authorization, responde 401", async () => {
    process.env.SUPABASE_URL = configConCredenciales.supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = configConCredenciales.supabaseServiceRoleKey;

    const app = Fastify();
    registrarAuth(app);
    app.get("/privado", async (request) => ({ usuario: request.usuario }));

    const respuesta = await app.inject({ method: "GET", url: "/privado" });

    expect(respuesta.statusCode).toBe(401);
    expect(getUserMock).not.toHaveBeenCalled();
    await app.close();
  });

  it("con credenciales configuradas y token inválido, responde 401", async () => {
    process.env.SUPABASE_URL = configConCredenciales.supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = configConCredenciales.supabaseServiceRoleKey;
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "invalid JWT" } });

    const app = Fastify();
    registrarAuth(app);
    app.get("/privado", async (request) => ({ usuario: request.usuario }));

    const respuesta = await app.inject({
      method: "GET",
      url: "/privado",
      headers: { authorization: "Bearer token-invalido" },
    });

    expect(respuesta.statusCode).toBe(401);
    await app.close();
  });

  it("con credenciales configuradas y token válido, deja pasar con el usuario real", async () => {
    process.env.SUPABASE_URL = configConCredenciales.supabaseUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = configConCredenciales.supabaseServiceRoleKey;
    getUserMock.mockResolvedValue({
      data: { user: { id: "usuario-789", email: "dueno@negocio.com" } },
      error: null,
    });

    const app = Fastify();
    registrarAuth(app);
    app.get("/privado", async (request) => ({ usuario: request.usuario }));

    const respuesta = await app.inject({
      method: "GET",
      url: "/privado",
      headers: { authorization: "Bearer token-valido" },
    });

    expect(respuesta.statusCode).toBe(200);
    expect(respuesta.json()).toEqual({
      usuario: { id: "usuario-789", correo: "dueno@negocio.com" },
    });
    await app.close();
  });
});
