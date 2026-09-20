import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "../supabaseClient";
import { s, money } from "../estilos";

interface ClienteFila {
  id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  comentarios: string | null;
  aplica_credito: boolean;
  limite_credito: number;
  saldo_credito: number;
  documento_tipo: string | null;
  documento_numero: string | null;
}

interface FormularioCliente {
  id: string | null;
  nombre: string;
  apellidos: string;
  telefono: string;
  correo: string;
  direccion: string;
  comentarios: string;
  aplicaCredito: boolean;
  limiteCredito: string;
  documentoTipo: string;
  documentoNumero: string;
}

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formularioVacio(): FormularioCliente {
  return {
    id: null,
    nombre: "",
    apellidos: "",
    telefono: "",
    correo: "",
    direccion: "",
    comentarios: "",
    aplicaCredito: false,
    limiteCredito: "0",
    documentoTipo: "",
    documentoNumero: "",
  };
}

function formularioDesdeFila(fila: ClienteFila): FormularioCliente {
  return {
    id: fila.id,
    nombre: fila.nombre,
    apellidos: fila.apellidos ?? "",
    telefono: fila.telefono ?? "",
    correo: fila.correo ?? "",
    direccion: fila.direccion ?? "",
    comentarios: fila.comentarios ?? "",
    aplicaCredito: fila.aplica_credito,
    limiteCredito: String(fila.limite_credito),
    documentoTipo: fila.documento_tipo ?? "",
    documentoNumero: fila.documento_numero ?? "",
  };
}

export function Clientes(): JSX.Element {
  const [clientes, setClientes] = useState<ClienteFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [formulario, setFormulario] = useState<FormularioCliente>(formularioVacio());

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: errorSupabase } = await supabase
      .from("cliente")
      .select(
        "id, nombre, apellidos, telefono, correo, direccion, comentarios, aplica_credito, limite_credito, saldo_credito, documento_tipo, documento_numero",
      )
      .is("deleted_at", null)
      .order("nombre");
    if (errorSupabase) setError(errorSupabase.message);
    else setClientes((data ?? []) as ClienteFila[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const clientesFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (termino === "") return clientes;
    return clientes.filter((cli) =>
      `${cli.nombre} ${cli.apellidos ?? ""}`.toLowerCase().includes(termino),
    );
  }, [clientes, busqueda]);

  function editar(fila: ClienteFila): void {
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
    if (formulario.correo.trim() !== "" && !REGEX_CORREO.test(formulario.correo.trim())) {
      setError("El correo no tiene un formato válido.");
      return;
    }
    const limiteCredito = Number(formulario.limiteCredito) || 0;
    if (limiteCredito < 0) {
      setError("El límite de crédito no puede ser negativo.");
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre: formulario.nombre.trim(),
        apellidos: formulario.apellidos.trim() || null,
        telefono: formulario.telefono.trim() || null,
        correo: formulario.correo.trim() || null,
        direccion: formulario.direccion.trim() || null,
        comentarios: formulario.comentarios.trim() || null,
        aplica_credito: formulario.aplicaCredito,
        limite_credito: limiteCredito,
        documento_tipo: formulario.documentoNumero.trim() ? formulario.documentoTipo || null : null,
        documento_numero: formulario.documentoNumero.trim() || null,
      };

      if (formulario.id) {
        const { error: errorSupabase } = await supabase
          .from("cliente")
          .update(payload)
          .eq("id", formulario.id);
        if (errorSupabase) {
          setError(errorSupabase.message);
          return;
        }
      } else {
        const { error: errorSupabase } = await supabase
          .from("cliente")
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
    if (!confirm("¿Eliminar este cliente?")) return;
    setError(null);
    const { error: errorSupabase } = await supabase
      .from("cliente")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (errorSupabase) {
      setError(errorSupabase.message);
      return;
    }
    await cargar();
  }

  if (cargando) {
    return <p>Cargando clientes…</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>Clientes</h2>
      {error !== null && (
        <div role="alert" style={s.errorBox}>
          {error}
        </div>
      )}

      <section style={{ ...s.tarjeta, marginBottom: 24 }}>
        <h3 style={{ marginTop: 0, fontSize: 18, fontWeight: 600 }}>
          {formulario.id ? "Editar cliente" : "Nuevo cliente"}
        </h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo etiqueta="Nombre">
            <input
              type="text"
              value={formulario.nombre}
              onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
              style={s.input}
            />
          </Campo>
          <Campo etiqueta="Apellidos">
            <input
              type="text"
              value={formulario.apellidos}
              onChange={(e) => setFormulario({ ...formulario, apellidos: e.target.value })}
              style={s.input}
            />
          </Campo>
          <Campo etiqueta="Teléfono">
            <input
              type="text"
              value={formulario.telefono}
              onChange={(e) => setFormulario({ ...formulario, telefono: e.target.value })}
              style={s.input}
            />
          </Campo>
          <Campo etiqueta="Correo">
            <input
              type="email"
              value={formulario.correo}
              onChange={(e) => setFormulario({ ...formulario, correo: e.target.value })}
              style={s.input}
            />
          </Campo>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo etiqueta="Dirección">
            <input
              type="text"
              value={formulario.direccion}
              onChange={(e) => setFormulario({ ...formulario, direccion: e.target.value })}
              style={{ ...s.input, width: 220 }}
            />
          </Campo>
          <Campo etiqueta="Documento (tipo)">
            <select
              value={formulario.documentoTipo}
              onChange={(e) => setFormulario({ ...formulario, documentoTipo: e.target.value })}
              style={s.input}
            >
              <option value="">—</option>
              <option value="cedula">Cédula</option>
              <option value="rnc">RNC</option>
            </select>
          </Campo>
          <Campo etiqueta="Documento (número)">
            <input
              type="text"
              value={formulario.documentoNumero}
              onChange={(e) => setFormulario({ ...formulario, documentoNumero: e.target.value })}
              style={s.input}
            />
          </Campo>
          <Campo etiqueta="Límite de crédito">
            <input
              type="number"
              step="0.01"
              value={formulario.limiteCredito}
              onChange={(e) => setFormulario({ ...formulario, limiteCredito: e.target.value })}
              style={{ ...s.input, width: 110 }}
            />
          </Campo>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20 }}>
            <input
              type="checkbox"
              checked={formulario.aplicaCredito}
              onChange={(e) => setFormulario({ ...formulario, aplicaCredito: e.target.checked })}
            />
            Aplica crédito
          </label>
        </div>
        <Campo etiqueta="Comentarios">
          <textarea
            value={formulario.comentarios}
            onChange={(e) => setFormulario({ ...formulario, comentarios: e.target.value })}
            style={{ ...s.input, width: 320, minHeight: 50 }}
          />
        </Campo>

        <div style={s.formFooter}>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando}
            style={{
              ...s.boton,
              cursor: guardando ? "not-allowed" : "pointer",
              opacity: guardando ? 0.7 : 1,
            }}
          >
            {guardando ? "Guardando…" : formulario.id ? "Guardar cambios" : "Crear cliente"}
          </button>
          {formulario.id && (
            <button type="button" onClick={cancelarEdicion} style={s.botonSecundario}>
              Cancelar
            </button>
          )}
        </div>
      </section>

      <input
        type="text"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar cliente…"
        style={{ ...s.input, marginBottom: 12 }}
      />

      <div className="sfr-tabla-scroll">
        <table style={s.tabla}>
          <thead>
            <tr>
              <th style={s.th}>Nombre</th>
              <th style={s.th}>Teléfono</th>
              <th style={s.th}>Crédito</th>
              <th style={s.th}>Saldo</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {clientesFiltrados.map((cliente) => (
              <tr key={cliente.id}>
                <td style={s.td}>
                  {cliente.nombre} {cliente.apellidos ?? ""}
                </td>
                <td style={s.td}>{cliente.telefono ?? "—"}</td>
                <td style={s.tdDerecha}>
                  {cliente.aplica_credito ? `RD$ ${money(cliente.limite_credito)}` : "—"}
                </td>
                <td style={s.tdDerecha}>
                  {cliente.aplica_credito ? money(cliente.saldo_credito) : "—"}
                </td>
                <td style={s.td}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => editar(cliente)} style={botonFila}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className="sfr-peligro"
                      onClick={() => void eliminar(cliente.id)}
                      style={{ ...s.botonPeligro, padding: "4px 10px", fontSize: 12 }}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {clientesFiltrados.length === 0 && (
              <tr>
                <td colSpan={5} style={s.filaVacia}>
                  Sin clientes.
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
      <label style={s.label}>{props.etiqueta}</label>
      {props.children}
    </div>
  );
}

const botonFila = { ...s.botonSecundario, padding: "4px 10px", fontSize: 12 };
