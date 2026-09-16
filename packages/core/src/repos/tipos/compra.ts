import type { ImpuestoTipo } from "../../dominio/impuesto.js";
import type { Auditoria } from "./comun.js";

export interface Proveedor extends Auditoria {
  id: string;
  nombre: string;
  rnc: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
}

export type EstadoClasificacionCompra = "con_fiscal" | "sin_fiscal" | "pendiente_revision";
export type OrigenCompra = "manual" | "chatbot";

export interface Compra extends Auditoria {
  id: string;
  fecha: string;
  proveedor_id: string | null;
  subtotal: number;
  itbis: number;
  total: number;
  ncf_proveedor: string | null;
  tiene_comprobante_fiscal: number; // 0 | 1
  mes_ano_contable: string; // 'AAAA-MM'
  estado_clasificacion: EstadoClasificacionCompra;
  origen: OrigenCompra;
  notas: string | null;
}

export interface CompraLinea extends Auditoria {
  id: string;
  compra_id: string;
  producto_id: string | null;
  descripcion: string;
  cantidad: number;
  costo_unitario: number;
  impuesto_tipo: ImpuestoTipo;
  tasa_impuesto: number;
  monto_itbis: number;
  subtotal: number;
}

export type EstadoRevisionComprobante = "auto" | "confirmado_usuario" | "pendiente";
export type IdentificadoPor = "chatbot" | "usuario";

export interface ComprobanteArchivo extends Auditoria {
  id: string;
  compra_id: string | null;
  nombre_archivo: string;
  tipo_mime: string;
  contenido_base64: string;
  mes_ano: string; // 'AAAA-MM'
  tiene_fiscal: number; // 0 | 1
  estado_revision: EstadoRevisionComprobante;
  identificado_por: IdentificadoPor;
  datos_extraidos_json: string | null;
}
