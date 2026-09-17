import { describe, it, expect, beforeEach } from "vitest";
import type { SqlDriver } from "../src/db/driver.js";
import { nuevaDb } from "./_ayuda.js";
import { crearCajaRepo, crearInstalacionRepo, ValidacionError } from "../src/index.js";

describe("cajaRepo — catálogo de cajas (MULTICAJA-02)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("crear devuelve la caja con id UUID, prefijo normalizado a mayúsculas y activa=1", async () => {
    const cajas = crearCajaRepo(db);
    const c = await cajas.crear({ nombre: "Caja principal", prefijo: "c1" });
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(c.prefijo).toBe("C1");
    expect(c.activa).toBe(1);
    expect(c.nombre).toBe("Caja principal");
  });

  it("crear sin nombre lanza ValidacionError con campo 'nombre'", async () => {
    const cajas = crearCajaRepo(db);
    try {
      await cajas.crear({ nombre: "", prefijo: "C1" });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidacionError);
      expect((e as ValidacionError).errores.some((x) => x.campo === "nombre")).toBe(true);
    }
  });

  it("crear sin prefijo lanza ValidacionError", async () => {
    const cajas = crearCajaRepo(db);
    await expect(cajas.crear({ nombre: "Caja 2", prefijo: "" })).rejects.toBeInstanceOf(ValidacionError);
  });

  it("crear con prefijo 'c1' cuando ya existe una caja con prefijo 'C1' lanza ValidacionError por prefijo duplicado", async () => {
    const cajas = crearCajaRepo(db);
    await cajas.crear({ nombre: "Caja A", prefijo: "C1" });
    await expect(cajas.crear({ nombre: "Caja B", prefijo: "c1" })).rejects.toBeInstanceOf(ValidacionError);
  });

  it("crear con prefijo demasiado largo lanza ValidacionError", async () => {
    const cajas = crearCajaRepo(db);
    await expect(
      cajas.crear({ nombre: "Caja larga", prefijo: "DEMASIADOLARGO" }),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("crear con prefijo de caracteres inválidos lanza ValidacionError", async () => {
    const cajas = crearCajaRepo(db);
    await expect(cajas.crear({ nombre: "Caja rara", prefijo: "C1#" })).rejects.toBeInstanceOf(ValidacionError);
  });

  it("listar excluye las borradas y listarActivas excluye activa=0", async () => {
    const cajas = crearCajaRepo(db);
    const a = await cajas.crear({ nombre: "Zeta", prefijo: "ZZ" });
    const b = await cajas.crear({ nombre: "Alfa", prefijo: "AA" });
    await cajas.desactivar(b.id);
    const c = await cajas.crear({ nombre: "Beta", prefijo: "BB" });
    await cajas.actualizar(c.id, { nombre: "Beta", prefijo: "BB", activa: 0 });

    const listados = await cajas.listar();
    expect(listados.map((x) => x.nombre)).toEqual(["Alfa", "Beta", "Zeta"]);

    const activas = await cajas.listarActivas();
    expect(activas.map((x) => x.nombre)).toEqual(["Zeta"]);

    void a;
  });

  it("desactivar la caja asignada en instalacion lanza ValidacionError y la caja sigue activa", async () => {
    const cajas = crearCajaRepo(db);
    const instalaciones = crearInstalacionRepo(db);
    const c = await cajas.crear({ nombre: "Caja usada", prefijo: "CU" });
    await instalaciones.fijarCaja(c.id);

    await expect(cajas.desactivar(c.id)).rejects.toBeInstanceOf(ValidacionError);
    const recargada = await cajas.obtener(c.id);
    expect(recargada?.activa).toBe(1);
  });

  it("crear y actualizar dejan una línea en bitacora_accion", async () => {
    const cajas = crearCajaRepo(db);
    const c = await cajas.crear({ nombre: "Caja con bitácora", prefijo: "CB" });
    await cajas.actualizar(c.id, { nombre: "Caja con bitácora 2", prefijo: "CB" });

    const filas = await db.all<{ accion: string; entidad: string }>(
      "SELECT accion, entidad FROM bitacora_accion WHERE entidad = 'caja' ORDER BY timestamp",
    );
    expect(filas.length).toBeGreaterThanOrEqual(2);
    expect(filas.every((f) => f.entidad === "caja")).toBe(true);
  });

  it("obtener devuelve undefined para una caja inexistente", async () => {
    const cajas = crearCajaRepo(db);
    expect(await cajas.obtener("no-existe")).toBeUndefined();
  });
});
