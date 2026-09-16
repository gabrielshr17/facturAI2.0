import type { ImpuestoTipo } from "../../dominio/impuesto.js";
import type { PoliticaSinExistencia } from "../../dominio/inventario.js";
import type { Auditoria } from "./comun.js";

export type TipoVenta = "unidad" | "granel" | "paquete" | "kit";

export interface Producto extends Auditoria {
  id: string;
  codigo_barra: string | null;
  descripcion: string;
  tipo_venta: TipoVenta;
  unidad_medida: string | null;
  costo: number;
  pct_ganancia: number;
  precio_venta: number;
  precio_mayoreo: number | null;
  departamento_id: string | null;
  impuesto_tipo: ImpuestoTipo;
  tasa_impuesto: number;
  existencia: number | null;
  politica_sin_existencia: PoliticaSinExistencia;
  activo: number; // 0 | 1
  favorito: number; // 0 | 1
}
