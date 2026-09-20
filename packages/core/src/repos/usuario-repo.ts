import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { tieneValor, type ErrorValidacion } from "../dominio/validacion.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";
import { hashearPin, verificarPin } from "../dominio/pin.js";
import { resolverPermisos, type Permiso, type RolUsuario } from "../dominio/permisos.js";
import type { Usuario, UsuarioSeguridad } from "./tipos.js";

/**
 * usuario-repo.ts (§ RBAC-03, banda 20-29): CRUD de personal, autenticación
 * por PIN y la regla de negocio que evita dejar una instalación sin acceso.
 *
 * `pin_hash` NUNCA sale de este archivo: `COLS` (usado por `listar`/
 * `obtener`/`actualizar`) lo omite a propósito, y `autenticar`/`cambiarPin`
 * lo leen con un SELECT aparte a una variable local que no se devuelve. La
 * interfaz `Usuario` de `tipos/usuario.ts` tampoco tiene el campo — es la
 * misma barrera puesta dos veces (tipo y consulta) para que un futuro
 * `SELECT *` no lo filtre por accidente.
 *
 * El PIN de 4-6 dígitos, el rol válido y la "regla del último dueño" (no se
 * puede desactivar ni degradar al último usuario activo con rol dueno o
 * superadmin) viven AQUÍ, no en la UI (CLAUDE.md §4): son la única barrera
 * real hoy, porque el guardia por sesión (RBAC-04) todavía no existe.
 *
 * Sin transacciones (`SqlDriver.enTransaccion` es opcional, ver `db/driver.ts`):
 * cada método escribe primero la fila que importa (usuario o
 * usuario_seguridad) y DESPUÉS deja el rastro en `bitacora_accion`, para que
 * un fallo a mitad de camino dañe como mucho la auditoría, nunca el dato de
 * negocio. `autenticar` no registra en bitácora a propósito: un intento de
 * login (fallido o no) no es una "acción sensible" en el sentido de las
 * otras ocho llamadas a `registrarAccion` del repo — es tráfico esperado, y
 * registrarlo ahí infla la bitácora de auditoría con ruido en cada
 * cobro del punto de venta.
 */
export interface UsuarioInput {
  nombre: string;
  rol: RolUsuario;
  /** Solo se usa en `crear`; `actualizar` lo ignora (usa `cambiarPin`). */
  pin?: string | null;
  activo?: boolean;
  permisos_json?: string | null;
}

export interface CambiarPinInput {
  usuarioId: string;
  pinActual?: string | null;
  pinNuevo: string;
  /** Salto de verificación del PIN actual: lo usa quien tiene `personal.gestionar` para resetear el PIN de otro usuario. */
  omitirPinActual?: boolean;
}

export interface AutenticarInput {
  usuarioId: string;
  pin: string;
}

export type ResultadoAutenticacion =
  | { ok: true; usuario: Usuario; permisos: ReadonlySet<Permiso> }
  | { ok: false; motivo: "pin_incorrecto" | "inactivo" | "bloqueado" | "sin_pin" };

const ROLES: readonly RolUsuario[] = ["cajero", "supervisor", "dueno", "superadmin"];
const PIN_VALIDO = /^\d{4,6}$/;

function esRolAdministrador(rol: RolUsuario): boolean {
  return rol === "dueno" || rol === "superadmin";
}

export function validarUsuario(input: UsuarioInput): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (!tieneValor(input.nombre)) {
    errores.push({ campo: "nombre", mensaje: "El nombre es obligatorio." });
  }
  if (!ROLES.includes(input.rol)) {
    errores.push({
      campo: "rol",
      mensaje: "El rol debe ser cajero, supervisor, dueno o superadmin.",
    });
  }
  if (input.pin != null && !PIN_VALIDO.test(input.pin)) {
    errores.push({ campo: "pin", mensaje: "El PIN debe tener entre 4 y 6 dígitos numéricos." });
  }
  return errores;
}

const COLS = `id, nombre, rol, activo, permisos_json, created_at, updated_at, deleted_at`;

async function contarOtrosAdministradoresActivos(
  db: SqlDriver,
  excluirId: string,
): Promise<number> {
  const fila = await db.get<{ n: number }>(
    `SELECT COUNT(*) as n FROM usuario
     WHERE rol IN ('dueno','superadmin') AND activo = 1 AND deleted_at IS NULL AND id <> ?`,
    [excluirId],
  );
  return fila?.n ?? 0;
}

async function obtenerSeguridad(
  db: SqlDriver,
  usuarioId: string,
): Promise<UsuarioSeguridad | undefined> {
  return db.get<UsuarioSeguridad>(
    `SELECT usuario_id, ultimo_acceso, intentos_fallidos, bloqueado_hasta, pin_actualizado_at
     FROM usuario_seguridad WHERE usuario_id = ?`,
    [usuarioId],
  );
}

/** Crea la fila satélite al vuelo si el usuario nunca autenticó ni cambió su PIN. */
async function asegurarSeguridad(db: SqlDriver, usuarioId: string): Promise<UsuarioSeguridad> {
  const existente = await obtenerSeguridad(db, usuarioId);
  if (existente) return existente;

  const ts = now();
  const fila: UsuarioSeguridad = {
    usuario_id: usuarioId,
    ultimo_acceso: null,
    intentos_fallidos: 0,
    bloqueado_hasta: null,
    pin_actualizado_at: null,
  };
  await db.run(
    `INSERT INTO usuario_seguridad
       (usuario_id, ultimo_acceso, intentos_fallidos, bloqueado_hasta, pin_actualizado_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?)`,
    [
      fila.usuario_id,
      fila.ultimo_acceso,
      fila.intentos_fallidos,
      fila.bloqueado_hasta,
      fila.pin_actualizado_at,
      ts,
      ts,
    ],
  );
  return fila;
}

export function crearUsuarioRepo(db: SqlDriver) {
  return {
    async listar(): Promise<Usuario[]> {
      return db.all<Usuario>(
        `SELECT ${COLS} FROM usuario WHERE deleted_at IS NULL ORDER BY nombre`,
      );
    },

    async obtener(id: string): Promise<Usuario | undefined> {
      return db.get<Usuario>(`SELECT ${COLS} FROM usuario WHERE id=? AND deleted_at IS NULL`, [id]);
    },

    async crear(input: UsuarioInput): Promise<Usuario> {
      const errores = validarUsuario(input);
      if (errores.length) throw new ValidacionError(errores);

      const ts = now();
      const pinHash = input.pin != null ? await hashearPin(input.pin) : null;
      const u: Usuario = {
        id: newId(),
        nombre: input.nombre.trim(),
        rol: input.rol,
        activo: input.activo === false ? 0 : 1,
        permisos_json: input.permisos_json ?? null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(
        `INSERT INTO usuario (id, nombre, rol, pin_hash, activo, permisos_json, created_at, updated_at, deleted_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          u.id,
          u.nombre,
          u.rol,
          pinHash,
          u.activo,
          u.permisos_json,
          u.created_at,
          u.updated_at,
          u.deleted_at,
        ],
      );
      await registrarAccion(db, {
        accion: "crear",
        entidad: "usuario",
        entidadId: u.id,
        resumen: `Usuario creado: ${u.nombre} (${u.rol})`,
      });
      return u;
    },

    async actualizar(id: string, input: UsuarioInput): Promise<void> {
      const errores = validarUsuario(input);
      if (errores.length) throw new ValidacionError(errores);

      const actual = await this.obtener(id);
      if (!actual) throw new Error(`Usuario ${id} no existe`);

      const nuevoActivo = input.activo === undefined ? actual.activo === 1 : input.activo;
      const seguiraSiendoAdminActivo = esRolAdministrador(input.rol) && nuevoActivo;
      if (actual.activo === 1 && esRolAdministrador(actual.rol) && !seguiraSiendoAdminActivo) {
        const otros = await contarOtrosAdministradoresActivos(db, id);
        if (otros === 0) {
          throw new ValidacionError([
            {
              campo: "rol",
              mensaje: "No se puede dejar la instalación sin un dueño o superadmin activo.",
            },
          ]);
        }
      }

      await db.run(
        `UPDATE usuario SET nombre=?, rol=?, activo=?, permisos_json=?, updated_at=? WHERE id=?`,
        [
          input.nombre.trim(),
          input.rol,
          nuevoActivo ? 1 : 0,
          input.permisos_json ?? actual.permisos_json,
          now(),
          id,
        ],
      );
    },

    async desactivar(id: string): Promise<void> {
      const actual = await this.obtener(id);
      if (!actual) throw new Error(`Usuario ${id} no existe`);

      if (actual.activo === 1 && esRolAdministrador(actual.rol)) {
        const otros = await contarOtrosAdministradoresActivos(db, id);
        if (otros === 0) {
          throw new ValidacionError([
            {
              campo: "activo",
              mensaje: "No se puede desactivar al único dueño o superadmin activo.",
            },
          ]);
        }
      }

      await db.run("UPDATE usuario SET activo=0, updated_at=? WHERE id=?", [now(), id]);
      await registrarAccion(db, {
        accion: "desactivar",
        entidad: "usuario",
        entidadId: id,
        resumen: `Usuario desactivado: ${actual.nombre}`,
      });
    },

    async cambiarPin(input: CambiarPinInput): Promise<void> {
      if (!PIN_VALIDO.test(input.pinNuevo)) {
        throw new ValidacionError([
          { campo: "pinNuevo", mensaje: "El PIN debe tener entre 4 y 6 dígitos numéricos." },
        ]);
      }

      const fila = await db.get<{ id: string; pin_hash: string | null }>(
        "SELECT id, pin_hash FROM usuario WHERE id=? AND deleted_at IS NULL",
        [input.usuarioId],
      );
      if (!fila) throw new Error(`Usuario ${input.usuarioId} no existe`);

      if (!input.omitirPinActual) {
        const coincide =
          fila.pin_hash != null &&
          input.pinActual != null &&
          (await verificarPin(input.pinActual, fila.pin_hash));
        if (!coincide) {
          throw new ValidacionError([
            { campo: "pinActual", mensaje: "El PIN actual no coincide." },
          ]);
        }
      }

      const nuevoHash = await hashearPin(input.pinNuevo);
      const ts = now();
      await db.run("UPDATE usuario SET pin_hash=?, updated_at=? WHERE id=?", [
        nuevoHash,
        ts,
        input.usuarioId,
      ]);

      await asegurarSeguridad(db, input.usuarioId);
      await db.run(
        "UPDATE usuario_seguridad SET pin_actualizado_at=?, updated_at=? WHERE usuario_id=?",
        [ts, ts, input.usuarioId],
      );

      await registrarAccion(db, {
        accion: "cambiar_pin",
        entidad: "usuario",
        entidadId: input.usuarioId,
      });
    },

    async autenticar(input: AutenticarInput): Promise<ResultadoAutenticacion> {
      const fila = await db.get<{
        id: string;
        nombre: string;
        rol: RolUsuario;
        activo: number;
        permisos_json: string | null;
        pin_hash: string | null;
        created_at: string;
        updated_at: string;
        deleted_at: string | null;
      }>(
        `SELECT id, nombre, rol, activo, permisos_json, pin_hash, created_at, updated_at, deleted_at
         FROM usuario WHERE id=? AND deleted_at IS NULL`,
        [input.usuarioId],
      );
      if (!fila) return { ok: false, motivo: "pin_incorrecto" };
      if (fila.activo === 0) return { ok: false, motivo: "inactivo" };

      const seguridad = await asegurarSeguridad(db, fila.id);
      if (seguridad.bloqueado_hasta && seguridad.bloqueado_hasta > now()) {
        return { ok: false, motivo: "bloqueado" };
      }
      if (fila.pin_hash == null) return { ok: false, motivo: "sin_pin" };

      const coincide = await verificarPin(input.pin, fila.pin_hash);
      const ts = now();
      if (!coincide) {
        await db.run(
          "UPDATE usuario_seguridad SET intentos_fallidos = intentos_fallidos + 1, updated_at=? WHERE usuario_id=?",
          [ts, fila.id],
        );
        return { ok: false, motivo: "pin_incorrecto" };
      }

      await db.run(
        "UPDATE usuario_seguridad SET intentos_fallidos=0, ultimo_acceso=?, updated_at=? WHERE usuario_id=?",
        [ts, ts, fila.id],
      );

      const usuario: Usuario = {
        id: fila.id,
        nombre: fila.nombre,
        rol: fila.rol,
        activo: fila.activo,
        permisos_json: fila.permisos_json,
        created_at: fila.created_at,
        updated_at: fila.updated_at,
        deleted_at: fila.deleted_at,
      };
      const permisos = resolverPermisos(usuario, (mensaje) => console.warn(mensaje));
      return { ok: true, usuario, permisos };
    },
  };
}

export type UsuarioRepo = ReturnType<typeof crearUsuarioRepo>;
