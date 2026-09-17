import { redondear2 } from "./dinero.js";
import type { ErrorValidacion } from "./validacion.js";

/**
 * Crédito de clientes (fiar una venta). `limiteCredito = 0` significa SIN
 * LÍMITE: hoy esa columna vale 0 en toda instalación real porque la pantalla
 * nunca la expuso, así que tratar 0 como bloqueo rompería la venta a crédito
 * de todos los usuarios el día del despliegue.
 */

export interface ValidarCargoCreditoInput {
  aplicaCredito: boolean;
  limiteCredito: number;
  saldoActual: number;
  monto: number;
}

/** Crédito disponible, o `null` cuando el cliente no tiene límite. */
export function creditoDisponible(limiteCredito: number, saldo: number): number | null {
  if (limiteCredito <= 0) return null;
  return redondear2(limiteCredito - saldo);
}

/** Valida un cargo a crédito (una venta fiada). Nunca lanza: devuelve errores. */
export function validarCargoCredito(input: ValidarCargoCreditoInput): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];

  if (input.monto <= 0) {
    errores.push({ campo: "monto", mensaje: "El monto a fiar debe ser mayor que cero." });
    return errores;
  }

  if (!input.aplicaCredito) {
    errores.push({ campo: "aplica_credito", mensaje: "Este cliente no tiene crédito habilitado." });
    return errores;
  }

  const disponible = creditoDisponible(input.limiteCredito, input.saldoActual);
  if (disponible !== null && input.monto > disponible) {
    errores.push({
      campo: "monto",
      mensaje:
        `Límite de crédito excedido. El cliente debe RD$ ${input.saldoActual.toFixed(2)} ` +
        `y solo tiene RD$ ${disponible.toFixed(2)} disponible.`,
    });
  }

  return errores;
}
