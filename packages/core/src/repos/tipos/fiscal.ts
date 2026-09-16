import type { TipoEcf } from "../../dominio/ecf.js";
import type { Auditoria } from "./comun.js";

export type ModoSecuencia = "ecf" | "ncf_papel" | "contingencia";
export type EstadoSecuencia = "disponible" | "agotada" | "vencida";
export type EstadoDgii = "pendiente" | "aceptado" | "rechazado" | "contingencia";

export interface SecuenciaNcf extends Auditoria {
  id: string;
  tipo_ecf: TipoEcf;
  prefijo: string;
  modo: ModoSecuencia;
  rango_desde: number;
  rango_hasta: number;
  proximo_numero: number;
  vencimiento: string; // fecha ISO (date)
  estado: EstadoSecuencia;
}

export interface ComprobanteFiscal extends Auditoria {
  id: string;
  factura_id: string;
  tipo_ecf: TipoEcf;
  ncf: string;
  secuencia_id: string;
  rnc_emisor: string | null;
  receptor_documento_tipo: "rnc" | "cedula" | null;
  receptor_documento_numero: string | null;
  fecha_emision: string;
  monto_gravado: number;
  monto_exento: number;
  monto_itbis: number;
  total: number;
  estado_dgii: EstadoDgii;
  track_id_dgii: string | null;
  codigo_seguridad: string | null;
  xml_firmado_ruta: string | null;
  qr_url: string | null;
  fecha_transmision: string | null;
}
