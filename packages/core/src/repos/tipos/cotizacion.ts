import type { ImpuestoTipo } from "../../dominio/impuesto.js";
import type { Auditoria } from "./comun.js";

export type EstadoCotizacion = "vigente" | "convertida" | "anulada";

/** Precio ofrecido a un cliente antes de la venta (§ Ventas) — no es una factura: sin pagos, sin
 *  comprobante fiscal, sin afectar existencia. */
export interface Cotizacion extends Auditoria {
  id: string;
  numero_interno: number;
  fecha_hora: string;
  fecha_vencimiento: string; // fecha ISO (date)
  cliente_id: string | null;
  usuario_id: string | null;
  subtotal_gravado: number;
  subtotal_exento: number;
  total_itbis: number;
  total: number;
  notas: string | null;
  estado: EstadoCotizacion;
  factura_id: string | null; // si se convirtió en venta
}

export interface CotizacionLinea extends Auditoria {
  id: string;
  cotizacion_id: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  impuesto_tipo: ImpuestoTipo;
  tasa_impuesto: number;
  monto_itbis: number;
  subtotal: number;
  /** Nivel de precio ofrecido (§ PRECIOS), para que sobreviva si se convierte en venta. */
  nivel_precio: string | null;
}
