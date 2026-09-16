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
}
