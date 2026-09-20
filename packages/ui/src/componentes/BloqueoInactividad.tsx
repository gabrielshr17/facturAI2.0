/**
 * Bloqueo de sesión por inactividad (§ RBAC-07 parte B).
 *
 * DECISIÓN DE PRODUCTO YA CONFIRMADA (ver plan/02-RBAC.md § RBAC-07): pasados 5
 * minutos sin actividad de mouse/teclado, la pantalla se BLOQUEA — no se cierra la
 * sesión ni se toca el ticket abierto en `Ventas.tsx`. Se desbloquea con el PIN del
 * MISMO usuario que la bloqueó, y solo entonces sigue exactamente donde estaba. Por
 * eso el temporizador vive en un componente flotante (igual que
 * `CambioRapidoUsuario.tsx`, ver la cabecera de ese archivo para el porqué de montarlo
 * dentro de `AppShell`/`<ProveedorAlertas>` y no en cada pantalla): un `return null`
 * mientras no está bloqueada, y un overlay `position: fixed` que se superpone sin
 * desmontar nada cuando sí lo está.
 *
 * DIFERENCIA CLAVE con `CambioRapidoUsuario`: ese modal deja elegir CUALQUIER usuario
 * activo; este NO tiene selector — valida el PIN contra `sesion.usuarioId`, el mismo
 * que ya tenía la sesión abierta. Reutiliza `usuarioRepo.autenticar` (ya prueba PIN
 * incorrecto/inactivo/bloqueado en `pin.test.ts`), nunca reimplementa esa validación.
 *
 * El temporizador en sí (cuándo bloquear, qué escuchar) vive en `useBloqueoInactividad`
 * — este componente solo lo consume y dibuja el modal. El atajo manual (`Ctrl+L`)
 * usa `useAtajosTeclado` como cualquier otro atajo de la app. Mientras está bloqueada,
 * este mismo componente apaga TODOS los atajos de pantalla llamando a
 * `establecerBloqueoGlobalAtajos` (ver la cabecera de `useAtajosTeclado.ts` para el
 * porqué de ese mecanismo en vez de un contexto/estado que causaría re-renders).
 *
 * `Esc` NO cierra este modal a propósito (criterio de aceptación de la tarea): un
 * bloqueo por inactividad que se puede descartar con una tecla no protege nada.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Delete, Lock, LogIn } from "lucide-react";
import { CriptoNoDisponibleError } from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { useSesion } from "../sesion/contexto.js";
import { useAlertas } from "../contexto/Alertas.js";
import { useModalAccesible } from "../hooks/useModalAccesible.js";
import { useAtajosTeclado, establecerBloqueoGlobalAtajos } from "../hooks/useAtajosTeclado.js";
import { useBloqueoInactividad } from "../hooks/useBloqueoInactividad.js";
import { c, s, sombra } from "../estilos.js";

const PIN_MAXIMO = 6;

/** Límite de inactividad antes del bloqueo automático (§ RBAC-07 parte B, decisión ya
 *  confirmada con el cliente: 5 minutos). */
const LIMITE_INACTIVIDAD_MINUTOS = 5;

const MENSAJE_POR_MOTIVO: Record<"pin_incorrecto" | "inactivo" | "bloqueado" | "sin_pin", string> = {
  pin_incorrecto: "El PIN no es correcto.",
  // `inactivo`/`bloqueado`/`sin_pin` no deberían poder pasar acá (el usuario que
  // desbloquea ya tenía una sesión activa con PIN definido), pero se cubren igual:
  // el tipo de `autenticar` los permite y un `Record` parcial dejaría pasar un
  // mensaje `undefined` a `avisar()`.
  inactivo: "Este usuario está desactivado. Pide a un dueño o superadmin que lo reactive.",
  bloqueado: "Demasiados intentos fallidos. Este usuario queda bloqueado temporalmente.",
  sin_pin: "Este usuario todavía no tiene PIN definido. Pide a un dueño que lo restablezca desde Personal.",
};

function mensajeDeError(error: unknown): string {
  if (error instanceof CriptoNoDisponibleError) return error.message;
  return "No se pudo completar la operación. Intenta de nuevo.";
}

export function BloqueoInactividad(): ReactElement | null {
  const { usuario: usuarioRepo } = useRepos();
  const { sesion } = useSesion();
  const { avisar } = useAlertas();

  // Sin sesión real (SESION_LOCAL, `usuarioId: null`) no hay a quién pedirle PIN, así
  // que el bloqueo automático queda apagado — es el caso de instalaciones/pruebas que
  // montan `<AppShell>` directo, sin pasar por `<Acceso>` (mismo criterio que usa
  // `AppShell.tsx` para la tarjeta de cuenta).
  const habilitado = sesion.usuarioId !== null;
  const { bloqueado, bloquearAhora, desbloquear } = useBloqueoInactividad(LIMITE_INACTIVIDAD_MINUTOS, habilitado);

  const [pin, setPin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [nombreUsuario, setNombreUsuario] = useState<string | null>(null);

  // Apaga TODOS los atajos de pantalla (Alt+1..9, Ctrl+S, Ctrl+U, etc.) mientras está
  // bloqueada — ver la cabecera de `useAtajosTeclado.ts`. Es un efecto, no una llamada
  // directa en el cuerpo, para que se ejecute solo en las transiciones y se limpie sola
  // si el componente llegara a desmontarse con el bloqueo activo.
  useEffect(() => {
    establecerBloqueoGlobalAtajos(bloqueado);
    return () => establecerBloqueoGlobalAtajos(false);
  }, [bloqueado]);

  // Atajo manual: bloquea de inmediato sin esperar el límite. Se apaga mientras ya
  // está bloqueada (`!bloqueado`) por la misma razón que `Ctrl+U` en
  // `CambioRapidoUsuario.tsx` se apaga mientras su propio modal ya está abierto.
  useAtajosTeclado({ "Ctrl+L": () => { if (habilitado) bloquearAhora(); } }, !bloqueado && habilitado);

  useEffect(() => {
    if (!bloqueado) {
      setPin("");
      return;
    }
    const id = sesion.usuarioId;
    if (id === null) return;
    let cancelado = false;
    void usuarioRepo.obtener(id).then((u) => {
      if (!cancelado) setNombreUsuario(u?.nombre ?? null);
    });
    return () => {
      cancelado = true;
    };
  }, [bloqueado, sesion.usuarioId, usuarioRepo]);

  async function intentarDesbloquear() {
    const id = sesion.usuarioId;
    if (id === null) {
      desbloquear();
      return;
    }
    setEnviando(true);
    try {
      const resultado = await usuarioRepo.autenticar({ usuarioId: id, pin });
      if (resultado.ok) {
        desbloquear();
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

  if (!bloqueado) return null;

  return (
    <div style={fondo}>
      <TecladoDesbloqueo
        nombreUsuario={nombreUsuario}
        pin={pin}
        deshabilitado={enviando}
        onCambiarPin={setPin}
        onConfirmar={() => void intentarDesbloquear()}
      />
    </div>
  );
}

interface TecladoDesbloqueoProps {
  nombreUsuario: string | null;
  pin: string;
  deshabilitado: boolean;
  onCambiarPin: (pin: string) => void;
  onConfirmar: () => void;
}

/** Mismo teclado táctil (≥44px) que `Acceso.tsx`/`CambioRapidoUsuario.tsx`, duplicado a
 *  propósito (ver la cabecera de `CambioRapidoUsuario.tsx`). A diferencia de esos dos,
 *  este NO escucha `Escape` para cerrar: el bloqueo por inactividad no se descarta con
 *  una tecla, esa es la razón de existir de esta pantalla. */
function TecladoDesbloqueo({ nombreUsuario, pin, deshabilitado, onCambiarPin, onConfirmar }: TecladoDesbloqueoProps) {
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
      }
      // Sin caso para "Escape": ver el comentario sobre `Esc` en la cabecera del archivo.
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pin, deshabilitado, onCambiarPin, onConfirmar]);

  return (
    <div ref={tarjetaRef} style={tarjeta} role="dialog" aria-modal="true" aria-labelledby="sfr-bloqueo-titulo">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span aria-hidden="true" style={iconoCirculo}>
          <Lock size={20} />
        </span>
        <h1 id="sfr-bloqueo-titulo" style={{ ...estiloTitulo, margin: 0 }}>Pantalla bloqueada</h1>
      </div>
      <p style={subtituloTexto}>
        {nombreUsuario ? `Ingresa el PIN de ${nombreUsuario} para continuar.` : "Ingresa tu PIN para continuar."}
      </p>

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
          aria-label="Desbloquear"
          onClick={onConfirmar}
        >
          <LogIn size={20} aria-hidden="true" />
        </button>
      </div>

      <div style={{ ...s.formFooter, justifyContent: "flex-end" }}>
        <button type="button" style={s.boton} disabled={deshabilitado || pin.length < 4} onClick={onConfirmar}>
          Desbloquear (Enter)
        </button>
      </div>
    </div>
  );
}

const fondo: CSSProperties = {
  position: "fixed",
  inset: 0,
  // 550: por encima de `useAlertas()` (500, § design-guidelines.md tabla de capas) a
  // propósito — si el bloqueo se dispara mientras hay un aviso en pantalla (p. ej. un
  // error de guardado), proteger la pantalla tiene que ganar: el bloqueo tapa el aviso,
  // no al revés. El aviso no se pierde, solo queda detrás hasta que se desbloquea.
  zIndex: 550,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "var(--sfr-overlay)",
  backdropFilter: "blur(4px)",
};

const tarjeta: CSSProperties = {
  ...s.tarjeta,
  width: 380,
  maxWidth: "100%",
  maxHeight: "92dvh",
  overflow: "auto",
  boxShadow: sombra.md,
  borderTop: `5px solid ${c.azul}`,
};

const estiloTitulo: CSSProperties = { fontSize: 20, margin: "0 0 4px", letterSpacing: -0.3 };

const subtituloTexto: CSSProperties = { margin: "0 0 16px", fontSize: 14, color: c.gris };

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

/** ≥44px de alto y ancho: objetivo táctil mínimo, igual que `Acceso.tsx`. */
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
