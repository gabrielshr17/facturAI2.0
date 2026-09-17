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
  /** Minutos de tolerancia antes de considerar tarde el corte de turno (§ CAJA). */
  desfase_horario_min: number | null;
  /** Política ante un costo de compra que sube (§ COMPRAS: "nunca ajusta el precio solo"). */
  politica_costo: string | null;
  umbral_aviso_costo_pct: number | null;
  /** Turno de caja obligatorio (§ CAJA). DEFAULT 0: instalaciones existentes arrancan apagadas. */
  exige_caja_abierta: number; // 0 | 1
  arqueo_ciego: number | null; // 0 | 1
  umbral_diferencia_caja: number | null;
}
