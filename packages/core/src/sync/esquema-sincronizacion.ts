import { column, Schema, Table } from "@powersync/common";

/**
 * Esquema de PowerSync para la sincronización en segundo plano de la caja
 * física hacia Supabase (ver packages/desktop/src-tauri/src/sync).
 *
 * A propósito NO espeja todo `packages/core/src/db/migrations.ts`: solo
 * incluye las tablas que de verdad necesitan salir del registro hacia el
 * panel remoto del dueño / reportes, que son exactamente las que tienen
 * políticas RLS en packages/api/db/rls-policies.sql. Deliberadamente
 * excluidas (ver comentario al inicio de ese archivo): `usuario`,
 * `usuario_seguridad`, `bitacora_accion`, `secuencia_ncf`,
 * `comprobante_fiscal`, `instalacion`, `caja`.
 *
 * `id` no se declara: PowerSync ya asume una columna `id TEXT` como llave
 * primaria en cada tabla. Los booleanos de SQLite (0/1) se mapean a
 * `column.integer` porque PowerSync no tiene un tipo booleano nativo.
 */

const negocio = new Table({
  nombre_comercial: column.text,
  razon_social: column.text,
  rnc: column.text,
  direccion: column.text,
  telefono: column.text,
  correo: column.text,
  logo_ruta: column.text,
  regimen: column.text,
  ancho_impresora_default: column.integer,
  redondeo_centavo: column.integer,
  inventario_activo: column.integer,
  desfase_horario_min: column.integer,
  politica_costo: column.text,
  umbral_aviso_costo_pct: column.real,
  exige_caja_abierta: column.integer,
  arqueo_ciego: column.integer,
  umbral_diferencia_caja: column.real,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const departamento = new Table({
  nombre: column.text,
  activo: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const producto = new Table({
  codigo_barra: column.text,
  descripcion: column.text,
  tipo_venta: column.text,
  unidad_medida: column.text,
  costo: column.real,
  pct_ganancia: column.real,
  precio_venta: column.real,
  precio_mayoreo: column.real,
  departamento_id: column.text,
  impuesto_tipo: column.text,
  tasa_impuesto: column.real,
  existencia: column.real,
  politica_sin_existencia: column.text,
  favorito: column.integer,
  precio_2: column.real,
  cantidad_minima_mayoreo: column.real,
  existencia_minima: column.real,
  activo: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const cliente = new Table({
  nombre: column.text,
  apellidos: column.text,
  telefono: column.text,
  correo: column.text,
  direccion: column.text,
  comentarios: column.text,
  aplica_credito: column.integer,
  limite_credito: column.real,
  saldo_credito: column.real,
  documento_tipo: column.text,
  documento_numero: column.text,
  nivel_precio: column.text,
  niveles_permitidos_json: column.text,
  fecha_nacimiento: column.text,
  dias_credito: column.integer,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const factura = new Table({
  numero_interno: column.integer,
  fecha_hora: column.text,
  cliente_id: column.text,
  caja_id: column.text,
  usuario_id: column.text,
  tipo: column.text,
  subtotal_gravado: column.real,
  subtotal_exento: column.real,
  total_itbis: column.real,
  total: column.real,
  monto_pagado: column.real,
  cambio: column.real,
  notas: column.text,
  estado: column.text,
  comprobante_id: column.text,
  prefijo_caja: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const factura_linea = new Table({
  factura_id: column.text,
  producto_id: column.text,
  descripcion: column.text,
  cantidad: column.real,
  precio_unitario: column.real,
  es_mayoreo: column.integer,
  impuesto_tipo: column.text,
  tasa_impuesto: column.real,
  monto_itbis: column.real,
  subtotal: column.real,
  nivel_precio: column.text,
  costo_unitario: column.real,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const pago = new Table({
  factura_id: column.text,
  metodo: column.text,
  monto: column.real,
  referencia: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const corte_caja = new Table({
  caja_id: column.text,
  usuario_id: column.text,
  fecha_apertura: column.text,
  fecha_cierre: column.text,
  monto_inicial: column.real,
  total_ventas: column.real,
  total_itbis: column.real,
  total_efectivo: column.real,
  total_tarjeta: column.real,
  total_transferencia: column.real,
  total_credito: column.real,
  efectivo_esperado: column.real,
  efectivo_contado: column.real,
  diferencia: column.real,
  estado: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const movimiento_inventario = new Table({
  producto_id: column.text,
  tipo: column.text,
  cantidad: column.real,
  costo: column.real,
  referencia_tipo: column.text,
  referencia_id: column.text,
  fecha: column.text,
  usuario_id: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const proveedor = new Table({
  nombre: column.text,
  rnc: column.text,
  telefono: column.text,
  correo: column.text,
  direccion: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const compra = new Table({
  fecha: column.text,
  proveedor_id: column.text,
  subtotal: column.real,
  itbis: column.real,
  total: column.real,
  ncf_proveedor: column.text,
  tiene_comprobante_fiscal: column.integer,
  mes_ano_contable: column.text,
  estado_clasificacion: column.text,
  origen: column.text,
  notas: column.text,
  condicion_pago: column.text,
  dias_credito: column.integer,
  fecha_vencimiento: column.text,
  monto_pagado: column.real,
  estado_pago: column.text,
  estado_recepcion: column.text,
  fecha_recepcion: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const compra_linea = new Table({
  compra_id: column.text,
  producto_id: column.text,
  descripcion: column.text,
  cantidad: column.real,
  costo_unitario: column.real,
  impuesto_tipo: column.text,
  tasa_impuesto: column.real,
  monto_itbis: column.real,
  subtotal: column.real,
  cantidad_recibida: column.real,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

const comprobante_archivo = new Table({
  compra_id: column.text,
  nombre_archivo: column.text,
  tipo_mime: column.text,
  contenido_base64: column.text,
  mes_ano: column.text,
  tiene_fiscal: column.integer,
  estado_revision: column.text,
  identificado_por: column.text,
  datos_extraidos_json: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
});

export const TABLAS_SINCRONIZADAS = [
  "negocio",
  "departamento",
  "producto",
  "cliente",
  "factura",
  "factura_linea",
  "pago",
  "corte_caja",
  "movimiento_inventario",
  "proveedor",
  "compra",
  "compra_linea",
  "comprobante_archivo",
] as const;

export type TablaSincronizada = (typeof TABLAS_SINCRONIZADAS)[number];

export const esquemaSincronizacion = new Schema({
  negocio,
  departamento,
  producto,
  cliente,
  factura,
  factura_linea,
  pago,
  corte_caja,
  movimiento_inventario,
  proveedor,
  compra,
  compra_linea,
  comprobante_archivo,
});
