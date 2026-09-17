import { describe, it, expect } from "vitest";
import { migrations } from "../src/db/migrations.js";
import { migrate } from "../src/db/migrator.js";
import { seed } from "../src/db/seed.js";
import { nuevaDbHasta } from "./_ayuda.js";

/**
 * Cubre RBAC-01 (banda 20-29, id 20): tabla satélite `usuario_seguridad` y
 * normalización de `usuario.rol` de 'admin' a 'dueno'. El caso central es la
 * idempotencia statement por statement (§00-CONVENCIONES §1.3): el migrador
 * no envuelve en transacción y registra en `_migracion` DESPUÉS de aplicar,
 * así que un reintento a medias tiene que poder correr el SQL completo de
 * nuevo sin lanzar.
 */
describe("migración 20 — usuario_seguridad y normalización de rol", () => {
  it("queda registrada en _migracion con id 20", async () => {
    const db = await nuevaDbHasta(19);
    await migrate(db);
    const filas = await db.all<{ id: number }>("SELECT id FROM _migracion WHERE id = 20");
    expect(filas).toHaveLength(1);
  });

  it("crea la tabla usuario_seguridad con las columnas esperadas (PRAGMA table_info)", async () => {
    const db = await nuevaDbHasta(19);
    await migrate(db);
    const columnas = await db.all<{ name: string }>("PRAGMA table_info(usuario_seguridad)");
    const nombres = columnas.map((c) => c.name);
    expect(nombres).toEqual(
      expect.arrayContaining([
        "usuario_id",
        "ultimo_acceso",
        "intentos_fallidos",
        "bloqueado_hasta",
        "pin_actualizado_at",
        "created_at",
        "updated_at",
      ]),
    );
  });

  it("normaliza a 'dueno' una fila usuario con rol='admin' insertada antes de migrar", async () => {
    const db = await nuevaDbHasta(19);
    const ts = new Date().toISOString();
    await db.run(
      "INSERT INTO usuario (id, nombre, rol, activo, created_at, updated_at) VALUES (?,?,?,?,?,?)",
      ["usuario-viejo", "Admin Viejo", "admin", 1, ts, ts],
    );

    await migrate(db);

    const fila = await db.get<{ rol: string }>("SELECT rol FROM usuario WHERE id = 'usuario-viejo'");
    expect(fila?.rol).toBe("dueno");
  });

  it("aplicar el SQL de la migración 20 dos veces seguidas no lanza (reintento a medias)", async () => {
    const db = await nuevaDbHasta(19);
    const migracion20 = migrations.find((m) => m.id === 20);
    expect(migracion20).toBeDefined();

    await db.exec(migracion20!.sql);
    await expect(db.exec(migracion20!.sql)).resolves.toBeUndefined();
  });

  it("el texto de la migración 20 no contiene ';' fuera de los dos separadores de statement", () => {
    const migracion20 = migrations.find((m) => m.id === 20);
    expect(migracion20).toBeDefined();
    const statements = migracion20!.sql.split(";").map((s) => s.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
  });

  it("ningún sql de la banda 20-29 contiene la palabra TRIGGER", () => {
    const propias = migrations.filter((m) => m.id >= 20 && m.id <= 29);
    expect(propias.length).toBeGreaterThan(0);
    for (const m of propias) {
      expect(m.sql.toUpperCase()).not.toContain("TRIGGER");
    }
  });

  it("no recrea la tabla usuario (no aparece DROP TABLE ni CREATE TABLE usuario en la banda)", () => {
    const propias = migrations.filter((m) => m.id >= 20 && m.id <= 29);
    for (const m of propias) {
      expect(m.sql).not.toMatch(/CREATE TABLE\s+usuario\s*\(/i);
      expect(m.sql.toUpperCase()).not.toContain("DROP TABLE");
    }
  });

  it("seed() deja usuario-admin con rol 'dueno' y pin_hash null", async () => {
    const db = await nuevaDbHasta(29);
    await seed(db);
    const fila = await db.get<{ rol: string; pin_hash: string | null }>(
      "SELECT rol, pin_hash FROM usuario WHERE id = 'usuario-admin'",
    );
    expect(fila?.rol).toBe("dueno");
    expect(fila?.pin_hash ?? null).toBeNull();
  });
});
