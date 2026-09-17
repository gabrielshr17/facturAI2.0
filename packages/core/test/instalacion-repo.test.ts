import { describe, it, expect, beforeEach } from "vitest";
import type { SqlDriver } from "../src/db/driver.js";
import { nuevaDb } from "./_ayuda.js";
import { crearCajaRepo, crearInstalacionRepo, ValidacionError } from "../src/index.js";

describe("instalacionRepo — identidad de instalación (MULTICAJA-02)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("estaConfigurada() es false y obtener() devuelve undefined en una base recién migrada", async () => {
    const instalaciones = crearInstalacionRepo(db);
    expect(await instalaciones.estaConfigurada()).toBe(false);
    expect(await instalaciones.obtener()).toBeUndefined();
  });

  it("obtenerCajaActual() devuelve undefined sin fila de instalación", async () => {
    const instalaciones = crearInstalacionRepo(db);
    expect(await instalaciones.obtenerCajaActual()).toBeUndefined();
  });

  it("fijarCaja con un id inexistente lanza ValidacionError y no crea fila", async () => {
    const instalaciones = crearInstalacionRepo(db);
    await expect(instalaciones.fijarCaja("no-existe")).rejects.toBeInstanceOf(ValidacionError);
    expect(await instalaciones.obtener()).toBeUndefined();
  });

  it("fijarCaja con una caja inactiva lanza ValidacionError", async () => {
    const cajas = crearCajaRepo(db);
    const instalaciones = crearInstalacionRepo(db);
    const c = await cajas.crear({ nombre: "Caja inactiva", prefijo: "CI" });
    await cajas.actualizar(c.id, { nombre: c.nombre, prefijo: c.prefijo ?? "CI", activa: 0 });

    await expect(instalaciones.fijarCaja(c.id)).rejects.toBeInstanceOf(ValidacionError);
  });

  it("fijarCaja con una caja borrada lanza ValidacionError", async () => {
    const cajas = crearCajaRepo(db);
    const instalaciones = crearInstalacionRepo(db);
    const c = await cajas.crear({ nombre: "Caja a borrar", prefijo: "CB" });
    await cajas.eliminar(c.id);

    await expect(instalaciones.fijarCaja(c.id)).rejects.toBeInstanceOf(ValidacionError);
  });

  it("fijarCaja deja obtener()/estaConfigurada()/obtenerCajaActual() consistentes", async () => {
    const cajas = crearCajaRepo(db);
    const instalaciones = crearInstalacionRepo(db);
    const c = await cajas.crear({ nombre: "Caja 1", prefijo: "C1" });

    const inst = await instalaciones.fijarCaja(c.id, "Mostrador");
    expect(inst.id).toBe("instalacion-local");
    expect(inst.caja_id).toBe(c.id);
    expect(inst.alias).toBe("Mostrador");

    expect(await instalaciones.estaConfigurada()).toBe(true);
    const actual = await instalaciones.obtenerCajaActual();
    expect(actual?.id).toBe(c.id);
  });

  it("fijarCaja dos veces con cajas distintas deja UNA sola fila y obtenerCajaActual() devuelve la última", async () => {
    const cajas = crearCajaRepo(db);
    const instalaciones = crearInstalacionRepo(db);
    const c1 = await cajas.crear({ nombre: "Caja 1", prefijo: "C1" });
    const c2 = await cajas.crear({ nombre: "Caja 2", prefijo: "C2" });

    await instalaciones.fijarCaja(c1.id);
    await instalaciones.fijarCaja(c2.id);

    const filas = await db.all("SELECT * FROM instalacion");
    expect(filas).toHaveLength(1);

    const actual = await instalaciones.obtenerCajaActual();
    expect(actual?.id).toBe(c2.id);
  });

  it("fijarCaja registra la acción en bitácora", async () => {
    const cajas = crearCajaRepo(db);
    const instalaciones = crearInstalacionRepo(db);
    const c = await cajas.crear({ nombre: "Caja 1", prefijo: "C1" });
    await instalaciones.fijarCaja(c.id);

    const filas = await db.all<{ entidad: string }>(
      "SELECT entidad FROM bitacora_accion WHERE entidad = 'instalacion'",
    );
    expect(filas.length).toBeGreaterThanOrEqual(1);
  });
});
