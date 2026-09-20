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
--   - usuario, usuario_seguridad: contienen pin_hash real e intentos
--     fallidos/bloqueo del personal. El acceso remoto de RBAC-07 (Personal)
--     sigue siendo LOCAL únicamente; no se expone por este canal.
--   - bitacora_accion: auditoría interna, no es dato operativo del dueño.
--   - secuencia_ncf, comprobante_fiscal: fiscal/DGII, fuera de alcance de
--     esta tanda (compras/inventario/reportes).
--   - instalacion, caja: identidad de la instalación física, no aplica a un
--     acceso remoto que no está "en ninguna caja".
--   - cotizacion, cotizacion_linea, devolucion, devolucion_linea, promocion:
--     no pedidos por el dueño en esta tanda; se agregan cuando haga falta.
--
-- Patrón de cada bloque: SELECT para cualquier autenticado; INSERT/UPDATE
-- solo en las tablas donde el dueño realmente necesita escribir (Compras e
-- Inventario). Los reportes son de SOLO LECTURA: las ventas se siguen
-- generando únicamente desde el registro local (Ventas), nunca desde el
-- canal remoto.

-- Reportes (solo lectura) ---------------------------------------------------
CREATE POLICY dueno_lee_negocio ON negocio
  FOR SELECT TO authenticated USING (true);

CREATE POLICY dueno_lee_factura ON factura
  FOR SELECT TO authenticated USING (true);

CREATE POLICY dueno_lee_factura_linea ON factura_linea
  FOR SELECT TO authenticated USING (true);

CREATE POLICY dueno_lee_pago ON pago
  FOR SELECT TO authenticated USING (true);

CREATE POLICY dueno_lee_corte_caja ON corte_caja
  FOR SELECT TO authenticated USING (true);

CREATE POLICY dueno_lee_cliente ON cliente
  FOR SELECT TO authenticated USING (true);

CREATE POLICY dueno_lee_movimiento_inventario ON movimiento_inventario
  FOR SELECT TO authenticated USING (true);

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
