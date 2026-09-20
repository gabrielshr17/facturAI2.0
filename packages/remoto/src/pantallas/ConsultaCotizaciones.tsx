import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { s, c, money } from "../estilos";

/**
 * Solo consulta + anular: las cotizaciones se crean durante un flujo de venta
 * que no existe en el panel remoto (fuera de alcance de esta tanda).
 */
interface CotizacionFila {
  id: string;
  numero_interno: number | null;
  fecha_hora: string;
  fecha_vencimiento: string;
  cliente_id: string | null;
  total: number;
  estado: string;
}

interface CotizacionLineaFila {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface ClienteOpcion {
  id: string;
  nombre: string;
  apellidos: string | null;
}

function esVencida(cot: CotizacionFila): boolean {
  const hoy = new Date().toISOString().slice(0, 10);
  return cot.estado === "vigente" && cot.fecha_vencimiento.slice(0, 10) < hoy;
}

export function ConsultaCotizaciones(): JSX.Element {
  const [cotizaciones, setCotizaciones] = useState<CotizacionFila[]>([]);
  const [clientes, setClientes] = useState<Record<string, ClienteOpcion>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [desde, setDesde] = useState(() => {
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    return hace30.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));

  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<CotizacionLineaFila[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [anulando, setAnulando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const desdeIso = new Date(`${desde}T00:00:00`).toISOString();
    const hastaIso = new Date(`${hasta}T23:59:59`).toISOString();
    const { data, error: errorSupabase } = await supabase
      .from("cotizacion")
      .select("id, numero_interno, fecha_hora, fecha_vencimiento, cliente_id, total, estado")
      .gte("fecha_hora", desdeIso)
      .lte("fecha_hora", hastaIso)
      .is("deleted_at", null)
      .order("fecha_hora", { ascending: false })
      .limit(200);
    if (errorSupabase) {
      setError(errorSupabase.message);
      setCargando(false);
      return;
    }
    const filas = (data ?? []) as CotizacionFila[];
    setCotizaciones(filas);

    const idsCliente = [
      ...new Set(filas.map((cot) => cot.cliente_id).filter((id): id is string => !!id)),
    ];
    if (idsCliente.length > 0) {
      const { data: clientesData } = await supabase
        .from("cliente")
        .select("id, nombre, apellidos")
        .in("id", idsCliente);
      const mapa: Record<string, ClienteOpcion> = {};
      for (const c of clientesData ?? []) mapa[c.id] = c;
      setClientes(mapa);
    } else {
      setClientes({});
    }
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function verDetalle(id: string): Promise<void> {
    setSeleccionId(id);
    setCargandoDetalle(true);
    const { data } = await supabase
      .from("cotizacion_linea")
      .select("id, descripcion, cantidad, precio_unitario, subtotal")
      .eq("cotizacion_id", id);
    setLineas((data ?? []) as CotizacionLineaFila[]);
    setCargandoDetalle(false);
  }

  async function anular(id: string): Promise<void> {
    if (!confirm("¿Anular esta cotización?")) return;
    setAnulando(true);
    setError(null);
    const { error: errorSupabase } = await supabase
      .from("cotizacion")
      .update({ estado: "anulada" })
      .eq("id", id);
    setAnulando(false);
    if (errorSupabase) {
      setError(errorSupabase.message);
      return;
    }
    await cargar();
  }

  if (cargando) {
    return <p>Cargando cotizaciones…</p>;
  }

  const seleccion = cotizaciones.find((cot) => cot.id === seleccionId) ?? null;

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
        Consulta de cotizaciones
      </h2>
      {error !== null && (
        <div role="alert" style={s.errorBox}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <label style={s.label}>Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            style={s.input}
          />
        </div>
        <div>
          <label style={s.label}>Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            style={s.input}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 380px" }} className="sfr-tabla-scroll">
          <table style={s.tabla}>
            <thead>
              <tr>
                <th style={s.th}>#</th>
                <th style={s.th}>Fecha</th>
                <th style={s.th}>Cliente</th>
                <th style={s.th}>Total</th>
                <th style={s.th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map((cot) => {
                const cliente = cot.cliente_id ? clientes[cot.cliente_id] : null;
                return (
                  <tr
                    key={cot.id}
                    className="sfr-fila-clickeable"
                    onClick={() => void verDetalle(cot.id)}
                    style={{
                      cursor: "pointer",
                      background: seleccionId === cot.id ? c.seleccion : "transparent",
                    }}
                  >
                    <td style={s.td}>{cot.numero_interno ?? "—"}</td>
                    <td style={s.td}>{cot.fecha_hora.slice(0, 16).replace("T", " ")}</td>
                    <td style={s.td}>
                      {cliente ? `${cliente.nombre} ${cliente.apellidos ?? ""}` : "—"}
                    </td>
                    <td style={s.tdDerecha}>{money(cot.total)}</td>
                    <td style={s.td}>{esVencida(cot) ? "Vencida" : cot.estado}</td>
                  </tr>
                );
              })}
              {cotizaciones.length === 0 && (
                <tr>
                  <td colSpan={5} style={s.filaVacia}>
                    Sin cotizaciones en este rango.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {seleccion && (
          <div style={{ ...s.tarjeta, flex: "1 1 300px" }}>
            <h3 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>
              Cotización #{seleccion.numero_interno ?? "—"}
            </h3>
            {cargandoDetalle ? (
              <p style={{ color: c.gris }}>Cargando detalle…</p>
            ) : (
              <>
                <table style={{ ...s.tabla, marginBottom: 12 }}>
                  <thead>
                    <tr>
                      <th style={s.th}>Producto</th>
                      <th style={s.th}>Cant.</th>
                      <th style={s.th}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.id}>
                        <td style={s.td}>{l.descripcion}</td>
                        <td style={s.td}>{l.cantidad}</td>
                        <td style={s.tdDerecha}>{money(l.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontWeight: 600, marginBottom: 12 }}>Total: {money(seleccion.total)}</p>
                {seleccion.estado === "vigente" && (
                  <button
                    type="button"
                    onClick={() => void anular(seleccion.id)}
                    disabled={anulando}
                    style={{
                      ...s.boton,
                      background: c.rojo,
                      padding: "8px 16px",
                      fontSize: 13,
                      cursor: anulando ? "not-allowed" : "pointer",
                    }}
                  >
                    {anulando ? "Anulando…" : "Anular cotización"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
