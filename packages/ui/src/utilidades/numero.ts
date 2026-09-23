/** Deja pasar solo dígitos y un único punto decimal — para inputs de texto (type="text" +
 *  inputMode="decimal") que solo deben aceptar números, ya que ese tipo de input no bloquea
 *  letras ni símbolos por sí solo en todos los navegadores/teclados. */
export function filtrarNumero(texto: string): string {
  const limpio = texto.replace(/[^0-9.]/g, "");
  const primerPunto = limpio.indexOf(".");
  if (primerPunto === -1) return limpio;
  return limpio.slice(0, primerPunto + 1) + limpio.slice(primerPunto + 1).replace(/\./g, "");
}

/** Como `filtrarNumero`, pero sin punto decimal — para cantidades (p.ej. cuántas monedas o
 *  billetes de una denominación), donde un medio no tiene sentido. */
export function filtrarEntero(texto: string): string {
  return texto.replace(/[^0-9]/g, "");
}
