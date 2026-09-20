import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { calcularPrecioVenta, tasaDe, type ImpuestoTipo } from "@sfr/core";
import { supabase } from "../supabaseClient";

interface DepartamentoOpcion {
  id: string;
  nombre: string;
}

interface ProductoFila {
  id: string;
  codigo_barra: string | null;
  descripcion: string;
  tipo_venta: string;
  unidad_medida: string | null;
  costo: number;
  pct_ganancia: number;
  precio_venta: number;
  precio_mayoreo: number | null;
  departamento_id: string | null;
  impuesto_tipo: ImpuestoTipo;
  tasa_impuesto: number;
  existencia: number | null;
  politica_sin_existencia: "bloquear" | "advertir";
  favorito: boolean;
  activo: boolean;
}

interface FormularioProducto {
  id: string | null;
  descripcion: string;
  codigoBarra: string;
  tipoVenta: string;
  unidadMedida: string;
  costo: string;
  pctGanancia: string;
  precioVentaManual: string;
  precioMayoreo: string;
  departamentoId: string;
  impuestoTipo: ImpuestoTipo;
  politicaSinExistencia: "bloquear" | "advertir";
  activo: boolean;
  favorito: boolean;
}

function formularioVacio(): FormularioProducto {
  return {
    id: null,
    descripcion: "",
    codigoBarra: "",
    tipoVenta: "unidad",
    unidadMedida: "",
    costo: "0",
    pctGanancia: "0",
    precioVentaManual: "",
    precioMayoreo: "",
    departamentoId: "",
    impuestoTipo: "itbis18",
    politicaSinExistencia: "advertir",
    activo: true,
    favorito: false,
  };
}

function formularioDesdeFila(fila: ProductoFila): FormularioProducto {
  return {
    id: fila.id,
    descripcion: fila.descripcion,
    codigoBarra: fila.codigo_barra ?? "",
    tipoVenta: fila.tipo_venta,
    unidadMedida: fila.unidad_medida ?? "",
    costo: String(fila.costo),
    pctGanancia: String(fila.pct_ganancia),
    precioVentaManual: String(fila.precio_venta),
    precioMayoreo: fila.precio_mayoreo !== null ? String(fila.precio_mayoreo) : "",
    departamentoId: fila.departamento_id ?? "",
    impuestoTipo: fila.impuesto_tipo,
    politicaSinExistencia: fila.politica_sin_existencia,
    activo: fila.activo,
    favorito: fila.favorito,
  };
}

export function Productos(): JSX.Element {
  const [productos, setProductos] = useState<ProductoFila[]>([]);
  const [departamentos, setDepartamentos] = useState<DepartamentoOpcion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [departamentoNuevo, setDepartamentoNuevo] = useState("");
  const [formulario, setFormulario] = useState<FormularioProducto>(formularioVacio());
  const [existenciaEdicion, setExistenciaEdicion] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [resProductos, resDepartamentos] = await Promise.all([
      supabase
        .from("producto")
        .select(
          "id, codigo_barra, descripcion, tipo_venta, unidad_medida, costo, pct_ganancia, precio_venta, precio_mayoreo, departamento_id, impuesto_tipo, tasa_impuesto, existencia, politica_sin_existencia, favorito, activo",
        )
        .is("deleted_at", null)
        .order("descripcion"),
      supabase.from("departamento").select("id, nombre").is("deleted_at", null).order("nombre"),
    ]);
    if (resProductos.error) setError(resProductos.error.message);
    else setProductos((resProductos.data ?? []) as ProductoFila[]);
    if (!resDepartamentos.error) setDepartamentos(resDepartamentos.data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const productosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (termino === "") return productos;
    return productos.filter(
      (p) =>
        p.descripcion.toLowerCase().includes(termino) ||
        (p.codigo_barra ?? "").toLowerCase().includes(termino),
    );
  }, [productos, busqueda]);

  const precioCalculado = calcularPrecioVenta({
    costo: Number(formulario.costo) || 0,
    pctGanancia: Number(formulario.pctGanancia) || 0,
    tasaImpuesto: tasaDe(formulario.impuestoTipo),
    precioManual:
      formulario.precioVentaManual.trim() === "" ? null : Number(formulario.precioVentaManual),
  });

  function editar(fila: ProductoFila): void {
    setFormulario(formularioDesdeFila(fila));
  }

  function cancelarEdicion(): void {
    setFormulario(formularioVacio());
  }

  async function crearDepartamento(): Promise<DepartamentoOpcion | null> {
    if (departamentoNuevo.trim() === "") return null;
    const { data, error: errorDepartamento } = await supabase
      .from("departamento")
      .insert({ id: crypto.randomUUID(), nombre: departamentoNuevo.trim() })
      .select("id, nombre")
      .single();
    if (errorDepartamento || !data) {
      setError(errorDepartamento?.message ?? "No se pudo crear el departamento.");
      return null;
    }
    setDepartamentos((actuales) => [...actuales, data]);
    setDepartamentoNuevo("");
    return data;
  }

  async function guardar(): Promise<void> {
    setError(null);

    if (formulario.descripcion.trim() === "") {
      setError("La descripción es obligatoria.");
      return;
    }
    const costo = Number(formulario.costo) || 0;
    if (costo < 0) {
      setError("El costo no puede ser negativo.");
      return;
    }

    setGuardando(true);
    try {
      let departamentoId = formulario.departamentoId || null;
      if (!departamentoId && departamentoNuevo.trim() !== "") {
        const creado = await crearDepartamento();
        if (!creado) return;
        departamentoId = creado.id;
      }

      const tasaImpuesto = tasaDe(formulario.impuestoTipo);
      const precioVenta = calcularPrecioVenta({
        costo,
        pctGanancia: Number(formulario.pctGanancia) || 0,
        tasaImpuesto,
        precioManual:
          formulario.precioVentaManual.trim() === "" ? null : Number(formulario.precioVentaManual),
      });

      const payload = {
        descripcion: formulario.descripcion.trim(),
        codigo_barra: formulario.codigoBarra.trim() || null,
        tipo_venta: formulario.tipoVenta,
        unidad_medida: formulario.unidadMedida.trim() || null,
        costo,
        pct_ganancia: Number(formulario.pctGanancia) || 0,
        precio_venta: precioVenta,
        precio_mayoreo:
          formulario.precioMayoreo.trim() === "" ? null : Number(formulario.precioMayoreo),
        departamento_id: departamentoId,
        impuesto_tipo: formulario.impuestoTipo,
        tasa_impuesto: tasaImpuesto,
        politica_sin_existencia: formulario.politicaSinExistencia,
        activo: formulario.activo,
        favorito: formulario.favorito,
      };

      if (formulario.id) {
        const { error: errorSupabase } = await supabase
          .from("producto")
          .update(payload)
          .eq("id", formulario.id);
        if (errorSupabase) {
          setError(errorSupabase.message);
          return;
        }
      } else {
        const { error: errorSupabase } = await supabase
          .from("producto")
          .insert({ id: crypto.randomUUID(), ...payload });
        if (errorSupabase) {
          setError(errorSupabase.message);
          return;
        }
      }

      setFormulario(formularioVacio());
      await cargar();
    } finally {
      setGuardando(false);
    }
  }

  async function ajustarExistencia(producto: ProductoFila): Promise<void> {
    const texto = existenciaEdicion[producto.id];
    if (texto === undefined) return;
    const nuevaExistencia = Number(texto);
    if (Number.isNaN(nuevaExistencia) || nuevaExistencia === (producto.existencia ?? 0)) {
      setExistenciaEdicion((actual) => {
        const { [producto.id]: _quitado, ...resto } = actual;
        return resto;
      });
      return;
    }
    setError(null);
    const delta = nuevaExistencia - (producto.existencia ?? 0);

    const { error: errorProducto } = await supabase
      .from("producto")
      .update({ existencia: nuevaExistencia })
      .eq("id", producto.id);
    if (errorProducto) {
      setError(errorProducto.message);
      return;
    }
    // No atómico (ver Ventas.tsx / Compras.tsx): si este segundo insert falla,
    // la existencia ya quedó ajustada pero sin su registro de auditoría.
    const { error: errorMovimiento } = await supabase.from("movimiento_inventario").insert({
      id: crypto.randomUUID(),
      producto_id: producto.id,
      tipo: "ajuste",
      cantidad: delta,
      fecha: new Date().toISOString(),
      usuario_id: null,
    });
    if (errorMovimiento) {
      setError(
        `La existencia se ajustó pero no se pudo registrar el movimiento (${errorMovimiento.message}).`,
      );
    }
    setExistenciaEdicion((actual) => {
      const { [producto.id]: _quitado, ...resto } = actual;
      return resto;
    });
    await cargar();
  }

  if (cargando) {
    return <p>Cargando productos…</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Productos</h2>
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
        <h3 style={{ marginTop: 0 }}>{formulario.id ? "Editar producto" : "Nuevo producto"}</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo etiqueta="Descripción">
            <input
              type="text"
              value={formulario.descripcion}
              onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })}
              style={{ ...estiloInput, width: 220 }}
            />
          </Campo>
          <Campo etiqueta="Código de barra">
            <input
              type="text"
              value={formulario.codigoBarra}
              onChange={(e) => setFormulario({ ...formulario, codigoBarra: e.target.value })}
              style={estiloInput}
            />
          </Campo>
          <Campo etiqueta="Departamento">
            <select
              value={formulario.departamentoId}
              onChange={(e) => setFormulario({ ...formulario, departamentoId: e.target.value })}
              style={estiloInput}
            >
              <option value="">— Ninguno —</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="O departamento nuevo">
            <input
              type="text"
              value={departamentoNuevo}
              disabled={formulario.departamentoId !== ""}
              onChange={(e) => setDepartamentoNuevo(e.target.value)}
              style={estiloInput}
            />
          </Campo>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo etiqueta="Costo">
            <input
              type="number"
              step="0.01"
              value={formulario.costo}
              onChange={(e) => setFormulario({ ...formulario, costo: e.target.value })}
              style={{ ...estiloInput, width: 100 }}
            />
          </Campo>
          <Campo etiqueta="% Ganancia">
            <input
              type="number"
              step="0.01"
              value={formulario.pctGanancia}
              onChange={(e) => setFormulario({ ...formulario, pctGanancia: e.target.value })}
              style={{ ...estiloInput, width: 100 }}
            />
          </Campo>
          <Campo etiqueta="Impuesto">
            <select
              value={formulario.impuestoTipo}
              onChange={(e) =>
                setFormulario({ ...formulario, impuestoTipo: e.target.value as ImpuestoTipo })
              }
              style={estiloInput}
            >
              <option value="itbis18">ITBIS 18%</option>
              <option value="itbis16">ITBIS 16%</option>
              <option value="exento">Exento</option>
              <option value="otro">Otro</option>
            </select>
          </Campo>
          <Campo etiqueta="Precio de venta (manual, opcional)">
            <input
              type="number"
              step="0.01"
              value={formulario.precioVentaManual}
              onChange={(e) => setFormulario({ ...formulario, precioVentaManual: e.target.value })}
              placeholder={precioCalculado.toFixed(2)}
              style={{ ...estiloInput, width: 130 }}
            />
          </Campo>
          <Campo etiqueta="Precio mayoreo">
            <input
              type="number"
              step="0.01"
              value={formulario.precioMayoreo}
              onChange={(e) => setFormulario({ ...formulario, precioMayoreo: e.target.value })}
              style={{ ...estiloInput, width: 110 }}
            />
          </Campo>
        </div>

        <p style={{ fontSize: 13, color: "var(--sfr-gris)", marginBottom: 12 }}>
          Precio de venta calculado: RD$ {precioCalculado.toFixed(2)} (déjalo vacío arriba para usar
          este valor derivado de costo + % ganancia + impuesto).
        </p>

        <div style={{ display: "flex", gap: 20, marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={formulario.activo}
              onChange={(e) => setFormulario({ ...formulario, activo: e.target.checked })}
            />
            Activo
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={formulario.favorito}
              onChange={(e) => setFormulario({ ...formulario, favorito: e.target.checked })}
            />
            Favorito
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            Si se agota:
            <select
              value={formulario.politicaSinExistencia}
              onChange={(e) =>
                setFormulario({
                  ...formulario,
                  politicaSinExistencia: e.target.value as "bloquear" | "advertir",
                })
              }
              style={estiloInput}
            >
              <option value="advertir">Advertir y permitir</option>
              <option value="bloquear">Bloquear venta</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void guardar()}
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
            {guardando ? "Guardando…" : formulario.id ? "Guardar cambios" : "Crear producto"}
          </button>
          {formulario.id && (
            <button
              type="button"
              onClick={cancelarEdicion}
              style={{
                background: "transparent",
                border: "1px solid var(--sfr-borde)",
                borderRadius: 8,
                padding: "9px 18px",
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          )}
        </div>
      </section>

      <input
        type="text"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar producto…"
        style={{ ...estiloInput, width: "100%", marginBottom: 12, boxSizing: "border-box" }}
      />

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Precio</th>
              <th>Existencia</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.descripcion}
                  {p.favorito && <span style={{ marginLeft: 6 }}>★</span>}
                </td>
                <td>{p.precio_venta.toFixed(2)}</td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={existenciaEdicion[p.id] ?? String(p.existencia ?? 0)}
                    onChange={(e) =>
                      setExistenciaEdicion({ ...existenciaEdicion, [p.id]: e.target.value })
                    }
                    onBlur={() => void ajustarExistencia(p)}
                    style={{ ...estiloInput, width: 90 }}
                  />
                </td>
                <td>{p.activo ? "Sí" : "No"}</td>
                <td>
                  <button type="button" onClick={() => editar(p)} style={botonFila}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {productosFiltrados.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--sfr-gris)" }}>
                  Sin productos.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Campo(props: { etiqueta: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}>
        {props.etiqueta}
      </label>
      {props.children}
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

const botonFila: CSSProperties = {
  border: "1px solid var(--sfr-borde)",
  background: "transparent",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
};
