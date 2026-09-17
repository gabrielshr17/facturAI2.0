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
  /** Tercer nivel de precio (§ PRECIOS): "precio mayoreo" ya existe; este es el adicional. */
  precio_2: number | null;
  /** Cantidad mínima para que aplique el precio de mayoreo. */
  cantidad_minima_mayoreo: number | null;
  /** Umbral de existencia baja (§ BACKOFFICE-04: alerta de reposición). */
  existencia_minima: number | null;
}
