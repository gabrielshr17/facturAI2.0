/**
 * Pantalla de acceso por PIN (§ RBAC-05).
 *
 * Reemplaza a `<AppShell>` ENTERO mientras no hay sesión activa (la decide
 * `packages/web/src/main.tsx` / `packages/desktop/src/main.tsx` mirando
 * `useSesion().autenticado`) — no es un modal sobre la app, por eso no usa
 * `role="dialog"`, pero SÍ usa `useModalAccesible()` para atrapar el `Tab` dentro de
 * la tarjeta (misma pieza que usan los modales de `useAlertas()`, no se reinventa
 * nada) porque, igual que un modal, es el único contenido operable de la pantalla y
 * no hay nada útil detrás a lo que el foco deba poder escaparse. El `zIndex: 600`
 * (por encima de `useAlertas()` en 500, ver `design-guidelines.md`) es a propósito:
 * una instalación recién actualizada puede tener un `avisar()` en vuelo (p. ej. un
 * error de red disparado antes del primer render) y esta pantalla debe quedar POR
 * ENCIMA de ese aviso, no debajo.
 *
 * Ninguna regla de autenticación se reimplementa aquí: los mensajes de error salen
 * TAL CUAL del campo `motivo` de `usuarioRepo.autenticar` (`pin_incorrecto` /
 * `inactivo` / `bloqueado` / `sin_pin`). El único camino de "primer arranque" es
 * `motivo === 'sin_pin'`: la pantalla pide definir un PIN nuevo con
 * `usuarioRepo.cambiarPin({ omitirPinActual: true })`, porque no hay PIN actual que
 * confirmar. `CriptoNoDisponibleError` (lanzado por `@sfr/core` cuando
 * `crypto.subtle` no existe — PWA servida por `http://` en la LAN) se atrapa
 * explícitamente y se muestra con un mensaje accionable; no hay catch vacío
 * (CLAUDE.md §4).
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Delete, LogIn, User as IconoUsuario, KeyRound, ShieldAlert } from "lucide-react";
import { CriptoNoDisponibleError, type Usuario } from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { useSesion } from "../sesion/contexto.js";
import { ProveedorAlertas, useAlertas } from "../contexto/Alertas.js";
import { useModalAccesible } from "../hooks/useModalAccesible.js";
import { c, s, sombra } from "../estilos.js";

const PIN_MAXIMO = 6;

const ETIQUETA_ROL: Record<string, string> = {
  cajero: "Cajero",
  supervisor: "Supervisor",
  dueno: "Dueño",
  superadmin: "Superadmin",
};

const MENSAJE_POR_MOTIVO: Record<"pin_incorrecto" | "inactivo" | "bloqueado", string> = {
  pin_incorrecto: "El PIN no es correcto.",
  inactivo: "Este usuario está desactivado. Pide a un dueño o superadmin que lo reactive.",
  bloqueado: "Demasiados intentos fallidos. Este usuario queda bloqueado temporalmente.",
};

function mensajeDeError(error: unknown): string {
  if (error instanceof CriptoNoDisponibleError) return error.message;
  return "No se pudo completar la operación. Intenta de nuevo.";
}

/**
 * Envuelve `<AccesoInterno>` en su PROPIO `<ProveedorAlertas>`: a diferencia de
 * `AppShell` (que ya vive dentro del árbol que monta el suyo), `<Acceso>` puede
 * renderizarse SOLO, sin ningún `AppShell` como hermano — es el caso real en
 * `main.tsx` mientras no hay sesión — así que necesita su propio proveedor de
 * alertas para que `useAlertas()` no lance.
 */
export function Acceso(): ReactElement {
  return (
    <ProveedorAlertas>
      <AccesoInterno />
    </ProveedorAlertas>
  );
}

function AccesoInterno(): ReactElement {
  const { usuario } = useRepos();
  const { iniciarSesion } = useSesion();
  const { avisar } = useAlertas();

  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [seleccionado, setSeleccionado] = useState<Usuario | null>(null);
  const [pin, setPin] = useState("");
  const [pinNuevo, setPinNuevo] = useState("");
  const [definiendoPin, setDefiniendoPin] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const lista = await usuario.listar();
        if (!cancelado) setUsuarios(lista.filter((u) => u.activo === 1));
      } catch (error) {
        if (!cancelado) avisar(mensajeDeError(error));
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function volverASeleccion() {
    setSeleccionado(null);
    setPin("");
    setPinNuevo("");
    setDefiniendoPin(false);
  }

  async function intentarLogin(usuarioId: string, pinIngresado: string) {
    setEnviando(true);
    try {
      const resultado = await usuario.autenticar({ usuarioId, pin: pinIngresado });
      if (resultado.ok) {
        iniciarSesion({ usuarioId: resultado.usuario.id, rol: resultado.usuario.rol, permisos: resultado.permisos });
        return;
      }
      if (resultado.motivo === "sin_pin") {
        setDefiniendoPin(true);
        setPin("");
        return;
      }
      await avisar(MENSAJE_POR_MOTIVO[resultado.motivo]);
      setPin("");
    } catch (error) {
      await avisar(mensajeDeError(error));
      setPin("");
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarPinNuevo(usuarioId: string, nuevoPin: string) {
    setEnviando(true);
    try {
      await usuario.cambiarPin({ usuarioId, pinNuevo: nuevoPin, omitirPinActual: true });
      await intentarLogin(usuarioId, nuevoPin);
    } catch (error) {
      await avisar(mensajeDeError(error));
      setPinNuevo("");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={fondo}>
      {usuarios === null && <p style={{ color: "white" }}>Cargando usuarios…</p>}

      {usuarios !== null && !seleccionado && (
        <SeleccionUsuario usuarios={usuarios} onElegir={setSeleccionado} />
      )}

      {seleccionado && !definiendoPin && (
        <TecladoPin
          titulo={`Hola, ${seleccionado.nombre}`}
          subtitulo={ETIQUETA_ROL[seleccionado.rol] ?? seleccionado.rol}
          pin={pin}
          deshabilitado={enviando}
          onCambiarPin={setPin}
          onCancelar={volverASeleccion}
          onConfirmar={() => intentarLogin(seleccionado.id, pin)}
        />
      )}

      {seleccionado && definiendoPin && (
        <TecladoPin
          titulo="Define tu PIN"
          subtitulo={`Es la primera vez que ${seleccionado.nombre} inicia sesión. Elige un PIN de 4 a 6 dígitos.`}
          pin={pinNuevo}
          deshabilitado={enviando}
          onCambiarPin={setPinNuevo}
          onCancelar={volverASeleccion}
          onConfirmar={() => confirmarPinNuevo(seleccionado.id, pinNuevo)}
          icono={KeyRound}
          zIndexTarjeta={650}
        />
      )}
    </div>
  );
}

function SeleccionUsuario({ usuarios, onElegir }: { usuarios: Usuario[]; onElegir: (u: Usuario) => void }) {
  const tarjetaRef = useModalAccesible<HTMLDivElement>();
  return (
    <div ref={tarjetaRef} style={tarjeta}>
      <h1 style={estiloTitulo}>facturAI</h1>
      <p style={subtituloTexto}>¿Quién va a usar la caja?</p>
      {usuarios.length === 0 && (
        <p style={{ ...subtituloTexto, color: c.rojo }}>
          No hay usuarios activos. Pide a un superadmin que reactive uno.
        </p>
      )}
      <ul style={listaUsuarios} aria-label="Selección de usuario">
        {usuarios.map((u) => (
          <li key={u.id}>
            <button style={botonUsuario} onClick={() => onElegir(u)}>
              <span style={iconoUsuario} aria-hidden="true">
                <IconoUsuario size={20} />
              </span>
              <span style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontWeight: 600 }}>{u.nombre}</div>
                <div style={{ fontSize: 12.5, color: c.gris }}>{ETIQUETA_ROL[u.rol] ?? u.rol}</div>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface TecladoPinProps {
  titulo: string;
  subtitulo: string;
  pin: string;
  deshabilitado: boolean;
  onCambiarPin: (pin: string) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
  icono?: typeof ShieldAlert;
  zIndexTarjeta?: number;
}

/**
 * Teclado numérico grande (§ criterio de aceptación: objetivos táctiles ≥44px) que
 * también funciona con el teclado físico: los dígitos 0-9, Retroceso y Enter se
 * capturan con un `keydown` global mientras este componente está montado, sin pasar
 * por `useAtajosTeclado` (que hace `preventDefault()` sobre teclas que SÍ hay que
 * poder escribir en cualquier `<input>` normal si algún día este teclado convive con
 * uno — hoy no hay ningún input de texto en esta pantalla, pero capturar aquí en vez
 * de sumar otra tecla al mapa global evita ese acoplamiento).
 */
function TecladoPin({ titulo, subtitulo, pin, deshabilitado, onCambiarPin, onCancelar, onConfirmar, icono: Icono = ShieldAlert, zIndexTarjeta }: TecladoPinProps) {
  const tarjetaRef = useModalAccesible<HTMLDivElement>();
  const primerBotonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primerBotonRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (deshabilitado) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        if (pin.length < PIN_MAXIMO) onCambiarPin(pin + e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        onCambiarPin(pin.slice(0, -1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (pin.length >= 4) onConfirmar();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancelar();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pin, deshabilitado, onCambiarPin, onConfirmar, onCancelar]);

  return (
    <div ref={tarjetaRef} style={{ ...tarjeta, ...(zIndexTarjeta ? { zIndex: zIndexTarjeta } : {}) }} role="group" aria-label={titulo}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span aria-hidden="true" style={iconoCirculo}>
          <Icono size={20} />
        </span>
        <h1 style={{ ...estiloTitulo, margin: 0 }}>{titulo}</h1>
      </div>
      <p style={subtituloTexto}>{subtitulo}</p>

      <div style={puntosPin} aria-label={`PIN, ${pin.length} de ${PIN_MAXIMO} dígitos`}>
        {Array.from({ length: PIN_MAXIMO }).map((_, i) => (
          <span key={i} style={{ ...punto, ...(i < pin.length ? puntoLleno : {}) }} />
        ))}
      </div>

      <div style={grillaTeclado}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d, i) => (
          <button
            key={d}
            ref={i === 0 ? primerBotonRef : undefined}
            type="button"
            style={botonTecla}
            disabled={deshabilitado}
            onClick={() => pin.length < PIN_MAXIMO && onCambiarPin(pin + d)}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          style={botonTecla}
          disabled={deshabilitado}
          aria-label="Borrar último dígito"
          onClick={() => onCambiarPin(pin.slice(0, -1))}
        >
          <Delete size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          style={botonTecla}
          disabled={deshabilitado}
          onClick={() => pin.length < PIN_MAXIMO && onCambiarPin(pin + "0")}
        >
          0
        </button>
        <button
          type="button"
          style={{ ...botonTecla, background: c.azul, color: "white" }}
          disabled={deshabilitado || pin.length < 4}
          aria-label="Entrar"
          onClick={onConfirmar}
        >
          <LogIn size={20} aria-hidden="true" />
        </button>
      </div>

      <div style={{ ...s.formFooter, justifyContent: "space-between" }}>
        <button type="button" style={s.botonSecundario} onClick={onCancelar}>
          Cambiar de usuario (Esc)
        </button>
        <button type="button" style={s.boton} disabled={deshabilitado || pin.length < 4} onClick={onConfirmar}>
          Entrar (Enter)
        </button>
      </div>
    </div>
  );
}

const fondo: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: `linear-gradient(160deg, ${c.azulOscuro}, #0f172a)`,
};

const tarjeta: CSSProperties = {
  ...s.tarjeta,
  width: 380,
  maxWidth: "100%",
  maxHeight: "92dvh",
  overflow: "auto",
  boxShadow: sombra.md,
};

const estiloTitulo: CSSProperties = { fontSize: 22, margin: "0 0 4px", letterSpacing: -0.3 };

const subtituloTexto: CSSProperties = { margin: "0 0 16px", fontSize: 14, color: c.gris };

const listaUsuarios: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxHeight: "60dvh",
  overflowY: "auto",
};

const botonUsuario: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  minHeight: 56,
  padding: "10px 14px",
  background: c.fondo,
  border: `1px solid ${c.borde}`,
  borderRadius: 10,
  cursor: "pointer",
  color: c.texto,
};

const iconoUsuario: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: c.azulClaro,
  color: c.azulOscuro,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const iconoCirculo: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: c.azulClaro,
  color: c.azulOscuro,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const puntosPin: CSSProperties = {
  display: "flex",
  gap: 10,
  justifyContent: "center",
  margin: "18px 0",
};

const punto: CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: "50%",
  border: `2px solid ${c.borde}`,
  background: "transparent",
};

const puntoLleno: CSSProperties = {
  background: c.azul,
  borderColor: c.azul,
};

const grillaTeclado: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
};

/** ≥44px de alto y ancho: objetivo táctil mínimo (criterio de aceptación). */
const botonTecla: CSSProperties = {
  minHeight: 52,
  minWidth: 44,
  fontSize: 20,
  fontWeight: 600,
  borderRadius: 10,
  border: `1px solid ${c.borde}`,
  background: c.superficie,
  color: c.texto,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
