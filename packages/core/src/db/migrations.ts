import type { Migration } from "./migraciones/tipos.js";
import { migracionesBase } from "./migraciones/00-base.js";
import { migracionesCompartido } from "./migraciones/11-compartido.js";
import { migracionesRbac } from "./migraciones/20-rbac.js";
import { migracionesMulticaja } from "./migraciones/30-multicaja.js";
import { migracionesCaja } from "./migraciones/40-caja.js";
import { migracionesPrecios } from "./migraciones/50-precios.js";
import { migracionesCompras } from "./migraciones/60-compras.js";
import { migracionesCrm } from "./migraciones/70-crm.js";
import { migracionesBackoffice } from "./migraciones/80-backoffice.js";
import { migracionesSync } from "./migraciones/95-sync.js";

export type { Migration } from "./migraciones/tipos.js";

/**
 * Concatenador: cada área escribe SOLO su archivo en migraciones/ (uno por
 * banda de id, ver MIGRACIONES.md), así que agregar una migración nunca
 * vuelve a tocar este archivo ni el de otra área. El orden final se calcula
 * por id, no por el orden de los imports de arriba.
 */
export const migrations: Migration[] = [
  ...migracionesBase,
  ...migracionesCompartido,
  ...migracionesRbac,
  ...migracionesMulticaja,
  ...migracionesCaja,
  ...migracionesPrecios,
  ...migracionesCompras,
  ...migracionesCrm,
  ...migracionesBackoffice,
  ...migracionesSync,
].sort((a, b) => a.id - b.id);
