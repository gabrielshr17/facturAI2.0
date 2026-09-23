import type { Auditoria } from "./comun.js";

export type EstadoCorteCaja = "abierto" | "cerrado";

export interface CorteCaja extends Auditoria {
  id: string;
  caja_id: string | null;
  usuario_id: string | null;
  fecha_apertura: string;
  fecha_cierre: string;
  monto_inicial: number;
  total_ventas: number;
  total_itbis: number;
  total_efectivo: number;
  total_tarjeta: number;
  total_transferencia: number;
  total_credito: number;
  efectivo_esperado: number;
  efectivo_contado: number;
  diferencia: number;
  /**
   * Verificación opcional de tarjeta/transferencia (§ CAJA): `null` = nadie
   * lo verificó todavía, distinto de `0` (verificado y coincidió exacto).
   * No es un conteo ciego como el efectivo — un supervisor la llena en
   * Corte de Caja transcribiendo el reporte de lote del datáfono o la
   * confirmación bancaria, para cualquier turno ya cerrado.
   */
  tarjeta_verificado: number | null;
  tarjeta_diferencia: number | null;
  transferencia_verificado: number | null;
  transferencia_diferencia: number | null;
  estado: EstadoCorteCaja;
}
