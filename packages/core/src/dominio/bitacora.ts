import type { BitacoraAccion } from "../repos/tipos.js";

/**
 * Convierte un registro crudo de bitácora en una sola oración legible, para
 * la pantalla de Auditoría. El `resumen` que ya escribe cada repo (§ acciones
 * sensibles) trae el detalle en español; aquí solo se le antepone el verbo y
 * la entidad, y se evita el punto doble si el resumen ya termina en uno.
 */
const VERBO_ACCION: Record<string, string> = {
  eliminar: "Eliminó",
  cobrar: "Cobró",
  registrar_compra: "Registró",
  registrar_devolucion: "Registró",
  cerrar_caja: "Cerró",
  ajustar_existencia: "Ajustó",
};

const ENTIDAD_NOMBRE: Record<string, { articulo: "un" | "una"; nombre: string }> = {
  producto: { articulo: "un", nombre: "producto" },
  cliente: { articulo: "un", nombre: "cliente" },
  proveedor: { articulo: "un", nombre: "proveedor" },
  factura: { articulo: "una", nombre: "factura" },
  compra: { articulo: "una", nombre: "compra" },
  devolucion: { articulo: "una", nombre: "devolución" },
  corte_caja: { articulo: "un", nombre: "corte de caja" },
};

function normalizarResumen(resumen: string | null): string | null {
  if (!resumen) return null;
  const recortado = resumen.trim();
  if (!recortado) return null;
  return recortado.endsWith(".") ? recortado.slice(0, -1) : recortado;
}

export function describirBitacora(log: BitacoraAccion): string {
  const resumen = normalizarResumen(log.resumen);
  const verbo = VERBO_ACCION[log.accion];

  const base = verbo
    ? `${verbo} ${ENTIDAD_NOMBRE[log.entidad]?.articulo ?? "un"} ${ENTIDAD_NOMBRE[log.entidad]?.nombre ?? log.entidad}`
    : `${log.accion} sobre ${log.entidad}`;

  return resumen ? `${base} — ${resumen}.` : `${base}.`;
}
