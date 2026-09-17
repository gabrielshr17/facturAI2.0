import { describe, it, expect } from "vitest";
import { createNodeSqliteDriver } from "../src/db/drivers/node-sqlite.js";
import { migrate, aplicarMigraciones } from "../src/db/migrator.js";
import type { Migration } from "../src/db/migraciones/tipos.js";
import { nuevaDbHasta } from "./_ayuda.js";

/**
 * aplicarMigraciones(db, lista) es la misma lógica que usa migrate(db), pero
 * parametrizada por el array de migraciones: migrate() no puede cambiar de
 * firma (sigue siendo migrate(db)) y esta tarea tiene prohibido tocar el
 * array real de packages/core/src/db/migraciones/*.ts, así que los casos de
 * "SQL inválido a mitad de camino" e "id duplicado" se prueban inyectando un
 * array falso a la función interna en vez de mutar migraciones de producción.
 */
describe("migrador atómico", () => {
  it("una migración de dos statements cuyo segundo es SQL inválido no deja rastro y no registra el id", async () => {
    const db = createNodeSqliteDriver();
    const migracionRota: Migration = {
      id: 9001,
      nombre: "prueba-rota",
      sql: "CREATE TABLE tabla_prueba (id TEXT); ESTO NO ES SQL VALIDO;",
    };

    await expect(aplicarMigraciones(db, [migracionRota])).rejects.toThrow();

    const tabla = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tabla_prueba'",
    );
    expect(tabla).toBeUndefined();

    const registrada = await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM _migracion WHERE id = 9001",
    );
    expect(registrada?.n ?? 0).toBe(0);
  });

  it("tras el fallo anterior, corregir el SQL y reintentar aplica sin 'table already exists'", async () => {
    const db = createNodeSqliteDriver();
    const migracionRota: Migration = {
      id: 9001,
      nombre: "prueba-rota",
      sql: "CREATE TABLE tabla_prueba (id TEXT); ESTO NO ES SQL VALIDO;",
    };
    await expect(aplicarMigraciones(db, [migracionRota])).rejects.toThrow();

    const migracionCorregida: Migration = {
      id: 9001,
      nombre: "prueba-rota",
      sql: "CREATE TABLE tabla_prueba (id TEXT);",
    };
    const aplicadas = await aplicarMigraciones(db, [migracionCorregida]);
    expect(aplicadas.map((m) => m.id)).toEqual([9001]);

    const tabla = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tabla_prueba'",
    );
    expect(tabla).toBeDefined();
  });

  it("dos migraciones con el mismo id lanzan antes de ejecutar nada", async () => {
    const db = createNodeSqliteDriver();
    const dosConElMismoId: Migration[] = [
      { id: 9002, nombre: "una", sql: "CREATE TABLE tabla_a (id TEXT);" },
      { id: 9002, nombre: "otra", sql: "CREATE TABLE tabla_b (id TEXT);" },
    ];

    await expect(aplicarMigraciones(db, dosConElMismoId)).rejects.toThrow(/9002/);

    const tablas = await db.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('tabla_a','tabla_b')",
    );
    expect(tablas).toHaveLength(0);
  });

  it("enTransaccion del driver de Node hace commit si el callback resuelve", async () => {
    const db = createNodeSqliteDriver();
    if (!db.enTransaccion) throw new Error("el driver de Node debe implementar enTransaccion");

    await db.enTransaccion(async () => {
      await db.exec("CREATE TABLE tabla_commit (id TEXT);");
      await db.run("INSERT INTO tabla_commit (id) VALUES ('a')");
    });

    const fila = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tabla_commit");
    expect(fila?.n).toBe(1);
  });

  it("enTransaccion del driver de Node hace rollback si el callback lanza, re-lanzando el error original", async () => {
    const db = createNodeSqliteDriver();
    if (!db.enTransaccion) throw new Error("el driver de Node debe implementar enTransaccion");

    const errorOriginal = new Error("fallo intencional de la prueba");
    await expect(
      db.enTransaccion(async () => {
        await db.exec("CREATE TABLE tabla_rollback (id TEXT);");
        throw errorOriginal;
      }),
    ).rejects.toBe(errorOriginal);

    const tabla = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tabla_rollback'",
    );
    expect(tabla).toBeUndefined();
  });

  it("migrate() sigue siendo idempotente y sigue aplicando sobre nuevaDbHasta(10)", async () => {
    // Bandas 20-89 aún vacías en este punto del plan (otras tareas de la ola las
    // llenan en paralelo): no se asume cuántas migraciones hay por encima de 10,
    // solo que correr migrate() dos veces seguidas da el mismo resultado la
    // segunda vez (idempotencia), que es lo único que este brief puede probar.
    const db = await nuevaDbHasta(10);
    await migrate(db);
    const segunda = await migrate(db);
    expect(segunda).toEqual([]);
  });
});
