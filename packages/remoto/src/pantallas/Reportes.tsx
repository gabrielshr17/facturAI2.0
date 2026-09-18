import { useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Consume la vista `vista_ventas_por_dia` (packages/api/db/reportes-vistas.sql,
 * pendiente de pegar en el SQL Editor de Supabase por el dueño — este agente
 * no tiene acceso directo al Postgres real). PostgREST no permite GROUP BY en
 * una consulta simple sobre `factura`, de ahí la vista.
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
        `${errorSupabase.message}. Si el error menciona que la vista no existe, falta pegar packages/api/db/reportes-vistas.sql en el SQL Editor de Supabase.`,
      );
      return;
    }
    setFilas((data ?? []) as FilaVentasPorDia[]);
  }

  const totalPeriodo = filas.reduce((acumulado, fila) => acumulado + fila.total_vendido, 0);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Reportes</h2>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}>Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(evento) => setDesde(evento.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--sfr-borde)" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}>Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(evento) => setHasta(evento.target.value)}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--sfr-borde)" }}
          />
        </div>
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={cargando}
          style={{
            background: "var(--sfr-acento)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: cargando ? "not-allowed" : "pointer",
            opacity: cargando ? 0.7 : 1,
          }}
        >
          {cargando ? "Consultando…" : "Consultar"}
        </button>
      </div>

      {error !== null && (
        <div
          role="alert"
          style={{
            background: "var(--sfr-peligro-fondo)",
            color: "var(--sfr-peligro)",
            border: "1px solid var(--sfr-peligro)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {error}
        </div>
      )}

      {consultado && !cargando && error === null && (
        <>
          <p style={{ fontSize: 15 }}>
            Total vendido en el período: <strong>{totalPeriodo.toFixed(2)}</strong>
          </p>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Facturas cobradas</th>
                  <th>Total vendido</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.fecha}>
                    <td>{fila.fecha}</td>
                    <td>{fila.cantidad_facturas}</td>
                    <td>{fila.total_vendido.toFixed(2)}</td>
                  </tr>
                ))}
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "var(--sfr-gris)" }}>
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
