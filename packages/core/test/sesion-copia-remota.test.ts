import { describe, it, expect } from "vitest";
import { SESION_COPIA_REMOTA } from "../src/index.js";

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
    ] as const) {
      expect(permisos.has(permiso)).toBe(true);
    }
  });

  it("no puede vender, cobrar, abrir ni cerrar caja, ni gestionar personal con PIN", () => {
    const permisos = SESION_COPIA_REMOTA.permisos;
    for (const permiso of [
      "modulo.ventas",
      "factura.cobrar",
      "modulo.corte_caja",
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
