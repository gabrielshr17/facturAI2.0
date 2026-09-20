import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * IMPORTANTE — por qué esta pantalla NO es atómica: PostgREST (la API que
 * genera Supabase sobre Postgres) no expone transacciones multi-tabla vía
 * REST; cada `.insert()` es su propio commit. Guardar una compra es DOS
 * inserciones secuenciales (primero `compra`, luego sus `compra_linea`). Si
 * la primera tiene éxito y la segunda falla (red, RLS, lo que sea), la
 * compra queda creada SIN líneas — huérfana, con subtotal/total ya
 * calculados pero sin el detalle que los sustenta. Para el alcance de hoy es
 * aceptable (el dueño puede ver el hueco y decidir si la borra o la
 * completa a mano en el SQL Editor); una mejora futura real sería mover esto
 * a una función Postgres (`rpc`) que envuelva ambos inserts en una sola
 * transacción del lado del servidor.
 *
 * `compra_linea.producto_id` es opcional (columna nullable en schema.sql):
 * una línea de compra puede ser "descripción libre" sin ligar a un producto
 * del catálogo, tal como permite la tabla.
 */
interface ProveedorFila {
  id: string;
  nombre: string;
}

interface ProductoOpcion {
  id: string;
  descripcion: string;
}

interface CompraFila {
  id: string;
  fecha: string;
  subtotal: number;
  itbis: number;
  total: number;
  proveedor: { nombre: string } | { nombre: string }[] | null;
}

interface LineaNueva {
  producto_id: string;
  descripcion: string;
  cantidad: string;
  costo_unitario: string;
}

const TASA_ITBIS = 0.18;

function lineaVacia(): LineaNueva {
  return { producto_id: "", descripcion: "", cantidad: "1", costo_unitario: "0" };
}

function nombreProveedor(proveedor: CompraFila["proveedor"]): string {
  if (proveedor === null) return "—";
  if (Array.isArray(proveedor)) return proveedor[0]?.nombre ?? "—";
  return proveedor.nombre;
}

export function Compras(): JSX.Element {
  const [compras, setCompras] = useState<CompraFila[]>([]);
  const [proveedores, setProveedores] = useState<ProveedorFila[]>([]);
  const [productos, setProductos] = useState<ProductoOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const [proveedorId, setProveedorId] = useState("");
  const [proveedorNuevo, setProveedorNuevo] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [lineas, setLineas] = useState<LineaNueva[]>([lineaVacia()]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [resCompras, resProveedores, resProductos] = await Promise.all([
      supabase
        .from("compra")
        .select("id, fecha, subtotal, itbis, total, proveedor:proveedor_id(nombre)")
        .is("deleted_at", null)
        .order("fecha", { ascending: false })
        .limit(50),
      supabase.from("proveedor").select("id, nombre").is("deleted_at", null).order("nombre"),
      supabase
        .from("producto")
        .select("id, descripcion")
        .is("deleted_at", null)
        .order("descripcion"),
    ]);
    if (resCompras.error) {
      setError(resCompras.error.message);
    } else {
      setCompras((resCompras.data ?? []) as unknown as CompraFila[]);
    }
    if (!resProveedores.error) setProveedores(resProveedores.data ?? []);
    if (!resProductos.error) setProductos(resProductos.data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function actualizarLinea(indice: number, cambios: Partial<LineaNueva>): void {
    setLineas((actuales) =>
      actuales.map((linea, i) => (i === indice ? { ...linea, ...cambios } : linea)),
    );
  }

  function agregarLinea(): void {
    setLineas((actuales) => [...actuales, lineaVacia()]);
  }

  function quitarLinea(indice: number): void {
    setLineas((actuales) => actuales.filter((_, i) => i !== indice));
  }

  function calcularTotales(): { subtotal: number; itbis: number; total: number } {
    const subtotal = lineas.reduce((acumulado, linea) => {
      const cantidad = Number(linea.cantidad) || 0;
      const costo = Number(linea.costo_unitario) || 0;
      return acumulado + cantidad * costo;
    }, 0);
    const itbis = Math.round(subtotal * TASA_ITBIS * 100) / 100;
    const total = Math.round((subtotal + itbis) * 100) / 100;
    return { subtotal: Math.round(subtotal * 100) / 100, itbis, total };
  }

  async function guardarCompra(): Promise<void> {
    setError(null);

    const lineasValidas = lineas.filter(
      (linea) => linea.descripcion.trim() !== "" && Number(linea.cantidad) > 0,
    );
    if (lineasValidas.length === 0) {
      setError("Agrega al menos una línea con descripción y cantidad mayor a cero.");
      return;
    }

    setGuardando(true);
    try {
      let idProveedor = proveedorId || null;
      if (!idProveedor && proveedorNuevo.trim() !== "") {
        const { data: proveedorCreado, error: errorProveedor } = await supabase
          .from("proveedor")
          .insert({ id: crypto.randomUUID(), nombre: proveedorNuevo.trim() })
          .select("id, nombre")
          .single();
        if (errorProveedor || !proveedorCreado) {
          setError(errorProveedor?.message ?? "No se pudo crear el proveedor.");
          return;
        }
        idProveedor = proveedorCreado.id;
        setProveedores((actuales) => [...actuales, proveedorCreado]);
      }

      const { subtotal, itbis, total } = calcularTotales();
      const idCompra = crypto.randomUUID();
      const fechaHoraIso = new Date(`${fecha}T12:00:00`).toISOString();
      const mesAno = fecha.slice(0, 7);

      const { error: errorCompra } = await supabase.from("compra").insert({
        id: idCompra,
        fecha: fechaHoraIso,
        proveedor_id: idProveedor,
        subtotal,
        itbis,
        total,
        mes_ano_contable: mesAno,
        estado_clasificacion: "sin_fiscal",
        origen: "manual",
      });
      if (errorCompra) {
        setError(errorCompra.message);
        return;
      }

      const filasLinea = lineasValidas.map((linea) => {
        const cantidad = Number(linea.cantidad);
        const costoUnitario = Number(linea.costo_unitario) || 0;
        const subtotalLinea = Math.round(cantidad * costoUnitario * 100) / 100;
        const itbisLinea = Math.round(subtotalLinea * TASA_ITBIS * 100) / 100;
        return {
          id: crypto.randomUUID(),
          compra_id: idCompra,
          producto_id: linea.producto_id || null,
          descripcion: linea.descripcion.trim(),
          cantidad,
          costo_unitario: costoUnitario,
          monto_itbis: itbisLinea,
          subtotal: subtotalLinea,
        };
      });

      const { error: errorLineas } = await supabase.from("compra_linea").insert(filasLinea);
      if (errorLineas) {
        // Ver la cabecera del archivo: la compra ya quedó creada sin líneas.
        setError(
          `La compra se guardó pero las líneas fallaron (${errorLineas.message}). Queda huérfana, revísala en el SQL Editor.`,
        );
        return;
      }

      setProveedorId("");
      setProveedorNuevo("");
      setLineas([lineaVacia()]);
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <p>Cargando compras…</p>;
  }

  const totales = calcularTotales();

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Compras</h2>
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

      <section
        style={{
          background: "var(--sfr-superficie)",
          border: "1px solid var(--sfr-borde)",
          borderRadius: 12,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <h3 style={{ marginTop: 0 }}>Nueva compra</h3>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <label
              style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}
            >
              Proveedor existente
            </label>
            <select
              value={proveedorId}
              onChange={(evento) => setProveedorId(evento.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--sfr-borde)" }}
            >
              <option value="">— Ninguno —</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}
            >
              O proveedor nuevo
            </label>
            <input
              type="text"
              value={proveedorNuevo}
              disabled={proveedorId !== ""}
              onChange={(evento) => setProveedorNuevo(evento.target.value)}
              placeholder="Nombre del proveedor"
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--sfr-borde)" }}
            />
          </div>
          <div>
            <label
              style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}
            >
              Fecha
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(evento) => setFecha(evento.target.value)}
              style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--sfr-borde)" }}
            />
          </div>
        </div>

        <table style={{ marginBottom: 12 }}>
          <thead>
            <tr>
              <th>Producto (catálogo)</th>
              <th>Descripción</th>
              <th>Cantidad</th>
              <th>Costo unitario</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((linea, indice) => (
              <tr key={indice}>
                <td>
                  <select
                    value={linea.producto_id}
                    onChange={(evento) => {
                      const productoId = evento.target.value;
                      const producto = productos.find((p) => p.id === productoId);
                      actualizarLinea(indice, {
                        producto_id: productoId,
                        descripcion: producto ? producto.descripcion : linea.descripcion,
                      });
                    }}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--sfr-borde)",
                    }}
                  >
                    <option value="">— Libre —</option>
                    {productos.map((producto) => (
                      <option key={producto.id} value={producto.id}>
                        {producto.descripcion}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    value={linea.descripcion}
                    onChange={(evento) =>
                      actualizarLinea(indice, { descripcion: evento.target.value })
                    }
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--sfr-borde)",
                      width: 180,
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={linea.cantidad}
                    onChange={(evento) =>
                      actualizarLinea(indice, { cantidad: evento.target.value })
                    }
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--sfr-borde)",
                      width: 90,
                    }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={linea.costo_unitario}
                    onChange={(evento) =>
                      actualizarLinea(indice, { costo_unitario: evento.target.value })
                    }
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: "1px solid var(--sfr-borde)",
                      width: 100,
                    }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => quitarLinea(indice)}
                    disabled={lineas.length === 1}
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "var(--sfr-gris)",
                    }}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          type="button"
          onClick={agregarLinea}
          style={{
            background: "transparent",
            border: "1px solid var(--sfr-borde)",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 13,
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          + Agregar línea
        </button>

        <p style={{ fontSize: 14, marginBottom: 16 }}>
          Subtotal: {totales.subtotal.toFixed(2)} · ITBIS: {totales.itbis.toFixed(2)} ·{" "}
          <strong>Total: {totales.total.toFixed(2)}</strong>
        </p>

        <button
          type="button"
          onClick={() => void guardarCompra()}
          disabled={guardando}
          style={{
            background: "var(--sfr-acento)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "9px 18px",
            fontSize: 14,
            fontWeight: 600,
            cursor: guardando ? "not-allowed" : "pointer",
            opacity: guardando ? 0.7 : 1,
          }}
        >
          {guardando ? "Guardando…" : "Guardar compra"}
        </button>
      </section>

      <h3>Historial (últimas 50)</h3>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Proveedor</th>
              <th>Subtotal</th>
              <th>ITBIS</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {compras.map((compra) => (
              <tr key={compra.id}>
                <td>{compra.fecha.slice(0, 10)}</td>
                <td>{nombreProveedor(compra.proveedor)}</td>
                <td>{compra.subtotal.toFixed(2)}</td>
                <td>{compra.itbis.toFixed(2)}</td>
                <td>{compra.total.toFixed(2)}</td>
              </tr>
            ))}
            {compras.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--sfr-gris)" }}>
                  Sin compras registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
