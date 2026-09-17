import { describe, it, expect } from "vitest";
import { describirBitacora } from "../src/dominio/bitacora.js";
import type { BitacoraAccion } from "../src/repos/tipos.js";

function registro(parcial: Partial<BitacoraAccion>): BitacoraAccion {
  return {
    id: "1",
    usuario_id: null,
    origen: "app",
    accion: "eliminar",
    entidad: "producto",
    entidad_id: null,
    resumen: null,
    confirmada: 1,
    timestamp: "2026-09-16T00:00:00.000Z",
    ...parcial,
  };
}

describe("describirBitacora", () => {
  it("cobrar factura: usa la etiqueta de la acción y el resumen", () => {
    const texto = describirBitacora(registro({
      accion: "cobrar", entidad: "factura",
      resumen: "Total RD$ 100.00, cambio RD$ 0.00",
    }));
    expect(texto).toBe("Cobró una factura — Total RD$ 100.00, cambio RD$ 0.00.");
  });

  it("eliminar cliente: usa el resumen ya redactado por el repo", () => {
    const texto = describirBitacora(registro({
      accion: "eliminar", entidad: "cliente",
      resumen: "Cliente eliminado: Juan Pérez",
    }));
    expect(texto).toBe("Eliminó un cliente — Cliente eliminado: Juan Pérez.");
  });

  it("sin resumen: solo la etiqueta de la acción y la entidad, sin guion colgante", () => {
    const texto = describirBitacora(registro({ accion: "eliminar", entidad: "factura", resumen: null }));
    expect(texto).toBe("Eliminó una factura.");
  });

  it("acción desconocida: cae a un texto genérico legible en vez de la clave cruda", () => {
    const texto = describirBitacora(registro({ accion: "algo_nuevo", entidad: "compra", resumen: "detalle" }));
    expect(texto).toBe("algo_nuevo sobre compra — detalle.");
  });

  it("no duplica el punto final si el resumen ya termina en punto", () => {
    const texto = describirBitacora(registro({
      accion: "registrar_compra", entidad: "compra", resumen: "Total RD$ 50.00.",
    }));
    expect(texto).toBe("Registró una compra — Total RD$ 50.00.");
  });
});
