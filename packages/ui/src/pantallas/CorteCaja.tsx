import { useEffect, useState, useCallback } from "react";
import {
  type CorteCaja as CorteCajaTipo,
  type ResumenPeriodoVentas,
  type Usuario,
  ValidacionError,
} from "@sfr/core";
import { ChartColumn, Banknote, ClipboardList } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { PromptCerrarTurno } from "../componentes/TarjetasTurno.js";
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
              nombreApertura={nombreDe(turno.usuario_id)}
              titulo="Forzar cierre de turno"
              onConfirmar={forzarCierre}
              onCancelar={() => setMostrandoCierre(false)}
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
            </tr>
          </thead>
          <tbody>
            {historial.length === 0 && (
              <tr>
                <td style={s.filaVacia} colSpan={6}>
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
              </tr>
            ))}
          </tbody>
        </table>
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
