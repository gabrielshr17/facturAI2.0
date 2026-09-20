import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "../supabaseClient";

/**
 * Solo consulta: sin NCF/comprobante fiscal (comprobante_fiscal no tiene
 * política RLS todavía, fuera de alcance de esta tanda) y sin "Devolver"
 * (devolucion/devolucion_linea tampoco tienen política RLS).
 */
interface FacturaFila {
  id: string;
  numero_interno: number | null;
  fecha_hora: string;
  cliente_id: string | null;
  tipo: string;
  total: number;
  estado: string;
  prefijo_caja: string | null;
}

interface FacturaLineaFila {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

interface PagoFila {
  id: string;
  metodo: string;
  monto: number;
}

interface ClienteOpcion {
  id: string;
  nombre: string;
  apellidos: string | null;
}

export function ConsultaFacturas(): JSX.Element {
  const [facturas, setFacturas] = useState<FacturaFila[]>([]);
  const [clientes, setClientes] = useState<Record<string, ClienteOpcion>>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [desde, setDesde] = useState(() => {
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    return hace30.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [busqueda, setBusqueda] = useState("");

  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<FacturaLineaFila[]>([]);
  const [pagos, setPagos] = useState<PagoFila[]>([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const desdeIso = new Date(`${desde}T00:00:00`).toISOString();
    const hastaIso = new Date(`${hasta}T23:59:59`).toISOString();
    const { data, error: errorSupabase } = await supabase
      .from("factura")
      .select("id, numero_interno, fecha_hora, cliente_id, tipo, total, estado, prefijo_caja")
      .eq("estado", "cobrada")
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
    const filas = (data ?? []) as FacturaFila[];
    setFacturas(filas);

    const idsCliente = [
      ...new Set(filas.map((f) => f.cliente_id).filter((id): id is string => !!id)),
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

  const facturasFiltradas = facturas.filter((f) => {
    const termino = busqueda.trim().toLowerCase();
    if (termino === "") return true;
    const cliente = f.cliente_id ? clientes[f.cliente_id] : null;
    const nombreCliente = cliente ? `${cliente.nombre} ${cliente.apellidos ?? ""}` : "";
    return (
      String(f.numero_interno ?? "").includes(termino) ||
      nombreCliente.toLowerCase().includes(termino)
    );
  });

  async function verDetalle(id: string): Promise<void> {
    setSeleccionId(id);
    setCargandoDetalle(true);
    const [resLineas, resPagos] = await Promise.all([
      supabase
        .from("factura_linea")
        .select("id, descripcion, cantidad, precio_unitario, subtotal")
        .eq("factura_id", id),
      supabase.from("pago").select("id, metodo, monto").eq("factura_id", id),
    ]);
    setLineas((resLineas.data ?? []) as FacturaLineaFila[]);
    setPagos((resPagos.data ?? []) as PagoFila[]);
    setCargandoDetalle(false);
  }

  if (cargando) {
    return <p>Cargando facturas…</p>;
  }

  const seleccion = facturas.find((f) => f.id === seleccionId) ?? null;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Consulta de facturas</h2>
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

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)" }}>Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            style={estiloInput}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)" }}>Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            style={estiloInput}
          />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)" }}>Buscar</label>
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Número o cliente…"
            style={{ ...estiloInput, width: "100%", boxSizing: "border-box" }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 380px", overflowX: "auto" }}>
          <table style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {facturasFiltradas.map((f) => {
                const cliente = f.cliente_id ? clientes[f.cliente_id] : null;
                return (
                  <tr
                    key={f.id}
                    onClick={() => void verDetalle(f.id)}
                    style={{
                      cursor: "pointer",
                      background: seleccionId === f.id ? "var(--sfr-borde)" : "transparent",
                    }}
                  >
                    <td>{f.numero_interno ?? "—"}</td>
                    <td>{f.fecha_hora.slice(0, 16).replace("T", " ")}</td>
                    <td>{cliente ? `${cliente.nombre} ${cliente.apellidos ?? ""}` : "—"}</td>
                    <td>{f.total.toFixed(2)}</td>
                  </tr>
                );
              })}
              {facturasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", color: "var(--sfr-gris)" }}>
                    Sin facturas en este rango.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {seleccion && (
          <div
            style={{
              flex: "1 1 300px",
              background: "var(--sfr-superficie)",
              border: "1px solid var(--sfr-borde)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Factura #{seleccion.numero_interno ?? "—"}</h3>
            {cargandoDetalle ? (
              <p>Cargando detalle…</p>
            ) : (
              <>
                <table style={{ width: "100%", marginBottom: 12 }}>
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cant.</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.id}>
                        <td>{l.descripcion}</td>
                        <td>{l.cantidad}</td>
                        <td>{l.subtotal.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}>Pagos</p>
                {pagos.map((p) => (
                  <p key={p.id} style={{ margin: "2px 0", fontSize: 14 }}>
                    {p.metodo}: {p.monto.toFixed(2)}
                  </p>
                ))}
                <p style={{ marginTop: 12, fontWeight: 600 }}>
                  Total: {seleccion.total.toFixed(2)}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const estiloInput: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--sfr-borde)",
  background: "var(--sfr-superficie)",
  color: "var(--sfr-texto)",
};
