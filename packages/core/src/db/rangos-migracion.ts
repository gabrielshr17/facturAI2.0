/**
 * Reparto de bandas de id de migración por área, en vigor desde
 * 00-CONVENCIONES.md sección 2. El id de una migración nueva sale de aquí,
 * nunca de contar el array: migrator.ts deduplica solo por id, así que dos
 * áreas eligiendo el mismo id dejan una tabla que nunca existe en el cliente,
 * sin error visible. Ver MIGRACIONES.md para la explicación completa.
 */
export interface RangoMigracion {
  area: string;
  desde: number;
  hasta: number;
}

export const RANGOS_MIGRACION: RangoMigracion[] = [
  { area: "BASE", desde: 1, hasta: 10 },
  { area: "COMPARTIDO", desde: 11, hasta: 19 },
  { area: "RBAC", desde: 20, hasta: 29 },
  { area: "MULTICAJA", desde: 30, hasta: 39 },
  { area: "CAJA", desde: 40, hasta: 49 },
  { area: "PRECIOS", desde: 50, hasta: 59 },
  { area: "COMPRAS", desde: 60, hasta: 69 },
  { area: "CRM", desde: 70, hasta: 79 },
  { area: "BACKOFFICE", desde: 80, hasta: 89 },
  { area: "PLATAFORMA", desde: 90, hasta: 94 },
  { area: "CORRECCIONES", desde: 95, hasta: 99 },
];
