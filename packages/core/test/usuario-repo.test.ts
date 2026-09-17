import { describe, expect, it } from "vitest";
import { nuevaDb } from "./_ayuda.js";
import { crearUsuarioRepo } from "../src/repos/usuario-repo.js";
import { ValidacionError } from "../src/repos/producto-repo.js";

/**
 * Pruebas de RBAC-03: usuario-repo.ts. Cubre el CRUD, la regla del último
 * dueño/superadmin activo, y `autenticar` como resultado discriminado que
 * nunca devuelve `pin_hash` fuera del repo.
 */
describe("usuario-repo", () => {
  it("crear con PIN persiste un pin_hash que no es null y no es igual al PIN en claro", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    const usuario = await repo.crear({ nombre: "Ana", rol: "cajero", pin: "1234" });

    const fila = await db.get<{ pin_hash: string | null }>(
      "SELECT pin_hash FROM usuario WHERE id=?",
      [usuario.id],
    );
    expect(fila?.pin_hash).not.toBeNull();
    expect(fila?.pin_hash).not.toBe("1234");
  });

  it("crear con nombre vacío lanza ValidacionError", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    await expect(repo.crear({ nombre: "", rol: "cajero" })).rejects.toThrow(ValidacionError);
  });

  it("crear con rol 'gerente' lanza ValidacionError", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    // @ts-expect-error rol inválido a propósito
    await expect(repo.crear({ nombre: "Ana", rol: "gerente" })).rejects.toThrow(ValidacionError);
  });

  it("crear con PIN de 3 dígitos lanza ValidacionError", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    await expect(repo.crear({ nombre: "Ana", rol: "cajero", pin: "123" })).rejects.toThrow(ValidacionError);
  });

  it("crear con PIN no numérico lanza ValidacionError", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    await expect(repo.crear({ nombre: "Ana", rol: "cajero", pin: "abcd" })).rejects.toThrow(ValidacionError);
  });

  it("autenticar con el PIN correcto devuelve ok:true con el set de permisos resuelto del rol", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    const usuario = await repo.crear({ nombre: "Ana", rol: "cajero", pin: "1234" });

    const resultado = await repo.autenticar({ usuarioId: usuario.id, pin: "1234" });

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.usuario.id).toBe(usuario.id);
      expect(resultado.permisos.has("modulo.ventas")).toBe(true);
      expect((resultado.usuario as unknown as { pin_hash?: string }).pin_hash).toBeUndefined();
    }
  });

  it("autenticar con PIN incorrecto devuelve ok:false motivo pin_incorrecto y sube intentos_fallidos", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    const usuario = await repo.crear({ nombre: "Ana", rol: "cajero", pin: "1234" });

    const primero = await repo.autenticar({ usuarioId: usuario.id, pin: "0000" });
    expect(primero).toEqual({ ok: false, motivo: "pin_incorrecto" });

    let fila = await db.get<{ intentos_fallidos: number }>(
      "SELECT intentos_fallidos FROM usuario_seguridad WHERE usuario_id=?",
      [usuario.id],
    );
    expect(fila?.intentos_fallidos).toBe(1);

    await repo.autenticar({ usuarioId: usuario.id, pin: "0000" });
    fila = await db.get<{ intentos_fallidos: number }>(
      "SELECT intentos_fallidos FROM usuario_seguridad WHERE usuario_id=?",
      [usuario.id],
    );
    expect(fila?.intentos_fallidos).toBe(2);
  });

  it("autenticar correcto tras fallos resetea intentos_fallidos y escribe ultimo_acceso", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    const usuario = await repo.crear({ nombre: "Ana", rol: "cajero", pin: "1234" });

    await repo.autenticar({ usuarioId: usuario.id, pin: "0000" });
    await repo.autenticar({ usuarioId: usuario.id, pin: "0000" });
    const resultado = await repo.autenticar({ usuarioId: usuario.id, pin: "1234" });
    expect(resultado.ok).toBe(true);

    const fila = await db.get<{ intentos_fallidos: number; ultimo_acceso: string | null }>(
      "SELECT intentos_fallidos, ultimo_acceso FROM usuario_seguridad WHERE usuario_id=?",
      [usuario.id],
    );
    expect(fila?.intentos_fallidos).toBe(0);
    expect(fila?.ultimo_acceso).not.toBeNull();
  });

  it("autenticar de un usuario con activo=0 devuelve motivo 'inactivo' aunque el PIN sea correcto", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    const usuario = await repo.crear({ nombre: "Ana", rol: "cajero", pin: "1234" });
    await repo.actualizar(usuario.id, { nombre: "Ana", rol: "cajero", activo: false });

    const resultado = await repo.autenticar({ usuarioId: usuario.id, pin: "1234" });
    expect(resultado).toEqual({ ok: false, motivo: "inactivo" });
  });

  it("autenticar con bloqueado_hasta en el futuro devuelve motivo 'bloqueado' sin verificar el PIN", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    const usuario = await repo.crear({ nombre: "Ana", rol: "cajero", pin: "1234" });

    const futuro = new Date(Date.now() + 60_000).toISOString();
    const ts = new Date().toISOString();
    await db.run(
      `INSERT INTO usuario_seguridad (usuario_id, ultimo_acceso, intentos_fallidos, bloqueado_hasta, pin_actualizado_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?)`,
      [usuario.id, null, 0, futuro, null, ts, ts],
    );

    const resultado = await repo.autenticar({ usuarioId: usuario.id, pin: "1234" });
    expect(resultado).toEqual({ ok: false, motivo: "bloqueado" });
  });

  it("autenticar del usuario semilla (pin_hash NULL) devuelve motivo 'sin_pin'", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    const usuario = await repo.crear({ nombre: "Sin Pin", rol: "cajero" });

    const resultado = await repo.autenticar({ usuarioId: usuario.id, pin: "1234" });
    expect(resultado).toEqual({ ok: false, motivo: "sin_pin" });
  });

  it("desactivar al único usuario activo con rol 'dueno' lanza ValidacionError; con dos dueños funciona", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    const unico = await repo.crear({ nombre: "Dueño Único", rol: "dueno" });

    await expect(repo.desactivar(unico.id)).rejects.toThrow(ValidacionError);

    const segundo = await repo.crear({ nombre: "Dueño Dos", rol: "dueno" });
    await expect(repo.desactivar(segundo.id)).resolves.toBeUndefined();

    const fila = await db.get<{ activo: number }>("SELECT activo FROM usuario WHERE id=?", [segundo.id]);
    expect(fila?.activo).toBe(0);
  });

  it("actualizar el rol del único dueño activo a 'cajero' lanza ValidacionError", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    const unico = await repo.crear({ nombre: "Dueño Único", rol: "dueno" });

    await expect(
      repo.actualizar(unico.id, { nombre: "Dueño Único", rol: "cajero" }),
    ).rejects.toThrow(ValidacionError);
  });

  it("cambiarPin con pinActual incorrecto lanza; con omitirPinActual true funciona", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    const usuario = await repo.crear({ nombre: "Ana", rol: "cajero", pin: "1234" });

    await expect(
      repo.cambiarPin({ usuarioId: usuario.id, pinActual: "0000", pinNuevo: "5678" }),
    ).rejects.toThrow(ValidacionError);

    await expect(
      repo.cambiarPin({ usuarioId: usuario.id, pinNuevo: "5678", omitirPinActual: true }),
    ).resolves.toBeUndefined();

    const resultado = await repo.autenticar({ usuarioId: usuario.id, pin: "5678" });
    expect(resultado.ok).toBe(true);
  });

  it("listar() devuelve objetos cuyas claves no incluyen 'pin_hash'", async () => {
    const db = await nuevaDb();
    const repo = crearUsuarioRepo(db);
    await repo.crear({ nombre: "Ana", rol: "cajero", pin: "1234" });

    const lista = await repo.listar();
    expect(lista.length).toBeGreaterThan(0);
    for (const usuario of lista) {
      expect(Object.keys(usuario)).not.toContain("pin_hash");
    }
  });
});
