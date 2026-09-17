import type { SqlDriver } from "./driver.js";
import type { Permiso, PortadorSesion, SesionRepo } from "../dominio/permisos.js";
import { PermisoError } from "../dominio/permisos.js";

/**
 * Sesión pegada al driver (§ RBAC-04, `plan/00-CONVENCIONES.md` §3).
 *
 * `PortadorSesion` (los datos: usuarioId/rol/permisos) y `SesionRepo` (el
 * accesor `obtenerActual()`) ya los declaró RBAC-02 en `dominio/permisos.ts`
 * — este archivo NO los redeclara, solo los importa. El brief original de
 * esta tarea nombraba los mismos tres identificadores con los papeles
 * invertidos (ahí `SesionRepo` eran los datos y `PortadorSesion` el
 * envoltorio mutable); se resuelve la colisión a favor de lo que RBAC-02 ya
 * dejó exportado, porque reescribirlo rompería `SESION_LOCAL` y todo lo que
 * ya importa esos nombres desde `dominio/permisos.js`.
 *
 * La sesión viaja PEGADA AL DRIVER y no como segundo argumento de
 * `crearXxxRepo(db)` por tres razones verificadas (no de gusto):
 * (1) los 32 archivos de `packages/core/test/` construyen los repos con
 *     `createNodeSqliteDriver()` + `migrate()` sin sesión — si el guardia
 *     exigiera un parámetro de sesión, la suite entera dejaría de compilar;
 * (2) `registrarAccion(db, input)` (`bitacora-repo.ts`) se llama desde
 *     sitios que solo tienen `db` en su closure — cambiar su firma para
 *     aceptar la sesión obligaría a tocar cada uno de esos sitios;
 * (3) `packages/ui/src/data/contexto.tsx` construye los repos en el cuerpo
 *     del render SIN `useMemo` — pasar la sesión como argumento cambiaría la
 *     identidad de cada repo en cada cambio de usuario o tick de un
 *     temporizador de inactividad, dispararía en bucle todos los
 *     `useEffect(..., [repo])` de la UI.
 *
 * El portador (`crearPortadorSesion`) es un objeto de identidad ESTABLE con
 * un campo mutable interno: `fijar()` cambia la sesión activa sin reemplazar
 * el objeto, así que el driver envuelto por `conSesion` no necesita
 * reconstruirse cuando cambia el usuario.
 *
 * El vínculo `driver envuelto -> portador` vive en un `WeakMap` en vez de una
 * propiedad del objeto driver: así el driver envuelto sigue siendo un
 * `SqlDriver` estructural sin campos extra visibles, y la entrada se libera
 * sola cuando el driver envuelto deja de referenciarse.
 */

const PORTADORES = new WeakMap<SqlDriver, SesionRepo>();

export function crearPortadorSesion(
  inicial: PortadorSesion | null = null,
): SesionRepo & { fijar(sesion: PortadorSesion | null): void } {
  let actual: PortadorSesion | null = inicial;
  return {
    obtenerActual(): PortadorSesion | null {
      return actual;
    },
    fijar(sesion: PortadorSesion | null): void {
      actual = sesion;
    },
  };
}

export function conSesion(db: SqlDriver, portador: SesionRepo): SqlDriver {
  const envuelto: SqlDriver = {
    exec: (sql) => db.exec(sql),
    run: (sql, params) => db.run(sql, params),
    all: (sql, params) => db.all(sql, params),
    get: (sql, params) => db.get(sql, params),
    ...(db.close ? { close: () => db.close!() } : {}),
    ...(db.enTransaccion ? { enTransaccion: <T>(fn: () => Promise<T>) => db.enTransaccion!(fn) } : {}),
  };
  PORTADORES.set(envuelto, portador);
  return envuelto;
}

export function sesionDe(db: SqlDriver): PortadorSesion | null {
  const portador = PORTADORES.get(db);
  return portador ? portador.obtenerActual() : null;
}

export function usuarioDe(db: SqlDriver): string | null {
  return sesionDe(db)?.usuarioId ?? null;
}

/**
 * Nombre explícito para la decisión "driver sin sesión adjunta = permisivo"
 * (criterio de aceptación: esto no puede ser un `if` mudo). Cubre dos casos
 * con el mismo comportamiento a propósito: un driver que nunca pasó por
 * `conSesion` (los 32 tests existentes, instalaciones sin login todavía) y
 * un driver envuelto cuyo portador no tiene sesión activa ahora mismo.
 */
export function esModoPermisivo(db: SqlDriver): boolean {
  return sesionDe(db) === null;
}

export function exigirPermiso(db: SqlDriver, permiso: Permiso): void {
  if (esModoPermisivo(db)) return;
  const sesion = sesionDe(db)!;
  if (!sesion.permisos.has(permiso)) throw new PermisoError(permiso);
}
