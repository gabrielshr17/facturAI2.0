import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "../supabaseClient";

/**
 * Gestión de personal MUY acotada a propósito: solo nombre/rol/activo.
 * El PIN local (`usuario.pin_hash`, `usuario_seguridad`) y el ajuste fino de
 * permisos (`usuario.permisos_json`) siguen siendo acciones SOLO del
 * registro físico — pin_hash nunca se sincroniza a Supabase. Esta pantalla
 * ni siquiera selecciona esas columnas (defensa en profundidad: aunque los
 * GRANT de Postgres son los que de verdad las esconden, ver
 * packages/api/db/rls-policies.sql).
 */
type RolUsuario = "cajero" | "supervisor" | "dueno" | "superadmin";

interface UsuarioFila {
  id: string;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
}

interface FormularioUsuario {
  id: string | null;
  nombre: string;
  rol: RolUsuario;
  activo: boolean;
}

function formularioVacio(): FormularioUsuario {
  return { id: null, nombre: "", rol: "cajero", activo: true };
}

export function Personal(): JSX.Element {
  const [usuarios, setUsuarios] = useState<UsuarioFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [formulario, setFormulario] = useState<FormularioUsuario>(formularioVacio());

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: errorSupabase } = await supabase
      .from("usuario")
      .select("id, nombre, rol, activo")
      .is("deleted_at", null)
      .order("nombre");
    if (errorSupabase) setError(errorSupabase.message);
    else setUsuarios((data ?? []) as UsuarioFila[]);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  function editar(fila: UsuarioFila): void {
    setFormulario({ id: fila.id, nombre: fila.nombre, rol: fila.rol, activo: fila.activo });
  }

  function cancelarEdicion(): void {
    setFormulario(formularioVacio());
  }

  /** Cuenta otros dueño/superadmin activos, excluyendo `excluirId`. */
  async function contarOtrosAdministradoresActivos(excluirId: string): Promise<number> {
    const { count } = await supabase
      .from("usuario")
      .select("id", { count: "exact", head: true })
      .in("rol", ["dueno", "superadmin"])
      .eq("activo", true)
      .is("deleted_at", null)
      .neq("id", excluirId);
    return count ?? 0;
  }

  async function guardar(): Promise<void> {
    setError(null);

    if (formulario.nombre.trim() === "") {
      setError("El nombre es obligatorio.");
      return;
    }

    setGuardando(true);
    try {
      if (formulario.id) {
        const original = usuarios.find((u) => u.id === formulario.id);
        const dejaDeSerAdmin =
          original &&
          (original.rol === "dueno" || original.rol === "superadmin") &&
          formulario.rol !== "dueno" &&
          formulario.rol !== "superadmin";
        const seDesactiva =
          original &&
          (original.rol === "dueno" || original.rol === "superadmin") &&
          original.activo &&
          !formulario.activo;

        if (dejaDeSerAdmin || seDesactiva) {
          const otros = await contarOtrosAdministradoresActivos(formulario.id);
          if (otros === 0) {
            setError("No se puede dejar la instalación sin un dueño o superadmin activo.");
            return;
          }
        }

        const { error: errorSupabase } = await supabase
          .from("usuario")
          .update({
            nombre: formulario.nombre.trim(),
            rol: formulario.rol,
            activo: formulario.activo,
          })
          .eq("id", formulario.id);
        if (errorSupabase) {
          setError(errorSupabase.message);
          return;
        }
      } else {
        const { error: errorSupabase } = await supabase.from("usuario").insert({
          id: crypto.randomUUID(),
          nombre: formulario.nombre.trim(),
          rol: formulario.rol,
          activo: formulario.activo,
        });
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

  if (cargando) {
    return <p>Cargando personal…</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Personal</h2>
      <div
        role="note"
        style={{
          background: "var(--sfr-superficie)",
          border: "1px solid var(--sfr-borde)",
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 13,
          color: "var(--sfr-gris)",
          marginBottom: 12,
        }}
      >
        El PIN de acceso y los permisos detallados por persona solo se configuran desde la caja
        física, nunca desde aquí.
      </div>
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
          maxWidth: 480,
        }}
      >
        <h3 style={{ marginTop: 0 }}>
          {formulario.id ? "Editar personal" : "Nuevo miembro del personal"}
        </h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div>
            <label
              style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}
            >
              Nombre
            </label>
            <input
              type="text"
              value={formulario.nombre}
              onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })}
              style={estiloInput}
            />
          </div>
          <div>
            <label
              style={{ display: "block", fontSize: 13, color: "var(--sfr-gris)", marginBottom: 4 }}
            >
              Rol
            </label>
            <select
              value={formulario.rol}
              onChange={(e) => setFormulario({ ...formulario, rol: e.target.value as RolUsuario })}
              style={estiloInput}
            >
              <option value="cajero">Cajero</option>
              <option value="supervisor">Supervisor</option>
              <option value="dueno">Dueño</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 20 }}>
            <input
              type="checkbox"
              checked={formulario.activo}
              onChange={(e) => setFormulario({ ...formulario, activo: e.target.checked })}
            />
            Activo
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
            {guardando ? "Guardando…" : formulario.id ? "Guardar cambios" : "Crear"}
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
              <th>Rol</th>
              <th>Activo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id}>
                <td>{u.nombre}</td>
                <td>{u.rol}</td>
                <td>{u.activo ? "Sí" : "No"}</td>
                <td>
                  <button type="button" onClick={() => editar(u)} style={botonFila}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: "center", color: "var(--sfr-gris)" }}>
                  Sin personal registrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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

const botonFila: CSSProperties = {
  border: "1px solid var(--sfr-borde)",
  background: "transparent",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 12,
  cursor: "pointer",
};
