import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { supabase } from "../supabaseClient";

type TipoPromocion = "porcentaje" | "monto";
type AplicaAPromocion = "todos" | "producto" | "departamento";

interface PromocionFila {
  id: string;
  nombre: string;
  tipo: TipoPromocion;
  valor: number;
  aplica_a: AplicaAPromocion;
  producto_id: string | null;
  departamento_id: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  activa: boolean;
}

interface OpcionSimple {
  id: string;
  nombre: string;
}

interface FormularioPromocion {
  id: string | null;
  nombre: string;
  tipo: TipoPromocion;
  valor: string;
  aplicaA: AplicaAPromocion;
  productoId: string;
  departamentoId: string;
  fechaInicio: string;
  fechaFin: string;
  activa: boolean;
}

function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formularioVacio(): FormularioPromocion {
  return {
    id: null,
    nombre: "",
    tipo: "porcentaje",
    valor: "0",
    aplicaA: "todos",
    productoId: "",
    departamentoId: "",
    fechaInicio: hoyIso(),
    fechaFin: hoyIso(),
    activa: true,
  };
}

function formularioDesdeFila(fila: PromocionFila): FormularioPromocion {
  return {
    id: fila.id,
    nombre: fila.nombre,
    tipo: fila.tipo,
    valor: String(fila.valor),
    aplicaA: fila.aplica_a,
    productoId: fila.producto_id ?? "",
    departamentoId: fila.departamento_id ?? "",
    fechaInicio: fila.fecha_inicio.slice(0, 10),
    fechaFin: fila.fecha_fin.slice(0, 10),
    activa: fila.activa,
  };
}

function esVigente(p: PromocionFila): boolean {
  const hoy = hoyIso();
  return p.activa && p.fecha_inicio.slice(0, 10) <= hoy && hoy <= p.fecha_fin.slice(0, 10);
}

export function Promociones(): JSX.Element {
  const [promociones, setPromociones] = useState<PromocionFila[]>([]);
  const [productos, setProductos] = useState<OpcionSimple[]>([]);
  const [departamentos, setDepartamentos] = useState<OpcionSimple[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [formulario, setFormulario] = useState<FormularioPromocion>(formularioVacio());

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const [resPromociones, resProductos, resDepartamentos] = await Promise.all([
      supabase
        .from("promocion")
        .select(
          "id, nombre, tipo, valor, aplica_a, producto_id, departamento_id, fecha_inicio, fecha_fin, activa",
        )
        .is("deleted_at", null)
        .order("fecha_inicio", { ascending: false }),
      supabase
        .from("producto")
        .select("id, descripcion")
        .is("deleted_at", null)
        .order("descripcion"),
      supabase.from("departamento").select("id, nombre").is("deleted_at", null).order("nombre"),
    ]);
    if (resPromociones.error) setError(resPromociones.error.message);
    else setPromociones((resPromociones.data ?? []) as PromocionFila[]);
    if (!resProductos.error) {
      setProductos((resProductos.data ?? []).map((p) => ({ id: p.id, nombre: p.descripcion })));
    }
    if (!resDepartamentos.error) setDepartamentos(resDepartamentos.data ?? []);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function editar(fila: PromocionFila): void {
    setFormulario(formularioDesdeFila(fila));
  }

  function cancelarEdicion(): void {
    setFormulario(formularioVacio());
  }

  async function guardar(): Promise<void> {
    setError(null);

    if (formulario.nombre.trim() === "") {
      setError("El nombre es obligatorio.");
      return;
    }
    const valor = Number(formulario.valor);
    if (!(valor > 0)) {
      setError("El valor debe ser mayor a cero.");
      return;
    }
    if (formulario.tipo === "porcentaje" && valor > 100) {
      setError("Un descuento porcentual no puede superar 100.");
      return;
    }
    if (formulario.aplicaA === "producto" && formulario.productoId === "") {
      setError("Selecciona un producto.");
      return;
    }
    if (formulario.aplicaA === "departamento" && formulario.departamentoId === "") {
      setError("Selecciona un departamento.");
      return;
    }
    if (formulario.fechaInicio > formulario.fechaFin) {
      setError("La fecha de inicio no puede ser posterior a la fecha de fin.");
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre: formulario.nombre.trim(),
        tipo: formulario.tipo,
        valor,
        aplica_a: formulario.aplicaA,
        producto_id: formulario.aplicaA === "producto" ? formulario.productoId : null,
        departamento_id: formulario.aplicaA === "departamento" ? formulario.departamentoId : null,
        fecha_inicio: formulario.fechaInicio,
        fecha_fin: formulario.fechaFin,
        activa: formulario.activa,
      };

      if (formulario.id) {
        const { error: errorSupabase } = await supabase
          .from("promocion")
          .update(payload)
          .eq("id", formulario.id);
        if (errorSupabase) {
          setError(errorSupabase.message);
          return;
        }
      } else {
        const { error: errorSupabase } = await supabase
          .from("promocion")
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

  async function eliminar(id: string): Promise<void> {
    if (!confirm("¿Eliminar esta promoción?")) return;
    setError(null);
    const { error: errorSupabase } = await supabase
      .from("promocion")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (errorSupabase) {
      setError(errorSupabase.message);
      return;
    }
    await cargar();
  }

  if (cargando) {
    return <p>Cargando promociones…</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Promociones</h2>
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
        <h3 style={{ marginTop: 0 }}>{formulario.id ? "Editar promoción" : "Nueva promoción"}</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo etiqueta="Nombre">
            <input
              type="text"
              value={formulario.nombre}
              onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
              style={estiloInput}
            />
          </Campo>
          <Campo etiqueta="Tipo">
            <select
              value={formulario.tipo}
              onChange={(e) =>
                setFormulario({ ...formulario, tipo: e.target.value as TipoPromocion })
              }
              style={estiloInput}
            >
              <option value="porcentaje">Porcentaje</option>
              <option value="monto">Monto fijo</option>
            </select>
          </Campo>
          <Campo etiqueta="Valor">
            <input
              type="number"
              step="0.01"
              value={formulario.valor}
              onChange={(e) => setFormulario({ ...formulario, valor: e.target.value })}
              style={{ ...estiloInput, width: 100 }}
            />
          </Campo>
          <Campo etiqueta="Aplica a">
            <select
              value={formulario.aplicaA}
              onChange={(e) =>
                setFormulario({ ...formulario, aplicaA: e.target.value as AplicaAPromocion })
              }
              style={estiloInput}
            >
              <option value="todos">Todos los productos</option>
              <option value="producto">Un producto</option>
              <option value="departamento">Un departamento</option>
            </select>
          </Campo>
          {formulario.aplicaA === "producto" && (
            <Campo etiqueta="Producto">
              <select
                value={formulario.productoId}
                onChange={(e) => setFormulario({ ...formulario, productoId: e.target.value })}
                style={estiloInput}
              >
                <option value="">— Selecciona —</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          )}
          {formulario.aplicaA === "departamento" && (
            <Campo etiqueta="Departamento">
              <select
                value={formulario.departamentoId}
                onChange={(e) => setFormulario({ ...formulario, departamentoId: e.target.value })}
                style={estiloInput}
              >
                <option value="">— Selecciona —</option>
                {departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <Campo etiqueta="Desde">
            <input
              type="date"
              value={formulario.fechaInicio}
              onChange={(e) => setFormulario({ ...formulario, fechaInicio: e.target.value })}
              style={estiloInput}
            />
          </Campo>
          <Campo etiqueta="Hasta">
            <input
              type="date"
              value={formulario.fechaFin}
              onChange={(e) => setFormulario({ ...formulario, fechaFin: e.target.value })}
              style={estiloInput}
            />
          </Campo>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20 }}>
            <input
              type="checkbox"
              checked={formulario.activa}
              onChange={(e) => setFormulario({ ...formulario, activa: e.target.checked })}
            />
            Activa
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
            {guardando ? "Guardando…" : formulario.id ? "Guardar cambios" : "Crear promoción"}
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

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Valor</th>
              <th>Vigencia</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {promociones.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{p.tipo === "porcentaje" ? `${p.valor}%` : `RD$ ${p.valor.toFixed(2)}`}</td>
                <td>
                  {p.fecha_inicio.slice(0, 10)} – {p.fecha_fin.slice(0, 10)}
                </td>
                <td>{esVigente(p) ? "Vigente" : p.activa ? "Fuera de rango" : "Inactiva"}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => editar(p)} style={botonFila}>
                    Editar
                  </button>
                  <button type="button" onClick={() => void eliminar(p.id)} style={botonFila}>
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {promociones.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--sfr-gris)" }}>
                  Sin promociones.
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
