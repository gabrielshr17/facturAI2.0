import type { ImpuestoTipo } from "../../dominio/impuesto.js";
import type { MetodoPago } from "../../dominio/factura.js";
import type { Auditoria } from "./comun.js";

export type EstadoFactura = "abierta" | "cobrada" | "anulada";
export type TipoFactura = "normal" | "fiscal";

export interface Factura extends Auditoria {
  id: string;
  numero_interno: number;
  fecha_hora: string;
  cliente_id: string | null;
  caja_id: string | null;
  usuario_id: string | null;
  tipo: TipoFactura;
  subtotal_gravado: number;
  subtotal_exento: number;
  total_itbis: number;
  total: number;
  monto_pagado: number;
  cambio: number;
  notas: string | null;
  estado: EstadoFactura;
  comprobante_id: string | null;
  /** Prefijo de la caja que emitió el ticket (§ MULTICAJA: numeración C1-000123). */
  prefijo_caja: string | null;
}

export interface FacturaLinea extends Auditoria {
  id: string;
  factura_id: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  es_mayoreo: number; // 0 | 1
  impuesto_tipo: ImpuestoTipo;
  tasa_impuesto: number;
  monto_itbis: number;
  subtotal: number;
  /** Nivel de precio cobrado en esta línea (§ PRECIOS). */
  nivel_precio: string | null;
  /** Costo del producto al momento de la venta (§ margen real, BACKOFFICE/COMPRAS). */
  costo_unitario: number | null;
}

export interface Pago extends Auditoria {
  id: string;
  factura_id: string;
  metodo: MetodoPago;
  monto: number;
  referencia: string | null;
}
