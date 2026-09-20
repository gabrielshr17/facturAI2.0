import { describe, it, expect } from "vitest";
import { restaurarSesion, marcarSesion, debeBloquear } from "../src/dominio/sesion-vigencia.js";
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

describe("debeBloquear — vigencia del bloqueo por inactividad (§ RBAC-07 parte B)", () => {
  const ULTIMA_ACTIVIDAD = new Date("2026-01-01T10:00:00.000Z");

  it("justo por debajo del límite no bloquea", () => {
    const ahora = new Date(ULTIMA_ACTIVIDAD.getTime() + 5 * 60_000 - 1);
    expect(debeBloquear(ULTIMA_ACTIVIDAD, ahora, 5)).toBe(false);
  });

  it("exactamente en el límite bloquea", () => {
    const ahora = new Date(ULTIMA_ACTIVIDAD.getTime() + 5 * 60_000);
    expect(debeBloquear(ULTIMA_ACTIVIDAD, ahora, 5)).toBe(true);
  });

  it("justo por encima del límite bloquea", () => {
    const ahora = new Date(ULTIMA_ACTIVIDAD.getTime() + 5 * 60_000 + 1);
    expect(debeBloquear(ULTIMA_ACTIVIDAD, ahora, 5)).toBe(true);
  });

  it("respeta distintos límites (1 y 30 minutos)", () => {
    const unMinutoDespues = new Date(ULTIMA_ACTIVIDAD.getTime() + 60_000);
    expect(debeBloquear(ULTIMA_ACTIVIDAD, unMinutoDespues, 1)).toBe(true);
    expect(debeBloquear(ULTIMA_ACTIVIDAD, unMinutoDespues, 30)).toBe(false);
  });

  it("límite 0 nunca bloquea (bloqueo desactivado) y no lanza", () => {
    const muchoDespues = new Date(ULTIMA_ACTIVIDAD.getTime() + 999 * 60_000);
    expect(() => debeBloquear(ULTIMA_ACTIVIDAD, muchoDespues, 0)).not.toThrow();
    expect(debeBloquear(ULTIMA_ACTIVIDAD, muchoDespues, 0)).toBe(false);
  });

  it("límite negativo se trata igual que desactivado y no lanza", () => {
    const muchoDespues = new Date(ULTIMA_ACTIVIDAD.getTime() + 999 * 60_000);
    expect(() => debeBloquear(ULTIMA_ACTIVIDAD, muchoDespues, -5)).not.toThrow();
    expect(debeBloquear(ULTIMA_ACTIVIDAD, muchoDespues, -5)).toBe(false);
  });

  it("ahora anterior a la última actividad (reloj retrocedido) no bloquea", () => {
    const antes = new Date(ULTIMA_ACTIVIDAD.getTime() - 60_000);
    expect(debeBloquear(ULTIMA_ACTIVIDAD, antes, 5)).toBe(false);
  });
});
