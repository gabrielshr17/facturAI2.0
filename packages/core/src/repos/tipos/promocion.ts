import type { TipoPromocion, AplicaAPromocion } from "../../dominio/promocion.js";
import type { Auditoria } from "./comun.js";

export interface Promocion extends Auditoria {
  id: string;
  nombre: string;
  tipo: TipoPromocion;
  valor: number;
  aplica_a: AplicaAPromocion;
  producto_id: string | null;
  departamento_id: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  activa: number; // 0 | 1
}
