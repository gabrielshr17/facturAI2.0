import type { SqlDriver } from "../db/driver.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";

/**
 * Respaldo completo (§ PLATAFORMA-03, ola 3): exporta e importa TODAS las
 * tablas de usuario de la base, descubiertas en tiempo de ejecución sobre
 * `sqlite_master` en vez de una lista `TABLAS` escrita a mano. Con la lista
 * manual, cinco áreas (RBAC, CRM, COMPRAS, CAJA, MULTICAJA) iban a editar el
 * mismo archivo para añadir sus tablas nuevas, y una tabla olvidada salía
 * del respaldo del cliente sin ningún aviso. El descubrimiento por
 * `sqlite_master` es genérico a propósito: no sabe nada de tablas
 * específicas, solo excluye `_migracion` (metadato del migrador, no dato de
 * negocio) y las internas `sqlite_%`. § RBAC-03 (banda 20-29):
 * `usuario_seguridad` ya existe (control de acceso: intentos fallidos,
 * bloqueo) y se excluye del respaldo aparte — es estado operativo, no dato
 * de negocio, y restaurarlo en otra instalación no tiene sentido. `usuario`
 * SIGUE exportándose (excluirla dejaría un negocio sin usuarios tras
 * restaurar en una máquina nueva), pero con `pin_hash` forzado a `null` en
 * cada fila: el botón de respaldo (Configuración) baja el archivo como JSON
 * descargable, y ahora que `pin_hash` tiene valor real (RBAC-03 se lo da por
 * primera vez), un volcado sin esta máscara entregaría los hashes de todo
 * el personal a cualquiera que lo abra.
 *
 * `importarTodo` exige `db.enTransaccion` (solo lo ofrecen node:sqlite y
 * sql.js, ver `db/driver.ts`): restaurar sin atomicidad real es demasiado
 * peligroso para permitirlo en silencio, así que en un driver sin
 * transacciones (Tauri hoy) lanza un error explícito en vez de dejar la base
 * a medias si algo falla a mitad de camino.
 *
 * FK cruzadas: dentro de una transacción SQLite, `PRAGMA foreign_keys` es un
 * no-op (no se puede desactivar con un BEGIN pendiente — ver la advertencia
 * de los revisores adversariales en plan/01-PLATAFORMA.md). Por eso se usa
 * `PRAGMA defer_foreign_keys = ON` DENTRO de la transacción: pospone la
 * verificación de cada FK hasta el COMMIT en vez de en cada INSERT, que es
 * exactamente el mecanismo pensado para restaurar tablas en un orden que no
 * respeta el de sus dependencias (p. ej. `factura` antes que `cliente`).
 * `defer_foreign_keys` se resetea solo a `OFF` en el COMMIT, así que no hace
 * falta restaurarlo a mano.
 */
export interface RespaldoCompleto {
  version: number;
  generadoEn: string;
  esquema: number;
  tablas: Record<string, Record<string, unknown>[]>;
}

/**
 * `usuario_seguridad` se excluye aquí, no en `exportarTodo`, para que
 * `importarTodo` también la rechace si un respaldo viejo (de antes de esta
 * tarea) la incluyera: `tablasBase` (calculada con esta misma función) ya no
 * la reconocería como tabla válida del destino.
 */
async function listarTablas(db: SqlDriver): Promise<string[]> {
  const filas = await db.all<{ name: string }>(
    `SELECT name FROM sqlite_master
     WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_migracion', 'usuario_seguridad')
     ORDER BY name`,
  );
  return filas.map((f) => f.name);
}

async function esquemaActual(db: SqlDriver): Promise<number> {
  const fila = await db.get<{ maximo: number | null }>("SELECT MAX(id) as maximo FROM _migracion");
  return fila?.maximo ?? 0;
}

export function crearBackupRepo(db: SqlDriver) {
  return {
    async exportarTodo(): Promise<RespaldoCompleto> {
      const nombresTablas = await listarTablas(db);
      const tablas: Record<string, Record<string, unknown>[]> = {};
      for (const tabla of nombresTablas) {
        const filas = await db.all<Record<string, unknown>>(`SELECT * FROM ${tabla}`);
        tablas[tabla] =
          tabla === "usuario" ? filas.map((fila) => ({ ...fila, pin_hash: null })) : filas;
      }
      return {
        version: 1,
        generadoEn: new Date().toISOString(),
        esquema: await esquemaActual(db),
        tablas,
      };
    },

    async importarTodo(respaldo: RespaldoCompleto): Promise<void> {
      if (!respaldo.tablas || Object.keys(respaldo.tablas).length === 0) {
        throw new ValidacionError([
          { campo: "tablas", mensaje: "El respaldo no contiene ninguna tabla." },
        ]);
      }

      const esquemaBase = await esquemaActual(db);
      if (respaldo.esquema > esquemaBase) {
        throw new ValidacionError([
          {
            campo: "esquema",
            mensaje: `El respaldo pertenece a una versión más nueva del esquema (${respaldo.esquema}) que la base actual (${esquemaBase}). No se puede restaurar hacia adelante.`,
          },
        ]);
      }

      const tablasBase = new Set(await listarTablas(db));
      const tablasDesconocidas = Object.keys(respaldo.tablas).filter((t) => !tablasBase.has(t));
      if (tablasDesconocidas.length > 0) {
        throw new ValidacionError([
          {
            campo: "tablas",
            mensaje: `El respaldo nombra tablas que no existen en esta base: ${tablasDesconocidas.join(", ")}.`,
          },
        ]);
      }

      if (!db.enTransaccion) {
        throw new Error(
          "Este driver no ofrece transacciones reales (enTransaccion no está disponible): restaurar sin atomicidad podría dejar la base a medias si algo falla a mitad de camino. Esta operación solo está disponible con node:sqlite o sql.js.",
        );
      }

      const entrandoTablas = Object.entries(respaldo.tablas);

      await db.enTransaccion(async () => {
        await db.exec("PRAGMA defer_foreign_keys = ON;");

        for (const [tabla] of entrandoTablas) {
          await db.run(`DELETE FROM ${tabla}`);
        }

        for (const [tabla, filas] of entrandoTablas) {
          for (const fila of filas) {
            const columnas = Object.keys(fila);
            if (columnas.length === 0) continue;
            const marcadores = columnas.map(() => "?").join(",");
            await db.run(
              `INSERT INTO ${tabla} (${columnas.join(",")}) VALUES (${marcadores})`,
              columnas.map((c) => fila[c]),
            );
          }
        }
      });

      await registrarAccion(db, {
        accion: "restaurar_respaldo",
        entidad: "respaldo",
        resumen: `Esquema ${respaldo.esquema}, ${entrandoTablas.length} tablas.`,
      });
    },
  };
}

export type BackupRepo = ReturnType<typeof crearBackupRepo>;
