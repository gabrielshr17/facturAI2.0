/**
 * Proveedor de repos (§ PLATAFORMA-07, ola 2).
 *
 * Antes, `Repos` y `ProveedorDatos` enumeraban los ~18 repos a mano, y el objeto de
 * repos se construía como literal en el cuerpo del render SIN `useMemo`: en cuanto este
 * componente re-renderizara, cambiaba la identidad de `repos` para los ~16 archivos que
 * llaman `useRepos`, disparando en cascada cada `useEffect([repo])` (Reportes, CorteCaja
 * y Compras entrarían en bucle de consultas). Ahora la construcción vive en
 * `crearRepos(db)` (`@sfr/core`, alimentada por `repos/registro.ts`), y este archivo solo
 * memoriza.
 *
 * La dependencia del `useMemo` es ÚNICAMENTE `[db]`, a propósito — NO `[db, sesion]`.
 * `crearRepos(db)` todavía no acepta sesión (ningún repo individual la acepta hasta
 * RBAC-04, que la pega al driver); meter `sesion` en las dependencias reconstruiría las
 * factorías en cada cambio de sesión sin ganar nada hoy, y es exactamente la cascada de
 * re-render que este refactor busca evitar. La sesión activa se lee aparte, con
 * `useSesion()`, y solo la consume `AppShell` para filtrar módulos — no los repos.
 *
 * `ProveedorDatos` también resuelve la sesión para el árbol que envuelve: si ya hay un
 * `<ProveedorSesion>` explícito por encima (como en las pruebas que fijan una sesión de
 * prueba), lo respeta tal cual; si no lo hay —el caso de TODAS las instalaciones hoy,
 * porque RBAC-05 (pantalla de acceso por PIN) todavía no existe— monta uno por defecto
 * con `SESION_LOCAL`, para que ni `packages/web/src/main.tsx` ni
 * `packages/desktop/src/main.tsx` necesiten cambiar una sola línea.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { crearRepos, type SqlDriver, type Repos as ReposCore } from "@sfr/core";
import { ProveedorSesion, useSesionOpcional } from "../sesion/contexto.js";

export type Repos = ReposCore;

const ReposContext = createContext<Repos | null>(null);

function ProveedorSesionSiFalta({ children }: { children: ReactNode }) {
  const existente = useSesionOpcional();
  if (existente) return <>{children}</>;
  return <ProveedorSesion>{children}</ProveedorSesion>;
}

/**
 * Provee los repos a partir de un `SqlDriver` ya migrado. Cada shell (PWA,
 * escritorio) crea su driver y lo pasa aquí; las pantallas son idénticas.
 */
export function ProveedorDatos({ db, children }: { db: SqlDriver; children: ReactNode }) {
  const repos = useMemo(() => crearRepos(db), [db]);
  return (
    <ProveedorSesionSiFalta>
      <ReposContext.Provider value={repos}>{children}</ReposContext.Provider>
    </ProveedorSesionSiFalta>
  );
}

export function useRepos(): Repos {
  const r = useContext(ReposContext);
  if (!r) throw new Error("useRepos debe usarse dentro de <ProveedorDatos>");
  return r;
}
