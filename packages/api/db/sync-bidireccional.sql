-- Sincronización bidireccional (panel remoto -> caja).
--
-- El panel remoto escribe con el cliente de Supabase y no toca `updated_at`:
-- sin este trigger, una edición remota conserva el `updated_at` viejo y la
-- caja (que compara `updated_at` para decidir quién gana) la ignoraría.
--
-- La caja SÍ envía su propio `updated_at` al subir. Por eso el trigger solo
-- lo reemplaza con now() cuando el UPDATE no lo cambió: así no pisa la marca
-- de tiempo de la caja y no se generan ecos de sincronización.
--
-- Ejecutar una sola vez en el SQL Editor de Supabase. Es idempotente.

CREATE OR REPLACE FUNCTION sfr_tocar_updated_at() RETURNS trigger AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'negocio',
    'departamento',
    'proveedor',
    'cliente',
    'producto',
    'movimiento_inventario'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_tocar_updated_at ON %I', tabla, tabla);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_tocar_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION sfr_tocar_updated_at()',
      tabla,
      tabla
    );
  END LOOP;
END;
$$;
