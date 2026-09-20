import { describe, it, expect } from "vitest";
import { normalizarValor } from "../src/sync/restauracion-nube.js";

/**
 * `normalizarValor` es la única lógica pura de restauracion-nube.ts (el
 * resto es red/SQL); el módulo en sí no tiene test de red, igual que
 * subida-saliente.ts tampoco lo tiene — ver comentario en el plan.
 */
describe("restauracion-nube — normalizarValor", () => {
  it("convierte booleans de Postgres a 0/1 de SQLite", () => {
    expect(normalizarValor(true)).toBe(1);
    expect(normalizarValor(false)).toBe(0);
  });

  it("reformatea un timestamp con offset numérico al formato local (sufijo Z)", () => {
    const resultado = normalizarValor("2026-09-20T14:49:02.736163+00:00");
    expect(resultado).toBe(new Date("2026-09-20T14:49:02.736163+00:00").toISOString());
    expect(resultado).toMatch(/Z$/);
  });

  it("reformatea una fecha pura (DATE de Postgres, sin hora)", () => {
    const resultado = normalizarValor("2026-09-20");
    expect(typeof resultado).toBe("string");
    expect(resultado).toMatch(/Z$/);
  });

  it("deja intactos strings que no parecen fecha", () => {
    expect(normalizarValor("Arroz Selecto 5 lb")).toBe("Arroz Selecto 5 lb");
    expect(normalizarValor("cajero")).toBe("cajero");
  });

  it("deja intactos numbers, null y undefined", () => {
    expect(normalizarValor(42)).toBe(42);
    expect(normalizarValor(null)).toBe(null);
    expect(normalizarValor(undefined)).toBe(undefined);
  });
});
