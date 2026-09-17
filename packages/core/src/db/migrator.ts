import type { SqlDriver } from "./driver.js";
import { migrations, type Migration } from "./migrations.js";

/**
 * Aplica las migraciones pendientes en orden. Idempotente: registra las
 * aplicadas en `_migracion` y salta las ya presentes. Devuelve las que aplicó.
 *
 * Envuelta sobre `aplicarMigraciones` con el array real de producción: la
 * firma pública `migrate(db)` no cambia (ningún consumidor existente se
 * entera de este refactor), y `aplicarMigraciones` queda exportada aparte
 * para que los tests de atomicidad (id duplicado, SQL inválido a mitad de
 * camino) puedan inyectar un array de migraciones falso sin tocar el array
 * real, que esta tarea tiene prohibido editar.
 */
export async function migrate(db: SqlDriver): Promise<Migration[]> {
  return aplicarMigraciones(db, migrations);
}

export async function aplicarMigraciones(
  db: SqlDriver,
  lista: Migration[],
): Promise<Migration[]> {
  // Se detecta el id duplicado ANTES de tocar la base: hoy migrator.ts
  // dedupe solo por id al filtrar pendientes, así que dos áreas eligiendo el
  // mismo id ejecutarían las dos y el segundo INSERT en _migracion violaría
  // su PK. Revisar el array completo primero deja la base intacta si hay
  // conflicto, en vez de aplicar la primera y reventar a mitad de la segunda.
  const vistos = new Map<number, Migration>();
  for (const m of lista) {
    const previa = vistos.get(m.id);
    if (previa) {
      throw new Error(
        `id de migración duplicado: ${m.id} lo usan '${previa.nombre}' y '${m.nombre}'`,
      );
    }
    vistos.set(m.id, m);
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migracion (
      id          INTEGER PRIMARY KEY,
      nombre      TEXT NOT NULL,
      aplicada_at TEXT NOT NULL
    );
  `);

  const aplicadas = await db.all<{ id: number }>("SELECT id FROM _migracion");
  const yaAplicadas = new Set(aplicadas.map((r) => r.id));

  const pendientes = lista
    .filter((m) => !yaAplicadas.has(m.id))
    .sort((a, b) => a.id - b.id);

  for (const m of pendientes) {
    const aplicarUna = async () => {
      await db.exec(m.sql);
      await db.run(
        "INSERT INTO _migracion (id, nombre, aplicada_at) VALUES (?, ?, ?)",
        [m.id, m.nombre, new Date().toISOString()],
      );
    };

    // El exec del SQL y el INSERT en _migracion van juntos en la misma
    // transacción cuando el driver la ofrece (node:sqlite, sql.js): si el SQL
    // falla a la mitad, ni queda tabla creada ni fila en _migracion, y el
    // reintento aplica limpio. Cuando el driver no la ofrece (Tauri, ver
    // driver.ts) se mantiene el comportamiento actual sin transacción: la
    // garantía ahí es "cada statement es idempotente por separado", no
    // atomicidad real.
    if (db.enTransaccion) {
      await db.enTransaccion(aplicarUna);
    } else {
      await aplicarUna();
    }
  }

  return pendientes;
}
