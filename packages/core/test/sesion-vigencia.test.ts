import { describe, it, expect } from "vitest";
import { restaurarSesion, marcarSesion } from "../src/dominio/sesion-vigencia.js";
import type { PortadorSesion } from "../src/dominio/permisos.js";

const SESION_VALIDA: PortadorSesion = {
  usuarioId: "usuario-1",
  rol: "cajero",
  permisos: new Set(["modulo.ventas", "factura.cobrar"]),
};

describe("marcarSesion / restaurarSesion — espejo en sessionStorage (§ RBAC-05)", () => {
  it("una marca válida con usuario activo se restaura con los permisos ya resueltos", () => {
    const marca = marcarSesion(SESION_VALIDA);
    const restaurada = restaurarSesion(marca, true);
    expect(restaurada).not.toBeNull();
    expect(restaurada!.usuarioId).toBe("usuario-1");
    expect(restaurada!.rol).toBe("cajero");
    expect(restaurada!.permisos.has("modulo.ventas")).toBe(true);
    expect(restaurada!.permisos.has("factura.cobrar")).toBe(true);
    expect(restaurada!.permisos.has("personal.gestionar")).toBe(false);
  });

  it("una marca válida cuyo usuario ya no está activo devuelve null", () => {
    const marca = marcarSesion(SESION_VALIDA);
    expect(restaurarSesion(marca, false)).toBeNull();
  });

  it("contenido malformado (JSON inválido) devuelve null sin lanzar y avisa por el callback", () => {
    let avisado: string | undefined;
    expect(() => restaurarSesion("{esto no es json", true, (m) => (avisado = m))).not.toThrow();
    expect(restaurarSesion("{esto no es json", true, (m) => (avisado = m))).toBeNull();
    expect(avisado).toBeTruthy();
  });

  it("contenido malformado (forma inesperada) devuelve null sin lanzar y avisa", () => {
    let avisado: string | undefined;
    const marca = JSON.stringify({ algo: "distinto" });
    expect(restaurarSesion(marca, true, (m) => (avisado = m))).toBeNull();
    expect(avisado).toBeTruthy();
  });

  it("un rol desconocido en la marca cuenta como malformado y no lanza", () => {
    const marca = JSON.stringify({ usuarioId: "x", rol: "root", permisos: [] });
    expect(restaurarSesion(marca, true)).toBeNull();
  });

  it("marca null (nunca hubo sesión guardada) devuelve null sin avisar", () => {
    let avisado = false;
    expect(restaurarSesion(null, true, () => (avisado = true))).toBeNull();
    expect(avisado).toBe(false);
  });

  it("permisos desconocidos dentro de una marca por lo demás válida se descartan en silencio", () => {
    const marca = JSON.stringify({
      usuarioId: "usuario-2",
      rol: "dueno",
      permisos: ["modulo.ventas", "permiso.inventado"],
    });
    const restaurada = restaurarSesion(marca, true);
    expect(restaurada).not.toBeNull();
    expect(restaurada!.permisos.has("modulo.ventas")).toBe(true);
    expect([...restaurada!.permisos]).not.toContain("permiso.inventado");
  });
});
