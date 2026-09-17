import { describe, it, expect } from "vitest";
import { migrate } from "../src/db/migrator.js";
import { nuevaDb, nuevaDbHasta } from "./_ayuda.js";

/**
 * Banda 80-89 (BACKOFFICE, migración id 80): solo agrega índices sobre
 * factura y factura_linea para que los agregados por rango de fecha del
 * panel (ver dominio/periodo.ts) no fuercen un scan completo. No toca
 * negocio.desfase_horario_min, que ya agregó CENSO-COLUMNAS en la banda
 * 11-19.
 */
describe("migración 80 — índices de factura", () => {
  it("crea los tres índices esperados en una base nueva", async () => {
    const db = await nuevaDb();
    const filas = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index'",
    );
    const nombres = filas.map((f) => f.name);
    expect(nombres).toContain("ix_factura_fecha_hora");
    expect(nombres).toContain("ix_factura_estado_fecha");
    expect(nombres).toContain("ix_factura_linea_producto");
  });

  it("una base con solo las migraciones anteriores a la 80 no tiene todavía esos índices", async () => {
    const db = await nuevaDbHasta(79);
    const filas = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index'",
    );
    const nombres = filas.map((f) => f.name);
    expect(nombres).not.toContain("ix_factura_fecha_hora");

    await migrate(db);
    const filasDespues = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='index'",
    );
    expect(filasDespues.map((f) => f.name)).toContain("ix_factura_fecha_hora");
  });
});
