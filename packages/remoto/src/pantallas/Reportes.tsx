import { useState } from "react";
import { supabase } from "../supabaseClient";
import { s, money } from "../estilos";

/**
 * Consume la vista `vista_ventas_por_dia` (packages/api/db/reportes-vistas.sql,
 * YA APLICADA contra el proyecto real de Supabase — verificado con PostgREST
 * respondiendo 200). PostgREST no permite GROUP BY en una consulta simple
 * sobre `factura`, de ahí la vista.
 *
 * Limitación de zona horaria (documentada también en el .sql): la vista
 * agrupa con `date(fecha_hora)` sin convertir de UTC a la zona de RD
 * (UTC-4), así que una venta después de las 8:00 pm local puede aparecer
 * agrupada bajo el día UTC siguiente. Aceptable para el alcance de hoy;
 * corregirlo es un `AT TIME ZONE 'America/Santo_Domingo'` en la vista.
 */
interface FilaVentasPorDia {
  fecha: string;
  total_vendido: number;
  cantidad_facturas: number;
}

function hace30Dias(): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - 30);
  return fecha.toISOString().slice(0, 10);
}

function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Reportes(): JSX.Element {
  const [desde, setDesde] = useState(hace30Dias());
  const [hasta, setHasta] = useState(hoy());
  const [filas, setFilas] = useState<FilaVentasPorDia[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consultado, setConsultado] = useState(false);

  async function buscar(): Promise<void> {
    setCargando(true);
    setError(null);
    setConsultado(true);
    const { data, error: errorSupabase } = await supabase
      .from("vista_ventas_por_dia")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true });
    setCargando(false);
    if (errorSupabase) {
      setError(
        `${errorSupabase.message}. Si el error menciona que la vista no existe (p. ej. tras un reset de la base), re-aplicar packages/api/db/reportes-vistas.sql en el SQL Editor de Supabase.`,
      );
      return;
    }
    setFilas((data ?? []) as FilaVentasPorDia[]);
  }

  const totalPeriodo = filas.reduce((acumulado, fila) => acumulado + fila.total_vendido, 0);

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>Reportes</h2>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginBottom: 16,
        }}
      >
        <div>
          <label style={s.label}>Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(evento) => setDesde(evento.target.value)}
            style={s.input}
          />
        </div>
        <div>
          <label style={s.label}>Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(evento) => setHasta(evento.target.value)}
            style={s.input}
          />
        </div>
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={cargando}
          style={{
            ...s.boton,
            cursor: cargando ? "not-allowed" : "pointer",
            opacity: cargando ? 0.7 : 1,
          }}
        >
          {cargando ? "Consultando…" : "Consultar"}
        </button>
      </div>

      {error !== null && (
        <div role="alert" style={s.errorBox}>
          {error}
        </div>
      )}

      {consultado && !cargando && error === null && (
        <>
          <p style={{ fontSize: 15 }}>
            Total vendido en el período: <strong>{money(totalPeriodo)}</strong>
          </p>
          <div className="sfr-tabla-scroll">
            <table style={s.tabla}>
              <thead>
                <tr>
                  <th style={s.th}>Fecha</th>
                  <th style={s.th}>Facturas cobradas</th>
                  <th style={s.th}>Total vendido</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.fecha}>
                    <td style={s.td}>{fila.fecha}</td>
                    <td style={s.td}>{fila.cantidad_facturas}</td>
                    <td style={s.tdDerecha}>{money(fila.total_vendido)}</td>
                  </tr>
                ))}
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={3} style={s.filaVacia}>
                      Sin ventas cobradas en el rango elegido.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
