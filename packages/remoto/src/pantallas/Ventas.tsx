import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  calcularLinea,
  calcularTotales,
  procesarCobro,
  evaluarDisponibilidad,
  type MetodoPago,
  type PagoInput,
} from "@sfr/core";
import { supabase } from "../supabaseClient";
import { s, c, money } from "../estilos";

/**
 * IMPORTANTE — no atómica, mismo motivo que Compras.tsx: PostgREST no
 * expone transacciones multi-tabla, así que `guardarVenta` hace varios
 * `.insert()`/`.update()` secuenciales. Si uno falla a mitad de camino, la
 * venta puede quedar parcialmente registrada (huérfana). Aceptado para este
 * alcance; el dueño puede revisar/corregir en el SQL Editor.
 *
 * IMPORTANTE — riesgo de desfase de inventario: `producto.existencia` que
 * ve esta pantalla viene de la última sincronización de la caja física, no
 * en tiempo real. Una venta remota puede chocar con ventas que ya ocurrieron
 * en la caja física pero aún no han subido. Se documenta y se muestra al
 * usuario en vez de bloquear con una validación de "frescura" (decisión
 * explícita del dueño).
 */

interface ProductoOpcion {
  id: string;
  descripcion: string;
  codigo_barra: string | null;
  precio_venta: number;
  precio_mayoreo: number | null;
  impuesto_tipo: string;
  tasa_impuesto: number;
  existencia: number | null;
  politica_sin_existencia: "bloquear" | "advertir";
}

interface ClienteOpcion {
  id: string;
  nombre: string;
  apellidos: string | null;
  aplica_credito: boolean;
  limite_credito: number;
  saldo_credito: number;
}

interface NegocioConfig {
  inventario_activo: boolean;
}

interface VentaFila {
  id: string;
  fecha_hora: string;
  total: number;
  estado: string;
}

interface LineaCarrito {
  clave: string;
  producto_id: string;
  descripcion: string;
  precioUnitario: number;
  cantidad: number;
  tasaImpuesto: number;
  esMayoreo: boolean;
}

interface PagoFila {
  metodo: MetodoPago;
  monto: string;
}

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "credito", etiqueta: "Crédito" },
];

export function Ventas(): JSX.Element {
  const [productos, setProductos] = useState<ProductoOpcion[]>([]);
  const [clientes, setClientes] = useState<ClienteOpcion[]>([]);
  const [negocio, setNegocio] = useState<NegocioConfig>({ inventario_activo: false });
  const [ventas, setVentas] = useState<VentaFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);

  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [clienteId, setClienteId] = useState<string>("");
  const [nombreClienteNuevo, setNombreClienteNuevo] = useState("");
  const [telefonoClienteNuevo, setTelefonoClienteNuevo] = useState("");

  const [pagos, setPagos] = useState<PagoFila[]>([{ metodo: "efectivo", monto: "" }]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [resProductos, resClientes, resNegocio, resVentas] = await Promise.all([
      supabase
        .from("producto")
        .select(
          "id, descripcion, codigo_barra, precio_venta, precio_mayoreo, impuesto_tipo, tasa_impuesto, existencia, politica_sin_existencia",
        )
        .eq("activo", true)
        .is("deleted_at", null)
        .order("descripcion"),
      supabase
        .from("cliente")
        .select("id, nombre, apellidos, aplica_credito, limite_credito, saldo_credito")
        .is("deleted_at", null)
        .order("nombre"),
      supabase.from("negocio").select("inventario_activo").limit(1).maybeSingle(),
      supabase
        .from("factura")
        .select("id, fecha_hora, total, estado")
        .eq("prefijo_caja", "REM")
        .is("deleted_at", null)
        .order("fecha_hora", { ascending: false })
        .limit(20),
    ]);
    if (resProductos.error) setError(resProductos.error.message);
    else setProductos(resProductos.data ?? []);
    if (!resClientes.error) setClientes(resClientes.data ?? []);
    if (resNegocio.data) setNegocio(resNegocio.data);
    if (!resVentas.error) setVentas(resVentas.data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const productosFiltrados = useMemo(() => {
    const termino = busquedaProducto.trim().toLowerCase();
    if (termino === "") return productos.slice(0, 20);
    return productos
      .filter(
        (p) =>
          p.descripcion.toLowerCase().includes(termino) ||
          (p.codigo_barra ?? "").toLowerCase().includes(termino),
      )
      .slice(0, 20);
  }, [productos, busquedaProducto]);

  const clientesFiltrados = useMemo(() => {
    const termino = busquedaCliente.trim().toLowerCase();
    if (termino === "") return clientes.slice(0, 15);
    return clientes
      .filter((cli) => `${cli.nombre} ${cli.apellidos ?? ""}`.toLowerCase().includes(termino))
      .slice(0, 15);
  }, [clientes, busquedaCliente]);

  const clienteSeleccionado = clientes.find((cli) => cli.id === clienteId) ?? null;

  function agregarProducto(producto: ProductoOpcion, mayoreo: boolean): void {
    const precioUnitario =
      mayoreo && producto.precio_mayoreo ? producto.precio_mayoreo : producto.precio_venta;
    setCarrito((actual) => {
      const existente = actual.find(
        (l) =>
          l.producto_id === producto.id &&
          l.precioUnitario === precioUnitario &&
          l.esMayoreo === mayoreo,
      );
      if (existente) {
        return actual.map((l) =>
          l.clave === existente.clave ? { ...l, cantidad: l.cantidad + 1 } : l,
        );
      }
      return [
        ...actual,
        {
          clave: crypto.randomUUID(),
          producto_id: producto.id,
          descripcion: producto.descripcion,
          precioUnitario,
          cantidad: 1,
          tasaImpuesto: producto.impuesto_tipo === "exento" ? 0 : producto.tasa_impuesto,
          esMayoreo: mayoreo,
        },
      ];
    });
  }

  function actualizarCantidad(clave: string, cantidad: number): void {
    setCarrito((actual) =>
      actual.map((l) => (l.clave === clave ? { ...l, cantidad: Math.max(0.01, cantidad) } : l)),
    );
  }

  function quitarLinea(clave: string): void {
    setCarrito((actual) => actual.filter((l) => l.clave !== clave));
  }

  const totales = calcularTotales(
    carrito.map((l) => ({
      precioUnitario: l.precioUnitario,
      cantidad: l.cantidad,
      tasaImpuesto: l.tasaImpuesto,
    })),
  );

  const pagosValidos: PagoInput[] = pagos
    .filter((p) => Number(p.monto) > 0)
    .map((p) => ({ metodo: p.metodo, monto: Number(p.monto) }));
  const cobro = procesarCobro(totales.total, pagosValidos);

  function actualizarPago(indice: number, cambios: Partial<PagoFila>): void {
    setPagos((actuales) => actuales.map((p, i) => (i === indice ? { ...p, ...cambios } : p)));
  }

  function agregarPago(): void {
    setPagos((actuales) => [...actuales, { metodo: "efectivo", monto: "" }]);
  }

  function quitarPago(indice: number): void {
    setPagos((actuales) => actuales.filter((_, i) => i !== indice));
  }

  async function crearClienteRapido(): Promise<void> {
    if (nombreClienteNuevo.trim() === "") return;
    const { data, error: errorCliente } = await supabase
      .from("cliente")
      .insert({
        id: crypto.randomUUID(),
        nombre: nombreClienteNuevo.trim(),
        telefono: telefonoClienteNuevo.trim() || null,
      })
      .select("id, nombre, apellidos, aplica_credito, limite_credito, saldo_credito")
      .single();
    if (errorCliente || !data) {
      setError(errorCliente?.message ?? "No se pudo crear el cliente.");
      return;
    }
    setClientes((actuales) => [...actuales, data]);
    setClienteId(data.id);
    setNombreClienteNuevo("");
    setTelefonoClienteNuevo("");
  }

  async function guardarVenta(): Promise<void> {
    setError(null);
    setExito(null);

    if (carrito.length === 0) {
      setError("Agrega al menos un producto al carrito.");
      return;
    }
    if (!cobro.suficiente) {
      setError(`El pago no cubre el total. Falta RD$ ${cobro.faltante.toFixed(2)}.`);
      return;
    }

    for (const linea of carrito) {
      const producto = productos.find((p) => p.id === linea.producto_id);
      if (!producto) continue;
      const disponibilidad = evaluarDisponibilidad({
        inventarioActivo: negocio.inventario_activo,
        existencia: producto.existencia,
        politica: producto.politica_sin_existencia,
        cantidadSolicitada: linea.cantidad,
      });
      if (!disponibilidad.permitido) {
        setError(
          `"${producto.descripcion}" no tiene existencia suficiente (faltan ${disponibilidad.faltante}) y su política es bloquear la venta.`,
        );
        return;
      }
    }

    const montoCredito = pagosValidos
      .filter((p) => p.metodo === "credito")
      .reduce((acumulado, p) => acumulado + p.monto, 0);

    if (montoCredito > 0) {
      if (!clienteSeleccionado) {
        setError("El pago a crédito requiere asignar un cliente al ticket.");
        return;
      }
      if (!clienteSeleccionado.aplica_credito) {
        setError("Este cliente no tiene crédito habilitado.");
        return;
      }
      const disponible = clienteSeleccionado.limite_credito - clienteSeleccionado.saldo_credito;
      if (montoCredito > disponible) {
        setError(
          `El cliente solo tiene RD$ ${Math.max(0, disponible).toFixed(2)} de crédito disponible.`,
        );
        return;
      }
    }

    setGuardando(true);
    try {
      const { data: ultimaVenta } = await supabase
        .from("factura")
        .select("numero_interno")
        .eq("prefijo_caja", "REM")
        .order("numero_interno", { ascending: false })
        .limit(1)
        .maybeSingle();
      const numeroInterno = (ultimaVenta?.numero_interno ?? 0) + 1;

      const idFactura = crypto.randomUUID();
      const ahora = new Date().toISOString();

      const { error: errorFactura } = await supabase.from("factura").insert({
        id: idFactura,
        numero_interno: numeroInterno,
        fecha_hora: ahora,
        cliente_id: clienteId || null,
        caja_id: null,
        usuario_id: null,
        tipo: "normal",
        subtotal_gravado: totales.subtotalGravado,
        subtotal_exento: totales.subtotalExento,
        total_itbis: totales.totalItbis,
        total: totales.total,
        monto_pagado: cobro.montoPagado,
        cambio: cobro.cambio,
        estado: "cobrada",
        prefijo_caja: "REM",
      });
      if (errorFactura) {
        setError(errorFactura.message);
        return;
      }

      const filasLinea = carrito.map((linea, indice) => {
        const calculada = calcularLinea({
          precioUnitario: linea.precioUnitario,
          cantidad: linea.cantidad,
          tasaImpuesto: linea.tasaImpuesto,
        });
        const producto = productos.find((p) => p.id === linea.producto_id);
        return {
          id: crypto.randomUUID(),
          factura_id: idFactura,
          producto_id: linea.producto_id,
          descripcion: linea.descripcion,
          cantidad: linea.cantidad,
          precio_unitario: linea.precioUnitario,
          es_mayoreo: linea.esMayoreo,
          impuesto_tipo: producto?.impuesto_tipo ?? "itbis18",
          tasa_impuesto: linea.tasaImpuesto,
          monto_itbis: calculada.montoItbis,
          subtotal: calculada.subtotal,
          _orden: indice,
        };
      });
      const { error: errorLineas } = await supabase
        .from("factura_linea")
        .insert(filasLinea.map(({ _orden, ...fila }) => fila));
      if (errorLineas) {
        setError(
          `La venta se guardó pero las líneas fallaron (${errorLineas.message}). Queda huérfana, revísala en el SQL Editor.`,
        );
        return;
      }

      const filasPago = pagosValidos.map((pago) => ({
        id: crypto.randomUUID(),
        factura_id: idFactura,
        metodo: pago.metodo,
        monto: pago.monto,
      }));
      const { error: errorPagos } = await supabase.from("pago").insert(filasPago);
      if (errorPagos) {
        setError(
          `La venta y sus líneas se guardaron pero los pagos fallaron (${errorPagos.message}). Revísala en el SQL Editor.`,
        );
        return;
      }

      if (negocio.inventario_activo) {
        for (const linea of carrito) {
          const producto = productos.find((p) => p.id === linea.producto_id);
          if (!producto) continue;
          await supabase
            .from("producto")
            .update({ existencia: (producto.existencia ?? 0) - linea.cantidad })
            .eq("id", linea.producto_id);
          await supabase.from("movimiento_inventario").insert({
            id: crypto.randomUUID(),
            producto_id: linea.producto_id,
            tipo: "venta",
            cantidad: -linea.cantidad,
            costo: null,
            referencia_tipo: "factura",
            referencia_id: idFactura,
            fecha: ahora,
            usuario_id: null,
          });
        }
      }

      if (montoCredito > 0 && clienteSeleccionado) {
        await supabase
          .from("cliente")
          .update({ saldo_credito: clienteSeleccionado.saldo_credito + montoCredito })
          .eq("id", clienteSeleccionado.id);
      }

      setExito(`Venta #${numeroInterno} registrada. Total RD$ ${totales.total.toFixed(2)}.`);
      setCarrito([]);
      setPagos([{ metodo: "efectivo", monto: "" }]);
      setClienteId("");
      setBusquedaCliente("");
      setBusquedaProducto("");
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <p>Cargando ventas…</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>Ventas</h2>

      <div
        role="note"
        style={{
          ...s.tarjeta,
          padding: "10px 12px",
          fontSize: 13,
          color: c.gris,
          marginBottom: 12,
        }}
      >
        La existencia mostrada puede no reflejar ventas recientes hechas en la caja física (se
        actualiza cuando esa caja sincroniza).
      </div>

      {error !== null && (
        <div role="alert" style={s.errorBox}>
          {error}
        </div>
      )}
      {exito !== null && (
        <div
          role="status"
          style={{
            background: c.verdeFondo,
            color: c.verde,
            border: `1px solid ${c.verde}`,
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            marginBottom: 12,
          }}
        >
          {exito}
        </div>
      )}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <section style={{ ...s.tarjeta, flex: "1 1 380px" }}>
          <h3 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>Buscar producto</h3>
          <input
            type="text"
            value={busquedaProducto}
            onChange={(evento) => setBusquedaProducto(evento.target.value)}
            placeholder="Nombre o código de barra…"
            style={{ ...s.input, marginBottom: 12 }}
          />
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {productosFiltrados.map((producto) => (
              <div
                key={producto.id}
                className="sfr-fila-clickeable"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 6px",
                  borderBottom: `1px solid ${c.borde}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 14 }}>{producto.descripcion}</div>
                  <div style={{ fontSize: 12, color: c.gris }}>
                    RD$ {money(producto.precio_venta)}
                    {producto.precio_mayoreo
                      ? ` · Mayoreo RD$ ${money(producto.precio_mayoreo)}`
                      : ""}
                    {negocio.inventario_activo ? ` · Existencia: ${producto.existencia ?? 0}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => agregarProducto(producto, false)}
                    style={botonChip}
                  >
                    + Agregar
                  </button>
                  {producto.precio_mayoreo !== null && (
                    <button
                      type="button"
                      onClick={() => agregarProducto(producto, true)}
                      style={botonChip}
                    >
                      + Mayoreo
                    </button>
                  )}
                </div>
              </div>
            ))}
            {productosFiltrados.length === 0 && (
              <p style={{ color: c.gris, fontSize: 13 }}>Sin resultados.</p>
            )}
          </div>
        </section>

        <section style={{ ...s.tarjeta, flex: "2 1 480px" }}>
          <h3 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>Carrito</h3>
          <table style={{ ...s.tabla, marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={s.th}>Producto</th>
                <th style={s.th}>Cantidad</th>
                <th style={s.th}>Precio</th>
                <th style={s.th}>Subtotal</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {carrito.map((linea) => (
                <tr key={linea.clave}>
                  <td style={s.td}>
                    {linea.descripcion}
                    {linea.esMayoreo && (
                      <span style={{ fontSize: 11, color: c.gris }}> (mayoreo)</span>
                    )}
                  </td>
                  <td style={s.td}>
                    <input
                      type="number"
                      step="0.01"
                      value={linea.cantidad}
                      onChange={(evento) =>
                        actualizarCantidad(linea.clave, Number(evento.target.value))
                      }
                      style={{ ...s.input, width: 70, padding: "4px 6px" }}
                    />
                  </td>
                  <td style={s.td}>{money(linea.precioUnitario)}</td>
                  <td style={s.tdDerecha}>{money(linea.precioUnitario * linea.cantidad)}</td>
                  <td style={s.td}>
                    <button
                      type="button"
                      className="sfr-peligro"
                      onClick={() => quitarLinea(linea.clave)}
                      style={{ ...s.botonPeligro, border: "none", padding: "4px 8px" }}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {carrito.length === 0 && (
                <tr>
                  <td colSpan={5} style={s.filaVacia}>
                    Carrito vacío.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <p style={{ fontSize: 14, marginBottom: 16 }}>
            Gravado: {money(totales.subtotalGravado)} · Exento: {money(totales.subtotalExento)} ·
            ITBIS: {money(totales.totalItbis)} · <strong>Total: {money(totales.total)}</strong>
          </p>

          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Cliente (opcional)</h3>
          <input
            type="text"
            value={busquedaCliente}
            onChange={(evento) => setBusquedaCliente(evento.target.value)}
            placeholder="Buscar cliente…"
            style={{ ...s.input, marginBottom: 8 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setClienteId("")}
              style={clienteId === "" ? botonChipActivo : botonChip}
            >
              — Sin cliente —
            </button>
            {clientesFiltrados.map((cliente) => (
              <button
                key={cliente.id}
                type="button"
                onClick={() => setClienteId(cliente.id)}
                style={clienteId === cliente.id ? botonChipActivo : botonChip}
              >
                {cliente.nombre} {cliente.apellidos ?? ""}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              value={nombreClienteNuevo}
              onChange={(evento) => setNombreClienteNuevo(evento.target.value)}
              placeholder="Nombre (nuevo cliente)"
              style={s.input}
            />
            <input
              type="text"
              value={telefonoClienteNuevo}
              onChange={(evento) => setTelefonoClienteNuevo(evento.target.value)}
              placeholder="Teléfono"
              style={s.input}
            />
            <button
              type="button"
              onClick={() => void crearClienteRapido()}
              style={s.botonSecundario}
            >
              + Nuevo cliente
            </button>
          </div>

          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Pago</h3>
          {pagos.map((pago, indice) => (
            <div key={indice} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select
                value={pago.metodo}
                onChange={(evento) =>
                  actualizarPago(indice, { metodo: evento.target.value as MetodoPago })
                }
                style={s.input}
              >
                {METODOS.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={pago.monto}
                onChange={(evento) => actualizarPago(indice, { monto: evento.target.value })}
                placeholder="Monto"
                style={{ ...s.input, width: 120 }}
              />
              <button
                type="button"
                className="sfr-peligro"
                onClick={() => quitarPago(indice)}
                disabled={pagos.length === 1}
                style={{ ...s.botonPeligro, border: "none" }}
              >
                Quitar
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={agregarPago}
            style={{ ...s.botonSecundario, marginBottom: 16 }}
          >
            + Agregar pago
          </button>

          <p style={{ fontSize: 14, marginBottom: 16 }}>
            Pagado: {money(cobro.montoPagado)}
            {cobro.suficiente
              ? ` · Cambio: ${money(cobro.cambio)}`
              : ` · Falta: ${money(cobro.faltante)}`}
          </p>

          <button
            type="button"
            onClick={() => void guardarVenta()}
            disabled={guardando || carrito.length === 0}
            style={{
              ...s.boton,
              padding: "10px 20px",
              cursor: guardando || carrito.length === 0 ? "not-allowed" : "pointer",
              opacity: guardando || carrito.length === 0 ? 0.7 : 1,
            }}
          >
            {guardando ? "Guardando…" : "Registrar venta"}
          </button>
        </section>
      </div>

      <h3 style={{ marginTop: 24, fontSize: 18, fontWeight: 600 }}>Últimas ventas remotas</h3>
      <div className="sfr-tabla-scroll">
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Fecha</th>
              <th style={s.th}>Total</th>
              <th style={s.th}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((v) => (
              <tr key={v.id}>
                <td style={s.td}>{v.fecha_hora.slice(0, 16).replace("T", " ")}</td>
                <td style={s.tdDerecha}>{money(v.total)}</td>
                <td style={s.td}>{v.estado}</td>
              </tr>
            ))}
            {ventas.length === 0 && (
              <tr>
                <td colSpan={3} style={s.filaVacia}>
                  Sin ventas remotas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const botonChip: CSSProperties = {
  ...s.botonSecundario,
  padding: "6px 12px",
  fontSize: 13,
};

const botonChipActivo: CSSProperties = {
  ...s.boton,
  padding: "6px 12px",
  fontSize: 13,
};
