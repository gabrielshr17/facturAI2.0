import { describe, it, expect } from "vitest";
import type { SqlDriver } from "../src/db/driver.js";
import { migrations } from "../src/db/migrations.js";
import { migrate } from "../src/db/migrator.js";
import { nuevaDbHasta } from "./_ayuda.js";

/**
 * Cubre MULTICAJA-01 (banda 30-39, id 30): la migración de identidad de
 * instalación, prefijo de caja y columnas para NCF por caja. El caso central
 * es el de saneamiento: dos facturas ya existentes con el mismo (caja_id,
 * numero_interno) antes de migrar deben sobrevivir `migrate()` sin lanzar,
 * porque el UPDATE de renumeración corre ANTES del CREATE UNIQUE INDEX.
 */

async function insertarCaja(db: SqlDriver, id: string, nombre: string): Promise<void> {
  const ts = new Date().toISOString();
  await db.run(
    "INSERT INTO caja (id, nombre, ubicacion, activa, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?,?)",
    [id, nombre, null, 1, ts, ts, null],
  );
}

async function insertarFactura(
  db: SqlDriver,
  id: string,
  numeroInterno: number | null,
  cajaId: string | null,
  deletedAt: string | null = null,
): Promise<void> {
  const ts = new Date().toISOString();
  await db.run(
    `INSERT INTO factura (id, numero_interno, fecha_hora, caja_id, created_at, updated_at, deleted_at)
     VALUES (?,?,?,?,?,?,?)`,
    [id, numeroInterno, ts, cajaId, ts, ts, deletedAt],
  );
}

describe("migración 30 — identidad de instalación y NCF por caja", () => {
  it("queda registrada en _migracion con id 30", async () => {
    const db = await nuevaDbHasta(29);
    await migrate(db);
    const filas = await db.all<{ id: number }>("SELECT id FROM _migracion WHERE id = 30");
    expect(filas).toHaveLength(1);
  });

  it("correr migrate() dos veces seguidas no lanza", async () => {
    const db = await nuevaDbHasta(29);
    await migrate(db);
    await expect(migrate(db)).resolves.toBeDefined();
  });

  it("ningún sql de la banda 30-39 contiene la palabra TRIGGER", () => {
    const propias = migrations.filter((m) => m.id >= 30 && m.id <= 39);
    expect(propias.length).toBeGreaterThan(0);
    for (const m of propias) {
      expect(m.sql.toUpperCase()).not.toContain("TRIGGER");
    }
  });

  it("PRAGMA table_info confirma las columnas nuevas", async () => {
    const db = await nuevaDbHasta(29);
    await migrate(db);

    const cajaCols = await db.all<{ name: string }>("PRAGMA table_info(caja)");
    expect(cajaCols.map((c) => c.name)).toContain("prefijo");

    const facturaCols = await db.all<{ name: string }>("PRAGMA table_info(factura)");
    expect(facturaCols.map((c) => c.name)).toContain("prefijo_caja");

    const cotizacionCols = await db.all<{ name: string }>("PRAGMA table_info(cotizacion)");
    expect(cotizacionCols.map((c) => c.name)).toContain("caja_id");
    expect(cotizacionCols.map((c) => c.name)).toContain("prefijo_caja");

    const secuenciaCols = await db.all<{ name: string }>("PRAGMA table_info(secuencia_ncf)");
    expect(secuenciaCols.map((c) => c.name)).toContain("caja_id");
  });

  it("rechaza una fila en instalacion con id distinto de 'instalacion-local' por el CHECK", async () => {
    const db = await nuevaDbHasta(29);
    await migrate(db);
    const ts = new Date().toISOString();
    await expect(
      db.run(
        "INSERT INTO instalacion (id, caja_id, alias, created_at, updated_at, deleted_at) VALUES (?,?,?,?,?,?)",
        ["otro-id", null, null, ts, ts, null],
      ),
    ).rejects.toThrow();
  });

  it("el seed sigue sin crear fila en instalacion", async () => {
    const db = await nuevaDbHasta(29);
    await migrate(db);
    const { seed } = await import("../src/db/seed.js");
    await seed(db);
    const filas = await db.all("SELECT * FROM instalacion");
    expect(filas).toHaveLength(0);
  });

  it("ux_factura_caja_numero rechaza dos facturas nuevas con la misma caja_id y numero_interno", async () => {
    const db = await nuevaDbHasta(29);
    await migrate(db);
    await insertarCaja(db, "caja-x", "Caja X");
    await insertarFactura(db, "fac-a", 1, "caja-x");
    await expect(insertarFactura(db, "fac-b", 1, "caja-x")).rejects.toThrow();
  });

  it("ux_factura_caja_numero permite N facturas con caja_id NULL", async () => {
    const db = await nuevaDbHasta(29);
    await migrate(db);
    await insertarFactura(db, "fac-a", 1, null);
    await expect(insertarFactura(db, "fac-b", 2, null)).resolves.toBeUndefined();
  });

  it("el saneamiento renumera facturas ya duplicadas antes de migrar, y migrate() no lanza", async () => {
    const db = await nuevaDbHasta(29);
    await insertarCaja(db, "caja-x", "Caja X");
    // Dos facturas viejas con el mismo (caja_id, numero_interno): el escenario
    // que el CREATE UNIQUE INDEX de esta migración rechazaría sin saneamiento previo.
    await insertarFactura(db, "fac-vieja-1", 1, "caja-x");
    await insertarFactura(db, "fac-vieja-2", 1, "caja-x");

    await expect(migrate(db)).resolves.toBeDefined();

    const filas = await db.all<{ id: string; numero_interno: number }>(
      "SELECT id, numero_interno FROM factura WHERE caja_id = 'caja-x' ORDER BY id",
    );
    expect(filas).toHaveLength(2);
    const numeros = filas.map((f) => f.numero_interno).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2]);
    expect(new Set(numeros).size).toBe(2);
  });

  it("el saneamiento deja intacta la numeración de facturas sin duplicar", async () => {
    const db = await nuevaDbHasta(29);
    await insertarCaja(db, "caja-y", "Caja Y");
    await insertarFactura(db, "fac-1", 1, "caja-y");
    await insertarFactura(db, "fac-2", 2, "caja-y");
    await insertarFactura(db, "fac-3", 3, "caja-y");

    await migrate(db);

    const filas = await db.all<{ id: string; numero_interno: number }>(
      "SELECT id, numero_interno FROM factura WHERE caja_id = 'caja-y' ORDER BY id",
    );
    expect(filas.map((f) => f.numero_interno)).toEqual([1, 2, 3]);
  });

  it("el saneamiento ignora facturas borradas al renumerar y no las cuenta contra el índice", async () => {
    const db = await nuevaDbHasta(29);
    await insertarCaja(db, "caja-z", "Caja Z");
    await insertarFactura(db, "fac-viva", 1, "caja-z");
    await insertarFactura(db, "fac-borrada", 1, "caja-z", new Date().toISOString());

    await expect(migrate(db)).resolves.toBeDefined();

    const viva = await db.get<{ numero_interno: number }>(
      "SELECT numero_interno FROM factura WHERE id = 'fac-viva'",
    );
    expect(viva?.numero_interno).toBe(1);
  });

  it("el saneamiento renumera cada caja de forma independiente", async () => {
    const db = await nuevaDbHasta(29);
    await insertarCaja(db, "caja-1", "Caja 1");
    await insertarCaja(db, "caja-2", "Caja 2");
    await insertarFactura(db, "fac-c1-a", 1, "caja-1");
    await insertarFactura(db, "fac-c1-b", 1, "caja-1");
    await insertarFactura(db, "fac-c2-a", 1, "caja-2");
    await insertarFactura(db, "fac-c2-b", 1, "caja-2");

    await expect(migrate(db)).resolves.toBeDefined();

    const c1 = await db.all<{ numero_interno: number }>(
      "SELECT numero_interno FROM factura WHERE caja_id = 'caja-1' ORDER BY numero_interno",
    );
    const c2 = await db.all<{ numero_interno: number }>(
      "SELECT numero_interno FROM factura WHERE caja_id = 'caja-2' ORDER BY numero_interno",
    );
    expect(c1.map((f) => f.numero_interno)).toEqual([1, 2]);
    expect(c2.map((f) => f.numero_interno)).toEqual([1, 2]);
  });

  it("una base con migraciones 1..10 aplicadas y datos sembrados acepta la 30 sin error y sin perder filas", async () => {
    const db = await nuevaDbHasta(10);
    const { seed } = await import("../src/db/seed.js");
    await seed(db);
    await expect(migrate(db)).resolves.toBeDefined();
    const productos = await db.all("SELECT * FROM producto");
    expect(productos.length).toBeGreaterThan(0);
  });
});
