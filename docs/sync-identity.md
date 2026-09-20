# Identidad de sincronización compartida (PowerSync)

## Qué es

Cada caja física necesita autenticarse contra Supabase Auth en segundo plano
para que PowerSync pueda sincronizar sus datos locales hacia la nube. En vez
de una identidad por caja, este proyecto usa **una sola identidad de
Supabase Auth compartida por todas las cajas** (`SYNC_EMAIL`/`SYNC_PASSWORD`
en `packages/api/.env` y, cuando exista, en `packages/desktop/.env`).

Esta identidad es invisible tanto para el cajero (que sigue usando su PIN
local) como para el dueño (que usa su propia cuenta en el panel remoto). Es
un usuario "de máquina", no de persona.

## Por qué es compartida (decisión deliberada)

El negocio opera con 2 cajas hoy. Provisionar y rotar una identidad por caja
es más seguro pero también más trabajo operativo (Rust + `@sfr/api` tendrían
que emitir credenciales por instalación, ver la opción A descartada por
ahora en `recommendations from bigpickle.md`). Con solo 2 cajas, la
simplicidad de una sola identidad compartida se consideró aceptable por
ahora — se puede revisar si el negocio crece a más instalaciones o si el
riesgo de abajo se materializa.

## El riesgo real

Si esta credencial se filtra, se rota, o Supabase la revoca por cualquier
motivo, **todas las cajas pierden sincronización al mismo tiempo** — no hay
forma de aislar el impacto a una sola caja. Es un punto único de falla
deliberado, aceptado a cambio de simplicidad operativa.

**Estado actual (importante):** hoy este riesgo es *latente*, no *vivo* — la
integración de PowerSync en `packages/desktop` (Rust,
`src-tauri/src/sync/conector.rs`) no compila todavía: `cargo check` falla
por un conflicto real de `libsqlite3-sys` entre `tauri-plugin-sql` (ya en uso
para SQLite local) y `tauri-plugin-powersync` (agregado para sync). Hasta que
esto se resuelva, ninguna caja física sube datos a Supabase, así que rotar o
filtrar esta credencial hoy no afecta nada en producción. Actualizar esta
nota cuando el build de desktop quede desbloqueado.

## Procedimiento de rotación

1. **Crear la nueva identidad** en Supabase Auth (Dashboard → Authentication
   → Users → Add user, o vía la Admin API con la `service_role` key —
   mismo patrón que se usó para crear la identidad original y la cuenta del
   dueño). Usar un correo con formato `sync-caja@facturai.internal` o similar
   (no necesita ser un correo real, ver nota en `packages/api/.env`).
2. **Actualizar `SYNC_EMAIL`/`SYNC_PASSWORD`** en:
   - `packages/api/.env` (si el backend llega a necesitarlas — hoy solo las
     usa el conector de cada caja, no el backend).
   - El `.env` de **cada caja física** (`packages/desktop/.env`, una vez que
     ese archivo exista y el build esté desbloqueado). No hay forma
     automática de empujar esto a todas las cajas — es trabajo manual, caja
     por caja.
3. **Revocar la identidad anterior** en Supabase Auth (Dashboard →
   Authentication → Users → borrar el usuario, o desactivarlo si Supabase
   ofrece esa opción en vez de borrar).
4. **Verificar** que al menos una caja reconecta exitosamente con la nueva
   credencial antes de dar la rotación por completa (revisar el log de
   `lib.rs`/`conector.rs` en esa caja, o confirmar con una venta de prueba
   que llega al panel remoto).

## Monitoreo

No hay alertas automáticas todavía. La única señal disponible hoy es el log
de error que ya queda registrado en `packages/desktop/src-tauri/src/lib.rs`
cuando el conector falla en autenticar. Si el negocio crece o el riesgo se
vuelve más relevante, vale la pena agregar una alerta real (p. ej. un
webhook de Supabase Auth por fallos de login repetidos de esta identidad).
