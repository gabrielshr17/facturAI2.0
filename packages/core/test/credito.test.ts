import { describe, it, expect } from "vitest";
import { creditoDisponible, validarCargoCredito } from "../src/dominio/credito.js";

describe("creditoDisponible", () => {
  it("límite 0 significa sin límite", () => {
    expect(creditoDisponible(0, 500)).toBeNull();
  });

  it("resta el saldo del límite cuando hay límite", () => {
    expect(creditoDisponible(2000, 500)).toBe(1500);
  });
});

describe("validarCargoCredito", () => {
  it("rechaza monto cero o negativo", () => {
    const errores = validarCargoCredito({
      aplicaCredito: true, limiteCredito: 0, saldoActual: 0, monto: 0,
    });
    expect(errores).not.toHaveLength(0);
  });

  it("rechaza cliente sin crédito habilitado aunque el monto sea pequeño", () => {
    const errores = validarCargoCredito({
      aplicaCredito: false, limiteCredito: 0, saldoActual: 0, monto: 10,
    });
    expect(errores).not.toHaveLength(0);
  });

  it("rechaza cuando el cargo excede el límite y muestra deuda y disponible", () => {
    const errores = validarCargoCredito({
      aplicaCredito: true, limiteCredito: 2000, saldoActual: 1800, monto: 300,
    });
    expect(errores).not.toHaveLength(0);
    expect(errores[0].mensaje).toMatch(/200/); // disponible
    expect(errores[0].mensaje).toMatch(/1800/); // deuda actual
  });

  it("acepta un cargo que llega exactamente al disponible", () => {
    const errores = validarCargoCredito({
      aplicaCredito: true, limiteCredito: 2000, saldoActual: 1800, monto: 200,
    });
    expect(errores).toHaveLength(0);
  });

  it("límite 0 (sin límite) acepta cualquier monto si aplica crédito", () => {
    const errores = validarCargoCredito({
      aplicaCredito: true, limiteCredito: 0, saldoActual: 999999, monto: 99999,
    });
    expect(errores).toHaveLength(0);
  });
});
