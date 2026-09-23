/**
 * Tarjetas de "abrir turno" / "cerrar turno" (§ CAJA), compartidas por los tres
 * puntos donde el ciclo de turno se engancha a la sesión: login (`Acceso.tsx`),
 * logout (`AppShell.tsx`) y cambio rápido de usuario (`CambioRapidoUsuario.tsx`).
 *
 * Son solo el CONTENIDO de la tarjeta (icono + título + input + botones), sin
 * el overlay/fondo alrededor: cada pantalla ya tiene su propio patrón de overlay
 * (`Acceso.tsx` ya está a pantalla completa; `AppShell`/`CambioRapidoUsuario`
 * necesitan un overlay flotante) y duplicar ese contenedor aquí solo forzaría un
 * prop más para algo que el que llama ya sabe hacer. Reutilizan `s.tarjeta`
 * (`estilos.ts`) para que se vean igual que el resto de la app.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { Banknote, LogOut as IconoCerrar } from "lucide-react";
import { ValidacionError } from "@sfr/core";
import { useModalAccesible } from "../hooks/useModalAccesible.js";
import { filtrarNumero, filtrarEntero } from "../utilidades/numero.js";
import { c, s } from "../estilos.js";

/** Denominaciones de RD$ en circulación (§ arqueo por denominación): monedas y billetes. */
const MONEDAS = [1, 5, 10, 25] as const;
const BILLETES = [50, 100, 200, 500, 1000, 2000] as const;

function mensajeDeError(error: unknown): string {
  if (error instanceof ValidacionError) return error.errores.map((e) => e.mensaje).join(" ");
  return "No se pudo completar la operación. Intenta de nuevo.";
}

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

const estiloTitulo: CSSProperties = { fontSize: 20, margin: "0 0 4px", letterSpacing: -0.3 };
const subtituloTexto: CSSProperties = { margin: "0 0 16px", fontSize: 14, color: c.gris };

export interface PromptAbrirTurnoProps {
  /** Nombre a mostrar en el título ("Hola, {nombre}"), si ya se conoce. */
  nombreUsuario?: string;
  onConfirmar: (montoInicial: number) => Promise<void>;
  onCancelar?: () => void;
}

/** Paso "abrir turno": pide el fondo de caja inicial antes de dejar entrar a Ventas. */
export function PromptAbrirTurno({
  nombreUsuario,
  onConfirmar,
  onCancelar,
}: PromptAbrirTurnoProps): ReactElement {
  const tarjetaRef = useModalAccesible<HTMLDivElement>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [monto, setMonto] = useState("0");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  async function confirmar() {
    setError(null);
    setEnviando(true);
    try {
      await onConfirmar(Number(monto) || 0);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div ref={tarjetaRef} style={s.tarjeta} role="group" aria-label="Abrir turno de caja">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span aria-hidden="true" style={iconoCirculo}>
          <Banknote size={20} />
        </span>
        <h1 style={{ ...estiloTitulo, margin: 0 }}>
          {nombreUsuario ? `Hola, ${nombreUsuario}` : "Abrir turno"}
        </h1>
      </div>
      <p style={subtituloTexto}>¿Con cuánto efectivo empieza la caja?</p>

      <label style={s.label} htmlFor="sfr-fondo-inicial">
        Fondo de caja inicial
      </label>
      <input
        id="sfr-fondo-inicial"
        ref={inputRef}
        style={s.input}
        type="text"
        inputMode="decimal"
        value={monto}
        disabled={enviando}
        onChange={(e) => setMonto(filtrarNumero(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") void confirmar();
        }}
      />

      {error && (
        <div role="alert" style={s.errorBox}>
          {error}
        </div>
      )}

      <div style={{ ...s.formFooter, justifyContent: onCancelar ? "space-between" : "flex-end" }}>
        {onCancelar && (
          <button type="button" style={s.botonSecundario} onClick={onCancelar} disabled={enviando}>
            Cancelar
          </button>
        )}
        <button type="button" style={s.boton} onClick={confirmar} disabled={enviando}>
          Abrir turno
        </button>
      </div>
    </div>
  );
}

export interface PromptCerrarTurnoProps {
  /** Fondo con el que abrió el turno, para mostrarlo como referencia (no editable aquí). */
  montoInicial: number;
  /** Quién abrió el turno, si difiere de quien lo está cerrando ahora. */
  nombreApertura?: string | null;
  titulo?: string;
  onConfirmar: (efectivoContado: number) => Promise<void>;
  onCancelar?: () => void;
}

type Denominacion = (typeof MONEDAS)[number] | (typeof BILLETES)[number];

function cantidadesVacias(): Record<Denominacion, string> {
  const vacio = {} as Record<Denominacion, string>;
  for (const d of [...MONEDAS, ...BILLETES]) vacio[d] = "";
  return vacio;
}

/**
 * Paso "cerrar turno": arqueo ciego por denominación (§ buena práctica, no configurable) — se
 * cuenta cuánto hay de cada moneda/billete, y el total NUNCA se muestra en esta pantalla, ni
 * mientras se cuenta ni después de enviar (el cajero se entera al cerrar sesión/cambiar de
 * usuario, no aquí; el supervisor lo ve en Corte de Caja). Solo se envía la suma calculada —
 * `onConfirmar` sigue recibiendo un solo número, igual que antes.
 */
export function PromptCerrarTurno({
  montoInicial,
  nombreApertura,
  titulo = "Cerrar turno",
  onConfirmar,
  onCancelar,
}: PromptCerrarTurnoProps): ReactElement {
  const tarjetaRef = useModalAccesible<HTMLDivElement>();
  const primerInputRef = useRef<HTMLInputElement>(null);
  const [cantidades, setCantidades] = useState<Record<Denominacion, string>>(cantidadesVacias);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    primerInputRef.current?.focus();
  }, []);

  async function confirmar() {
    setError(null);
    setEnviando(true);
    try {
      const efectivoContado = [...MONEDAS, ...BILLETES].reduce(
        (suma, denom) => suma + denom * (Number(cantidades[denom]) || 0),
        0,
      );
      await onConfirmar(efectivoContado);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setEnviando(false);
    }
  }

  function celdaDenominacion(denom: Denominacion, primera: boolean) {
    return (
      <div key={denom}>
        <label style={{ ...s.label, fontSize: 12.5 }} htmlFor={`sfr-denom-${denom}`}>
          RD$ {denom}
        </label>
        <input
          id={`sfr-denom-${denom}`}
          ref={primera ? primerInputRef : undefined}
          style={s.input}
          type="text"
          inputMode="numeric"
          placeholder="0"
          value={cantidades[denom]}
          disabled={enviando}
          onChange={(e) =>
            setCantidades((prev) => ({ ...prev, [denom]: filtrarEntero(e.target.value) }))
          }
        />
      </div>
    );
  }

  return (
    <div ref={tarjetaRef} style={{ ...s.tarjeta, width: 380 }} role="group" aria-label={titulo}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span aria-hidden="true" style={iconoCirculo}>
          <IconoCerrar size={20} />
        </span>
        <h1 style={{ ...estiloTitulo, margin: 0 }}>{titulo}</h1>
      </div>
      <p style={subtituloTexto}>
        Cuenta cuántas monedas y billetes de cada tipo hay en caja
        {nombreApertura ? ` (turno abierto por ${nombreApertura})` : ""}.
      </p>
      <p style={{ ...subtituloTexto, marginTop: -10 }}>
        Fondo inicial: RD$ {montoInicial.toFixed(2)}
      </p>

      <p style={{ ...s.label, marginBottom: 4 }}>Monedas</p>
      <div style={gridDenominaciones}>
        {MONEDAS.map((d) => celdaDenominacion(d, d === MONEDAS[0]))}
      </div>

      <p style={{ ...s.label, marginTop: 12, marginBottom: 4 }}>Billetes</p>
      <div style={gridDenominaciones}>{BILLETES.map((d) => celdaDenominacion(d, false))}</div>

      {error && (
        <div role="alert" style={{ ...s.errorBox, marginTop: 12 }}>
          {error}
        </div>
      )}

      <div style={{ ...s.formFooter, justifyContent: onCancelar ? "space-between" : "flex-end" }}>
        {onCancelar && (
          <button type="button" style={s.botonSecundario} onClick={onCancelar} disabled={enviando}>
            Cancelar
          </button>
        )}
        <button type="button" style={s.boton} onClick={confirmar} disabled={enviando}>
          Cerrar turno
        </button>
      </div>
    </div>
  );
}

const gridDenominaciones: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
};
