import type { Auditoria } from "./comun.js";

export type TipoMovimientoInventario = "entrada" | "salida" | "ajuste" | "venta" | "compra";

export interface MovimientoInventario extends Auditoria {
  id: string;
  producto_id: string;
  tipo: TipoMovimientoInventario;
  /** Delta con signo aplicado a la existencia (positivo = entra, negativo = sale). */
  cantidad: number;
  costo: number | null;
  referencia_tipo: string | null;
  referencia_id: string | null;
  fecha: string;
  usuario_id: string | null;
}
