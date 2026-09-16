import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate } from "../src/db/migrator.js";
import { migrations } from "../src/db/migrations.js";
import { seed } from "../src/db/seed.js";
import type { SqlDriver } from "../src/db/driver.js";

/** Base migrada, sin seed: el molde que usaban los 11 archivos de test antes de este helper. */
export async function nuevaDb(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  return db;
}

/** Base migrada y sembrada (producto + factura de ejemplo). */
export async function nuevaDbMigrada(): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await migrate(db);
  await seed(db);
  return db;
}

/**
 * Simula una instalación vieja: aplica solo las migraciones con id <= idMaximo
 * y registra `_migracion` a mano, sin pasar por `migrate()` (que aplicaría
 * todo el array). Sirve para probar que una migración nueva corre limpio
 * sobre una base que ya tenía las anteriores.
 */
export async function nuevaDbHasta(idMaximo: number): Promise<SqlDriver> {
  const db = createNodeSqliteDriver();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migracion (
      id          INTEGER PRIMARY KEY,
      nombre      TEXT NOT NULL,
      aplicada_at TEXT NOT NULL
    );
  `);
  const pendientes = migrations.filter((m) => m.id <= idMaximo).sort((a, b) => a.id - b.id);
  for (const m of pendientes) {
    await db.exec(m.sql);
    await db.run("INSERT INTO _migracion (id, nombre, aplicada_at) VALUES (?, ?, ?)", [
      m.id,
      m.nombre,
      new Date().toISOString(),
    ]);
  }
  return db;
}

/** Nombres de todas las tablas de usuario (excluye sqlite_* internas). */
export async function tablasDe(db: SqlDriver): Promise<string[]> {
  const filas = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  return filas.map((f) => f.name);
}
