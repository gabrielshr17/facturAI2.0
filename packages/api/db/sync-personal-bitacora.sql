-- Permite que la caja suba el personal (sin PIN ni permisos) y su bitacora de acciones.
-- Solo agrega permisos y triggers; no modifica ni borra filas. Ejecutar una vez en el SQL Editor.

GRANT INSERT (id, nombre, rol, activo, created_at, updated_at, deleted_at) ON usuario TO authenticated;
GRANT UPDATE (id, nombre, rol, activo, created_at, updated_at, deleted_at) ON usuario TO authenticated;

DROP TRIGGER IF EXISTS trg_usuario_tocar_updated_at ON usuario;
CREATE TRIGGER trg_usuario_tocar_updated_at BEFORE UPDATE ON usuario
  FOR EACH ROW EXECUTE FUNCTION sfr_tocar_updated_at();

GRANT SELECT, INSERT, UPDATE ON bitacora_accion TO authenticated;

DROP POLICY IF EXISTS dueno_lee_bitacora_accion ON bitacora_accion;
CREATE POLICY dueno_lee_bitacora_accion ON bitacora_accion
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dueno_escribe_bitacora_accion ON bitacora_accion;
CREATE POLICY dueno_escribe_bitacora_accion ON bitacora_accion
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS dueno_actualiza_bitacora_accion ON bitacora_accion;
CREATE POLICY dueno_actualiza_bitacora_accion ON bitacora_accion
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
