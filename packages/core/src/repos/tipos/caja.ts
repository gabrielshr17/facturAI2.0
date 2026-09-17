import type { Auditoria } from "./comun.js";

/**
 * `prefijo` es nullable porque las cajas creadas antes de MULTICAJA-01 (o
 * cualquier caja sembrada antes de asignarle prefijo) siguen existiendo sin
 * uno: caja-repo lo exige solo al CREAR, no lo hace NOT NULL en el esquema.
 */
export interface Caja extends Auditoria {
  id: string;
  nombre: string;
  ubicacion: string | null;
  activa: number;
  prefijo: string | null;
}

/**
 * Fila única (id fijo 'instalacion-local', forzado por CHECK en la migración
 * 30) que responde "qué caja es esta instalación" desde los datos. `caja_id`
 * es nullable porque una instalación recién migrada, sin caja asignada
 * todavía, no tiene fila — `instalacion-repo.obtener()` devuelve `undefined`
 * en ese caso, no una fila con `caja_id` null.
 */
export interface Instalacion extends Auditoria {
  id: string;
  caja_id: string | null;
  alias: string | null;
}
