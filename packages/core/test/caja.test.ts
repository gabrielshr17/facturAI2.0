import { describe, it, expect } from "vitest";
import { calcularCorteCaja, calcularDiferenciaVerificacion } from "../src/dominio/caja.js";

describe("caja — calcularCorteCaja (corte de caja)", () => {
  it("efectivo esperado = fondo inicial + ventas en efectivo", () => {
    const r = calcularCorteCaja({ montoInicial: 1000, totalEfectivo: 500, efectivoContado: 1500 });
    expect(r.efectivoEsperado).toBe(1500);
    expect(r.diferencia).toBe(0);
  });

  it("diferencia positiva cuando sobra efectivo", () => {
    const r = calcularCorteCaja({ montoInicial: 0, totalEfectivo: 100, efectivoContado: 110 });
    expect(r.diferencia).toBe(10);
  });

  it("diferencia negativa cuando falta efectivo", () => {
    const r = calcularCorteCaja({ montoInicial: 0, totalEfectivo: 100, efectivoContado: 90 });
    expect(r.diferencia).toBe(-10);
  });

  it("redondea a 2 decimales", () => {
    const r = calcularCorteCaja({ montoInicial: 0, totalEfectivo: 33.333, efectivoContado: 33.33 });
    expect(r.efectivoEsperado).toBe(33.33);
    expect(r.diferencia).toBe(0);
  });
});

describe("caja — calcularDiferenciaVerificacion (verificar tarjeta/transferencia)", () => {
  it("0 cuando el monto verificado coincide con lo esperado", () => {
    expect(calcularDiferenciaVerificacion(100, 100)).toBe(0);
  });

  it("negativa cuando lo verificado es menos de lo esperado", () => {
    expect(calcularDiferenciaVerificacion(100, 95)).toBe(-5);
  });

  it("positiva cuando lo verificado es más de lo esperado", () => {
    expect(calcularDiferenciaVerificacion(100, 110)).toBe(10);
  });

  it("redondea a 2 decimales", () => {
    expect(calcularDiferenciaVerificacion(10, 13.336)).toBe(3.34);
  });
});
