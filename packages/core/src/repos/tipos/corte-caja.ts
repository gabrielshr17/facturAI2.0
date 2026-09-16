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
  estado: EstadoCorteCaja;
}
