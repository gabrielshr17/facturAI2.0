/**
 * Cambio rápido de usuario en el punto de venta (§ RBAC-07, parte C).
 *
 * POR QUÉ VIVE AQUÍ Y NO EN `AppShell.tsx` NI EN `Ventas.tsx`: el atajo (`Ctrl+U`)
 * tiene que funcionar "sin importar qué módulo esté activo" (encargo de la tarea),
 * así que no puede vivir dentro de `Ventas.tsx` — se perdería en cuanto el cajero
 * estuviera en otra pantalla. Tampoco se cablea a mano dentro de `AppShell.tsx`
 * porque ese archivo ya está en la lista de "archivos calientes" de
 * `00-CONVENCIONES.md` (cinco áreas lo editan en los mismos puntos) y porque
 * `AppShell` es quien MONTA `<ProveedorAlertas>` — no quien lo CONSUME — así que
 * `useAlertas()` no puede llamarse desde el cuerpo de `AppShell` mismo, solo desde
 * un componente hijo suyo. Se monta este componente una sola vez dentro del árbol
 * de `AppShell` (adentro de su `<ProveedorAlertas>`) y encapsula atajo + guardia +
 * modal en un solo lugar, sin tocar los cuatro puntos cableados de `AppShell`.
 *
 * No desmonta `Ventas` ni ningún otro módulo: es un `return null` mientras el modal
 * está cerrado, y el modal mismo es un overlay `position: fixed` que se superpone,
 * nunca un reemplazo del árbol activo — el estado de un ticket en construcción en
 * `Ventas.tsx` vive en SU PROPIO estado de React, ajeno a este componente, así que
 * abrir/cerrar/cancelar este modal nunca lo toca.
 *
 * REGLA DE NEGOCIO (decisión ya confirmada con el dueño, ver
 * `packages/core/src/dominio/cambio-usuario.ts`): antes de mostrar el selector de
 * usuario se llama a `facturaRepo.listarAbiertos()` y se evalúa con
 * `evaluarCambioUsuario`. Si hay algún ticket abierto CON CONTENIDO, el cambio se
 * bloquea por completo con un aviso — nunca se abre el selector. La regla en sí no
 * se reimplementa aquí, solo se invoca.
 *
 * El selector de usuario + teclado de PIN IMITA el patrón de `pantallas/Acceso.tsx`
 * (no lo reutiliza: `Acceso` reemplaza a `AppShell` entero mientras no hay sesión,
 * este componente es un modal FLOTANTE sobre una sesión ya activa, con reglas de
 * cierre/cancelación distintas) — se duplica el teclado numérico a propósito: es un
 * pedazo pequeño de UI y forzar una extracción compartida con `Acceso.tsx` habría
 * significado tocar un archivo que el encargo pide no editar salvo necesidad real.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Delete, LogIn, User as IconoUsuario, UserCog } from "lucide-react";
import { CriptoNoDisponibleError, evaluarCambioUsuario, type Usuario } from "@sfr/core";
import { useRepos } from "../data/contexto.js";
import { useSesion } from "../sesion/contexto.js";
import { useAlertas } from "../contexto/Alertas.js";
import { useModalAccesible } from "../hooks/useModalAccesible.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { c, s, sombra } from "../estilos.js";

const PIN_MAXIMO = 6;

const ETIQUETA_ROL: Record<string, string> = {
  cajero: "Cajero",
  supervisor: "Supervisor",
  dueno: "Dueño",
  superadmin: "Superadmin",
};

const MENSAJE_POR_MOTIVO: Record<"pin_incorrecto" | "inactivo" | "bloqueado" | "sin_pin", string> = {
  pin_incorrecto: "El PIN no es correcto.",
  inactivo: "Este usuario está desactivado. Pide a un dueño o superadmin que lo reactive.",
  bloqueado: "Demasiados intentos fallidos. Este usuario queda bloqueado temporalmente.",
  // `sin_pin` no debería poder pasar aquí (solo ocurre en el primer login de un
  // usuario, que ya tuvo que pasar por `Acceso.tsx` para existir con sesión activa),
  // pero se cubre el motivo igual: el tipo de `autenticar` lo permite y un `Record`
  // parcial dejaría pasar un mensaje `undefined` a `avisar()`.
  sin_pin: "Este usuario todavía no tiene PIN definido. Pide a un dueño que lo restablezca desde Personal.",
};

function mensajeDeError(error: unknown): string {
  if (error instanceof CriptoNoDisponibleError) return error.message;
  return "No se pudo completar la operación. Intenta de nuevo.";
}

export function CambioRapidoUsuario(): ReactElement | null {
  const { usuario: usuarioRepo, factura: facturaRepo } = useRepos();
  const { sesion, iniciarSesion } = useSesion();
  const { avisar } = useAlertas();

  const [abierto, setAbierto] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [seleccionado, setSeleccionado] = useState<Usuario | null>(null);
  const [pin, setPin] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function abrir() {
    const abiertos = await facturaRepo.listarAbiertos();
    const evaluacion = evaluarCambioUsuario(abiertos);
    if (!evaluacion.permitido) {
      await avisar(evaluacion.mensaje ?? "No se puede cambiar de usuario en este momento.");
      return;
    }
    setUsuarios(null);
    setSeleccionado(null);
    setPin("");
    setAbierto(true);
    try {
      const lista = await usuarioRepo.listar();
      setUsuarios(lista.filter((u) => u.activo === 1));
    } catch (error) {
      setAbierto(false);
      await avisar(mensajeDeError(error));
    }
  }

  function cerrar() {
    setAbierto(false);
    setSeleccionado(null);
    setPin("");
  }

  // Atajo global: funciona sin importar qué módulo esté activo. Se apaga mientras el
  // modal ya está abierto (`activo = !abierto`) para no relanzar `abrir()` — que
  // volvería a consultar `listarAbiertos()` y a resetear la selección — en cada
  // Ctrl+U repetido mientras el cajero ya está eligiendo usuario.
  useAtajosTeclado({ "Ctrl+U": () => void abrir() }, !abierto);
  useAtajosTeclado({ Escape: cerrar }, abierto);

  async function intentarLogin(usuarioId: string, pinIngresado: string) {
    setEnviando(true);
    try {
      const resultado = await usuarioRepo.autenticar({ usuarioId, pin: pinIngresado });
      if (resultado.ok) {
        iniciarSesion({ usuarioId: resultado.usuario.id, rol: resultado.usuario.rol, permisos: resultado.permisos });
        cerrar();
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

  if (!abierto) return null;

  return (
    <div style={fondo} onClick={cerrar}>
      <div onClick={(e) => e.stopPropagation()}>
        {usuarios === null && (
          <div style={tarjeta}>
            <p style={{ margin: 0, color: c.texto }}>Cargando usuarios…</p>
          </div>
        )}

        {usuarios !== null && !seleccionado && (
          <SeleccionUsuario
            usuarios={usuarios}
            usuarioActualId={sesion.usuarioId}
            onElegir={setSeleccionado}
            onCancelar={cerrar}
          />
        )}

        {seleccionado && (
          <TecladoPin
            titulo={`Cambiar a ${seleccionado.nombre}`}
            subtitulo={ETIQUETA_ROL[seleccionado.rol] ?? seleccionado.rol}
            pin={pin}
            deshabilitado={enviando}
            onCambiarPin={setPin}
            onCancelar={() => setSeleccionado(null)}
            onConfirmar={() => intentarLogin(seleccionado.id, pin)}
          />
        )}
      </div>
    </div>
  );
}

function SeleccionUsuario({
  usuarios,
  usuarioActualId,
  onElegir,
  onCancelar,
}: {
  usuarios: Usuario[];
  usuarioActualId: string | null;
  onElegir: (u: Usuario) => void;
  onCancelar: () => void;
}) {
  const tarjetaRef = useModalAccesible<HTMLDivElement>();
  return (
    <div ref={tarjetaRef} style={tarjeta} role="dialog" aria-modal="true" aria-labelledby="sfr-cambio-usuario-titulo">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span aria-hidden="true" style={iconoCirculo}>
          <UserCog size={20} />
        </span>
        <h1 id="sfr-cambio-usuario-titulo" style={{ ...estiloTitulo, margin: 0 }}>Cambiar de usuario</h1>
      </div>
      <p style={subtituloTexto}>¿Quién va a usar la caja ahora?</p>
      {usuarios.length === 0 && (
        <p style={{ ...subtituloTexto, color: c.rojo }}>No hay usuarios activos disponibles.</p>
      )}
      <ul style={listaUsuarios} aria-label="Selección de usuario">
        {usuarios.map((u) => (
          <li key={u.id}>
            <button style={botonUsuario} onClick={() => onElegir(u)}>
              <span style={iconoUsuario} aria-hidden="true">
                <IconoUsuario size={20} />
              </span>
              <span style={{ flex: 1, textAlign: "left" }}>
                <div style={{ fontWeight: 600 }}>
                  {u.nombre}
                  {u.id === usuarioActualId ? " (activo)" : ""}
                </div>
                <div style={{ fontSize: 12.5, color: c.gris }}>{ETIQUETA_ROL[u.rol] ?? u.rol}</div>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div style={{ ...s.formFooter, justifyContent: "flex-end" }}>
        <button type="button" style={s.botonSecundario} onClick={onCancelar}>
          Cancelar (Esc)
        </button>
      </div>
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
}

/** Mismo teclado táctil (≥44px) que `Acceso.tsx`, duplicado a propósito — ver cabecera del archivo. */
function TecladoPin({ titulo, subtitulo, pin, deshabilitado, onCambiarPin, onCancelar, onConfirmar }: TecladoPinProps) {
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
    <div ref={tarjetaRef} style={tarjeta} role="dialog" aria-modal="true" aria-label={titulo}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span aria-hidden="true" style={iconoCirculo}>
          <UserCog size={20} />
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
  // 100: mismo nivel que "un modal nuevo entra en 100 salvo que tenga que aparecer
  // sobre otro" (design-guidelines.md, tabla de capas). A propósito POR DEBAJO de
  // `useAlertas()` (500): un PIN incorrecto dispara `avisar()` desde DENTRO de este
  // modal, y ese aviso tiene que verse encima, no taparse detrás del propio modal
  // que lo generó.
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "var(--sfr-overlay)",
  backdropFilter: "blur(2px)",
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

const listaUsuarios: CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxHeight: "50dvh",
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
