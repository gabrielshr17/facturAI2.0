import { useEffect, useState, useCallback, useRef } from "react";
import {
  type CorteCaja as CorteCajaTipo,
  type ResumenPeriodoVentas,
  type Usuario,
  ValidacionError,
} from "@sfr/core";
import { ChartColumn, Banknote, ClipboardList, ShieldCheck } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { PromptCerrarTurno } from "../componentes/TarjetasTurno.js";
import { useModalAccesible } from "../hooks/useModalAccesible.js";
import { filtrarNumero } from "../utilidades/numero.js";
import { s, c, money } from "../estilos.js";

/**
 * Corte de caja: ahora es una pantalla de SUPERVISIÓN, no el punto donde se abre o
 * cierra el turno del día a día — eso pasa solo por el login/logout y el cambio
 * rápido de usuario (§ CAJA, ver `AppShell.tsx` y `CambioRapidoUsuario.tsx`). Esta
 * pantalla muestra el turno abierto en vivo, permite un cierre forzado (recuperación
 * de un turno que quedó abierto, p. ej. tras un cierre inesperado de la app) y lista
 * el historial de turnos ya cerrados.
 */
export function CorteCaja() {
  const { corteCaja: repo, usuario: usuarioRepo } = useRepos();

  const [turno, setTurno] = useState<CorteCajaTipo | null | undefined>(undefined);
  const [resumen, setResumen] = useState<ResumenPeriodoVentas | null>(null);
  const [historial, setHistorial] = useState<CorteCajaTipo[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [mostrandoCierre, setMostrandoCierre] = useState(false);
  const [verificando, setVerificando] = useState<{
    corte: CorteCajaTipo;
    metodo: "tarjeta" | "transferencia";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarTurno = useCallback(async () => {
    const abierto = await repo.turnoAbierto();
    setTurno(abierto);
    if (abierto) {
      setResumen(await repo.calcularResumen(abierto.fecha_apertura, new Date().toISOString()));
    } else {
      setResumen(null);
    }
  }, [repo]);

  const cargarHistorial = useCallback(async () => {
    setHistorial(await repo.listar());
  }, [repo]);

  useEffect(() => {
    void usuarioRepo.listar().then(setUsuarios);
  }, [usuarioRepo]);

  useEffect(() => {
    void cargarTurno();
  }, [cargarTurno]);
  useEffect(() => {
    void cargarHistorial();
  }, [cargarHistorial]);

  function nombreDe(usuarioId: string | null): string {
    if (!usuarioId) return "—";
    return usuarios.find((u) => u.id === usuarioId)?.nombre ?? "Usuario eliminado";
  }

  /** Celda de la columna Tarjeta/Transferencia del historial: "—" si ese turno no tuvo ventas
   *  por ese método, un botón "Verificar" si tuvo pero nadie lo verificó todavía, o el monto
   *  verificado + su diferencia (con un "Editar" para corregirlo) una vez verificado. */
  function celdaVerificacion(h: CorteCajaTipo, metodo: "tarjeta" | "transferencia") {
    const total = metodo === "tarjeta" ? h.total_tarjeta : h.total_transferencia;
    const verificado = metodo === "tarjeta" ? h.tarjeta_verificado : h.transferencia_verificado;
    const diferencia = metodo === "tarjeta" ? h.tarjeta_diferencia : h.transferencia_diferencia;

    if (total === 0) {
      return <td style={{ ...s.tdDerecha, color: c.gris }}>—</td>;
    }
    if (verificado === null) {
      return (
        <td style={s.tdDerecha}>
          <button
            style={{ ...s.botonSecundario, padding: "4px 10px", fontSize: 12.5 }}
            onClick={() => setVerificando({ corte: h, metodo })}
          >
            Verificar
          </button>
        </td>
      );
    }
    return (
      <td style={s.tdDerecha}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span style={{ color: diferencia === 0 ? c.verde : c.rojo, fontWeight: 600 }}>
            RD$ {money(verificado)} (dif: RD$ {money(diferencia ?? 0)})
          </span>
          <button
            style={{
              background: "none",
              border: "none",
              color: c.azul,
              fontSize: 12,
              cursor: "pointer",
              padding: 0,
            }}
            onClick={() => setVerificando({ corte: h, metodo })}
          >
            Editar
          </button>
        </div>
      </td>
    );
  }

  async function forzarCierre(efectivoContado: number) {
    setError(null);
    try {
      await repo.cerrarTurno({ efectivoContado });
      setMostrandoCierre(false);
      await Promise.all([cargarTurno(), cargarHistorial()]);
    } catch (e) {
      setError(
        e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e),
      );
      throw e; // el modal necesita el rechazo para mostrar su propio mensaje
    }
  }

  /** Verificación opcional de tarjeta/transferencia (§ CAJA): no es un conteo ciego — el
   *  supervisor transcribe el reporte de lote del datáfono o la confirmación bancaria. */
  async function guardarVerificacion(monto: number) {
    if (!verificando) return;
    setError(null);
    try {
      await repo.verificarPago(
        verificando.corte.id,
        verificando.metodo === "tarjeta"
          ? { tarjetaVerificado: monto }
          : { transferenciaVerificado: monto },
      );
      setVerificando(null);
      await cargarHistorial();
    } catch (e) {
      setError(
        e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e),
      );
      throw e;
    }
  }

  return (
    <div>
      {error && (
        <div role="alert" style={{ ...s.errorBox, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {turno === undefined && <p style={{ color: c.gris }}>Cargando…</p>}

      {turno === null && (
        <div style={s.tarjeta}>
          <p style={{ margin: 0, color: c.gris }}>No hay ningún turno de caja abierto.</p>
        </div>
      )}

      {turno && resumen && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={s.tarjeta}>
            <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <ChartColumn size={16} /> Turno en curso
            </h4>
            <div style={filaResumen}>
              <span style={{ color: c.gris }}>Abierto por</span>
              <span>{nombreDe(turno.usuario_id)}</span>
            </div>
            <div style={filaResumen}>
              <span style={{ color: c.gris }}>Desde</span>
              <span>{new Date(turno.fecha_apertura).toLocaleString("es-DO")}</span>
            </div>
            <div style={filaResumen}>
              <span style={{ color: c.gris }}>Facturas cobradas</span>
              <span>{resumen.cantidadFacturas}</span>
            </div>
            <div style={filaResumenTotal}>
              <span>Total ventas</span>
              <span>RD$ {money(resumen.totalVentas)}</span>
            </div>
            <div style={filaResumen}>
              <span style={{ color: c.gris }}>Efectivo</span>
              <span>RD$ {money(resumen.totalEfectivo)}</span>
            </div>
            <div style={filaResumen}>
              <span style={{ color: c.gris }}>Tarjeta</span>
              <span>RD$ {money(resumen.totalTarjeta)}</span>
            </div>
            <div style={filaResumen}>
              <span style={{ color: c.gris }}>Transferencia</span>
              <span>RD$ {money(resumen.totalTransferencia)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
              <span style={{ color: c.gris }}>Crédito</span>
              <span>RD$ {money(resumen.totalCredito)}</span>
            </div>
          </div>

          <div style={s.tarjeta}>
            <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Banknote size={16} /> Efectivo
            </h4>
            <div style={filaResumen}>
              <span style={{ color: c.gris }}>Fondo inicial</span>
              <span>RD$ {money(turno.monto_inicial)}</span>
            </div>
            <div style={filaResumenTotal}>
              <span>Efectivo esperado</span>
              <span>RD$ {money(turno.monto_inicial + resumen.totalEfectivo)}</span>
            </div>

            <p style={{ fontSize: 13, color: c.gris, marginTop: 16 }}>
              El turno se cierra normalmente al cerrar sesión o cambiar de usuario. Usa esto solo
              para recuperar un turno que quedó abierto (p. ej. tras un cierre inesperado de la
              aplicación).
            </p>
            <button
              style={{ ...s.botonSecundario, width: "100%" }}
              onClick={() => setMostrandoCierre(true)}
            >
              Forzar cierre de turno
            </button>
          </div>
        </div>
      )}

      {mostrandoCierre && turno && (
        <div style={overlayModal} onClick={() => setMostrandoCierre(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <PromptCerrarTurno
              montoInicial={turno.monto_inicial}
              fechaApertura={turno.fecha_apertura}
              nombreApertura={nombreDe(turno.usuario_id)}
              titulo="Forzar cierre de turno"
              onConfirmar={forzarCierre}
              onCancelar={() => setMostrandoCierre(false)}
            />
          </div>
        </div>
      )}

      {verificando && (
        <div style={overlayModal} onClick={() => setVerificando(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <PromptVerificarPago
              metodo={verificando.metodo}
              totalEsperado={
                verificando.metodo === "tarjeta"
                  ? verificando.corte.total_tarjeta
                  : verificando.corte.total_transferencia
              }
              valorActual={
                verificando.metodo === "tarjeta"
                  ? verificando.corte.tarjeta_verificado
                  : verificando.corte.transferencia_verificado
              }
              onConfirmar={guardarVerificacion}
              onCancelar={() => setVerificando(null)}
            />
          </div>
        </div>
      )}

      <div style={{ ...s.tarjeta, marginTop: 16 }}>
        <h4 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <ClipboardList size={16} /> Turnos anteriores
        </h4>
        <table style={s.tabla}>
          <thead>
            <tr>
              <th scope="col" style={s.th}>
                Período
              </th>
              <th scope="col" style={s.th}>
                Cajero
              </th>
              <th scope="col" style={s.th}>
                Total ventas
              </th>
              <th scope="col" style={s.th}>
                Efectivo esperado
              </th>
              <th scope="col" style={s.th}>
                Efectivo contado
              </th>
              <th scope="col" style={s.th}>
                Diferencia
              </th>
              <th scope="col" style={s.th}>
                Tarjeta
              </th>
              <th scope="col" style={s.th}>
                Transferencia
              </th>
            </tr>
          </thead>
          <tbody>
            {historial.length === 0 && (
              <tr>
                <td style={s.filaVacia} colSpan={8}>
                  Todavía no se ha cerrado ningún turno.
                </td>
              </tr>
            )}
            {historial.map((h) => (
              <tr key={h.id}>
                <td style={s.td}>
                  {new Date(h.fecha_apertura).toLocaleString("es-DO")}
                  {" – "}
                  {new Date(h.fecha_cierre).toLocaleString("es-DO")}
                </td>
                <td style={s.td}>{nombreDe(h.usuario_id)}</td>
                <td style={s.tdDerecha}>RD$ {money(h.total_ventas)}</td>
                <td style={s.tdDerecha}>RD$ {money(h.efectivo_esperado)}</td>
                <td style={s.tdDerecha}>RD$ {money(h.efectivo_contado)}</td>
                <td
                  style={{
                    ...s.tdDerecha,
                    color: h.diferencia === 0 ? c.verde : c.rojo,
                    fontWeight: 600,
                  }}
                >
                  RD$ {money(h.diferencia)}
                </td>
                {celdaVerificacion(h, "tarjeta")}
                {celdaVerificacion(h, "transferencia")}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface PromptVerificarPagoProps {
  metodo: "tarjeta" | "transferencia";
  /** Lo que el sistema calculó de las ventas del turno — mostrado como referencia, nunca
   *  precargado en el campo: quien verifica transcribe el número real, no confirma el del
   *  sistema a ciegas. */
  totalEsperado: number;
  /** Si ya había un valor verificado antes (§ "Editar"), se precarga para corregirlo. */
  valorActual: number | null;
  onConfirmar: (monto: number) => Promise<void>;
  onCancelar: () => void;
}

/** Verificación de tarjeta/transferencia (§ CAJA): a diferencia del conteo de efectivo, esto
 *  NO es ciego — el total esperado se muestra, porque el supervisor está comparando contra
 *  una fuente externa (reporte de lote, confirmación bancaria), no adivinando. */
function PromptVerificarPago({
  metodo,
  totalEsperado,
  valorActual,
  onConfirmar,
  onCancelar,
}: PromptVerificarPagoProps) {
  const tarjetaRef = useModalAccesible<HTMLDivElement>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [monto, setMonto] = useState(valorActual != null ? String(valorActual) : "");
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
      setError(
        e instanceof ValidacionError ? e.errores.map((x) => x.mensaje).join(" ") : String(e),
      );
    } finally {
      setEnviando(false);
    }
  }

  const etiquetaMetodo = metodo === "tarjeta" ? "tarjeta" : "transferencia";
  const fuente =
    metodo === "tarjeta" ? "el reporte de lote del datáfono" : "la confirmación del banco";

  return (
    <div ref={tarjetaRef} style={s.tarjeta} role="group" aria-label={`Verificar ${etiquetaMetodo}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span
          aria-hidden="true"
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: c.azulClaro,
            color: c.azulOscuro,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <ShieldCheck size={20} />
        </span>
        <h1 style={{ fontSize: 20, margin: 0, letterSpacing: -0.3 }}>Verificar {etiquetaMetodo}</h1>
      </div>
      <p style={{ margin: "0 0 4px", fontSize: 14, color: c.gris }}>
        El sistema calculó RD$ {money(totalEsperado)} en ventas por {etiquetaMetodo}.
      </p>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: c.gris }}>
        Escribe lo que de verdad muestra {fuente}.
      </p>

      <label style={s.label} htmlFor="sfr-monto-verificado">
        Monto verificado
      </label>
      <input
        id="sfr-monto-verificado"
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
        <div role="alert" style={{ ...s.errorBox, marginTop: 12 }}>
          {error}
        </div>
      )}

      <div style={{ ...s.formFooter, justifyContent: "space-between" }}>
        <button type="button" style={s.botonSecundario} onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="button" style={s.boton} onClick={confirmar} disabled={enviando}>
          Guardar
        </button>
      </div>
    </div>
  );
}

const filaResumen = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 14,
  marginBottom: 4,
} as const;

const filaResumenTotal = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 18,
  fontWeight: 700,
  borderTop: `1px solid ${c.borde}`,
  paddingTop: 8,
  marginBottom: 12,
} as const;

const overlayModal = {
  position: "fixed",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  background: "var(--sfr-overlay)",
  backdropFilter: "blur(2px)",
} as const;
