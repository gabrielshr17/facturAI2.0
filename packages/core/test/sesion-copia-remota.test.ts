import { describe, it, expect } from "vitest";
import { crearCorteCajaRepo, PermisoError, SESION_COPIA_REMOTA } from "../src/index.js";
import { conSesion, crearPortadorSesion } from "../src/db/sesion.js";
import { nuevaDb } from "./_ayuda.js";

describe("SESION_COPIA_REMOTA — dueño en la copia web del panel remoto", () => {
  it("puede administrar catálogo, compras, clientes y reportes", () => {
    const permisos = SESION_COPIA_REMOTA.permisos;
    for (const permiso of [
      "modulo.productos",
      "producto.editar",
      "modulo.clientes",
      "modulo.compras",
      "compra.registrar",
      "modulo.facturas",
      "modulo.reportes",
      "modulo.configuracion",
      "modulo.corte_caja",
    ] as const) {
      expect(permisos.has(permiso)).toBe(true);
    }
  });

  it("no puede vender, cobrar, abrir ni cerrar caja, ni gestionar personal con PIN", () => {
    const permisos = SESION_COPIA_REMOTA.permisos;
    for (const permiso of [
      "modulo.ventas",
      "factura.cobrar",
      "caja.abrir",
      "caja.cerrar",
      "devolucion.registrar",
      "personal.gestionar",
    ] as const) {
      expect(permisos.has(permiso)).toBe(false);
    }
  });

  it("no apunta a un usuario local que la nube no conoce", () => {
    expect(SESION_COPIA_REMOTA.usuarioId).toBeNull();
    expect(SESION_COPIA_REMOTA.rol).toBe("dueno");
  });
});

describe("SESION_COPIA_REMOTA sobre el corte de caja", () => {
  async function repoConSesionRemota() {
    const db = await nuevaDb();
    const portador = crearPortadorSesion(null);
    portador.fijar(SESION_COPIA_REMOTA);
    return { db, cortes: crearCorteCajaRepo(conSesion(db, portador)) };
  }

  it("puede consultar el turno abierto de la caja", async () => {
    const { db, cortes } = await repoConSesionRemota();
    await crearCorteCajaRepo(db).abrirTurno({ montoInicial: 500 });

    const turno = await cortes.turnoAbierto();

    expect(turno?.monto_inicial).toBe(500);
  });

  it("no puede abrir un turno de caja", async () => {
    const { cortes } = await repoConSesionRemota();

    await expect(cortes.abrirTurno({ montoInicial: 500 })).rejects.toBeInstanceOf(PermisoError);
  });

  it("no puede cerrar un turno que la caja abrió sin usuario", async () => {
    const { db, cortes } = await repoConSesionRemota();
    await crearCorteCajaRepo(db).abrirTurno({ montoInicial: 500 });

    await expect(cortes.cerrarTurno({ efectivoContado: 500 })).rejects.toBeInstanceOf(PermisoError);
  });
});
