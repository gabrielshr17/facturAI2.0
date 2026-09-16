import type { Auditoria } from "./comun.js";

export interface Negocio extends Auditoria {
  id: string;
  nombre_comercial: string;
  razon_social: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
  logo_ruta: string | null;
  regimen: string | null;
  ancho_impresora_default: number; // 58 | 80
  redondeo_centavo: number; // 0 | 1
  inventario_activo: number; // 0 | 1
}
