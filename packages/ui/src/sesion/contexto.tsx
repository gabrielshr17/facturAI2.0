/**
 * Proveedor de sesión del lado de la UI (§ RBAC-05).
 *
 * CORRECCIÓN DE ARQUITECTURA sobre PLATAFORMA-07: antes, este archivo mantenía un
 * `useState<PortadorSesion>` de React que NUNCA se conectaba al portador real de
 * `@sfr/core` (`crearPortadorSesion`/`conSesion` de `db/sesion.ts`), y
 * `data/contexto.tsx` construía `crearRepos(db)` con el driver CRUDO. Resultado: el
 * guardia `exigirPermiso` de RBAC-04 existía en el backend pero NUNCA se activaba
 * cuando la app corría de verdad. Este archivo ahora es el ÚNICO lugar donde se crea
 * el portador — con `useRef` (identidad estable, se muta con `.fijar()`, nunca se
 * reemplaza) — y expone, además de la sesión para pintar la UI, el driver YA
 * ENVUELTO con `conSesion(dbCrudo, portador)`. `data/contexto.tsx` (`ProveedorDatos`)
 * consume ESE driver, nunca el crudo, así que solo puede existir un portador: el que
 * vive aquí. Ningún otro módulo debe llamar a `crearPortadorSesion` ni a `conSesion`.
 *
 * `sesion` (el campo que expone `useSesion()`) sigue el mismo contrato que antes por
 * compatibilidad con `AppShell` y con toda la suite de humo existente: cuando nadie
 * inició sesión todavía, vale `SESION_LOCAL` (superadmin, todo visible) — el mismo
 * valor por defecto de siempre para instalaciones/pruebas que montan `<AppShell>`
 * directamente sin pasar por la pantalla de Acceso. Lo nuevo es `autenticado`
 * (`false` mientras `sesion` es solo el default): `packages/web` y
 * `packages/desktop` lo usan para decidir si muestran `<Acceso>` o `<AppShell>`. El
 * guardia del backend, en cambio, SÍ distingue los dos casos (`esModoPermisivo`
 * mira si el portador tiene una sesión real fijada, no si `autenticado` es true),
 * así que aunque la UI muestre "todo visible" antes de loguearse, cualquier
 * instalación que YA tenga usuarios con PIN queda con `usuarioActivo=null` en el
 * portador hasta el primer login — ver `iniciarSesion`.
 *
 * `iniciarSesion`/`cerrarSesion` hacen las DOS cosas que pide el criterio de
 * aceptación: mutan el portador (`.fijar()`, para que el guardia del backend se
 * entere en la siguiente escritura) Y actualizan el estado de React (para que la UI
 * se entere y vuelva a renderizar). El espejo en `sessionStorage`
 * (`marcarSesion`/`restaurarSesion` de `@sfr/core`, § `dominio/sesion-vigencia.ts`)
 * vive en `iniciarSesion`/`cerrarSesion`/el efecto de restauración de este archivo,
 * nunca en SQLite (decisión tomada, ver brief de la tarea).
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  conSesion,
  crearPortadorSesion,
  marcarSesion,
  restaurarSesion,
  SESION_LOCAL,
  type PortadorSesion,
  type SqlDriver,
} from "@sfr/core";

const CLAVE_SESSION_STORAGE = "sfr-sesion-activa";

export interface SesionApi {
  /** Sesión en efecto para pintar la UI: `SESION_LOCAL` si nadie inició sesión todavía. */
  sesion: PortadorSesion;
  /** `true` solo después de un login real (o de restaurar uno válido desde sessionStorage). */
  autenticado: boolean;
  /** Driver YA envuelto con `conSesion`; es el que debe recibir `ProveedorDatos`. */
  db: SqlDriver;
  iniciarSesion(sesion: PortadorSesion): void;
  cerrarSesion(): void;
}

const SesionContext = createContext<SesionApi | null>(null);

function leerMarcaGuardada(): string | null {
  try {
    return sessionStorage.getItem(CLAVE_SESSION_STORAGE);
  } catch {
    return null;
  }
}

function escribirMarcaGuardada(marca: string | null): void {
  try {
    if (marca === null) sessionStorage.removeItem(CLAVE_SESSION_STORAGE);
    else sessionStorage.setItem(CLAVE_SESSION_STORAGE, marca);
  } catch {
    // sessionStorage puede fallar (modo privado estricto, cuota agotada): perder el espejo
    // solo significa pedir el PIN de nuevo al recargar, no es un error que deba interrumpir
    // el login que ya ocurrió en memoria.
  }
}

export interface ProveedorSesionProps {
  db: SqlDriver;
  children: ReactNode;
  /**
   * Vuelve a validar, contra la base, que el usuario de una marca de `sessionStorage`
   * siga activo antes de confiar en ella (criterio de aceptación: "re-validar antes
   * de usarla"). Recibe el `usuarioId` de la marca y devuelve si sigue activo.
   * Opcional: sin este prop (p. ej. en pruebas que no necesitan restaurar sesión) no
   * se intenta restaurar nada y la app arranca sin sesión.
   */
  revalidarUsuarioActivo?: (usuarioId: string) => Promise<boolean>;
  onAvisoRestauracion?: (mensaje: string) => void;
  /**
   * SOLO para pruebas (§ `packages/ui/test/_render.tsx`): fija una sesión ya
   * autenticada al montar, sin pasar por `sessionStorage` ni por la pantalla de
   * Acceso, para poder probar una pantalla con un rol/permiso concreto. Ninguna
   * instalación real la usa: `packages/web`/`packages/desktop` nunca la pasan.
   */
  sesionInicial?: PortadorSesion;
}

export function ProveedorSesion({
  db,
  children,
  revalidarUsuarioActivo,
  onAvisoRestauracion,
  sesionInicial,
}: ProveedorSesionProps) {
  const portadorRef = useRef(crearPortadorSesion(sesionInicial ?? null));
  const dbConSesion = useMemo(() => conSesion(db, portadorRef.current), [db]);

  const [sesion, setSesion] = useState<PortadorSesion>(sesionInicial ?? SESION_LOCAL);
  const [autenticado, setAutenticado] = useState(sesionInicial !== undefined);

  useEffect(() => {
    if (sesionInicial !== undefined) return;
    if (!revalidarUsuarioActivo) return;
    const marca = leerMarcaGuardada();
    if (marca === null) return;

    let cancelado = false;
    void (async () => {
      let usuarioId: string | null;
      try {
        const parcial = JSON.parse(marca) as { usuarioId?: unknown };
        usuarioId = typeof parcial.usuarioId === "string" ? parcial.usuarioId : null;
      } catch {
        usuarioId = null;
      }
      const activo = usuarioId ? await revalidarUsuarioActivo(usuarioId) : false;
      const restaurada = restaurarSesion(marca, activo, onAvisoRestauracion);
      if (cancelado) return;
      if (restaurada) {
        portadorRef.current.fijar(restaurada);
        setSesion(restaurada);
        setAutenticado(true);
      } else {
        escribirMarcaGuardada(null);
      }
    })();
    return () => {
      cancelado = true;
    };
    // Solo al montar: la restauración de una pestaña recién abierta ocurre una única vez.
  }, []);

  function iniciarSesion(nueva: PortadorSesion): void {
    portadorRef.current.fijar(nueva);
    setSesion(nueva);
    setAutenticado(true);
    escribirMarcaGuardada(marcarSesion(nueva));
  }

  function cerrarSesion(): void {
    portadorRef.current.fijar(null);
    setSesion(SESION_LOCAL);
    setAutenticado(false);
    escribirMarcaGuardada(null);
  }

  return (
    <SesionContext.Provider
      value={{ sesion, autenticado, db: dbConSesion, iniciarSesion, cerrarSesion }}
    >
      {children}
    </SesionContext.Provider>
  );
}

export function useSesion(): SesionApi {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error("useSesion debe usarse dentro de <ProveedorSesion>");
  return ctx;
}

export function useSesionOpcional(): SesionApi | null {
  return useContext(SesionContext);
}
