import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { tieneValor, type ErrorValidacion } from "../dominio/validacion.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";
import type { Caja } from "./tipos.js";

/**
 * `prefijo` es requerido solo al CREAR (numeración por caja, C1-000123, la
 * consume MULTICAJA-03). Al actualizar puede omitirse para no obligar a
 * repetirlo en cada edición de nombre/ubicación.
 */
export interface CajaInput {
  nombre: string;
  ubicacion?: string | null;
  prefijo?: string | null;
  activa?: number;
}

const PATRON_PREFIJO = /^[A-Z0-9-]{1,6}$/;

/**
 * `existentePrefijo` deja que `actualizar` valide unicidad sin volver a
 * consultar la base dentro de esta función pura: la repo la llama con la
 * lista ya excluyendo la propia caja.
 */
export function validarCaja(
  input: CajaInput,
  opciones: { exigirPrefijo: boolean } = { exigirPrefijo: true },
): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (!tieneValor(input.nombre)) {
    errores.push({ campo: "nombre", mensaje: "El nombre es obligatorio." });
  }
  const prefijo = input.prefijo?.trim().toUpperCase() ?? "";
  if (opciones.exigirPrefijo && !tieneValor(prefijo)) {
    errores.push({ campo: "prefijo", mensaje: "El prefijo es obligatorio." });
  } else if (tieneValor(prefijo) && !PATRON_PREFIJO.test(prefijo)) {
    errores.push({
      campo: "prefijo",
      mensaje: "El prefijo debe tener de 1 a 6 caracteres, solo letras, números o guiones.",
    });
  }
  return errores;
}

const COLS = `id, nombre, ubicacion, activa, prefijo, created_at, updated_at, deleted_at`;

export function crearCajaRepo(db: SqlDriver) {
  return {
    async crear(input: CajaInput): Promise<Caja> {
      const errores = validarCaja(input, { exigirPrefijo: true });
      if (errores.length) throw new ValidacionError(errores);

      const prefijo = input.prefijo!.trim().toUpperCase();
      const enUso = await db.get<{ id: string }>(
        "SELECT id FROM caja WHERE deleted_at IS NULL AND UPPER(prefijo) = ?",
        [prefijo],
      );
      if (enUso) {
        throw new ValidacionError([
          { campo: "prefijo", mensaje: `Ya existe una caja con el prefijo '${prefijo}'.` },
        ]);
      }

      const ts = now();
      const c: Caja = {
        id: newId(),
        nombre: input.nombre.trim(),
        ubicacion: input.ubicacion ?? null,
        activa: 1,
        prefijo,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(`INSERT INTO caja (${COLS}) VALUES (${Array(8).fill("?").join(",")})`, [
        c.id, c.nombre, c.ubicacion, c.activa, c.prefijo, c.created_at, c.updated_at, c.deleted_at,
      ]);
      await registrarAccion(db, {
        accion: "crear", entidad: "caja", entidadId: c.id,
        resumen: `Caja creada: ${c.nombre} (${c.prefijo})`,
      });
      return c;
    },

    async actualizar(id: string, input: CajaInput): Promise<void> {
      const actual = await this.obtener(id);
      if (!actual) throw new Error(`Caja ${id} no existe`);

      const errores = validarCaja(input, { exigirPrefijo: false });
      if (errores.length) throw new ValidacionError(errores);

      const prefijo = tieneValor(input.prefijo) ? input.prefijo!.trim().toUpperCase() : actual.prefijo;
      if (prefijo) {
        const enUso = await db.get<{ id: string }>(
          "SELECT id FROM caja WHERE deleted_at IS NULL AND UPPER(prefijo) = ? AND id != ?",
          [prefijo, id],
        );
        if (enUso) {
          throw new ValidacionError([
            { campo: "prefijo", mensaje: `Ya existe una caja con el prefijo '${prefijo}'.` },
          ]);
        }
      }

      const activa = input.activa ?? actual.activa;
      await db.run(
        `UPDATE caja SET nombre=?, ubicacion=?, prefijo=?, activa=?, updated_at=? WHERE id=?`,
        [input.nombre.trim(), input.ubicacion ?? actual.ubicacion, prefijo, activa, now(), id],
      );
      await registrarAccion(db, {
        accion: "actualizar", entidad: "caja", entidadId: id,
        resumen: `Caja actualizada: ${input.nombre.trim()}`,
      });
    },

    /**
     * No es un borrado físico: marca `deleted_at` y `activa=0`, con la misma
     * guardia de "en uso" que `desactivar`, porque una caja borrada que
     * sigue siendo la de `instalacion` dejaría a la instalación apuntando a
     * una caja invisible en cualquier `listar()`.
     */
    async desactivar(id: string): Promise<void> {
      const actual = await this.obtener(id);
      if (!actual) throw new Error(`Caja ${id} no existe`);

      const enUso = await db.get<{ id: string }>(
        "SELECT id FROM instalacion WHERE deleted_at IS NULL AND caja_id = ?",
        [id],
      );
      if (enUso) {
        throw new ValidacionError([
          { campo: "id", mensaje: "No se puede desactivar la caja asignada a esta instalación." },
        ]);
      }

      await db.run("UPDATE caja SET activa=0, updated_at=? WHERE id=?", [now(), id]);
      await registrarAccion(db, {
        accion: "desactivar", entidad: "caja", entidadId: id,
        resumen: `Caja desactivada: ${actual.nombre}`,
      });
    },

    async obtener(id: string): Promise<Caja | undefined> {
      return db.get<Caja>(`SELECT ${COLS} FROM caja WHERE id=? AND deleted_at IS NULL`, [id]);
    },

    async listar(): Promise<Caja[]> {
      return db.all<Caja>(`SELECT ${COLS} FROM caja WHERE deleted_at IS NULL ORDER BY nombre`);
    },

    async listarActivas(): Promise<Caja[]> {
      return db.all<Caja>(
        `SELECT ${COLS} FROM caja WHERE deleted_at IS NULL AND activa = 1 ORDER BY nombre`,
      );
    },

    /** Alias de `desactivar`: "eliminar" una caja del catálogo también es un borrado lógico. */
    async eliminar(id: string): Promise<void> {
      const actual = await this.obtener(id);
      if (!actual) throw new Error(`Caja ${id} no existe`);

      const enUso = await db.get<{ id: string }>(
        "SELECT id FROM instalacion WHERE deleted_at IS NULL AND caja_id = ?",
        [id],
      );
      if (enUso) {
        throw new ValidacionError([
          { campo: "id", mensaje: "No se puede eliminar la caja asignada a esta instalación." },
        ]);
      }

      await db.run("UPDATE caja SET deleted_at=?, activa=0, updated_at=? WHERE id=?", [now(), now(), id]);
      await registrarAccion(db, {
        accion: "eliminar", entidad: "caja", entidadId: id,
        resumen: `Caja eliminada: ${actual.nombre}`,
      });
    },
  };
}

export type CajaRepo = ReturnType<typeof crearCajaRepo>;
