import { redondear2, sumar, calcularCambio } from "./dinero.js";

/**
 * Cálculo de totales de una factura y de su cobro (incluye pago mixto).
 *
 * Convención (ver `precio.ts`): el `precioUnitario` de cada línea es el precio
 * final con **ITBIS incluido**. Por eso el desglose *extrae* el impuesto:
 *   gravado = subtotal / (1 + tasa);  itbis = subtotal - gravado.
 * Las líneas exentas (tasa 0) van completas al monto exento, con ITBIS 0.
 */

export interface LineaInput {
  /** Precio final por unidad, ITBIS incluido. */
  precioUnitario: number;
  cantidad: number;
  /** Tasa de impuesto como fracción (0.18, 0.16, 0 = exento). */
  tasaImpuesto: number;
}

export interface LineaCalculada extends LineaInput {
  /** precioUnitario * cantidad, redondeado (ITBIS incluido). */
  subtotal: number;
  /** Porción gravada (base sin impuesto). 0 si exento. */
  montoGravado: number;
  /** ITBIS de la línea. 0 si exento. */
  montoItbis: number;
  /** Porción exenta. Igual al subtotal si tasa 0; si no, 0. */
  montoExento: number;
}

export interface TotalesFactura {
  lineas: LineaCalculada[];
  subtotalGravado: number;
  subtotalExento: number;
  totalItbis: number;
  total: number;
}

/** Desglosa una línea extrayendo el ITBIS del precio con impuesto incluido. */
export function calcularLinea(linea: LineaInput): LineaCalculada {
  const subtotal = redondear2(linea.precioUnitario * linea.cantidad);

  if (linea.tasaImpuesto <= 0) {
    return {
      ...linea,
      subtotal,
      montoGravado: 0,
      montoItbis: 0,
      montoExento: subtotal,
    };
  }

  const montoGravado = redondear2(subtotal / (1 + linea.tasaImpuesto));
  const montoItbis = redondear2(subtotal - montoGravado);
  return {
    ...linea,
    subtotal,
    montoGravado,
    montoItbis,
    montoExento: 0,
  };
}

/** Calcula las líneas y los totales de la factura. */
export function calcularTotales(lineas: LineaInput[]): TotalesFactura {
  const calculadas = lineas.map(calcularLinea);
  return {
    lineas: calculadas,
    subtotalGravado: sumar(calculadas.map((l) => l.montoGravado)),
    subtotalExento: sumar(calculadas.map((l) => l.montoExento)),
    totalItbis: sumar(calculadas.map((l) => l.montoItbis)),
    total: sumar(calculadas.map((l) => l.subtotal)),
  };
}

// --- Cobro / pago mixto -----------------------------------------------------

export type MetodoPago = "efectivo" | "transferencia" | "credito" | "tarjeta";

export interface PagoInput {
  metodo: MetodoPago;
  monto: number;
}

export interface ResultadoCobro {
  montoPagado: number;
  cambio: number;
  /** true si lo pagado cubre el total. */
  suficiente: boolean;
  /** Falta por pagar si es insuficiente; 0 si alcanza. */
  faltante: number;
}

/**
 * Procesa un cobro con uno o varios pagos (mixto). Suma los montos, determina si
 * cubren el total y calcula el cambio.
 *
 * SUPUESTO (marcado): el cambio se entrega en **efectivo**. Solo se genera
 * cambio si hay pago en efectivo suficiente para cubrir el excedente; así una
 * "sobre-captura" en tarjeta/transferencia no produce cambio ficticio.
 */
/**
 * Recargo fijo por pagar con tarjeta (§ PRECIOS/COBRO): 5%, no configurable
 * por negocio. Se aplica solo a la porción de la factura pagada con
 * tarjeta — el resto de los métodos no se toca.
 *
 * A propósito NO se le resta a `procesarCobro`/`factura.total`: el recargo
 * es lo que de verdad se cobra en la tarjeta (lo que refleja `pago.monto`/
 * `factura.monto_pagado`), no una línea más del ticket — la factura impresa
 * sigue mostrando el precio de los productos tal cual, sin un ítem de
 * "recargo" separado (decisión ya tomada, ver el plan de la tarea).
 */
const RECARGO_TARJETA_PCT = 0.05;

export function aplicarRecargoTarjeta(pagos: PagoInput[]): PagoInput[] {
  return pagos.map((p) =>
    p.metodo === "tarjeta" ? { ...p, monto: redondear2(p.monto * (1 + RECARGO_TARJETA_PCT)) } : p,
  );
}

export function procesarCobro(total: number, pagos: PagoInput[]): ResultadoCobro {
  const totalR = redondear2(total);
  const montoPagado = sumar(pagos.map((p) => p.monto));
  const efectivo = sumar(pagos.filter((p) => p.metodo === "efectivo").map((p) => p.monto));

  const suficiente = montoPagado >= totalR;
  const faltante = suficiente ? 0 : redondear2(totalR - montoPagado);

  // Excedente total sobre la factura, limitado a lo cubierto por efectivo.
  const excedente = redondear2(montoPagado - totalR);
  const cambio = excedente > 0 ? calcularCambio(0, Math.min(excedente, efectivo)) : 0;

  return { montoPagado, cambio, suficiente, faltante };
}
