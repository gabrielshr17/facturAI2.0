import type { SqlDriver } from "../db/driver.js";
import { now } from "../ids.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";
import type { Caja, Instalacion } from "./tipos.js";

const ID_INSTALACION = "instalacion-local";
const COLS = `id, caja_id, alias, created_at, updated_at, deleted_at`;
const COLS_CAJA = `id, nombre, ubicacion, activa, prefijo, created_at, updated_at, deleted_at`;

/**
 * `instalacion` es la tabla de una sola fila (CHECK id='instalacion-local',
 * migración 30) que dice "qué caja es esta instalación". `fijarCaja` hace
 * upsert manual sobre ese id fijo en vez de depender de `INSERT ... ON
 * CONFLICT` (el resto del repo no usa upserts de SQLite en ningún lado, y
 * mantenerlo como SELECT + INSERT/UPDATE explícito deja el camino legible
 * para los tres drivers).
 */
export function crearInstalacionRepo(db: SqlDriver) {
  return {
    async obtener(): Promise<Instalacion | undefined> {
      return db.get<Instalacion>(
        `SELECT ${COLS} FROM instalacion WHERE id=? AND deleted_at IS NULL`,
        [ID_INSTALACION],
      );
    },

    async estaConfigurada(): Promise<boolean> {
      const fila = await this.obtener();
      return fila != null && fila.caja_id != null;
    },

    async obtenerCajaActual(): Promise<Caja | undefined> {
      const fila = await this.obtener();
      if (!fila?.caja_id) return undefined;
      return db.get<Caja>(`SELECT ${COLS_CAJA} FROM caja WHERE id=? AND deleted_at IS NULL`, [fila.caja_id]);
    },

    async fijarCaja(cajaId: string, alias: string | null = null): Promise<Instalacion> {
      const caja = await db.get<Caja>(
        `SELECT ${COLS_CAJA} FROM caja WHERE id=? AND deleted_at IS NULL`,
        [cajaId],
      );
      if (!caja) {
        throw new ValidacionError([{ campo: "cajaId", mensaje: "La caja indicada no existe." }]);
      }
      if (caja.activa !== 1) {
        throw new ValidacionError([{ campo: "cajaId", mensaje: "La caja indicada no está activa." }]);
      }

      const ts = now();
      const existente = await db.get<{ id: string }>(
        "SELECT id FROM instalacion WHERE id=?",
        [ID_INSTALACION],
      );
      if (existente) {
        await db.run(
          "UPDATE instalacion SET caja_id=?, alias=?, updated_at=?, deleted_at=NULL WHERE id=?",
          [cajaId, alias, ts, ID_INSTALACION],
        );
      } else {
        await db.run(
          `INSERT INTO instalacion (${COLS}) VALUES (?,?,?,?,?,?)`,
          [ID_INSTALACION, cajaId, alias, ts, ts, null],
        );
      }

      await registrarAccion(db, {
        accion: "fijar_caja", entidad: "instalacion", entidadId: ID_INSTALACION,
        resumen: `Instalación asignada a la caja: ${caja.nombre}`,
      });

      const actualizada = await this.obtener();
      if (!actualizada) throw new Error("No se pudo leer la instalación tras fijarCaja.");
      return actualizada;
    },
  };
}

export type InstalacionRepo = ReturnType<typeof crearInstalacionRepo>;
