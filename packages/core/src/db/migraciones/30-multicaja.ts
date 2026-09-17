import type { Migration } from "./tipos.js";

/**
 * Banda 30-39 (MULTICAJA — identidad de instalación y NCF por caja).
 *
 * `instalacion` es una tabla de una sola fila (CHECK id='instalacion-local')
 * que responde "qué caja es esta instalación" desde los datos, no desde
 * localStorage ni una variable de entorno: tiene que viajar con la base y
 * ser legible desde los repos, porque la validación no puede vivir solo en
 * el front (CLAUDE.md §4). Esta migración NO inserta la fila: sin ella, una
 * instalación recién migrada se comporta exactamente igual que hoy (caja_id
 * null en factura/cotización, numeración global, secuencia NCF compartida).
 *
 * DISCREPANCIA CON EL BRIEF, verificada contra el código real: `factura.caja_id`
 * ya existe desde la migración base (00-base.ts:113) y `factura.prefijo_caja`
 * YA fue añadida por el censo de columnas compartido (banda 11-19, ola 2 —
 * ver `11-compartido.ts:59`, que documenta explícitamente "lo consume
 * MULTICAJA"). El SQL del brief de esta tarea repetía
 * `ALTER TABLE factura ADD COLUMN prefijo_caja TEXT`, que hoy rompe con
 * "duplicate column name" porque la columna ya existe: se omite aquí.
 * `cotizacion` y `secuencia_ncf` SÍ necesitan su propia columna `caja_id`
 * nueva (y `cotizacion.prefijo_caja`), porque nunca la tuvieron.
 *
 * El UPDATE de saneamiento va ANTES del CREATE UNIQUE INDEX a propósito: los
 * revisores adversariales del brief señalaron que un CREATE UNIQUE INDEX
 * sobre datos de producción sin saneamiento previo puede fallar si alguna
 * instalación ya tiene un `numero_interno` repetido para la misma caja (una
 * carrera pasada del cálculo MAX+1, una restauración, un merge manual), y
 * `migrate()` no corre en transacción en el driver de escritorio: si el
 * CREATE INDEX revienta, la instalación queda inarrancable en cada arranque.
 * El UPDATE renumera de forma determinista y densa: para cada `caja_id`,
 * asigna el rango de facturas no borradas ordenado por (numero_interno, id)
 * empezando en 1, así que después de correrlo NINGÚN par (caja_id,
 * numero_interno) puede quedar repetido y el CREATE UNIQUE INDEX que sigue
 * nunca falla. Verificado con un test que siembra dos facturas con el mismo
 * (caja_id, numero_interno) antes de migrar (ver
 * packages/core/test/migracion-30-multicaja.test.ts).
 *
 * Nada de TRIGGER ni de ';' dentro de literales o comentarios SQL: el driver
 * de escritorio parte el SQL por ';' a ciegas (tauri-sql-driver.ts:17-22).
 * `ALTER TABLE ... ADD COLUMN ... REFERENCES` se declara sin DEFAULT y
 * nullable, que es la única forma legal en SQLite.
 */
export const migracionesMulticaja: Migration[] = [
  {
    id: 30,
    nombre: "identidad_instalacion",
    sql: /* sql */ `
      CREATE TABLE instalacion (
        id          TEXT PRIMARY KEY CHECK (id = 'instalacion-local'),
        caja_id     TEXT REFERENCES caja(id),
        alias       TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL,
        deleted_at  TEXT
      );
      ALTER TABLE caja ADD COLUMN prefijo TEXT;
      UPDATE factura SET numero_interno = (
        SELECT COUNT(*) FROM factura f2
        WHERE f2.caja_id IS factura.caja_id
          AND f2.deleted_at IS NULL
          AND (f2.numero_interno < factura.numero_interno OR (f2.numero_interno = factura.numero_interno AND f2.id <= factura.id))
      ) WHERE deleted_at IS NULL AND caja_id IS NOT NULL;
      CREATE UNIQUE INDEX ux_factura_caja_numero ON factura(caja_id, numero_interno) WHERE deleted_at IS NULL;
      CREATE INDEX ix_factura_caja_estado ON factura(caja_id, estado);
      ALTER TABLE cotizacion ADD COLUMN caja_id TEXT REFERENCES caja(id);
      ALTER TABLE cotizacion ADD COLUMN prefijo_caja TEXT;
      CREATE UNIQUE INDEX ux_cotizacion_caja_numero ON cotizacion(caja_id, numero_interno) WHERE deleted_at IS NULL;
      ALTER TABLE secuencia_ncf ADD COLUMN caja_id TEXT REFERENCES caja(id);
      CREATE INDEX ix_secuencia_ncf_caja ON secuencia_ncf(caja_id, tipo_ecf);
    `,
  },
];
