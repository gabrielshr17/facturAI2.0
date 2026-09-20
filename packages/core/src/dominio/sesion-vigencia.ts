import { PERMISOS, type Permiso, type PortadorSesion, type RolUsuario } from "./permisos.js";

/**
 * Vigencia de la sesión espejada en `sessionStorage` (§ RBAC-05).
 *
 * DECISIÓN YA TOMADA (ver brief de la tarea, PLAN-MEJORAS.md §3): la sesión activa
 * vive EN MEMORIA, en el portador de `db/sesion.ts`. `sessionStorage` es solo un
 * espejo por pestaña para sobrevivir un recargue de página — nunca la fuente de
 * verdad, y nunca SQLite. Este archivo NO toca el navegador ni la base de datos:
 * son funciones puras que reciben los datos ya leídos como parámetros, para que se
 * puedan probar con `vitest` sin `jsdom` y sin un driver real. El componente que las
 * llama es quien lee/escribe `sessionStorage` y quien consulta si el usuario sigue
 * activo antes de invocar `restaurarSesion`.
 *
 * Formato de la marca (`marcarSesion`/`restaurarSesion`): un JSON con
 * `{ usuarioId, rol, permisos: Permiso[] }`. Se guarda el ARREGLO de permisos ya
 * resueltos al momento del login (no solo el rol), porque `resolverPermisos` aplica
 * excepciones por usuario (`permisos_json`) que una función pura no puede recalcular
 * sin volver a golpear la base — y precisamente evitar ese golpe en cada recargue es
 * el propósito de espejar la sesión. El costo aceptado: si el rol o las excepciones
 * de un usuario cambian mientras tiene la pestaña abierta, el cambio no se refleja
 * hasta el siguiente login real (no hasta el siguiente recargue). `usuarioId: null`
 * (la sesión "sin login" que no debería llegar a guardarse) se rechaza como
 * malformada a propósito: no tiene sentido espejar "nadie ha iniciado sesión".
 *
 * `restaurarSesion` nunca lanza: un `sessionStorage` corrupto (edición manual,
 * versión anterior del formato, cuota agotada que dejó una escritura a medias) se
 * reporta por `alAvisar` y se trata como "no hay sesión que restaurar", nunca como
 * un error fatal que bloquee el arranque de la app.
 */

const ROLES: readonly RolUsuario[] = ["cajero", "supervisor", "dueno", "superadmin"];

interface MarcaSesion {
  usuarioId: string;
  rol: RolUsuario;
  permisos: Permiso[];
}

function esRolUsuario(valor: unknown): valor is RolUsuario {
  return typeof valor === "string" && (ROLES as readonly string[]).includes(valor);
}

function esMarcaSesion(valor: unknown): valor is MarcaSesion {
  if (typeof valor !== "object" || valor === null) return false;
  const candidata = valor as Record<string, unknown>;
  return (
    typeof candidata.usuarioId === "string" &&
    candidata.usuarioId.length > 0 &&
    esRolUsuario(candidata.rol) &&
    Array.isArray(candidata.permisos) &&
    candidata.permisos.every((p) => typeof p === "string")
  );
}

/** Serializa una sesión activa para guardarla en `sessionStorage`. Ver cabecera del archivo. */
export function marcarSesion(sesion: PortadorSesion): string {
  const marca: MarcaSesion = {
    usuarioId: sesion.usuarioId ?? "",
    rol: sesion.rol,
    permisos: [...sesion.permisos],
  };
  return JSON.stringify(marca);
}

/**
 * Reconstruye la sesión desde la marca de `sessionStorage`, o `null` si no hay
 * ninguna, está corrupta, o `usuarioActivo` es `false` (el usuario se desactivó o
 * se eliminó mientras la pestaña estaba abierta — la comprobación en base la hace
 * el llamador ANTES de invocar esta función, no aquí).
 */
export function restaurarSesion(
  marca: unknown,
  usuarioActivo: boolean,
  alAvisar?: (mensaje: string) => void,
): PortadorSesion | null {
  if (marca === null || marca === undefined) return null;

  let parseada: unknown;
  if (typeof marca === "string") {
    try {
      parseada = JSON.parse(marca);
    } catch {
      alAvisar?.("La sesión guardada en este navegador no es JSON válido; se pide iniciar sesión de nuevo.");
      return null;
    }
  } else {
    parseada = marca;
  }

  if (!esMarcaSesion(parseada)) {
    alAvisar?.("La sesión guardada en este navegador tiene un formato inesperado; se pide iniciar sesión de nuevo.");
    return null;
  }

  if (!usuarioActivo) return null;

  const permisosValidos = new Set<Permiso>();
  for (const p of parseada.permisos) {
    if ((PERMISOS as readonly string[]).includes(p)) permisosValidos.add(p as Permiso);
  }

  return {
    usuarioId: parseada.usuarioId,
    rol: parseada.rol,
    permisos: permisosValidos,
  };
}

/**
 * Decide si, dado el momento de la última actividad y la hora actual, ya pasó el
 * límite de inactividad configurado (§ RBAC-07 parte B, bloqueo de sesión).
 *
 * Función PURA a propósito: el hook de UI (`useBloqueoInactividad`) solo la invoca
 * contra un reloj y una marca de tiempo que él mismo mantiene en un `ref` — nunca
 * reimplementa la cuenta acá. Recibe `Date` en vez de milisegundos crudos porque así
 * se prueba con fechas legibles (`new Date("2026-01-01T10:00:00")`) sin aritmética de
 * timestamps en cada test.
 *
 * `limiteMinutos <= 0` se trata como "bloqueo desactivado", no como error: una
 * instalación podría querer apagar el bloqueo por completo sin que el llamador tenga
 * que acordarse de no invocar la función en absoluto.
 */
export function debeBloquear(ultimaActividad: Date, ahora: Date, limiteMinutos: number): boolean {
  if (limiteMinutos <= 0) return false;
  const transcurridoMs = ahora.getTime() - ultimaActividad.getTime();
  return transcurridoMs >= limiteMinutos * 60_000;
}
