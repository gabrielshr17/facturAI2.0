import type { ImpuestoTipo } from "../../dominio/impuesto.js";
import type { Auditoria } from "./comun.js";

export interface Devolucion extends Auditoria {
  id: string;
  factura_id: string;
  fecha: string;
  motivo: string | null;
  subtotal: number;
  itbis: number;
  total: number;
  comprobante_id: string | null; // Nota de Crédito (E34), NULL si la venta no fue fiscal
  /** Cómo se devolvió el dinero (§ CAJA: efectivo mueve la gaveta; tarjeta/crédito no). */
  metodo_devolucion: string | null;
}

export interface DevolucionLinea extends Auditoria {
  id: string;
  devolucion_id: string;
  factura_linea_id: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  impuesto_tipo: ImpuestoTipo;
  tasa_impuesto: number;
  monto_itbis: number;
  subtotal: number;
  /** Nivel de precio de la línea original (§ PRECIOS), si se registró al devolver. */
  nivel_precio: string | null;
}
