import type { Migration } from "./tipos.js";

/**
 * Banda 80-89 (BACKOFFICE). Vacío hasta que el área despache su primera
 * migración. Un solo agente escribe este archivo por vez, ver
 * MIGRACIONES.md y 00-CONVENCIONES.md, sección 2.
 */
export const migracionesBackoffice: Migration[] = [];
