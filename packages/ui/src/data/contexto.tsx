/**
 * Proveedor de repos (§ PLATAFORMA-07 / RBAC-05).
 *
 * CORRECCIÓN DE ARQUITECTURA: antes, `ProveedorDatos` recibía el `SqlDriver` CRUDO
 * como prop y llamaba `crearRepos(db)` directo con él, y montaba un
 * `<ProveedorSesion>` de relleno (`ProveedorSesionSiFalta`) que solo servía para que
 * `useSesion()` no lanzara — nunca envolvía el driver. Resultado: el guardia
 * `exigirPermiso` de RBAC-04 (ya viviendo en 9 puntos sensibles de los repos) nunca
 * se activaba en la app real, porque `crearRepos` jamás vio un driver pasado por
 * `conSesion`. Ahora `ProveedorDatos` YA NO acepta `db` como prop: `<ProveedorSesion
 * db={...}>` es OBLIGATORIO por encima (crea el ÚNICO portador y expone el driver ya
 * envuelto vía `useSesion().db`), y este componente solo memoriza `crearRepos` sobre
 * ESE driver envuelto. Así solo puede existir un portador de sesión en todo el árbol.
 *
 * La dependencia del `useMemo` sigue siendo únicamente el driver (ahora el envuelto,
 * antes el crudo): `conSesion` devuelve SIEMPRE el mismo objeto driver envuelto para
 * el mismo `db` crudo mientras `<ProveedorSesion>` no se desmonte (memorizado ahí con
 * `useMemo([db])`), así que cambiar de usuario —que muta el portador con `.fijar()`,
 * nunca lo reemplaza— NO cambia la identidad del driver envuelto, y por lo tanto
 * tampoco la de `repos`. Eso es lo que evita la cascada de re-render que ya
 * documentaba PLATAFORMA-07 (Reportes, CorteCaja y Compras con `useEffect([repo])`).
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { crearRepos, type Repos as ReposCore } from "@sfr/core";
import { useSesion } from "../sesion/contexto.js";

export type Repos = ReposCore;

const ReposContext = createContext<Repos | null>(null);

/** Provee los repos a partir del driver YA ENVUELTO que expone `<ProveedorSesion>`. */
export function ProveedorDatos({ children }: { children: ReactNode }) {
  const { db } = useSesion();
  const repos = useMemo(() => crearRepos(db), [db]);
  return <ReposContext.Provider value={repos}>{children}</ReposContext.Provider>;
}

export function useRepos(): Repos {
  const r = useContext(ReposContext);
  if (!r) throw new Error("useRepos debe usarse dentro de <ProveedorDatos>");
  return r;
}
