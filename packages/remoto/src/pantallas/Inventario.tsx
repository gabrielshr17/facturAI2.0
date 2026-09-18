import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Fila de `producto` tal como la necesita esta pantalla. Se listan las
 * columnas explícitas (no `select("*")`) siguiendo la convención del repo
 * (§00-CONVENCIONES.md): una columna nueva de producto queda invisible acá
 * hasta agregarla a mano, a propósito.
 */
interface ProductoFila {
  id: string;
  descripcion: string;
  costo: number;
  precio_venta: number;
  existencia: number | null;
  existencia_minima: number | null;
  activo: boolean;
}

/**
 * Edición inline de `existencia` y `precio_venta`. No hay borrado físico ni
 * lógico de producto en esta pantalla: RLS solo permite UPDATE/INSERT sobre
 * `producto` (sin DELETE), y marcar `deleted_at` desde acá queda fuera del
 * alcance de hoy — el dueño de este encargo pidió omitirlo si no era
 * trivial, y agregar un flujo de "dar de baja" con confirmación no lo es.
 * Pendiente para una siguiente vuelta.
 */
export function Inventario(): JSX.Element {
  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: errorSupabase } = await supabase
      .from("producto")
      .select("id, descripcion, costo, precio_venta, existencia, existencia_minima, activo")
      .is("deleted_at", null)
      .order("descripcion", { ascending: true });
    if (errorSupabase) {
      setError(errorSupabase.message);
    } else {
      setProductos((data ?? []) as ProductoFila[]);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardarCampo(id: string, campo: "existencia" | "precio_venta", valor: number): Promise<void> {
    setGuardandoId(id);
    setError(null);
    const { error: errorSupabase } = await supabase
      .from("producto")
      .update({ [campo]: valor })
      .eq("id", id);
    setGuardandoId(null);
    if (errorSupabase) {
      setError(errorSupabase.message);
      return;
    }
    setProductos((actuales) => actuales.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  }

  if (cargando) {
    return <p>Cargando inventario…</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Inventario</h2>
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
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Costo</th>
              <th>Precio de venta</th>
              <th>Existencia</th>
              <th>Mínimo</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((producto) => {
              const bajoMinimo =
                producto.existencia_minima !== null && (producto.existencia ?? 0) <= producto.existencia_minima;
              return (
                <tr key={producto.id}>
                  <td>
                    {producto.descripcion}
                    {bajoMinimo && (
                      <span className="sfr-badge-alerta" style={{ marginLeft: 8 }}>
                        Reponer
                      </span>
                    )}
                  </td>
                  <td>{producto.costo.toFixed(2)}</td>
                  <td>
                    <CampoNumerico
                      valor={producto.precio_venta}
                      deshabilitado={guardandoId === producto.id}
                      onGuardar={(valor) => guardarCampo(producto.id, "precio_venta", valor)}
                    />
                  </td>
                  <td>
                    <CampoNumerico
                      valor={producto.existencia ?? 0}
                      deshabilitado={guardandoId === producto.id}
                      onGuardar={(valor) => guardarCampo(producto.id, "existencia", valor)}
                    />
                  </td>
                  <td>{producto.existencia_minima ?? "—"}</td>
                </tr>
              );
            })}
            {productos.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--sfr-gris)" }}>
                  Sin productos activos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CampoNumerico(props: {
  valor: number;
  deshabilitado: boolean;
  onGuardar: (valor: number) => void;
}): JSX.Element {
  const [texto, setTexto] = useState(String(props.valor));

  useEffect(() => {
    setTexto(String(props.valor));
  }, [props.valor]);

  function confirmar(): void {
    const numero = Number(texto);
    if (Number.isNaN(numero) || numero === props.valor) {
      setTexto(String(props.valor));
      return;
    }
    props.onGuardar(numero);
  }

  return (
    <input
      type="number"
      step="0.01"
      value={texto}
      disabled={props.deshabilitado}
      onChange={(evento) => setTexto(evento.target.value)}
      onBlur={confirmar}
      onKeyDown={(evento) => {
        if (evento.key === "Enter") {
          evento.currentTarget.blur();
        }
      }}
      style={{
        width: 100,
        padding: "6px 8px",
        fontSize: 14,
        border: "1px solid var(--sfr-borde)",
        borderRadius: 6,
        background: "var(--sfr-superficie)",
        color: "var(--sfr-texto)",
      }}
    />
  );
}
