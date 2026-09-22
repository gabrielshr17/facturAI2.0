import type { Migration } from "./tipos.js";

/**
 * Banda 40-49 (CAJA).
 *
 * `corte_caja.estado` ya soportaba 'abierto'/'cerrado' desde la migración
 * base (00-base.ts, id=3), pero ningún repo escribía 'abierto': el ciclo de
 * turno (abrir con fondo inicial -> vender -> cerrar con conteo) nunca se
 * implementó. Esta es la primera migración real de la banda: un índice
 * único parcial que garantiza a nivel de base que solo puede haber UN turno
 * abierto a la vez (todas las instalaciones de este MVP son de una sola
 * caja en la práctica — ver `corte-caja-repo.ts` para el detalle de por qué
 * el turno se modela global al negocio y no por `caja_id`). Es el respaldo
 * duro detrás de la validación del repo (`abrirTurno` ya rechaza un segundo
 * turno abierto antes de llegar aquí); este índice cubre la carrera que la
 * validación en JS no puede cubrir sola.
 */
export const migracionesCaja: Migration[] = [
  {
    id: 40,
    nombre: "un_turno_abierto",
    sql: /* sql */ `
      CREATE UNIQUE INDEX ux_corte_caja_un_abierto ON corte_caja(estado)
        WHERE estado = 'abierto' AND deleted_at IS NULL;
    `,
  },
];
