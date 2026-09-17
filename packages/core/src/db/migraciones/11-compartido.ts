import type { Migration } from "./tipos.js";

/**
 * Banda 11-19 (COMPARTIDO / censo de columnas, tarea CENSO-COLUMNAS de la ola 2).
 * Un único agente añade aquí, de una sola pasada, todas las columnas que las
 * áreas futuras iban a reclamar por separado sobre los mismos `ALTER TABLE`
 * (ver 00-CONVENCIONES.md, sección 3 y 4). Ninguna columna referencia una
 * tabla que todavía no existe: MULTICAJA, CAJA, CRM y COMPRAS crean sus
 * tablas propias en bandas posteriores, así que aquí solo van columnas
 * planas (nullable, o con DEFAULT cuando la regla de negocio ya está tomada).
 *
 * - producto: precio_2, cantidad_minima_mayoreo y existencia_minima — las
 *   consume PRECIOS (tercer nivel de precio) y BACKOFFICE-04 (alerta de
 *   existencia baja).
 * - cliente: nivel_precio, niveles_permitidos_json, fecha_nacimiento y
 *   dias_credito — los consume PRECIOS (nivel por cliente) y CRM (crédito y
 *   recordatorios).
 * - negocio: desfase_horario_min, politica_costo, umbral_aviso_costo_pct,
 *   exige_caja_abierta, arqueo_ciego y umbral_diferencia_caja — los consumen
 *   BACKOFFICE, COMPRAS y CAJA respectivamente. `exige_caja_abierta` lleva
 *   DEFAULT 0 porque es una decisión de negocio ya tomada (PLAN-MEJORAS.md,
 *   decisión 6): las instalaciones existentes arrancan con el turno APAGADO
 *   para no dejar sin vender el primer lunes tras la actualización; el seed
 *   de una instalación nueva es quien lo enciende.
 * - factura: prefijo_caja — lo consume MULTICAJA (numeración C1-000123).
 * - factura_linea: nivel_precio y costo_unitario — los consume PRECIOS (qué
 *   nivel se cobró) y COMPRAS/BACKOFFICE (margen real de cada venta).
 * - cotizacion_linea y devolucion_linea: nivel_precio — mismo motivo que
 *   factura_linea, para que el nivel sobreviva si la cotización se convierte
 *   o la línea se devuelve.
 * - devolucion: metodo_devolucion — lo consume CAJA (una devolución en
 *   efectivo mueve la gaveta; en tarjeta/crédito, no).
 * - compra_linea: cantidad_recibida — lo consume COMPRAS (recepción parcial).
 * - compra: condicion_pago, dias_credito, fecha_vencimiento, monto_pagado,
 *   estado_pago, estado_recepcion y fecha_recepcion — los consume COMPRAS
 *   (cuentas por pagar y recepción).
 */
export const migracionesCompartido: Migration[] = [
  {
    id: 11,
    nombre: "censo_columnas_compartido",
    sql: `
      ALTER TABLE producto ADD COLUMN precio_2 REAL;
      ALTER TABLE producto ADD COLUMN cantidad_minima_mayoreo REAL;
      ALTER TABLE producto ADD COLUMN existencia_minima REAL;

      ALTER TABLE cliente ADD COLUMN nivel_precio TEXT;
      ALTER TABLE cliente ADD COLUMN niveles_permitidos_json TEXT;
      ALTER TABLE cliente ADD COLUMN fecha_nacimiento TEXT;
      ALTER TABLE cliente ADD COLUMN dias_credito INTEGER;

      ALTER TABLE negocio ADD COLUMN desfase_horario_min INTEGER;
      ALTER TABLE negocio ADD COLUMN politica_costo TEXT;
      ALTER TABLE negocio ADD COLUMN umbral_aviso_costo_pct REAL;
      ALTER TABLE negocio ADD COLUMN exige_caja_abierta INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE negocio ADD COLUMN arqueo_ciego INTEGER;
      ALTER TABLE negocio ADD COLUMN umbral_diferencia_caja REAL;

      ALTER TABLE factura ADD COLUMN prefijo_caja TEXT;

      ALTER TABLE factura_linea ADD COLUMN nivel_precio TEXT;
      ALTER TABLE factura_linea ADD COLUMN costo_unitario REAL;

      ALTER TABLE cotizacion_linea ADD COLUMN nivel_precio TEXT;

      ALTER TABLE devolucion_linea ADD COLUMN nivel_precio TEXT;

      ALTER TABLE devolucion ADD COLUMN metodo_devolucion TEXT;

      ALTER TABLE compra_linea ADD COLUMN cantidad_recibida REAL;

      ALTER TABLE compra ADD COLUMN condicion_pago TEXT;
      ALTER TABLE compra ADD COLUMN dias_credito INTEGER;
      ALTER TABLE compra ADD COLUMN fecha_vencimiento TEXT;
      ALTER TABLE compra ADD COLUMN monto_pagado REAL;
      ALTER TABLE compra ADD COLUMN estado_pago TEXT;
      ALTER TABLE compra ADD COLUMN estado_recepcion TEXT;
      ALTER TABLE compra ADD COLUMN fecha_recepcion TEXT;
    `,
  },
];
