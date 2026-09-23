import { redondear2 } from "./dinero.js";

/**
 * Cálculo del precio de venta. Regla §5:
 *   - Se deriva de **costo + % de ganancia**.
 *   - Pero puede **ingresarse manualmente**, y el valor manual **manda**.
 *
 * SUPUESTO (marcado): el `precio_venta` es el precio final al público con **ITBIS
 * incluido** (lo que ve el cliente). Por eso la derivación aplica primero el
 * margen sobre el costo (precio base sin impuesto) y luego suma el impuesto. En
 * la factura, el impuesto se *extrae* de este precio (ver `factura.ts`).
 * Si el negocio prefiere manejar precios sin impuesto, se cambia aquí sin tocar
 * el resto del dominio.
 */
export interface CalculoPrecioInput {
  costo: number;
  /** Porcentaje de ganancia sobre el costo, p.ej. 25 = 25%. */
  pctGanancia: number;
  /** Tasa de impuesto como fracción (0.18 = 18%). 0 para exento. */
  tasaImpuesto: number;
  /** Precio ingresado a mano. Si está presente (>= 0), manda sobre la derivación. */
  precioManual?: number | null;
}

/** Precio base (sin impuesto) a partir de costo + % de ganancia. */
export function precioBaseDesdeCosto(costo: number, pctGanancia: number): number {
  return redondear2(costo * (1 + pctGanancia / 100));
}

/**
 * Inverso de `calcularPrecioVenta`: el % de ganancia que de verdad implica un
 * precio de venta dado, para costo y tasa de impuesto conocidos.
 *
 * Existe porque `pct_ganancia` solo se actualiza cuando el precio se DERIVA de
 * costo + %. Si en cambio el precio se escribió a mano (§ "manual manda" en
 * `calcularPrecioVenta`), `pct_ganancia` se queda en lo que sea que tenía
 * antes — típicamente 0 — y deja de reflejar el margen real. La ventana de
 * edición usa esto para mostrar el % verdadero en vez del valor guardado.
 * Con costo 0 el % no está definido (cualquier precio es "infinito" margen),
 * así que se devuelve 0 en vez de Infinity/NaN.
 */
export function pctGananciaDesdePrecio(
  costo: number,
  precioVenta: number,
  tasaImpuesto: number,
): number {
  if (!(costo > 0)) return 0;
  const base = precioVenta / (1 + tasaImpuesto);
  return redondear2((base / costo - 1) * 100);
}

/**
 * Calcula el precio de venta final (ITBIS incluido).
 * Si `precioManual` viene definido y no negativo, se usa tal cual (manual manda).
 * Si no, se deriva: (costo + %) y se le suma el impuesto.
 */
export function calcularPrecioVenta(input: CalculoPrecioInput): number {
  const { costo, pctGanancia, tasaImpuesto, precioManual } = input;

  if (precioManual != null && precioManual >= 0) {
    return redondear2(precioManual);
  }

  const base = precioBaseDesdeCosto(costo, pctGanancia);
  return redondear2(base * (1 + tasaImpuesto));
}

/**
 * Sugerencia inicial de `precio_2`/`precio_3` (§ PRECIOS): mismo cálculo que
 * `calcularPrecioVenta` (margen fijo sobre costo + impuesto), pero con un
 * margen FIJO (10%/5%) en vez del `pct_ganancia` propio del producto — a
 * diferencia de `precio_venta`, estos niveles NUNCA se recalculan después de
 * creados: es solo el valor con el que arranca el campo, editable sin tope.
 */
export function precioTierDesdeCosto(
  costo: number,
  pctMargen: number,
  tasaImpuesto: number,
): number {
  const base = precioBaseDesdeCosto(costo, pctMargen);
  return redondear2(base * (1 + tasaImpuesto));
}

export type NivelPrecio = "1" | "2" | "3";

/**
 * Qué precio cobrar según el nivel de precio del cliente en el ticket. Cae a
 * `precio_venta` (nivel 1) si el nivel 2/3 nunca se configuró para ese
 * producto — p.ej. productos creados antes de esta banda de migración.
 */
export function precioSegunNivel(
  producto: { precio_venta: number; precio_2: number | null; precio_3: number | null },
  nivel: NivelPrecio,
): number {
  if (nivel === "2") return producto.precio_2 ?? producto.precio_venta;
  if (nivel === "3") return producto.precio_3 ?? producto.precio_venta;
  return producto.precio_venta;
}
