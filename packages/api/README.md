# @sfr/api (backend multi-caja/multiusuario)

Backend Fastify para el modo multi-caja/multiusuario (§ Flujo de datos y
modos, plan.md). **El modo 100% local (default) no necesita este paquete
corriendo** — el cliente (Tauri/PWA) habla directo con su SQLite local.

## Estado: scaffold, sin conectar

Este paquete arranca y sirve rutas, pero **no está conectado a ningún
proyecto real de Supabase ni de PowerSync todavía**:

- `GET /health` — responde siempre; indica si Supabase/PowerSync están
  configurados (`supabaseConfigurado`/`powersyncConfigurado`), no si están
  *funcionando*.
- Auth (`src/plugins/auth.ts`): sin credenciales, todas las solicitudes pasan
  como un usuario de desarrollo fijo (`dev-local`) — modo esperado en 100%
  local, nunca en producción. **Con credenciales presentes, la verificación
  de JWT contra Supabase Auth ya está implementada** (`@supabase/supabase-js`,
  `supabase.auth.getUser(token)`): token ausente, inválido o un fallo de red
  al verificarlo responden `401` explícito, nunca se asume válido. Ver
  `test/auth.test.ts` para los casos cubiertos (mock de `@supabase/supabase-js`).
- `POST /fiscal/transmitir` (§ Módulo fiscal): responde `501` siempre. Sigue
  pendiente la decisión "PAC certificado vs. integración directa a la DGII"
  (ver `plan.md`, "Decisiones aún pendientes"). El cliente hoy usa
  `crearProveedorFiscalSimulado()` de `@sfr/core` para desarrollo.
- `db/schema.sql`: traducción a Postgres de las migraciones SQLite de
  `@sfr/core` (bandas 00-base, 11-compartido, 20-rbac, 30-multicaja y
  80-backoffice; 40/50/60/70 siguen vacías en `@sfr/core` y no tienen nada
  que traducir todavía), lista para correr contra el Postgres de un proyecto
  Supabase cuando exista (no se ejecuta sola).
- `sync-rules.yaml`: reglas de PowerSync de referencia (bucket único,
  asumiendo negocio single-tenant); se sube al dashboard de PowerSync cuando
  haya un proyecto. `usuario_seguridad` queda fuera a propósito (mismo
  criterio que `packages/core/src/repos/backup-repo.ts`): es estado
  operativo de control de acceso, no dato de negocio que el cliente necesite
  releer.

## Qué falta para activarlo de verdad

1. Crear un proyecto de **Supabase** → copiar `SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE_KEY` a `.env` (ver `.env.example`).
2. Correr `db/schema.sql` contra el Postgres de ese proyecto y confirmar que
   no hay errores de sintaxis que solo un Postgres real detecta (la
   traducción se hizo a mano, sin ejecutarla todavía contra un servidor).
3. Crear un proyecto de **PowerSync**, apuntarlo al mismo Postgres, subir
   `sync-rules.yaml`, y copiar `POWERSYNC_URL` a `.env`.
4. Probar el login real de punta a punta con un usuario de prueba de
   Supabase Auth (crear el usuario, pedirle un JWT, mandarlo en
   `Authorization: Bearer <token>` a una ruta protegida) — los tests de hoy
   solo cubren la lógica con un mock, no un proyecto real.
5. Implementar `POST /fiscal/transmitir` una vez decidido PAC vs. DGII
   directo (certificado digital, custodia de credenciales, etc. — ver
   `plan.md`).

## Correr en local (modo scaffold, sin credenciales)

```
pnpm --filter @sfr/api dev
```

Arranca en `http://localhost:3001` (configurable con `PORT`). `GET /health`
debe responder `{"estado":"ok", "supabaseConfigurado": false, ...}`.
