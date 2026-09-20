import { useState } from "react";
import { supabase } from "../supabaseClient";
import { s, c, money } from "../estilos";

/**
 * Réplica client-side de packages/core/src/repos/reportes/{ventas,margen,fiscal}.ts
 * (usadas por la pantalla Reportes de la app local): mismas métricas, mismas
 * fórmulas, pero agregadas en el navegador en vez de con SQL GROUP BY, porque
 * PostgREST no expone eso sobre una consulta simple. Se trae `factura`,
 * `factura_linea`, `pago` del rango con `estado='cobrada'` y se agrega acá —
 * mismo patrón que ya usan ConsultaFacturas.tsx/ConsultaCotizaciones.tsx para
 * un límite razonable de filas.
 *
 * Limitación de zona horaria: se agrupa por date(fecha_hora) en UTC sin
 * convertir a la zona de RD (UTC-4), así que una venta después de las
 * 8:00 pm local puede aparecer bajo el día UTC siguiente. Igual que en la
 * app local (mismo comentario en reportes-vistas.sql).
 */
const LIMITE_FACTURAS = 2000;

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  credito: "Crédito",
  tarjeta: "Tarjeta",
};

interface FacturaFila {
  id: string;
  fecha_hora: string;
  total: number;
  subtotal_gravado: number;
  subtotal_exento: number;
  total_itbis: number;
}

interface LineaFila {
  factura_id: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  subtotal: number;
}

interface PagoFila {
  factura_id: string;
  metodo: string;
  monto: number;
}

interface VentaPorDia {
  fecha: string;
  totalVentas: number;
  cantidadFacturas: number;
}

interface ProductoVendido {
  productoId: string | null;
  descripcion: string;
  cantidadVendida: number;
  totalVendido: number;
}

interface ResumenGanancia {
  costoEstimado: number;
  gananciaEstimada: number;
  ingresosSinCosto: number;
}

interface ResumenItbis {
  totalGravado: number;
  totalExento: number;
  totalItbis: number;
}

interface ResumenPorMetodo {
  metodo: string;
  total: number;
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
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consultado, setConsultado] = useState(false);

  const [ventasPorDia, setVentasPorDia] = useState<VentaPorDia[]>([]);
  const [productos, setProductos] = useState<ProductoVendido[]>([]);
  const [ganancia, setGanancia] = useState<ResumenGanancia | null>(null);
  const [itbis, setItbis] = useState<ResumenItbis | null>(null);
  const [porMetodo, setPorMetodo] = useState<ResumenPorMetodo[]>([]);

  async function buscar(): Promise<void> {
    setCargando(true);
    setError(null);
    setConsultado(true);

    const desdeIso = new Date(`${desde}T00:00:00`).toISOString();
    const hastaIso = new Date(`${hasta}T23:59:59`).toISOString();

    const { data: facturasData, error: errorFacturas } = await supabase
      .from("factura")
      .select("id, fecha_hora, total, subtotal_gravado, subtotal_exento, total_itbis")
      .eq("estado", "cobrada")
      .is("deleted_at", null)
      .gte("fecha_hora", desdeIso)
      .lte("fecha_hora", hastaIso)
      .order("fecha_hora")
      .limit(LIMITE_FACTURAS);
    if (errorFacturas) {
      setError(errorFacturas.message);
      setCargando(false);
      return;
    }
    const facturas = (facturasData ?? []) as FacturaFila[];
    const idsFactura = facturas.map((f) => f.id);

    if (idsFactura.length === 0) {
      setVentasPorDia([]);
      setProductos([]);
      setGanancia({ costoEstimado: 0, gananciaEstimada: 0, ingresosSinCosto: 0 });
      setItbis({ totalGravado: 0, totalExento: 0, totalItbis: 0 });
      setPorMetodo([]);
      setCargando(false);
      return;
    }

    const [resLineas, resPagos] = await Promise.all([
      supabase
        .from("factura_linea")
        .select("factura_id, producto_id, descripcion, cantidad, subtotal")
        .in("factura_id", idsFactura)
        .is("deleted_at", null),
      supabase
        .from("pago")
        .select("factura_id, metodo, monto")
        .in("factura_id", idsFactura)
        .is("deleted_at", null),
    ]);
    if (resLineas.error) {
      setError(resLineas.error.message);
      setCargando(false);
      return;
    }
    if (resPagos.error) {
      setError(resPagos.error.message);
      setCargando(false);
      return;
    }
    const lineas = (resLineas.data ?? []) as LineaFila[];
    const pagos = (resPagos.data ?? []) as PagoFila[];

    const idsProducto = [...new Set(lineas.map((l) => l.producto_id).filter((id): id is string => !!id))];
    let costoPorProducto: Record<string, number> = {};
    if (idsProducto.length > 0) {
      const { data: productosData } = await supabase
        .from("producto")
        .select("id, costo")
        .in("id", idsProducto);
      costoPorProducto = Object.fromEntries(
        (productosData ?? []).map((p) => [p.id as string, p.costo as number]),
      );
    }

    // Ventas por día
    const porDia = new Map<string, VentaPorDia>();
    for (const f of facturas) {
      const fecha = f.fecha_hora.slice(0, 10);
      const actual = porDia.get(fecha) ?? { fecha, totalVentas: 0, cantidadFacturas: 0 };
      actual.totalVentas += f.total;
      actual.cantidadFacturas += 1;
      porDia.set(fecha, actual);
    }
    setVentasPorDia([...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)));

    // Productos más vendidos
    const porProducto = new Map<string, ProductoVendido>();
    for (const l of lineas) {
      const clave = l.producto_id ?? `sin-producto:${l.descripcion}`;
      const actual = porProducto.get(clave) ?? {
        productoId: l.producto_id,
        descripcion: l.descripcion,
        cantidadVendida: 0,
        totalVendido: 0,
      };
      actual.cantidadVendida += l.cantidad;
      actual.totalVendido += l.subtotal;
      porProducto.set(clave, actual);
    }
    setProductos(
      [...porProducto.values()].sort((a, b) => b.cantidadVendida - a.cantidadVendida).slice(0, 10),
    );

    // Ganancia estimada (costo ACTUAL del producto, igual que la app local)
    let costoEstimado = 0;
    let ingresosSinCosto = 0;
    for (const l of lineas) {
      if (l.producto_id && costoPorProducto[l.producto_id] !== undefined) {
        costoEstimado += l.cantidad * costoPorProducto[l.producto_id];
      } else {
        ingresosSinCosto += l.subtotal;
      }
    }
    const ingresos = lineas.reduce((acumulado, l) => acumulado + l.subtotal, 0);
    setGanancia({
      costoEstimado,
      gananciaEstimada: ingresos - costoEstimado,
      ingresosSinCosto,
    });

    // ITBIS
    setItbis({
      totalGravado: facturas.reduce((a, f) => a + f.subtotal_gravado, 0),
      totalExento: facturas.reduce((a, f) => a + f.subtotal_exento, 0),
      totalItbis: facturas.reduce((a, f) => a + f.total_itbis, 0),
    });

    // Ventas por método de pago
    const porMetodoMapa = new Map<string, number>();
    for (const p of pagos) {
      porMetodoMapa.set(p.metodo, (porMetodoMapa.get(p.metodo) ?? 0) + p.monto);
    }
    setPorMetodo(
      [...porMetodoMapa.entries()]
        .map(([metodo, total]) => ({ metodo, total }))
        .sort((a, b) => b.total - a.total),
    );

    setCargando(false);
  }

  function exportarCsv(): void {
    const filas = [
      ["Fecha", "Total ventas", "Cantidad facturas"],
      ...ventasPorDia.map((v) => [v.fecha, v.totalVentas.toFixed(2), String(v.cantidadFacturas)]),
    ];
    const csvTexto = filas
      .map((f) => f.map((col) => `"${col.replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([csvTexto], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas_${desde}_a_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalVentas = ventasPorDia.reduce((acc, v) => acc + v.totalVentas, 0);
  const maxVenta = Math.max(1, ...ventasPorDia.map((v) => v.totalVentas));

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>Reportes</h2>

      <div style={{ ...s.tarjeta, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
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
            style={{ ...s.boton, cursor: cargando ? "not-allowed" : "pointer", opacity: cargando ? 0.7 : 1 }}
          >
            {cargando ? "Consultando…" : "Consultar"}
          </button>
          <button
            type="button"
            onClick={exportarCsv}
            disabled={ventasPorDia.length === 0}
            style={s.botonSecundario}
          >
            Exportar CSV
          </button>
        </div>
        <p style={{ color: c.gris, fontSize: 12, marginBottom: 0, marginTop: 8 }}>
          Ventas brutas del período (no descuenta devoluciones). La ganancia usa el costo ACTUAL del
          producto como estimación.
        </p>
      </div>

      {error !== null && (
        <div role="alert" style={s.errorBox}>
          {error}
        </div>
      )}

      {consultado && !cargando && error === null && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div style={s.tarjeta}>
              <h4 style={{ marginTop: 0, color: c.gris, fontSize: 13, fontWeight: 600 }}>
                Total ventas
              </h4>
              <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                RD$ {money(totalVentas)}
              </div>
            </div>
            <div style={s.tarjeta}>
              <h4 style={{ marginTop: 0, color: c.gris, fontSize: 13, fontWeight: 600 }}>
                Ganancia estimada
              </h4>
              <div
                style={{ fontSize: 26, fontWeight: 700, color: c.verde, fontVariantNumeric: "tabular-nums" }}
              >
                RD$ {money(ganancia?.gananciaEstimada ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: c.gris }}>
                Costo estimado: RD$ {money(ganancia?.costoEstimado ?? 0)}
              </div>
              {(ganancia?.ingresosSinCosto ?? 0) > 0 && (
                <div style={{ fontSize: 12, color: c.amarillo, marginTop: 6, fontWeight: 600 }}>
                  RD$ {money(ganancia!.ingresosSinCosto)} en ventas sin producto vinculado — su costo
                  real se desconoce y NO está restado arriba, así que la ganancia real es MENOR a la
                  mostrada.
                </div>
              )}
            </div>
            <div style={s.tarjeta}>
              <h4 style={{ marginTop: 0, color: c.gris, fontSize: 13, fontWeight: 600 }}>
                ITBIS recaudado
              </h4>
              <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                RD$ {money(itbis?.totalItbis ?? 0)}
              </div>
              <div style={{ fontSize: 12, color: c.gris }}>
                Gravado RD$ {money(itbis?.totalGravado ?? 0)} · Exento RD${" "}
                {money(itbis?.totalExento ?? 0)}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={s.tarjeta}>
              <h4 style={{ marginTop: 0 }}>Ventas por día</h4>
              {ventasPorDia.length === 0 && <p style={{ color: c.gris }}>Sin ventas en este período.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {ventasPorDia.map((v) => (
                  <div key={v.fecha}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                      <span>{v.fecha}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        RD$ {money(v.totalVentas)} ({v.cantidadFacturas})
                      </span>
                    </div>
                    <div style={{ background: c.grisClaro, borderRadius: 999, height: 7, overflow: "hidden" }}>
                      <div
                        style={{
                          background: c.azul,
                          borderRadius: 999,
                          height: 7,
                          width: `${(v.totalVentas / maxVenta) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <h4 style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${c.borde}` }}>
                Ventas por método de pago
              </h4>
              {porMetodo.map((m) => (
                <div key={m.metodo} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                  <span>{ETIQUETA_METODO[m.metodo] ?? m.metodo}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>RD$ {money(m.total)}</span>
                </div>
              ))}
              {porMetodo.length === 0 && <p style={{ color: c.gris, fontSize: 13 }}>Sin pagos registrados.</p>}
            </div>

            <div style={s.tarjeta}>
              <h4 style={{ marginTop: 0 }}>Productos más vendidos</h4>
              <table style={s.tabla}>
                <thead>
                  <tr>
                    <th style={s.th}>Producto</th>
                    <th style={s.th}>Cant.</th>
                    <th style={s.th}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.length === 0 && (
                    <tr>
                      <td style={s.filaVacia} colSpan={3}>
                        Sin datos.
                      </td>
                    </tr>
                  )}
                  {productos.map((p, i) => (
                    <tr key={p.productoId ?? i}>
                      <td style={s.td}>{p.descripcion}</td>
                      <td style={s.tdDerecha}>{p.cantidadVendida}</td>
                      <td style={s.tdDerecha}>RD$ {money(p.totalVendido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
