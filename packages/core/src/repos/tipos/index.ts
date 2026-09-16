/**
 * Barrel: un archivo por dominio (censo de columnas y áreas nuevas añaden el
 * suyo aquí, no parchean uno compartido). repos/tipos.ts reexporta este
 * barrel para que las importaciones existentes por "../repos/tipos.js" sigan
 * funcionando sin cambios.
 */
export * from "./comun.js";
export * from "./producto.js";
export * from "./cliente.js";
export * from "./departamento.js";
export * from "./factura.js";
export * from "./devolucion.js";
export * from "./cotizacion.js";
export * from "./fiscal.js";
export * from "./corte-caja.js";
export * from "./inventario.js";
export * from "./compra.js";
export * from "./bitacora.js";
export * from "./promocion.js";
export * from "./negocio.js";
