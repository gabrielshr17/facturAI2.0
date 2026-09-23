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
  -- Censo de columnas compartido (migración SQLite 11): desfase_horario_min
  -- lo consume BACKOFFICE, politica_costo/umbral_aviso_costo_pct COMPRAS, y
  -- exige_caja_abierta/arqueo_ciego/umbral_diferencia_caja CAJA.
  -- exige_caja_abierta nace en false para no exigir turno a instalaciones
  -- que arrancan por primera vez sin haber sembrado la caja principal.
  desfase_horario_min      INTEGER,
  politica_costo           TEXT,
  umbral_aviso_costo_pct   NUMERIC(6,2),
  exige_caja_abierta       BOOLEAN NOT NULL DEFAULT false,
  arqueo_ciego             BOOLEAN,
  umbral_diferencia_caja   NUMERIC(12,2),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at               TIMESTAMPTZ
);

CREATE TABLE usuario (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  rol            TEXT NOT NULL DEFAULT 'dueno', -- cajero | supervisor | dueno | superadmin
  pin_hash       TEXT,
  activo         BOOLEAN NOT NULL DEFAULT true,
  permisos_json  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ
);

-- Control de acceso (§ RBAC-01, migración SQLite 20): satélite de `usuario`
-- para no arrastrar intentos_fallidos/bloqueado_hasta en cada fila de
-- usuario. `pin_hash` de `usuario` NUNCA se replica con valor real a este
-- espejo por sync-rules.yaml (ver ese archivo).
CREATE TABLE usuario_seguridad (
  usuario_id         TEXT PRIMARY KEY REFERENCES usuario(id),
  ultimo_acceso      TIMESTAMPTZ,
  intentos_fallidos  INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta    TIMESTAMPTZ,
  pin_actualizado_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE caja (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  ubicacion   TEXT,
  activa      BOOLEAN NOT NULL DEFAULT true,
  -- prefijo (migración SQLite 30, MULTICAJA): base de la numeración por caja
  -- (ej. "C1" -> C1-000123). NULL = caja sin numeración propia todavía.
  prefijo     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- instalación (migración SQLite 30, MULTICAJA): fila única que responde "qué
-- caja es esta instalación" desde los datos, no desde localStorage ni una
-- variable de entorno (CLAUDE.md §4: ninguna regla de negocio solo en el
-- front). El CHECK de fila única de SQLite (id = 'instalacion-local') se
-- traduce igual en Postgres: una CHECK constraint sobre una PK de un solo
-- valor posible cumple el mismo propósito sin necesitar una tabla singleton
-- separada.
CREATE TABLE instalacion (
  id          TEXT PRIMARY KEY CHECK (id = 'instalacion-local'),
  caja_id     TEXT REFERENCES caja(id),
  alias       TEXT,
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
  -- favorito (migración SQLite 9): productos marcados para aparecer primero
  -- al buscar en Ventas.
  favorito                BOOLEAN NOT NULL DEFAULT false,
  -- Censo de columnas compartido (migración SQLite 11): precio_2 y
  -- cantidad_minima_mayoreo los consume PRECIOS (tercer nivel de precio);
  -- existencia_minima lo consume BACKOFFICE (alerta de existencia baja).
  precio_2                NUMERIC(12,2),
  cantidad_minima_mayoreo NUMERIC(14,4),
  existencia_minima       NUMERIC(14,4),
  activo                  BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ
);
CREATE UNIQUE INDEX ux_producto_codigo_barra
  ON producto(codigo_barra) WHERE codigo_barra IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_producto_favorito ON producto(favorito);

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
  -- Censo de columnas compartido (migración SQLite 11): nivel_precio y
  -- niveles_permitidos_json los consume PRECIOS (nivel por cliente);
  -- fecha_nacimiento y dias_credito los consume CRM (recordatorios y crédito).
  nivel_precio             TEXT,
  niveles_permitidos_json  JSONB,
  fecha_nacimiento         DATE,
  dias_credito             INTEGER,
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
  -- caja_id/usuario_id SIN FK a propósito (ver packages/core/src/sync/
  -- subida-saliente.ts): caja y usuario NUNCA se sincronizan hacia Supabase
  -- (identidad de instalación física / pin_hash real), así que una FK real
  -- aquí bloquearía para siempre la subida de cualquier factura — el
  -- registro local SÍ mantiene la FK real en su propio SQLite.
  caja_id           TEXT,
  usuario_id        TEXT,
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
  -- prefijo_caja (migración SQLite 11, consumida por MULTICAJA): numeración
  -- C1-000123 por caja.
  prefijo_caja      TEXT,
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
  -- Censo de columnas compartido (migración SQLite 11): nivel_precio lo
  -- consume PRECIOS (qué nivel se cobró); costo_unitario lo consume
  -- COMPRAS/BACKOFFICE (margen real de cada venta).
  nivel_precio    TEXT,
  costo_unitario  NUMERIC(12,2),
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
  -- caja_id (migración SQLite 30, MULTICAJA): secuencia NCF propia por caja;
  -- NULL = secuencia compartida entre cajas (comportamiento previo a MULTICAJA).
  caja_id         TEXT REFERENCES caja(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX ix_secuencia_ncf_caja ON secuencia_ncf(caja_id, tipo_ecf);

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
  -- Sin FK a propósito, mismo motivo que factura.caja_id/usuario_id arriba.
  caja_id             TEXT,
  usuario_id          TEXT,
  -- TIMESTAMPTZ (no DATE): el turno guarda el instante exacto de apertura/cierre,
  -- no solo el día, para poder acotar las ventas de cada turno sin solaparse.
  fecha_apertura      TIMESTAMPTZ NOT NULL,
  fecha_cierre        TIMESTAMPTZ NOT NULL,
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
  -- Verificación opcional de tarjeta/transferencia (migración SQLite 41): NULL = nadie lo
  -- verificó todavía, distinto de 0 (verificado y coincidió exacto). No es un conteo ciego
  -- como el efectivo — el supervisor transcribe el reporte de lote del datáfono o la
  -- confirmación bancaria en Corte de Caja, para cualquier turno ya cerrado.
  tarjeta_verificado          NUMERIC(12,2),
  tarjeta_diferencia          NUMERIC(12,2),
  transferencia_verificado    NUMERIC(12,2),
  transferencia_diferencia    NUMERIC(12,2),
  estado              TEXT NOT NULL DEFAULT 'cerrado', -- abierto|cerrado
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX ix_corte_caja_fecha_cierre ON corte_caja(fecha_cierre);
-- Respaldo del índice único parcial de SQLite (packages/core/src/db/migraciones/40-caja.ts):
-- como máximo un turno abierto a la vez.
CREATE UNIQUE INDEX ux_corte_caja_un_abierto ON corte_caja(estado)
  WHERE estado = 'abierto' AND deleted_at IS NULL;

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
  -- Sin FK a propósito, mismo motivo que factura.usuario_id arriba.
  usuario_id      TEXT,
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
  -- Censo de columnas compartido (migración SQLite 11), consumidas por
  -- COMPRAS: cuentas por pagar y recepción.
  condicion_pago           TEXT,
  dias_credito             INTEGER,
  fecha_vencimiento        DATE,
  monto_pagado             NUMERIC(12,2),
  estado_pago              TEXT,
  estado_recepcion         TEXT,
  fecha_recepcion          TIMESTAMPTZ,
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
  -- cantidad_recibida (migración SQLite 11, consumida por COMPRAS): recepción
  -- parcial de la línea.
  cantidad_recibida NUMERIC(14,4),
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
  -- metodo_devolucion (migración SQLite 11, consumida por CAJA): una
  -- devolución en efectivo mueve la gaveta; en tarjeta/crédito, no.
  metodo_devolucion TEXT,
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
  -- nivel_precio (migración SQLite 11): mismo motivo que factura_linea, para
  -- que el nivel sobreviva si la línea se devuelve.
  nivel_precio      TEXT,
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
  -- caja_id/prefijo_caja (migración SQLite 30, MULTICAJA): numeración por
  -- caja igual que factura.
  caja_id           TEXT REFERENCES caja(id),
  prefijo_caja      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX ix_cotizacion_fecha ON cotizacion(fecha_hora);
CREATE UNIQUE INDEX ux_cotizacion_caja_numero
  ON cotizacion(caja_id, numero_interno) WHERE deleted_at IS NULL;

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
  -- nivel_precio (migración SQLite 11): mismo motivo que factura_linea, para
  -- que el nivel sobreviva si la cotización se convierte en venta.
  nivel_precio    TEXT,
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

-- Índices MULTICAJA (migración SQLite 30) --------------------------------
CREATE UNIQUE INDEX ux_factura_caja_numero
  ON factura(caja_id, numero_interno) WHERE deleted_at IS NULL;
CREATE INDEX ix_factura_caja_estado ON factura(caja_id, estado);

-- Índices BACKOFFICE (migración SQLite 80): panel del dueño, evitan un scan
-- completo de factura en cada agregado por rango de fecha.
CREATE INDEX ix_factura_fecha_hora ON factura(fecha_hora);
CREATE INDEX ix_factura_estado_fecha ON factura(estado, fecha_hora);
CREATE INDEX ix_factura_linea_producto ON factura_linea(producto_id);
