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
  {
    // Verificación opcional de tarjeta/transferencia al revisar un corte ya cerrado (§ CAJA):
    // NULL = nadie lo verificó todavía; distinto de 0, que significa "verificado y coincidió
    // exacto". El supervisor lo llena en Corte de Caja transcribiendo el reporte de lote del
    // datáfono o la confirmación bancaria — no es un conteo ciego como el efectivo, así que no
    // hace falta nada más que estas cuatro columnas.
    id: 41,
    nombre: "verificacion_tarjeta_transferencia",
    sql: /* sql */ `
      ALTER TABLE corte_caja ADD COLUMN tarjeta_verificado REAL;
      ALTER TABLE corte_caja ADD COLUMN tarjeta_diferencia REAL;
      ALTER TABLE corte_caja ADD COLUMN transferencia_verificado REAL;
      ALTER TABLE corte_caja ADD COLUMN transferencia_diferencia REAL;
    `,
  },
];
