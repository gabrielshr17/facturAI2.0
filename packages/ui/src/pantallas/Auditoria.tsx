import { useEffect, useState } from "react";
import { describirBitacora, type BitacoraAccion } from "@sfr/core";
import { ScrollText } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";

const TAMANO_PAGINA = 30;

const ENTIDADES = [
  { valor: "", etiqueta: "Todas las entidades" },
  { valor: "producto", etiqueta: "Producto" },
  { valor: "cliente", etiqueta: "Cliente" },
  { valor: "proveedor", etiqueta: "Proveedor" },
  { valor: "factura", etiqueta: "Factura" },
  { valor: "compra", etiqueta: "Compra" },
  { valor: "devolucion", etiqueta: "Devolución" },
  { valor: "corte_caja", etiqueta: "Corte de caja" },
];

/** Auditoría (§ Caja y auditoría): historial completo de acciones sensibles, en
 *  una oración legible por registro en vez de columnas crudas, con filtros y
 *  paginación para poder llegar hasta el principio de la actividad del negocio. */
export function Auditoria() {
  const { bitacora: repo } = useRepos();
  const [lista, setLista] = useState<BitacoraAccion[]>([]);
  const [entidad, setEntidad] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    void cargarPagina(0, true);
  }, [repo, entidad, desde, hasta]);

  async function cargarPagina(offset: number, reiniciar: boolean) {
    setCargando(true);
    try {
      const pagina = await repo.listar({
        entidad: entidad || null,
        desde: desde || null,
        hasta: hasta || null,
        limite: TAMANO_PAGINA,
        offset,
      });
      setLista((prev) => (reiniciar ? pagina : [...prev, ...pagina]));
      setHayMas(pagina.length === TAMANO_PAGINA);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <div style={{ ...s.tarjeta, marginBottom: 12 }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <ScrollText size={18} /> Auditoría
        </h3>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <label style={s.label}>Desde</label>
            <input style={s.input} type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Hasta</label>
            <input style={s.input} type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div>
            <label style={s.label}>Entidad</label>
            <select style={s.input} value={entidad} onChange={(e) => setEntidad(e.target.value)}>
              {ENTIDADES.map((op) => <option key={op.valor} value={op.valor}>{op.etiqueta}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={s.tarjeta}>
        {lista.length === 0 && !cargando && (
          <p style={{ color: c.gris, textAlign: "center", margin: "24px 0" }}>Sin registros todavía.</p>
        )}
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {lista.map((r) => (
            <li
              key={r.id}
              style={{
                display: "flex", flexDirection: "column", gap: 2,
                padding: "10px 4px", borderBottom: `1px solid ${c.borde}`,
              }}
            >
              <span style={{ fontSize: 13, color: c.gris }}>
                {new Date(r.timestamp).toLocaleString("es-DO")}
              </span>
              <span style={{ fontSize: 14, color: c.texto }}>{describirBitacora(r)}</span>
            </li>
          ))}
        </ul>

        {hayMas && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button
              style={s.botonSecundario}
              disabled={cargando}
              onClick={() => void cargarPagina(lista.length, false)}
            >
              {cargando ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
