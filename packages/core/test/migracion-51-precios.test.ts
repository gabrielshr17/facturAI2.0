import { describe, it, expect } from "vitest";
import type { SqlDriver } from "../src/db/driver.js";
import { migrate } from "../src/db/migrator.js";
import { nuevaDbHasta } from "./_ayuda.js";

async function insertarProducto(
  db: SqlDriver,
  id: string,
  costo: number,
  precioVenta: number,
  precio2: number | null = null,
  precio3: number | null = null,
): Promise<void> {
  const ts = new Date().toISOString();
  await db.run(
    `INSERT INTO producto (id, descripcion, costo, precio_venta, precio_2, precio_3, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [id, id, costo, precioVenta, precio2, precio3, ts, ts],
  );
}

async function niveles(db: SqlDriver, id: string) {
  return db.get<{ precio_2: number | null; precio_3: number | null }>(
    "SELECT precio_2, precio_3 FROM producto WHERE id=?",
    [id],
  );
}

describe("migración 51 — precio_2/precio_3 por defecto en productos existentes", () => {
  it("rellena precio_2 con costo+10% y precio_3 con costo+5% donde estaban vacíos", async () => {
    const db = await nuevaDbHasta(50);
    await insertarProducto(db, "p1", 100, 118);
    await migrate(db);
    expect(await niveles(db, "p1")).toEqual({ precio_2: 110, precio_3: 105 });
  });

  it("no pisa niveles que ya estaban configurados", async () => {
    const db = await nuevaDbHasta(50);
    await insertarProducto(db, "p1", 100, 118, 500, null);
    await migrate(db);
    expect(await niveles(db, "p1")).toEqual({ precio_2: 500, precio_3: 105 });
  });

  it("nunca deja un nivel por encima del precio de venta", async () => {
    const db = await nuevaDbHasta(50);
    await insertarProducto(db, "p1", 100, 104);
    await migrate(db);
    expect(await niveles(db, "p1")).toEqual({ precio_2: 104, precio_3: 104 });
  });

  it("con costo 0 usa el precio de venta en vez de dejar el nivel en cero", async () => {
    const db = await nuevaDbHasta(50);
    await insertarProducto(db, "p1", 0, 35);
    await migrate(db);
    expect(await niveles(db, "p1")).toEqual({ precio_2: 35, precio_3: 35 });
  });
});
