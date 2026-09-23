import { redondear2 } from "./dinero.js";

/**
 * Cálculo del corte de caja (cierre de período): el efectivo esperado es el
 * fondo inicial más las ventas en efectivo del período; la diferencia compara
 * eso contra lo contado físicamente en caja.
 */
export interface CorteCajaInput {
  montoInicial: number;
  totalEfectivo: number;
  efectivoContado: number;
}

export interface CorteCajaResultado {
  efectivoEsperado: number;
  diferencia: number;
}

export function calcularCorteCaja(input: CorteCajaInput): CorteCajaResultado {
  const efectivoEsperado = redondear2(input.montoInicial + input.totalEfectivo);
  const diferencia = redondear2(input.efectivoContado - efectivoEsperado);
  return { efectivoEsperado, diferencia };
}

/**
 * Diferencia entre lo verificado (un monto de tarjeta/transferencia que el
 * supervisor transcribe de un reporte de lote del datáfono o una
 * confirmación bancaria) y lo esperado (lo que el sistema calculó de las
 * ventas del turno). A diferencia del efectivo, esto no es un conteo ciego:
 * el número real viene de una fuente externa, no de adivinar el total.
 */
export function calcularDiferenciaVerificacion(esperado: number, verificado: number): number {
  return redondear2(verificado - esperado);
}
