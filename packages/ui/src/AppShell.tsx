import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Sun, Moon, Menu, LogOut } from "lucide-react";
import type { CorteCaja } from "@sfr/core";
import { Marca } from "./componentes/Marca.js";
import { ErrorBoundary } from "./componentes/ErrorBoundary.js";
import { CambioRapidoUsuario } from "./componentes/CambioRapidoUsuario.js";
import { BloqueoInactividad } from "./componentes/BloqueoInactividad.js";
import { PromptAbrirTurno, PromptCerrarTurno } from "./componentes/TarjetasTurno.js";
import { registrarManejadorCierreVentana } from "./cierreVentana.js";
import { ProveedorAlertas } from "./contexto/Alertas.js";
import { useSesion } from "./sesion/contexto.js";
import { useRepos } from "./data/contexto.js";
import { MODULOS, MODULO_POR_DEFECTO_ID, type ModuloDef } from "./navegacion/modulos.js";
import { c, s, sombra } from "./estilos.js";
import { useTema } from "./hooks/useTema.js";
import { useAtajosTeclado } from "./hooks/useAtajosTeclado.js";
import { useNavegacionFlechas } from "./hooks/useNavegacionFlechas.js";
import { useBreakpoint, useNavSoloIconos, useNavEnCajon } from "./hooks/useBreakpoint.js";

// Mismo mapa que `pantallas/Acceso.tsx` (rol -> etiqueta legible). Se duplica a propósito:
// es una constante puramente de presentación, de dos líneas, y forzar un import cruzado
// entre una pantalla y el cascarón compartido acopla dos archivos que hoy no se conocen.
const ETIQUETA_ROL: Record<string, string> = {
  cajero: "Cajero",
  supervisor: "Supervisor",
  dueno: "Dueño",
  superadmin: "Superadmin",
};

// Clave de localStorage: el módulo activo sobrevive a un remontaje (recargar la página,
// reabrir la ventana de escritorio) igual que el tema. Si el valor guardado ya no existe
// en MODULOS o el permiso que lo cubría se revocó, `moduloInicial` cae a 'ventas'.
const CLAVE_MODULO_ACTIVO = "sfr-modulo-activo";

function leerModuloPersistido(): string | null {
  try {
    return localStorage.getItem(CLAVE_MODULO_ACTIVO);
  } catch {
    return null;
  }
}

function guardarModuloActivo(id: string): void {
  try {
    localStorage.setItem(CLAVE_MODULO_ACTIVO, id);
  } catch {
    // localStorage puede fallar (modo privado, cuota agotada, jsdom sin storage real): no
    // persistir el módulo activo no es un error que deba interrumpir la navegación, solo
    // se pierde el "recordar dónde estaba" al recargar.
  }
}

function moduloPorId(lista: ModuloDef[], id: string): ModuloDef | undefined {
  return lista.find((m) => m.id === id);
}

/**
 * Cascarón de UI compartido (PWA y escritorio). Deriva el menú, el mapa de atajos y el
 * render del módulo activo a partir de `MODULOS` (§ navegacion/modulos.ts, PLATAFORMA-07):
 * agregar, quitar o esconder por permiso un módulo es editar SOLO ese registro — este
 * archivo no menciona ningún módulo por nombre. El Cobro (§7.2) no es una pantalla
 * propia: es el modal que se abre con el botón "Cobrar" dentro de Ventas, ya que
 * necesita el ticket activo.
 */
export function AppShell({ plataforma }: { plataforma: "Escritorio" | "Web" }) {
  const { sesion, cerrarSesion } = useSesion();
  const { usuario: usuarioRepo, corteCaja: corteCajaRepo, negocio: negocioRepo } = useRepos();

  // Ciclo de turno de caja (§ CAJA): login abre turno, logout lo cierra. `exigeCajaAbierta`
  // se lee una sola vez (configuración del negocio, no cambia por usuario); `estadoTurno` se
  // vuelve a consultar cada vez que cambia `sesion.usuarioId` — login, logout y el cambio
  // rápido de usuario (`Ctrl+U`, que ya cierra el turno saliente ANTES de llamar
  // `iniciarSesion` del nuevo usuario, ver `CambioRapidoUsuario.tsx`) pasan todos por ahí.
  const [exigeCajaAbierta, setExigeCajaAbierta] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelado = false;
    void negocioRepo.obtener().then((n) => {
      if (!cancelado) setExigeCajaAbierta(n?.exige_caja_abierta === 1);
    });
    return () => {
      cancelado = true;
    };
  }, [negocioRepo]);

  const [estadoTurno, setEstadoTurno] = useState<{ cargado: boolean; abierto: CorteCaja | null }>({
    cargado: false,
    abierto: null,
  });
  useEffect(() => {
    if (sesion.usuarioId === null) {
      setEstadoTurno({ cargado: true, abierto: null });
      return;
    }
    let cancelado = false;
    setEstadoTurno((prev) => ({ ...prev, cargado: false }));
    void corteCajaRepo.turnoAbierto().then((abierto) => {
      if (!cancelado) setEstadoTurno({ cargado: true, abierto });
    });
    return () => {
      cancelado = true;
    };
  }, [sesion.usuarioId, corteCajaRepo]);

  // Turno abierto por OTRO usuario (§ CAJA, bug real: un cajero podía loguearse mientras
  // el turno de otro seguía abierto —el portón solo miraba "¿hay turno?", no "¿es mío?"—
  // y se quedaba sin forma de cerrar sesión al final, porque cerrar el turno de otro
  // exige `caja.cerrar`, que un cajero no tiene). Se resuelve el nombre del que lo abrió
  // solo cuando de verdad hay un desajuste, para no disparar una consulta de más en el
  // caso normal (turno propio o ninguno).
  const [nombreAbiertoPor, setNombreAbiertoPor] = useState<string | null>(null);
  const turnoDeOtroUsuario =
    estadoTurno.abierto !== null && estadoTurno.abierto.usuario_id !== sesion.usuarioId;
  useEffect(() => {
    if (!turnoDeOtroUsuario || !estadoTurno.abierto?.usuario_id) {
      setNombreAbiertoPor(null);
      return;
    }
    let cancelado = false;
    void usuarioRepo.obtener(estadoTurno.abierto.usuario_id).then((u) => {
      if (!cancelado) setNombreAbiertoPor(u?.nombre ?? null);
    });
    return () => {
      cancelado = true;
    };
  }, [turnoDeOtroUsuario, estadoTurno.abierto?.usuario_id, usuarioRepo]);

  const [cerrandoTurno, setCerrandoTurno] = useState(false);
  const [forzandoCierre, setForzandoCierre] = useState(false);
  const puedeForzarCierre = sesion.permisos.has("caja.cerrar");

  // Cerrar la VENTANA (§ CAJA, escritorio): mismo pedido de arqueo que cerrar sesión, pero
  // disparado por el botón de cerrar del sistema operativo en vez de por "Cerrar sesión".
  // El puente vive en `cierreVentana.ts` (agnóstico de plataforma); quien de verdad
  // intercepta el cierre nativo y llama para acá es `packages/desktop/src/main.tsx` — la
  // PWA nunca registra nada del lado de Tauri, así que esto queda inerte ahí.
  const [cerrandoParaSalirApp, setCerrandoParaSalirApp] = useState(false);
  const resolverCierreAppRef = useRef<((r: "cerrar" | "cancelar") => void) | null>(null);

  function cancelarCierreApp() {
    resolverCierreAppRef.current?.("cancelar");
    resolverCierreAppRef.current = null;
    setCerrandoParaSalirApp(false);
  }

  useEffect(() => {
    return registrarManejadorCierreVentana(() => {
      if (!estadoTurno.abierto || estadoTurno.abierto.usuario_id !== sesion.usuarioId) {
        return Promise.resolve("cerrar");
      }
      return new Promise<"cerrar" | "cancelar">((resolve) => {
        resolverCierreAppRef.current = resolve;
        setCerrandoParaSalirApp(true);
      });
    });
  }, [estadoTurno, sesion.usuarioId]);

  async function manejarCerrarSesion() {
    if (estadoTurno.abierto) {
      setCerrandoTurno(true);
      return;
    }
    cerrarSesion();
  }

  // El portador de sesión (§ RBAC-05) solo trae `usuarioId`/`rol`: el NOMBRE hay que
  // resolverlo aparte con una consulta. Se dispara una sola vez por cambio de usuario
  // (no en cada render) y se limpia sola cuando `usuarioId` vuelve a `null` (instalaciones
  // o pruebas que montan `<AppShell>` directo, sin pasar por `<Acceso>`).
  const [nombreUsuario, setNombreUsuario] = useState<string | null>(null);
  useEffect(() => {
    const id = sesion.usuarioId;
    if (id === null) {
      setNombreUsuario(null);
      return;
    }
    let cancelado = false;
    void usuarioRepo.obtener(id).then((u) => {
      if (!cancelado) setNombreUsuario(u?.nombre ?? null);
    });
    return () => {
      cancelado = true;
    };
  }, [sesion.usuarioId, usuarioRepo]);

  // Filtrar por permiso es lo que hace esto más que cosmético: un módulo sin permiso no
  // se renderiza NI se registra su atajo (ver el `useAtajosTeclado` de abajo), así que
  // Alt+N de un módulo oculto no cambia de pantalla.
  const permitidos = useMemo(
    () => MODULOS.filter((m) => m.permiso === null || sesion.permisos.has(m.permiso)),
    [sesion.permisos],
  );

  const [activoId, setActivoId] = useState<string>(() => {
    const persistidoId = leerModuloPersistido();
    const persistido = persistidoId ? MODULOS.find((m) => m.id === persistidoId) : undefined;
    const persistidoPermitido =
      persistido && (persistido.permiso === null || sesion.permisos.has(persistido.permiso));
    if (persistidoPermitido && persistido) return persistido.id;
    return MODULO_POR_DEFECTO_ID;
  });

  // Si la sesión cambia en caliente (o el módulo persistido resultó no estar permitido al
  // montar) y el módulo activo deja de estar en `permitidos`, cae a Ventas — o al primero
  // que sí esté permitido, por si algún día Ventas mismo quedara fuera.
  useEffect(() => {
    if (permitidos.some((m) => m.id === activoId)) return;
    const reemplazo = moduloPorId(permitidos, MODULO_POR_DEFECTO_ID) ?? permitidos[0];
    if (reemplazo) setActivoId(reemplazo.id);
  }, [permitidos, activoId]);

  const activo =
    moduloPorId(permitidos, activoId) ??
    moduloPorId(permitidos, MODULO_POR_DEFECTO_ID) ??
    permitidos[0];

  const [tema, alternarTema] = useTema();
  const tramo = useBreakpoint();
  // La columna izquierda es lo PRIMERO que cede al angostar la ventana: pierde las etiquetas y queda
  // como tira de iconos ANTES de que el contenido se apile (§ tabla de tramos en useBreakpoint), y
  // recién en teléfono sale del flujo a un cajón.
  const soloIconos = useNavSoloIconos();
  const enCajon = useNavEnCajon();
  const [cajonAbierto, setCajonAbierto] = useState(false);

  function irA(id: string) {
    setActivoId(id);
    guardarModuloActivo(id);
    setCajonAbierto(false);
  }

  // Alt+1..Alt+9 (o el atajo que traiga cada módulo) cambia de pantalla desde cualquier
  // lugar de la app — junto con `useNavegacionFlechas` (flechas para moverse entre campos
  // en vez de alterar valores), es lo que hace posible operar todo el sistema sin mouse.
  // El mapa sale de `permitidos`, no de `MODULOS`: un atajo de un módulo sin permiso no se
  // registra, y uno con `atajo: null` tampoco entra en el mapa.
  useAtajosTeclado(
    Object.fromEntries(
      permitidos
        .filter((m): m is ModuloDef & { atajo: string } => m.atajo !== null)
        .map((m) => [m.atajo, () => irA(m.id)]),
    ),
  );
  useNavegacionFlechas();

  // El cajón se cierra solo al ensanchar la ventana: si no, al volver a escritorio quedaría un
  // overlay abierto encima de una barra lateral que ya es visible de por sí.
  useEffect(() => {
    if (!enCajon) setCajonAbierto(false);
  }, [enCajon]);
  useAtajosTeclado({ Escape: () => setCajonAbierto(false) }, cajonAbierto);

  // Al abrir el cajón el foco entra en él, y al cerrarlo vuelve al botón que lo abrió. Sin esto,
  // quien navega con teclado o lector de pantalla abre el menú y se queda con el foco atrás, en el
  // contenido tapado por el overlay, sin forma evidente de llegar a los módulos.
  const cajonRef = useRef<HTMLElement>(null);
  const botonMenuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (cajonAbierto) cajonRef.current?.querySelector("button")?.focus();
    else botonMenuRef.current?.focus();
  }, [cajonAbierto]);

  if (!activo) {
    // No debería ocurrir con SESION_LOCAL (todos los permisos); si una sesión real se
    // queda sin ningún módulo visible, es mejor decirlo explícito que reventar con un
    // `undefined.componente` más abajo.
    return <div style={{ padding: 24 }}>No hay ningún módulo disponible para esta sesión.</div>;
  }

  // Compuerta de "turno de otro usuario" (§ CAJA, bug real): esto va ANTES de la
  // compuerta de "abrir turno" de abajo, y es independiente de `exigeCajaAbierta` — un
  // turno abierto por alguien más bloquea a cualquier otro que inicie sesión después,
  // sin importar si el negocio exige turno para vender o no. Solo quien lo abrió puede
  // cerrarlo por su cuenta; cualquier otro necesita que un supervisor lo cierre a la
  // fuerza desde Corte de Caja. Bloquear ACÁ, al entrar, evita el atrapamiento real que
  // pasaba antes: alguien trabajaba todo el día sobre el turno de otro sin saberlo, y
  // recién se enteraba al cerrar sesión, con un error genérico que no explicaba nada.
  if (sesion.usuarioId !== null && estadoTurno.cargado && turnoDeOtroUsuario) {
    return (
      <ProveedorAlertas>
        <div style={styles.overlayCompleto}>
          <div style={{ ...s.tarjeta, width: 380, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, margin: "0 0 12px" }}>Hay un turno abierto</h1>
            <p style={{ margin: "0 0 16px", fontSize: 14, color: c.gris }}>
              {nombreAbiertoPor ?? "Otro usuario"} tiene un turno de caja abierto.{" "}
              {puedeForzarCierre
                ? "Puedes cerrarlo a la fuerza contando el efectivo de la caja."
                : "Pídele que cierre sesión para cerrarlo, o que un supervisor lo cierre a la fuerza."}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {puedeForzarCierre && (
                <button type="button" style={s.boton} onClick={() => setForzandoCierre(true)}>
                  Forzar cierre
                </button>
              )}
              <button type="button" style={s.botonSecundario} onClick={cerrarSesion}>
                Volver al login
              </button>
            </div>
          </div>
        </div>
        {forzandoCierre && estadoTurno.abierto && (
          <div style={styles.overlayModal} onClick={() => setForzandoCierre(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <PromptCerrarTurno
                montoInicial={estadoTurno.abierto.monto_inicial}
                fechaApertura={estadoTurno.abierto.fecha_apertura}
                nombreApertura={nombreAbiertoPor ?? undefined}
                titulo="Forzar cierre de turno"
                onConfirmar={async (efectivoContado) => {
                  await corteCajaRepo.cerrarTurno({ efectivoContado });
                  setForzandoCierre(false);
                  setEstadoTurno({ cargado: true, abierto: await corteCajaRepo.turnoAbierto() });
                }}
                onCancelar={() => setForzandoCierre(false)}
              />
            </div>
          </div>
        )}
      </ProveedorAlertas>
    );
  }

  // Compuerta de turno (§ CAJA): mientras el negocio exige caja abierta y la sesión real
  // todavía no tiene turno, NINGÚN módulo (ni Ventas) se renderiza — solo el paso "abrir
  // turno". Se resuelve DESPUÉS de todos los hooks de arriba (regla de hooks) pero ANTES
  // del cascarón normal. `sesion.usuarioId === null` cubre `SESION_LOCAL` (instalaciones/
  // pruebas que montan `<AppShell>` sin pasar por `<Acceso>`): ahí no hay turno que abrir.
  // A propósito NO bloquea mientras `exigeCajaAbierta`/`estadoTurno` todavía están
  // cargando (ambos arrancan en su estado "no cargado"): el primer render debe verse
  // igual que hoy, sin parpadeo en blanco, y solo pasa a bloquear una vez confirmado
  // que de verdad hace falta un turno.
  if (
    sesion.usuarioId !== null &&
    exigeCajaAbierta === true &&
    estadoTurno.cargado &&
    !estadoTurno.abierto
  ) {
    return (
      <ProveedorAlertas>
        <div style={styles.overlayCompleto}>
          <PromptAbrirTurno
            nombreUsuario={nombreUsuario ?? undefined}
            onConfirmar={async (montoInicial) => {
              await corteCajaRepo.abrirTurno({ montoInicial });
              const abierto = await corteCajaRepo.turnoAbierto();
              setEstadoTurno({ cargado: true, abierto });
            }}
          />
        </div>
      </ProveedorAlertas>
    );
  }

  const nav = (
    <nav
      aria-label="Módulos"
      ref={cajonRef}
      style={{
        ...styles.nav,
        ...(soloIconos ? { width: 60, padding: "16px 6px", alignItems: "center" } : {}),
        ...(enCajon
          ? { position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 300, boxShadow: sombra.md }
          : {}),
      }}
    >
      <div
        style={{
          ...styles.marca,
          ...(soloIconos ? { alignItems: "center", padding: "4px 0 16px" } : {}),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Marca size={20} aria-hidden="true" />
          {!soloIconos && <span style={styles.marcaTexto}>facturAI</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!soloIconos && <span style={styles.badge}>{plataforma}</span>}
          <button
            onClick={alternarTema}
            // `title` sale como tooltip pero no todos los lectores de pantalla lo anuncian; el
            // nombre accesible de un botón que solo tiene un icono tiene que ir en aria-label.
            aria-label={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-pressed={tema === "oscuro"}
            title={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            style={styles.botonTema}
          >
            {tema === "oscuro" ? (
              <Sun size={14} aria-hidden="true" />
            ) : (
              <Moon size={14} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {sesion.usuarioId !== null && (
        // Sin sesión real (SESION_LOCAL, `usuarioId: null`) no hay nada que mostrar ni
        // sesión que cerrar — es el caso de instalaciones/pruebas que montan `<AppShell>`
        // directo, sin pasar por `<Acceso>`.
        <div
          style={{
            ...styles.cuenta,
            justifyContent: soloIconos ? "center" : "space-between",
          }}
        >
          {!soloIconos && (
            <div style={{ minWidth: 0 }}>
              <div style={styles.cuentaNombre}>{nombreUsuario ?? "…"}</div>
              <div style={styles.cuentaRol}>{ETIQUETA_ROL[sesion.rol] ?? sesion.rol}</div>
            </div>
          )}
          <button
            onClick={() => void manejarCerrarSesion()}
            aria-label="Cerrar sesión"
            title={
              soloIconos
                ? `Cerrar sesión${nombreUsuario ? ` (${nombreUsuario})` : ""}`
                : "Cerrar sesión"
            }
            style={styles.botonTema}
          >
            <LogOut size={14} aria-hidden="true" />
          </button>
        </div>
      )}
      {permitidos.map((m) => {
        const Icono = m.icono;
        const pistaAtajo = m.atajo ? ` (${m.atajo})` : "";
        return (
          <button
            key={m.id}
            onClick={() => irA(m.id)}
            // Sin etiqueta visible el tooltip pasa a ser la única forma de saber qué es cada icono.
            title={soloIconos ? `${m.etiqueta}${pistaAtajo}` : (m.atajo ?? undefined)}
            // En modo tira de iconos no queda texto dentro del botón: sin esto el lector de
            // pantalla lo anunciaría como "botón" a secas.
            aria-label={soloIconos ? m.etiqueta : undefined}
            // Le dice al lector cuál de los módulos permitidos es el que está abierto.
            aria-current={activo.id === m.id ? "page" : undefined}
            style={{
              ...styles.navItem,
              ...(activo.id === m.id ? styles.navItemActivo : {}),
              ...(soloIconos ? { justifyContent: "center", padding: "12px 0", width: "100%" } : {}),
            }}
          >
            <Icono size={16} aria-hidden="true" />
            {!soloIconos && (
              <>
                <span style={{ flex: 1 }}>{m.etiqueta}</span>
                {/* El atajo leído en voz alta no significa nada; la pista real ya va en el
                    `title`, así que para el lector este adorno se oculta. */}
                {m.atajo && (
                  <span style={styles.navAtajo} aria-hidden="true">
                    {m.atajo.replace("Alt+", "")}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </nav>
  );

  const Componente = activo.componente;
  const IconoActivo = activo.icono;

  return (
    <ProveedorAlertas>
      <div style={styles.root}>
        {/* Primer tabulador de la página: salta los módulos y va directo al contenido. Solo se
          ve cuando tiene el foco (§ .sfr-salto-contenido en estilos-globales.css). */}
        <a href="#contenido-principal" className="sfr-salto-contenido">
          Saltar al contenido
        </a>
        {!enCajon && nav}
        {enCajon && cajonAbierto && (
          <>
            <div
              onClick={() => setCajonAbierto(false)}
              aria-hidden="true"
              style={{ position: "fixed", inset: 0, background: "var(--sfr-overlay)", zIndex: 290 }}
            />
            {nav}
          </>
        )}

        {/* El padding se achica recién cuando el contenido ya se está apilando; en `medio` (barra en
          tira de iconos pero dos columnas todavía) el respiro de escritorio se mantiene. */}
        <main
          id="contenido-principal"
          style={{
            ...styles.main,
            ...(tramo === "compacto" || tramo === "movil" ? { padding: "12px 14px" } : {}),
          }}
        >
          <h2
            style={{
              ...styles.titulo,
              display: "flex",
              alignItems: "center",
              gap: 10,
              ...(enCajon ? { fontSize: 18, marginBottom: 14 } : {}),
            }}
          >
            {enCajon && (
              <button
                ref={botonMenuRef}
                onClick={() => setCajonAbierto(true)}
                aria-label="Abrir menú de módulos"
                aria-expanded={cajonAbierto}
                title="Menú"
                style={styles.botonMenu}
              >
                <Menu size={20} aria-hidden="true" />
              </button>
            )}
            <IconoActivo size={enCajon ? 18 : 22} aria-hidden="true" /> {activo.etiqueta}
          </h2>
          <ErrorBoundary key={activo.id}>
            <Componente />
          </ErrorBoundary>
        </main>
        {/* Ctrl+U, global sin importar el módulo activo (§ RBAC-07 parte C). Vive DENTRO
          de este `<ProveedorAlertas>` (montado arriba, no consumido por `AppShell`
          mismo) porque el modal necesita `useAlertas()` para el mensaje de bloqueo
          por ticket abierto. Ver la cabecera de `CambioRapidoUsuario.tsx`. */}
        <CambioRapidoUsuario />
        {/* Bloqueo por inactividad / Ctrl+L (§ RBAC-07 parte B). Mismo motivo que
          `CambioRapidoUsuario` para vivir acá: necesita `useAlertas()` para el PIN
          incorrecto, y no debe desmontar ningún módulo activo al bloquear. */}
        <BloqueoInactividad />
        {/* Cerrar sesión con turno abierto (§ CAJA): pide contar el efectivo ANTES de
          cerrar sesión de verdad — ver `manejarCerrarSesion`. */}
        {cerrandoTurno && estadoTurno.abierto && (
          <div style={styles.overlayModal} onClick={() => setCerrandoTurno(false)}>
            <div onClick={(e) => e.stopPropagation()}>
              <PromptCerrarTurno
                montoInicial={estadoTurno.abierto.monto_inicial}
                fechaApertura={estadoTurno.abierto.fecha_apertura}
                titulo="Cerrar turno para salir"
                onConfirmar={async (efectivoContado) => {
                  await corteCajaRepo.cerrarTurno({ efectivoContado });
                  setCerrandoTurno(false);
                  cerrarSesion();
                }}
                onCancelar={() => setCerrandoTurno(false)}
              />
            </div>
          </div>
        )}
        {/* Cerrar la ventana con turno abierto (§ CAJA, escritorio): ver el comentario junto
          a `registrarManejadorCierreVentana` arriba. */}
        {cerrandoParaSalirApp && estadoTurno.abierto && (
          <div style={styles.overlayModal} onClick={cancelarCierreApp}>
            <div onClick={(e) => e.stopPropagation()}>
              <PromptCerrarTurno
                montoInicial={estadoTurno.abierto.monto_inicial}
                fechaApertura={estadoTurno.abierto.fecha_apertura}
                titulo="Cerrar turno para salir de la aplicación"
                onConfirmar={async (efectivoContado) => {
                  await corteCajaRepo.cerrarTurno({ efectivoContado });
                  setCerrandoParaSalirApp(false);
                  resolverCierreAppRef.current?.("cerrar");
                  resolverCierreAppRef.current = null;
                }}
                onCancelar={cancelarCierreApp}
              />
            </div>
          </div>
        )}
      </div>
    </ProveedorAlertas>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    display: "flex",
    // `dvh` en vez de `vh`: en el navegador del teléfono la barra de direcciones se muestra y se
    // esconde al scrollear, y `100vh` (que no la cuenta) deja el final de la app tapado.
    height: "100dvh",
    fontFamily:
      "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: c.texto,
    background: c.fondo,
  },
  nav: {
    width: 216,
    flexShrink: 0,
    background: c.superficie,
    borderRight: `1px solid ${c.borde}`,
    padding: "16px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    boxShadow: "1px 0 3px rgba(15, 23, 42, 0.04)",
    overflowY: "auto",
  },
  marca: { padding: "4px 8px 20px", display: "flex", flexDirection: "column", gap: 10 },
  marcaTexto: { fontSize: 17, fontWeight: 700, letterSpacing: -0.2 },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    background: c.azulClaro,
    color: c.azulOscuro,
    borderRadius: 999,
    padding: "3px 10px",
  },
  cuenta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 8px 16px",
    marginBottom: 4,
    borderBottom: `1px solid ${c.borde}`,
  },
  cuentaNombre: {
    fontSize: 13,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cuentaRol: {
    fontSize: 11,
    color: c.gris,
  },
  botonTema: {
    background: "none",
    border: `1px solid ${c.borde}`,
    borderRadius: 999,
    width: 26,
    height: 26,
    fontSize: 13,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textAlign: "left",
    background: "none",
    border: "none",
    borderLeft: "3px solid transparent",
    borderRadius: 8,
    padding: "10px 11px",
    fontSize: 14,
    cursor: "pointer",
    color: c.gris,
  },
  navItemActivo: {
    background: c.azulClaro,
    borderLeft: `3px solid ${c.azul}`,
    color: c.azulOscuro,
    fontWeight: 600,
  },
  navAtajo: {
    fontSize: 11,
    color: c.gris,
    opacity: 0.7,
  },
  botonMenu: {
    background: "none",
    border: `1px solid ${c.borde}`,
    borderRadius: 8,
    width: 38,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: c.texto,
    padding: 0,
    flexShrink: 0,
  },
  // `minWidth: 0` es imprescindible, no cosmético: un hijo flex arranca con `min-width: auto`, o sea
  // que se NIEGA a achicarse por debajo del ancho de su contenido. Con la barra lateral en
  // `flexShrink: 0`, al angostar la ventana el <main> no cedía y el contenido se desbordaba hacia la
  // derecha — la columna de Totales quedaba cortada por la mitad mucho antes de que el breakpoint
  // llegara a esconder la barra.
  main: { flex: 1, minWidth: 0, minHeight: 0, padding: "24px 32px", overflow: "auto" },
  titulo: { marginTop: 0, marginBottom: 20, fontSize: 22, letterSpacing: -0.3 },
  // Compuerta de "abrir turno": pantalla completa, mismo tono que `pantallas/Acceso.tsx`
  // (zIndex 600 — por encima de cualquier `avisar()` en vuelo, mismo motivo que ahí).
  overlayCompleto: {
    position: "fixed",
    inset: 0,
    zIndex: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: `linear-gradient(160deg, ${c.azulOscuro}, #0f172a)`,
  },
  // "Cerrar turno" al salir: modal flotante sobre la app ya en uso, mismo nivel que
  // `CambioRapidoUsuario.tsx` (100 — por debajo de `useAlertas()` en 500).
  overlayModal: {
    position: "fixed",
    inset: 0,
    zIndex: 100,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "var(--sfr-overlay)",
    backdropFilter: "blur(2px)",
  },
};
