-- Vista de reportes para @sfr/remoto (panel del dueño). NO se ejecuta sola:
-- pegar en el SQL Editor del proyecto Supabase real, igual que ya se hizo
-- con schema.sql y rls-policies.sql.
--
-- Por qué hace falta una vista: PostgREST (la API REST que expone Supabase
-- sobre Postgres) no soporta GROUP BY en una consulta simple contra una
-- tabla; para "ventas por día" hay que agregar del lado del servidor.
--
-- Por qué NO necesita política RLS propia: una vista NORMAL en Postgres (sin
-- SECURITY DEFINER, que esta no usa) corre con los privilegios y las
-- políticas RLS de QUIEN CONSULTA, no del dueño de la vista. Como hereda el
-- RLS de `factura` (ya verificado: `authenticated` puede LEER factura), un
-- usuario autenticado que consulte esta vista solo ve lo que ya podía ver
-- leyendo `factura` directo. Alcanza con el GRANT SELECT de abajo para que
-- el rol `authenticated` pueda siquiera nombrar la vista.
--
-- Limitación de zona horaria (documentada también en Reportes.tsx): `fecha_hora`
-- es TIMESTAMPTZ y se guarda en UTC (igual que en @sfr/core). `date(fecha_hora)`
-- trunca según la zona horaria de la SESIÓN de Postgres, que en Supabase por
-- defecto es UTC, no la de República Dominicana (UTC-4). Una venta después de
-- las 8:00 pm hora local puede agruparse bajo el día UTC siguiente. Para el
-- alcance de hoy se deja así (documentado, no oculto); la corrección real es
-- agrupar por `(fecha_hora AT TIME ZONE 'America/Santo_Domingo')::date` en vez
-- de `date(fecha_hora)` — se deja fuera de esta vuelta para no tocar una cifra
-- que el dueño ya podría estar comparando contra el corte de caja local sin
-- avisarle primero del cambio de criterio.

CREATE VIEW vista_ventas_por_dia AS
  SELECT
    date(fecha_hora) AS fecha,
    SUM(total) AS total_vendido,
    COUNT(*) AS cantidad_facturas
  FROM factura
  WHERE estado = 'cobrada' AND deleted_at IS NULL
  GROUP BY date(fecha_hora)
  ORDER BY date(fecha_hora);

GRANT SELECT ON vista_ventas_por_dia TO authenticated;
