-- Políticas de Row Level Security para el proyecto Supabase real.
--
-- CONTEXTO: schema.sql ya se ejecutó contra el proyecto y Supabase activó RLS
-- por defecto en cada tabla nueva (sin políticas = nadie puede leer/escribir
-- con la publishable key ni con un JWT de Supabase Auth; solo la secret key,
-- que SIEMPRE evita RLS, sigue funcionando -- eso es lo que ya usa nuestro
-- backend @sfr/api).
--
-- Este archivo agrega las políticas mínimas para que el DUEÑO, autenticado
-- por Supabase Auth (email/contraseña, NO el PIN local), pueda usar las
-- pantallas remotas de Compras, Inventario y Reportes. Es una app de un solo
-- negocio (single-tenant): no hace falta filtrar por negocio_id, "autenticado"
-- ya identifica al dueño porque somos nosotros quienes creamos su usuario en
-- Supabase Auth (nadie se registra solo).
--
-- Deliberadamente SIN política (osea: bloqueadas para cualquier key que no
-- sea la secret key) las tablas que no le corresponden al dueño remoto:
--   - usuario_seguridad: pin_actualizado_at/intentos_fallidos/bloqueado_hasta
--     del personal. El reset de PIN sigue siendo LOCAL únicamente.
--   - bitacora_accion: auditoría interna, no es dato operativo del dueño.
--   - secuencia_ncf, comprobante_fiscal: fiscal/DGII, fuera de alcance de
--     esta tanda (compras/inventario/reportes).
--   - instalacion, caja: identidad de la instalación física, no aplica a un
--     acceso remoto que no está "en ninguna caja".
--   - devolucion, devolucion_linea: no pedidas por el dueño en esta tanda;
--     se agregan cuando haga falta.
--
-- Patrón de cada bloque: SELECT para cualquier autenticado; INSERT/UPDATE
-- donde además haga falta escribir.
--
-- `usuario` es la EXCEPCIÓN al patrón: tiene política de fila permisiva
-- (USING true) igual que las demás, pero además GRANTs por columna que
-- excluyen `pin_hash` y `permisos_json` — el dueño remoto puede ver/crear/
-- editar nombre/rol/activo del personal (pantalla Personal), pero la
-- fila de RLS por sí sola no basta para esconder esas dos columnas: sin el
-- REVOKE+GRANT de más abajo, `USING (true)` las expondría igual que el
-- resto. El reset de PIN y el ajuste fino de permisos siguen siendo LOCAL
-- únicamente (usuario_seguridad sigue sin política, ver arriba).
--
-- Reportes (negocio, factura, factura_linea, pago, corte_caja, cliente,
-- movimiento_inventario) ganaron INSERT/UPDATE (no solo SELECT) cuando se
-- reemplazó la sincronización rota basada en PowerSync por
-- packages/core/src/sync/subida-saliente.ts: el registro local sube sus
-- propias ventas directo a estas tablas vía PostgREST, autenticado con la
-- MISMA identidad de sync compartida que ya usaban Compras/Inventario (no
-- hay un rol de Postgres separado para "solo el registro" vs. "el dueño
-- remoto" — ambos son `authenticated` hoy, aceptable para una app de un
-- solo negocio). Antes de este cambio estas tablas eran de solo lectura a
-- propósito ("las ventas se generan solo desde el registro local, nunca
-- desde el canal remoto") — sigue siendo cierto: el PANEL REMOTO (dueño)
-- nunca escribe factura/pago/etc., solo el registro local lo hace, ahora
-- por HTTP en vez de por PowerSync.

-- Reportes (lectura + escritura: el registro local sube sus ventas) --------
CREATE POLICY dueno_lee_negocio ON negocio
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_negocio ON negocio
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_negocio ON negocio
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_factura ON factura
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_factura ON factura
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_factura ON factura
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_factura_linea ON factura_linea
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_factura_linea ON factura_linea
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_factura_linea ON factura_linea
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_pago ON pago
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_pago ON pago
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_pago ON pago
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_corte_caja ON corte_caja
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_corte_caja ON corte_caja
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_corte_caja ON corte_caja
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_cliente ON cliente
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_cliente ON cliente
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_cliente ON cliente
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_movimiento_inventario ON movimiento_inventario
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_movimiento_inventario ON movimiento_inventario
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_movimiento_inventario ON movimiento_inventario
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Inventario (lectura + escritura: ajustar existencia, precios, alta de productos) --
CREATE POLICY dueno_lee_producto ON producto
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_producto ON producto
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_producto ON producto
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_departamento ON departamento
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_departamento ON departamento
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_departamento ON departamento
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Compras (lectura + escritura completa) ------------------------------------
CREATE POLICY dueno_lee_proveedor ON proveedor
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_proveedor ON proveedor
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_proveedor ON proveedor
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_compra ON compra
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_compra ON compra
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_compra ON compra
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_compra_linea ON compra_linea
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_compra_linea ON compra_linea
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_compra_linea ON compra_linea
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_comprobante_archivo ON comprobante_archivo
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_comprobante_archivo ON comprobante_archivo
  FOR INSERT TO authenticated WITH CHECK (true);

-- Promociones (lectura + escritura completa) --------------------------------
CREATE POLICY dueno_lee_promocion ON promocion
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_promocion ON promocion
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_promocion ON promocion
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Cotizaciones (lectura + anular; nunca se crean desde el canal remoto) -----
CREATE POLICY dueno_lee_cotizacion ON cotizacion
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_actualiza_cotizacion ON cotizacion
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY dueno_lee_cotizacion_linea ON cotizacion_linea
  FOR SELECT TO authenticated USING (true);

-- Personal (pantalla Personal remota: nombre/rol/activo, NUNCA pin_hash) ----
-- La política de fila es permisiva igual que el resto, pero los GRANT por
-- columna de abajo son los que de verdad esconden pin_hash/permisos_json:
-- sin ellos, esta misma política expondría la tabla completa.
CREATE POLICY dueno_lee_usuario ON usuario
  FOR SELECT TO authenticated USING (true);
CREATE POLICY dueno_escribe_usuario ON usuario
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY dueno_actualiza_usuario ON usuario
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

REVOKE ALL ON usuario FROM authenticated;
GRANT SELECT (id, nombre, rol, activo, created_at, updated_at, deleted_at)
  ON usuario TO authenticated;
GRANT INSERT (id, nombre, rol, activo)
  ON usuario TO authenticated;
GRANT UPDATE (nombre, rol, activo, updated_at)
  ON usuario TO authenticated;
