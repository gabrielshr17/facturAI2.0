import { describe, it, expect } from "vitest";
import {
  precioBaseDesdeCosto,
  calcularPrecioVenta,
  precioTierDesdeCosto,
  pctGananciaDesdePrecio,
  precioSegunNivel,
} from "../src/dominio/precio.js";

describe("precio — costo + % de ganancia (§5)", () => {
  it("deriva el precio base sin impuesto", () => {
    expect(precioBaseDesdeCosto(40, 25)).toBe(50); // 40 + 25%
    expect(precioBaseDesdeCosto(100, 0)).toBe(100);
    expect(precioBaseDesdeCosto(33.33, 30)).toBe(43.33);
  });

  it("el precio final es costo + margen, sin sumar impuesto aparte", () => {
    expect(calcularPrecioVenta({ costo: 100, pctGanancia: 20 })).toBe(120);
    expect(calcularPrecioVenta({ costo: 100, pctGanancia: 0 })).toBe(100);
  });
});

describe("precio — el valor manual manda (§5)", () => {
  it("usa el precio manual e ignora la derivación", () => {
    const p = calcularPrecioVenta({
      costo: 40,
      pctGanancia: 25,
      precioManual: 55,
    });
    expect(p).toBe(55);
  });

  it("precio manual 0 es válido y manda", () => {
    const p = calcularPrecioVenta({
      costo: 40,
      pctGanancia: 25,
      precioManual: 0,
    });
    expect(p).toBe(0);
  });

  it("precio manual null/negativo cae a la derivación", () => {
    expect(calcularPrecioVenta({ costo: 40, pctGanancia: 25, precioManual: null })).toBe(50);
    expect(calcularPrecioVenta({ costo: 40, pctGanancia: 25, precioManual: -5 })).toBe(50);
  });
});

describe("precioTierDesdeCosto — sugerencia inicial de precio_2/precio_3 (§ PRECIOS)", () => {
  it("deriva el precio final con un margen fijo sobre el costo, sin impuesto aparte", () => {
    expect(precioTierDesdeCosto(40, 10, 50)).toBe(44);
    expect(precioTierDesdeCosto(40, 5, 50)).toBe(42);
  });

  it("nunca supera el precio de venta", () => {
    expect(precioTierDesdeCosto(100, 10, 104)).toBe(104);
  });

  it("con costo 0 usa el precio de venta", () => {
    expect(precioTierDesdeCosto(0, 10, 35)).toBe(35);
  });
});

describe("precioSegunNivel — qué precio usar según el nivel del cliente (§ PRECIOS)", () => {
  const producto = { precio_venta: 59, precio_2: 51.92, precio_3: 49.56 };

  it("nivel 1 (o sin nivel) usa precio_venta", () => {
    expect(precioSegunNivel(producto, "1")).toBe(59);
  });

  it("nivel 2 usa precio_2", () => {
    expect(precioSegunNivel(producto, "2")).toBe(51.92);
  });

  it("nivel 3 usa precio_3", () => {
    expect(precioSegunNivel(producto, "3")).toBe(49.56);
  });

  it("cae a precio_venta si el nivel 2/3 nunca se configuró (producto viejo)", () => {
    const productoViejo = { precio_venta: 59, precio_2: null, precio_3: null };
    expect(precioSegunNivel(productoViejo, "2")).toBe(59);
    expect(precioSegunNivel(productoViejo, "3")).toBe(59);
  });
});

describe("pctGananciaDesdePrecio — inverso de la derivación", () => {
  it("devuelve el % real de un precio escrito a mano", () => {
    expect(pctGananciaDesdePrecio(100, 120)).toBe(20);
    expect(pctGananciaDesdePrecio(100, 100)).toBe(0);
  });

  it("con costo 0 devuelve 0", () => {
    expect(pctGananciaDesdePrecio(0, 50)).toBe(0);
  });
});
