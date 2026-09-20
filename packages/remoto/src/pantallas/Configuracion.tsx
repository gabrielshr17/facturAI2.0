import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../supabaseClient";
import { s, c } from "../estilos";

interface NegocioFila {
  id: string;
  nombre_comercial: string;
  razon_social: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  ancho_impresora_default: number;
  redondeo_centavo: boolean;
  inventario_activo: boolean;
}

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Configuracion(): JSX.Element {
  const [negocio, setNegocio] = useState<NegocioFila | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    const { data, error: errorSupabase } = await supabase
      .from("negocio")
      .select(
        "id, nombre_comercial, razon_social, rnc, direccion, telefono, correo, ancho_impresora_default, redondeo_centavo, inventario_activo",
      )
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (errorSupabase) setError(errorSupabase.message);
    else setNegocio(data);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(): Promise<void> {
    if (!negocio) return;
    setError(null);
    setExito(null);

    if (negocio.nombre_comercial.trim() === "") {
      setError("El nombre comercial es obligatorio.");
      return;
    }
    if (
      negocio.correo &&
      negocio.correo.trim() !== "" &&
      !REGEX_CORREO.test(negocio.correo.trim())
    ) {
      setError("El correo no tiene un formato válido.");
      return;
    }
    if (negocio.ancho_impresora_default !== 58 && negocio.ancho_impresora_default !== 80) {
      setError("El ancho de impresora debe ser 58 o 80.");
      return;
    }

    setGuardando(true);
    try {
      const { error: errorSupabase } = await supabase
        .from("negocio")
        .update({
          nombre_comercial: negocio.nombre_comercial.trim(),
          razon_social: negocio.razon_social?.trim() || null,
          rnc: negocio.rnc?.trim() || null,
          direccion: negocio.direccion?.trim() || null,
          telefono: negocio.telefono?.trim() || null,
          correo: negocio.correo?.trim() || null,
          ancho_impresora_default: negocio.ancho_impresora_default,
          redondeo_centavo: negocio.redondeo_centavo,
          inventario_activo: negocio.inventario_activo,
        })
        .eq("id", negocio.id);
      if (errorSupabase) {
        setError(errorSupabase.message);
        return;
      }
      setExito("Configuración guardada.");
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <p>Cargando configuración…</p>;
  }

  if (!negocio) {
    return <p>No se encontró la configuración del negocio.</p>;
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
        Configuración
      </h2>
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

      <section style={{ ...s.tarjeta, maxWidth: 560 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo etiqueta="Nombre comercial">
            <input
              type="text"
              value={negocio.nombre_comercial}
              onChange={(e) => setNegocio({ ...negocio, nombre_comercial: e.target.value })}
              style={s.input}
            />
          </Campo>
          <Campo etiqueta="Razón social">
            <input
              type="text"
              value={negocio.razon_social ?? ""}
              onChange={(e) => setNegocio({ ...negocio, razon_social: e.target.value })}
              style={s.input}
            />
          </Campo>
          <Campo etiqueta="RNC">
            <input
              type="text"
              value={negocio.rnc ?? ""}
              onChange={(e) => setNegocio({ ...negocio, rnc: e.target.value })}
              style={s.input}
            />
          </Campo>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <Campo etiqueta="Dirección">
            <input
              type="text"
              value={negocio.direccion ?? ""}
              onChange={(e) => setNegocio({ ...negocio, direccion: e.target.value })}
              style={{ ...s.input, width: 220 }}
            />
          </Campo>
          <Campo etiqueta="Teléfono">
            <input
              type="text"
              value={negocio.telefono ?? ""}
              onChange={(e) => setNegocio({ ...negocio, telefono: e.target.value })}
              style={s.input}
            />
          </Campo>
          <Campo etiqueta="Correo">
            <input
              type="email"
              value={negocio.correo ?? ""}
              onChange={(e) => setNegocio({ ...negocio, correo: e.target.value })}
              style={s.input}
            />
          </Campo>
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 16 }}>
          <Campo etiqueta="Ancho de impresora">
            <select
              value={negocio.ancho_impresora_default}
              onChange={(e) =>
                setNegocio({ ...negocio, ancho_impresora_default: Number(e.target.value) })
              }
              style={s.input}
            >
              <option value={58}>58 mm</option>
              <option value={80}>80 mm</option>
            </select>
          </Campo>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={negocio.redondeo_centavo}
              onChange={(e) => setNegocio({ ...negocio, redondeo_centavo: e.target.checked })}
            />
            Redondeo a centavo
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={negocio.inventario_activo}
              onChange={(e) => setNegocio({ ...negocio, inventario_activo: e.target.checked })}
            />
            Inventario activo
          </label>
        </div>

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
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
      </section>
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
