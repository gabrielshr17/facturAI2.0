import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { type NegocioInput, type RespaldoCompleto, ValidacionError } from "@sfr/core";
import { Store, Printer, Save, Upload } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { useSesion } from "../sesion/contexto.js";
import { useAlertas } from "../contexto/Alertas.js";
import { s, c } from "../estilos.js";
import { FUNCIONES_EN_DESARROLLO } from "../banderas.js";
import { SeccionSecuenciasNcf } from "../componentes/SeccionSecuenciasNcf.js";
import { SeccionBitacora } from "../componentes/SeccionBitacora.js";
import { SeccionImpresoraTermica } from "../componentes/SeccionImpresoraTermica.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";

const VACIO: NegocioInput = {
  nombre_comercial: "",
  razon_social: "",
  rnc: "",
  direccion: "",
  telefono: "",
  correo: "",
  ancho_impresora_default: 80,
  redondeo_centavo: true,
  inventario_activo: false,
};

export function Configuracion() {
  const { negocio: repo, backup } = useRepos();
  const { db } = useSesion();
  const { confirmar, avisar } = useAlertas();
  const [form, setForm] = useState<NegocioInput>(VACIO);
  const [errores, setErrores] = useState<string[]>([]);
  const [guardado, setGuardado] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement>(null);
  const restaurarDisponible = db.enTransaccion !== undefined;

  useAtajosTeclado({ "Ctrl+S": () => void guardar() });

  useEffect(() => {
    void (async () => {
      const n = await repo.obtener();
      if (n) {
        setForm({
          nombre_comercial: n.nombre_comercial,
          razon_social: n.razon_social ?? "",
          rnc: n.rnc ?? "",
          direccion: n.direccion ?? "",
          telefono: n.telefono ?? "",
          correo: n.correo ?? "",
          ancho_impresora_default: n.ancho_impresora_default as 58 | 80,
          redondeo_centavo: n.redondeo_centavo === 1,
          inventario_activo: n.inventario_activo === 1,
        });
      }
    })();
  }, []);

  async function guardar() {
    setGuardado(false);
    try {
      await repo.guardar(form);
      setErrores([]);
      setGuardado(true);
    } catch (e) {
      if (e instanceof ValidacionError) setErrores(e.errores.map((x) => x.mensaje));
      else setErrores([String(e)]);
    }
  }

  async function exportarRespaldo() {
    setExportando(true);
    try {
      const respaldo = await backup.exportarTodo();
      const json = JSON.stringify(respaldo, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `respaldo_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportando(false);
    }
  }

  async function manejarArchivoSeleccionado(evento: ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    const confirmado = await confirmar(
      "Esto reemplaza TODA la información actual (productos, ventas, compras, clientes, etc.) con la del archivo. No se puede deshacer. ¿Continuar?",
      { titulo: "Restaurar respaldo", textoConfirmar: "Restaurar" },
    );
    if (!confirmado) return;

    setRestaurando(true);
    try {
      const texto = await archivo.text();
      const respaldo = JSON.parse(texto) as RespaldoCompleto;
      await backup.importarTodo(respaldo);
      await avisar("Respaldo restaurado. Recarga la aplicación para ver los datos actualizados.", {
        titulo: "Restauración completa",
        variante: "info",
      });
    } catch (e) {
      const mensaje =
        e instanceof ValidacionError
          ? e.errores.map((x) => x.mensaje).join(" ")
          : String((e as Error)?.message ?? e);
      await avisar(mensaje, { titulo: "No se pudo restaurar", variante: "error" });
    } finally {
      setRestaurando(false);
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={s.tarjeta}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Store size={18} /> Datos del negocio
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={s.label}>Nombre comercial *</label>
            <input
              style={s.input}
              value={form.nombre_comercial}
              onChange={(e) => setForm({ ...form, nombre_comercial: e.target.value })}
            />
          </div>
          <div>
            <label style={s.label}>Razón social</label>
            <input
              style={s.input}
              value={form.razon_social ?? ""}
              onChange={(e) => setForm({ ...form, razon_social: e.target.value })}
            />
          </div>
          <div>
            <label style={s.label}>RNC</label>
            <input
              style={s.input}
              value={form.rnc ?? ""}
              onChange={(e) => setForm({ ...form, rnc: e.target.value })}
            />
          </div>
          <div>
            <label style={s.label}>Teléfono</label>
            <input
              style={s.input}
              value={form.telefono ?? ""}
              onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            />
          </div>
          <div>
            <label style={s.label}>Correo</label>
            <input
              style={s.input}
              value={form.correo ?? ""}
              onChange={(e) => setForm({ ...form, correo: e.target.value })}
            />
          </div>
          <div>
            <label style={s.label}>Dirección</label>
            <input
              style={s.input}
              value={form.direccion ?? ""}
              onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div style={{ ...s.tarjeta, marginTop: 16 }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Printer size={18} /> Impresión y montos
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={s.label}>Ancho de impresora</label>
            <select
              style={s.input}
              value={form.ancho_impresora_default}
              onChange={(e) =>
                setForm({ ...form, ancho_impresora_default: Number(e.target.value) as 58 | 80 })
              }
            >
              <option value={58}>58 mm</option>
              <option value={80}>80 mm</option>
            </select>
          </div>
        </div>
        <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
          <input
            type="checkbox"
            checked={form.redondeo_centavo ?? true}
            onChange={(e) => setForm({ ...form, redondeo_centavo: e.target.checked })}
          />
          Redondear el cambio al centavo más cercano
        </label>
        <label style={{ ...s.label, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={form.inventario_activo ?? false}
            onChange={(e) => setForm({ ...form, inventario_activo: e.target.checked })}
          />
          Inventario activo (en el MVP se recomienda apagado)
        </label>

        {errores.length > 0 && (
          <div role="alert" style={s.errorBox}>
            {errores.join(" ")}
          </div>
        )}
        {guardado && (
          <div
            style={{
              ...s.errorBox,
              background: c.verdeFondo,
              borderColor: c.verde,
              color: c.verde,
            }}
          >
            Configuración guardada.
          </div>
        )}

        <div style={s.formFooter}>
          <button style={s.boton} onClick={guardar}>
            Guardar configuración (Ctrl+S)
          </button>
        </div>
      </div>

      <SeccionImpresoraTermica />

      {FUNCIONES_EN_DESARROLLO.fiscal && <SeccionSecuenciasNcf />}

      <div style={{ ...s.tarjeta, marginTop: 16 }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <Save size={18} /> Respaldo y exportación
        </h3>
        <p style={{ color: c.gris, fontSize: 13 }}>
          Descarga toda la información del negocio (productos, ventas, compras, etc.) en un archivo
          JSON.
        </p>
        <button style={s.botonSecundario} disabled={exportando} onClick={exportarRespaldo}>
          {exportando ? "Exportando…" : "Exportar respaldo completo"}
        </button>

        <hr style={{ border: "none", borderTop: `1px solid ${c.borde}`, margin: "16px 0" }} />

        <p style={{ color: c.gris, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <Upload size={14} /> Restaura toda la información desde un archivo de respaldo. Reemplaza
          los datos actuales.
        </p>
        {!restaurarDisponible && (
          <div style={{ ...s.errorBox, marginBottom: 12 }}>
            La restauración no está disponible en esta instalación (requiere una base con soporte de
            transacciones reales).
          </div>
        )}
        <input
          ref={inputArchivoRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => void manejarArchivoSeleccionado(e)}
        />
        <button
          style={s.botonSecundario}
          disabled={!restaurarDisponible || restaurando}
          onClick={() => inputArchivoRef.current?.click()}
        >
          {restaurando ? "Restaurando…" : "Restaurar desde archivo"}
        </button>
      </div>

      <SeccionBitacora />
    </div>
  );
}
