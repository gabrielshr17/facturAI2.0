import { useEffect, useState } from "react";
import { type BitacoraAccion } from "@sfr/core";
import { ScrollText } from "lucide-react";
import { useRepos } from "../data/contexto.js";
import { s, c } from "../estilos.js";

const ETIQUETA_ACCION: Record<string, string> = {
  eliminar: "Eliminar",
  cobrar: "Cobrar",
  registrar_compra: "Registrar compra",
  registrar_devolucion: "Registrar devolución",
  cerrar_caja: "Cerrar caja",
  ajustar_existencia: "Ajustar existencia",
};

/**
 * Bitácora de auditoría (§ Caja y auditoría, § RBAC-06): quién hizo qué y cuándo, solo
 * lectura. El nombre de usuario se resuelve con UN SOLO `usuario.listar()` al montar,
 * no con una consulta por fila: se cargan 50 filas de bitácora a la vez, así que una
 * consulta por fila serían hasta 50 viajes a la base solo para pintar la tabla.
 */
export function SeccionBitacora() {
  const { bitacora: repo, usuario: usuarioRepo } = useRepos();
  const [lista, setLista] = useState<BitacoraAccion[]>([]);
  const [entidad, setEntidad] = useState("");
  const [nombresPorId, setNombresPorId] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    void repo.listar({ entidad: entidad || null, limite: 50 }).then(setLista);
  }, [repo, entidad]);

  useEffect(() => {
    void usuarioRepo.listar().then((usuarios) => {
      setNombresPorId(new Map(usuarios.map((u) => [u.id, u.nombre])));
    });
    // Se carga una sola vez: el mapa id->nombre no cambia mientras la sección está montada,
    // y recargarlo en cada refiltrado de `entidad` sería una consulta de más sin motivo.
  }, [usuarioRepo]);

  // Filas de antes de RBAC-04/05 no tienen `usuario_id`, y un id que ya no está en el mapa
  // (usuario dado de baja) tampoco tiene nombre resuelto: las dos caen a '—'.
  function nombreDeUsuario(usuarioId: string | null): string {
    if (usuarioId === null) return "—";
    return nombresPorId.get(usuarioId) ?? "—";
  }

  return (
    <div style={{ ...s.tarjeta, marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <ScrollText size={18} /> Bitácora de auditoría
        </h3>
        <select
          style={{ ...s.input, width: 200 }}
          value={entidad}
          onChange={(e) => setEntidad(e.target.value)}
        >
          <option value="">Todas las entidades</option>
          <option value="producto">Producto</option>
          <option value="cliente">Cliente</option>
          <option value="proveedor">Proveedor</option>
          <option value="factura">Factura</option>
          <option value="compra">Compra</option>
          <option value="devolucion">Devolución</option>
          <option value="corte_caja">Corte de caja</option>
        </select>
      </div>

      <table style={s.tabla}>
        <thead>
          <tr>
            <th scope="col" style={s.th}>
              Fecha
            </th>
            <th scope="col" style={s.th}>
              Usuario
            </th>
            <th scope="col" style={s.th}>
              Acción
            </th>
            <th scope="col" style={s.th}>
              Entidad
            </th>
            <th scope="col" style={s.th}>
              Detalle
            </th>
          </tr>
        </thead>
        <tbody>
          {lista.length === 0 && (
            <tr>
              <td style={s.filaVacia} colSpan={5}>
                Sin registros todavía.
              </td>
            </tr>
          )}
          {lista.map((r) => (
            <tr key={r.id}>
              <td style={s.td}>{new Date(r.timestamp).toLocaleString("es-DO")}</td>
              <td style={s.td}>{nombreDeUsuario(r.usuario_id)}</td>
              <td style={s.td}>
                <span style={s.badge}>{ETIQUETA_ACCION[r.accion] ?? r.accion}</span>
              </td>
              <td style={{ ...s.td, color: c.gris }}>{r.entidad}</td>
              <td style={s.td}>{r.resumen ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
