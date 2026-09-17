import { describe, it, expect, beforeEach } from "vitest";
import type { SqlDriver } from "../src/db/driver.js";
import { nuevaDb } from "./_ayuda.js";
import { crearCotizacionRepo, ValidacionError } from "../src/index.js";

describe("cotizacionRepo — crear (§ Ventas)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  it("crea la cotización con encabezado y líneas, y calcula totales", async () => {
    const repo = crearCotizacionRepo(db);
    const c = await repo.crear({
      lineas: [
        { descripcion: "Arroz 5lb", cantidad: 2, precioUnitario: 59, impuestoTipo: "itbis18", tasaImpuesto: 0.18 },
      ],
    });
    expect(c.total).toBe(118);
    expect(c.estado).toBe("vigente");

    const lineas = await repo.obtenerLineas(c.id);
    expect(lineas).toHaveLength(1);
  });

  it("rechaza una cotización sin líneas", async () => {
    const repo = crearCotizacionRepo(db);
    await expect(repo.crear({ lineas: [] })).rejects.toBeInstanceOf(ValidacionError);
  });

  it("ida y vuelta: cotizacion_linea.nivel_precio", async () => {
    const repo = crearCotizacionRepo(db);
    const c = await repo.crear({
      lineas: [
        {
          descripcion: "Arroz 5lb",
          cantidad: 1,
          precioUnitario: 59,
          impuestoTipo: "itbis18",
          tasaImpuesto: 0.18,
          nivelPrecio: "mayoreo",
        },
      ],
    });

    const [linea] = await repo.obtenerLineas(c.id);
    expect(linea.nivel_precio).toBe("mayoreo");
  });
});
