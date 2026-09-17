-- Esquema Postgres (para el proyecto Supabase cuando exista) equivalente a
-- las migraciones SQLite de @sfr/core (packages/core/src/db/migrations.ts).
--
-- NO se ejecuta automáticamente todavía: es la traducción de referencia para
-- cuando se conecte el proyecto real. Convenciones (ver plan.md):
--   - PK `id TEXT` = UUID generado en el cliente (no `gen_random_uuid()`:
--     el id se genera offline, antes de sincronizar).
--   - Montos NUMERIC(12,2), tasas NUMERIC(5,4), cantidades NUMERIC(14,4)
--     (permite fracciones para venta a granel).
--   - Booleans 0/1 de SQLite -> BOOLEAN real en Postgres.
--   - Timestamps -> TIMESTAMPTZ; fechas puras (ej. vencimiento NCF) -> DATE.
--   - Todas las tablas sincronizables: created_at, updated_at, deleted_at.

-- Configuración / acceso ------------------------------------------------
CREATE TABLE negocio (
  id                       TEXT PRIMARY KEY,
  nombre_comercial         TEXT NOT NULL,
  razon_social             TEXT,
  rnc                      TEXT,
  direccion                TEXT,
  telefono                 TEXT,
  correo                   TEXT,
  logo_ruta                TEXT,
  regimen                  TEXT,
  ancho_impresora_default  INTEGER NOT NULL DEFAULT 80,
  redondeo_centavo         BOOLEAN NOT NULL DEFAULT true,
  inventario_activo        BOOLEAN NOT NULL DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

CREATE TABLE usuario (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'admin', -- admin | cajero
  pin_hash       TEXT,
  activo         BOOLEAN NOT NULL DEFAULT true,
  permisos_json  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

CREATE TABLE caja (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  ubicacion   TEXT,
  activa      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- Catálogo ----------------------------------------------------------------
CREATE TABLE departamento (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE producto (
  id                      TEXT PRIMARY KEY,
  codigo_barra            TEXT,
  descripcion             TEXT NOT NULL,
  tipo_venta              TEXT NOT NULL DEFAULT 'unidad', -- unidad|granel|paquete|kit
  unidad_medida           TEXT,
  costo                   NUMERIC(12,2) NOT NULL DEFAULT 0,
  pct_ganancia            NUMERIC(6,2) NOT NULL DEFAULT 0,
  precio_venta            NUMERIC(12,2) NOT NULL DEFAULT 0,
  precio_mayoreo          NUMERIC(12,2),
  departamento_id         TEXT REFERENCES departamento(id),
  impuesto_tipo           TEXT NOT NULL DEFAULT 'itbis18', -- itbis18|itbis16|exento|otro
  tasa_impuesto           NUMERIC(5,4) NOT NULL DEFAULT 0.18,
  existencia              NUMERIC(14,4), -- NULL si inventario off
  politica_sin_existencia TEXT NOT NULL DEFAULT 'advertir', -- bloquear|advertir
  activo                  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ
);
CREATE UNIQUE INDEX ux_producto_codigo_barra
  ON producto(codigo_barra) WHERE codigo_barra IS NOT NULL AND deleted_at IS NULL;

-- Clientes ------------------------------------------------------------------
CREATE TABLE cliente (
  id               TEXT PRIMARY KEY,
  nombre           TEXT NOT NULL,
  apellidos        TEXT,
  telefono         TEXT,
  correo           TEXT,
  direccion        TEXT,
  comentarios      TEXT,
  aplica_credito   BOOLEAN NOT NULL DEFAULT false,
  limite_credito   NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_credito    NUMERIC(12,2) NOT NULL DEFAULT 0,
  documento_tipo   TEXT, -- rnc | cedula | NULL
  documento_numero TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

-- Ventas ----------------------------------------------------------------
CREATE TABLE factura (
  id                TEXT PRIMARY KEY,
  numero_interno    INTEGER,
  fecha_hora        TIMESTAMPTZ NOT NULL,
  cliente_id        TEXT REFERENCES cliente(id),
  caja_id           TEXT REFERENCES caja(id),
  usuario_id        TEXT REFERENCES usuario(id),
  tipo              TEXT NOT NULL DEFAULT 'normal', -- normal | fiscal
  subtotal_gravado  NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal_exento   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_itbis       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_pagado      NUMERIC(12,2) NOT NULL DEFAULT 0,
  cambio            NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas             TEXT,
  estado            TEXT NOT NULL DEFAULT 'abierta', -- abierta|cobrada|anulada
  comprobante_id    TEXT, -- FK agregada más abajo (comprobante_fiscal se crea después)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE TABLE factura_linea (
  id              TEXT PRIMARY KEY,
  factura_id      TEXT NOT NULL REFERENCES factura(id),
  producto_id     TEXT REFERENCES producto(id),
  descripcion     TEXT NOT NULL,
  cantidad        NUMERIC(14,4) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  es_mayoreo      BOOLEAN NOT NULL DEFAULT false,
  impuesto_tipo   TEXT NOT NULL DEFAULT 'itbis18',
  tasa_impuesto   NUMERIC(5,4) NOT NULL DEFAULT 0.18,
  monto_itbis     NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX ix_factura_linea_factura ON factura_linea(factura_id);

CREATE TABLE pago (
  id          TEXT PRIMARY KEY,
  factura_id  TEXT NOT NULL REFERENCES factura(id),
  metodo      TEXT NOT NULL, -- efectivo|transferencia|credito|tarjeta
  monto       NUMERIC(12,2) NOT NULL DEFAULT 0,
  referencia  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX ix_pago_factura ON pago(factura_id);

-- Fiscal (e-CF) -----------------------------------------------------------
CREATE TABLE secuencia_ncf (
  id              TEXT PRIMARY KEY,
  tipo_ecf        TEXT NOT NULL,
  prefijo         TEXT NOT NULL,
  modo            TEXT NOT NULL DEFAULT 'ecf', -- ecf|ncf_papel|contingencia
  rango_desde     INTEGER NOT NULL,
  rango_hasta     INTEGER NOT NULL,
  proximo_numero  INTEGER NOT NULL,
  vencimiento     DATE NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'disponible', -- disponible|agotada|vencida
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE comprobante_fiscal (
  id                        TEXT PRIMARY KEY,
  factura_id                TEXT NOT NULL REFERENCES factura(id),
  tipo_ecf                  TEXT NOT NULL,
  ncf                       TEXT NOT NULL,
  secuencia_id              TEXT NOT NULL REFERENCES secuencia_ncf(id),
  rnc_emisor                TEXT,
  receptor_documento_tipo   TEXT,
  receptor_documento_numero TEXT,
  fecha_emision             TIMESTAMPTZ NOT NULL,
  monto_gravado             NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_exento              NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_itbis               NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                     NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado_dgii               TEXT NOT NULL DEFAULT 'pendiente', -- pendiente|aceptado|rechazado|contingencia
  track_id_dgii             TEXT,
  codigo_seguridad          TEXT,
  xml_firmado_ruta          TEXT,
  qr_url                    TEXT,
  fecha_transmision         TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at                TIMESTAMPTZ
);
CREATE UNIQUE INDEX ux_comprobante_fiscal_ncf ON comprobante_fiscal(ncf);
CREATE INDEX ix_comprobante_fiscal_factura ON comprobante_fiscal(factura_id);

ALTER TABLE factura ADD CONSTRAINT fk_factura_comprobante
  FOREIGN KEY (comprobante_id) REFERENCES comprobante_fiscal(id);

-- Caja y auditoría --------------------------------------------------------
CREATE TABLE corte_caja (
  id                  TEXT PRIMARY KEY,
  caja_id             TEXT REFERENCES caja(id),
  usuario_id          TEXT REFERENCES usuario(id),
  fecha_apertura      DATE NOT NULL,
  fecha_cierre        DATE NOT NULL,
  monto_inicial       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_ventas        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_itbis         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_efectivo      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tarjeta       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_transferencia NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_credito       NUMERIC(12,2) NOT NULL DEFAULT 0,
  efectivo_esperado   NUMERIC(12,2) NOT NULL DEFAULT 0,
  efectivo_contado    NUMERIC(12,2) NOT NULL DEFAULT 0,
  diferencia          NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado              TEXT NOT NULL DEFAULT 'cerrado', -- abierto|cerrado
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX ix_corte_caja_fecha_cierre ON corte_caja(fecha_cierre);

-- Inventario ----------------------------------------------------------------
CREATE TABLE movimiento_inventario (
  id              TEXT PRIMARY KEY,
  producto_id     TEXT NOT NULL REFERENCES producto(id),
  tipo            TEXT NOT NULL, -- entrada|salida|ajuste|venta|compra
  cantidad        NUMERIC(14,4) NOT NULL,
  costo           NUMERIC(12,2),
  referencia_tipo TEXT,
  referencia_id   TEXT,
  fecha           TIMESTAMPTZ NOT NULL,
  usuario_id      TEXT REFERENCES usuario(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX ix_movimiento_inventario_producto ON movimiento_inventario(producto_id);

-- Compras e inventario (con archivado) --------------------------------------
CREATE TABLE proveedor (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  rnc         TEXT,
  telefono    TEXT,
  correo      TEXT,
  direccion   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

CREATE TABLE compra (
  id                       TEXT PRIMARY KEY,
  fecha                    TIMESTAMPTZ NOT NULL,
  proveedor_id             TEXT REFERENCES proveedor(id),
  subtotal                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  itbis                    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                    NUMERIC(12,2) NOT NULL DEFAULT 0,
  ncf_proveedor            TEXT,
  tiene_comprobante_fiscal BOOLEAN NOT NULL DEFAULT false,
  mes_ano_contable         TEXT NOT NULL, -- 'AAAA-MM'
  estado_clasificacion     TEXT NOT NULL DEFAULT 'sin_fiscal', -- con_fiscal|sin_fiscal|pendiente_revision
  origen                   TEXT NOT NULL DEFAULT 'manual', -- manual|chatbot
  notas                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);
CREATE INDEX ix_compra_fecha ON compra(fecha);
CREATE INDEX ix_compra_mes_ano ON compra(mes_ano_contable);

CREATE TABLE compra_linea (
  id             TEXT PRIMARY KEY,
  compra_id      TEXT NOT NULL REFERENCES compra(id),
  producto_id    TEXT REFERENCES producto(id),
  descripcion    TEXT NOT NULL,
  cantidad       NUMERIC(14,4) NOT NULL DEFAULT 1,
  costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuesto_tipo  TEXT NOT NULL DEFAULT 'itbis18',
  tasa_impuesto  NUMERIC(5,4) NOT NULL DEFAULT 0.18,
  monto_itbis    NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX ix_compra_linea_compra ON compra_linea(compra_id);

-- En Supabase real esto debería vivir en Storage (bucket privado), no inline;
-- se deja como columna TEXT (base64) para calzar 1:1 con el modo local hasta
-- que se implemente la subida a Storage real (ver README.md de este paquete).
CREATE TABLE comprobante_archivo (
  id                   TEXT PRIMARY KEY,
  compra_id            TEXT REFERENCES compra(id),
  nombre_archivo       TEXT NOT NULL,
  tipo_mime            TEXT NOT NULL,
  contenido_base64     TEXT NOT NULL,
  mes_ano              TEXT NOT NULL, -- 'AAAA-MM'
  tiene_fiscal         BOOLEAN NOT NULL DEFAULT false,
  estado_revision      TEXT NOT NULL DEFAULT 'confirmado_usuario', -- auto|confirmado_usuario|pendiente
  identificado_por     TEXT NOT NULL DEFAULT 'usuario', -- chatbot|usuario
  datos_extraidos_json JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at           TIMESTAMPTZ
);
CREATE INDEX ix_comprobante_archivo_compra ON comprobante_archivo(compra_id);

-- Devoluciones (§ Ventas, migración 7) -------------------------------------
CREATE TABLE devolucion (
  id              TEXT PRIMARY KEY,
  factura_id      TEXT NOT NULL REFERENCES factura(id),
  fecha           TIMESTAMPTZ NOT NULL,
  motivo          TEXT,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  itbis           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  comprobante_id  TEXT REFERENCES comprobante_fiscal(id), -- NC E34, NULL si venta no fiscal
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX ix_devolucion_factura ON devolucion(factura_id);

CREATE TABLE devolucion_linea (
  id                TEXT PRIMARY KEY,
  devolucion_id     TEXT NOT NULL REFERENCES devolucion(id),
  factura_linea_id  TEXT NOT NULL REFERENCES factura_linea(id),
  producto_id       TEXT REFERENCES producto(id),
  descripcion       TEXT NOT NULL,
  cantidad          NUMERIC(14,4) NOT NULL,
  precio_unitario   NUMERIC(12,2) NOT NULL,
  impuesto_tipo     TEXT NOT NULL,
  tasa_impuesto     NUMERIC(5,4) NOT NULL,
  monto_itbis       NUMERIC(12,2) NOT NULL,
  subtotal          NUMERIC(12,2) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX ix_devolucion_linea_devolucion ON devolucion_linea(devolucion_id);
CREATE INDEX ix_devolucion_linea_factura_linea ON devolucion_linea(factura_linea_id);

-- Promociones (§ Fase 3, migración 8) ----------------------------------------
CREATE TABLE promocion (
  id               TEXT PRIMARY KEY,
  nombre           TEXT NOT NULL,
  tipo             TEXT NOT NULL, -- porcentaje|monto_fijo
  valor            NUMERIC(12,2) NOT NULL,
  aplica_a         TEXT NOT NULL DEFAULT 'producto', -- producto|departamento|todo
  producto_id      TEXT REFERENCES producto(id),
  departamento_id  TEXT REFERENCES departamento(id),
  fecha_inicio     DATE NOT NULL,
  fecha_fin        DATE NOT NULL,
  activa           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);
CREATE INDEX ix_promocion_producto ON promocion(producto_id);
CREATE INDEX ix_promocion_departamento ON promocion(departamento_id);
CREATE INDEX ix_promocion_vigencia ON promocion(fecha_inicio, fecha_fin);

-- Cotizaciones (§ Ventas, migración 10) --------------------------------------
CREATE TABLE cotizacion (
  id                TEXT PRIMARY KEY,
  numero_interno    INTEGER,
  fecha_hora        TIMESTAMPTZ NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  cliente_id        TEXT REFERENCES cliente(id),
  usuario_id        TEXT REFERENCES usuario(id),
  subtotal_gravado  NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal_exento   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_itbis       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  notas             TEXT,
  estado            TEXT NOT NULL DEFAULT 'vigente', -- vigente|convertida|anulada
  factura_id        TEXT REFERENCES factura(id), -- si se convirtió en venta
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX ix_cotizacion_fecha ON cotizacion(fecha_hora);

CREATE TABLE cotizacion_linea (
  id              TEXT PRIMARY KEY,
  cotizacion_id   TEXT NOT NULL REFERENCES cotizacion(id),
  producto_id     TEXT REFERENCES producto(id),
  descripcion     TEXT NOT NULL,
  cantidad        NUMERIC(14,4) NOT NULL DEFAULT 1,
  precio_unitario NUMERIC(12,2) NOT NULL DEFAULT 0,
  impuesto_tipo   TEXT NOT NULL DEFAULT 'itbis18',
  tasa_impuesto   NUMERIC(5,4) NOT NULL DEFAULT 0.18,
  monto_itbis     NUMERIC(12,2) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX ix_cotizacion_linea_cotizacion ON cotizacion_linea(cotizacion_id);

-- Bitácora (pendiente en el modo local, ver plan.md §"Caja y auditoría") ----
CREATE TABLE bitacora_accion (
  id          TEXT PRIMARY KEY,
  usuario_id  TEXT REFERENCES usuario(id),
  origen      TEXT NOT NULL DEFAULT 'app', -- app|chatbot
  accion      TEXT NOT NULL,
  entidad     TEXT NOT NULL,
  entidad_id  TEXT,
  resumen     TEXT,
  confirmada  BOOLEAN NOT NULL DEFAULT true,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_bitacora_accion_entidad ON bitacora_accion(entidad, entidad_id);
