import { describe, it, expect } from "vitest";
import { evaluarCambioUsuario } from "../src/dominio/cambio-usuario.js";
import type { Factura } from "../src/repos/tipos.js";

function ticket(overrides: Partial<Factura> = {}): Factura {
  return {
    id: "ticket-1",
    numero_interno: 1,
    fecha_hora: "2026-09-17T12:00:00.000Z",
    cliente_id: null,
    caja_id: null,
    usuario_id: "usuario-1",
    tipo: "normal",
    subtotal_gravado: 0,
    subtotal_exento: 0,
    total_itbis: 0,
    total: 0,
    monto_pagado: 0,
    cambio: 0,
    notas: null,
    estado: "abierta",
    comprobante_id: null,
    prefijo_caja: null,
    created_at: "2026-09-17T12:00:00.000Z",
    updated_at: "2026-09-17T12:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("evaluarCambioUsuario — bloqueo por ticket abierto al cambiar de usuario (§ RBAC-07 parte C)", () => {
  it("ticket vacío (recién abierto por Ventas.tsx, total en cero) no bloquea el cambio", () => {
    const resultado = evaluarCambioUsuario([ticket({ total: 0 })]);
    expect(resultado.permitido).toBe(true);
    expect(resultado.mensaje).toBeUndefined();
  });

  it("ningún ticket abierto no bloquea el cambio", () => {
    expect(evaluarCambioUsuario([]).permitido).toBe(true);
  });

  it("ticket con líneas (total distinto de cero) bloquea el cambio con un mensaje claro", () => {
    const resultado = evaluarCambioUsuario([ticket({ total: 150 })]);
    expect(resultado.permitido).toBe(false);
    expect(resultado.mensaje).toMatch(/ticket abierto/i);
  });

  it("varios tickets con contenido bloquean con un mensaje en plural", () => {
    const resultado = evaluarCambioUsuario([ticket({ id: "a", total: 100 }), ticket({ id: "b", total: 50 })]);
    expect(resultado.permitido).toBe(false);
    expect(resultado.mensaje).toMatch(/2 tickets abiertos/i);
  });

  it("un ticket vacío junto a uno con contenido bloquea (el vacío no lo salva)", () => {
    const resultado = evaluarCambioUsuario([ticket({ id: "vacio", total: 0 }), ticket({ id: "con-lineas", total: 300 })]);
    expect(resultado.permitido).toBe(false);
  });
});
