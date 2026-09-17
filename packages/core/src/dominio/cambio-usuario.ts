import type { Factura } from "../repos/tipos.js";

/**
 * Regla de negocio para el cambio rápido de usuario en el punto de venta (§ RBAC-07,
 * parte C).
 *
 * DECISIÓN YA CONFIRMADA CON EL DUEÑO DEL NEGOCIO (el brief original de RBAC-07 la
 * dejaba como pregunta abierta: "se queda a nombre del cajero anterior, se transfiere
 * al nuevo, o hay que cerrarlo primero"; ya no es una pregunta): si hay CUALQUIER
 * ticket abierto CON CONTENIDO en el momento de cambiar de usuario, el cambio se
 * BLOQUEA por completo hasta que ese ticket se cobre o se elimine. No se transfiere el
 * ticket al nuevo usuario ni se queda a nombre del anterior — sencillamente no se
 * permite cambiar mientras haya algo pendiente.
 *
 * "Con contenido" y no "cualquier fila de `listarAbiertos()`" a propósito:
 * `Ventas.tsx` (`cargarTickets`) abre SIEMPRE un ticket vacío (`abrirTicket()`,
 * `total: 0`) en cuanto no queda ninguno abierto, así que `listarAbiertos()` casi
 * nunca devuelve un arreglo vacío en la práctica — bloquear por esa fila placeholder
 * volvería el cambio rápido inutilizable la mayoría de las veces. `total` se recalcula
 * en cada `agregarLinea`/`quitarLinea` (`recalcularTotales`), así que es la señal ya
 * disponible en el objeto `Factura` sin tener que ir a buscar `factura_linea` aparte.
 *
 * Función pura a propósito (CLAUDE.md §4: ninguna regla de negocio vive solo en un
 * componente): el componente de UI solo llama a `evaluarCambioUsuario` con lo que ya
 * trajo `facturaRepo.listarAbiertos()`, nunca decide él mismo si hay que bloquear.
 */
export interface ResultadoCambioUsuario {
  permitido: boolean;
  /** Mensaje listo para mostrar con `useAlertas().avisar(...)` cuando `permitido` es `false`. */
  mensaje?: string;
}

function tieneContenido(ticket: Factura): boolean {
  return ticket.total !== 0;
}

export function evaluarCambioUsuario(ticketsAbiertos: readonly Factura[]): ResultadoCambioUsuario {
  const conContenido = ticketsAbiertos.filter(tieneContenido);
  if (conContenido.length === 0) return { permitido: true };

  const plural = conContenido.length > 1;
  return {
    permitido: false,
    mensaje: plural
      ? `Hay ${conContenido.length} tickets abiertos. Cóbralos o elimínalos antes de cambiar de usuario.`
      : "Hay un ticket abierto. Cóbralo o elimínalo antes de cambiar de usuario.",
  };
}
