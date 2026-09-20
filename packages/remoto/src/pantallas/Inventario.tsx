import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { s, money } from "../estilos";

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

  async function guardarCampo(
    id: string,
    campo: "existencia" | "precio_venta",
    valor: number,
  ): Promise<void> {
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
      <h2 style={{ marginTop: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
        Inventario
      </h2>
      {error !== null && (
        <div role="alert" style={s.errorBox}>
          {error}
        </div>
      )}
      <div className="sfr-tabla-scroll">
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Producto</th>
              <th style={s.th}>Costo</th>
              <th style={s.th}>Precio de venta</th>
              <th style={s.th}>Existencia</th>
              <th style={s.th}>Mínimo</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((producto) => {
              const bajoMinimo =
                producto.existencia_minima !== null &&
                (producto.existencia ?? 0) <= producto.existencia_minima;
              return (
                <tr key={producto.id}>
                  <td style={s.td}>
                    {producto.descripcion}
                    {bajoMinimo && (
                      <span className="sfr-badge-alerta" style={{ marginLeft: 8 }}>
                        Reponer
                      </span>
                    )}
                  </td>
                  <td style={s.tdDerecha}>{money(producto.costo)}</td>
                  <td style={s.td}>
                    <CampoNumerico
                      valor={producto.precio_venta}
                      deshabilitado={guardandoId === producto.id}
                      onGuardar={(valor) => guardarCampo(producto.id, "precio_venta", valor)}
                    />
                  </td>
                  <td style={s.td}>
                    <CampoNumerico
                      valor={producto.existencia ?? 0}
                      deshabilitado={guardandoId === producto.id}
                      onGuardar={(valor) => guardarCampo(producto.id, "existencia", valor)}
                    />
                  </td>
                  <td style={s.td}>{producto.existencia_minima ?? "—"}</td>
                </tr>
              );
            })}
            {productos.length === 0 && (
              <tr>
                <td colSpan={5} style={s.filaVacia}>
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
      style={{ ...s.input, width: 100, padding: "6px 8px" }}
    />
  );
}
