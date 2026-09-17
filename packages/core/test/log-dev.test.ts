import { describe, it, expect } from "vitest";
import { describirLogDev, type LogDevEntry } from "../src/dominio/log-dev.js";

function entrada(parcial: Partial<LogDevEntry>): LogDevEntry {
  return {
    nivel: "error",
    mensaje: "",
    detalle: null,
    timestamp: "2026-09-16T00:00:00.000Z",
    ...parcial,
  };
}

describe("describirLogDev", () => {
  it("reconoce el error de invoke de Tauri fuera de la ventana de escritorio", () => {
    const texto = describirLogDev(entrada({
      mensaje: "TypeError: Cannot read properties of undefined (reading 'invoke')",
    }));
    expect(texto).toMatch(/Tauri/);
    expect(texto).toMatch(/ventana de escritorio|navegador/);
  });

  it("reconoce un fallo de red (fetch)", () => {
    const texto = describirLogDev(entrada({ mensaje: "Failed to fetch" }));
    expect(texto).toMatch(/red|conexión/i);
  });

  it("reconoce almacenamiento local lleno", () => {
    const texto = describirLogDev(entrada({ mensaje: "QuotaExceededError: exceeded the quota" }));
    expect(texto).toMatch(/almacenamiento/i);
  });

  it("mensaje de error desconocido cae al texto genérico de error", () => {
    const texto = describirLogDev(entrada({ nivel: "error", mensaje: "Algo totalmente nuevo explotó" }));
    expect(texto).toBe("Error inesperado de la aplicación. Revisa el detalle técnico abajo.");
  });

  it("mensaje de advertencia desconocido cae al texto genérico de advertencia", () => {
    const texto = describirLogDev(entrada({ nivel: "warn", mensaje: "Algo raro pero no fatal" }));
    expect(texto).toBe("Advertencia de la aplicación, sin impacto inmediato conocido. Revisa el detalle técnico abajo.");
  });

  it("la coincidencia de patrones no distingue mayúsculas/minúsculas", () => {
    const texto = describirLogDev(entrada({ mensaje: "failed TO FETCH algo" }));
    expect(texto).toMatch(/red|conexión/i);
  });
});
