# Corte de caja / turnos — estado y próximos pasos

Contexto completo del trabajo hecho y lo que falta, para retomar con otro
agente/LLM o en otra sesión sin perder el hilo. El feedback original del
dueño: "corte de caja is a shit, doesnt work well at all, it throws random
nnumbers, doesnt ask for the user that was before the close".

## Hecho (PR #46, rama `feature/corte-caja-turnos`, sin mergear todavía)

https://github.com/gabrielshr17/facturAI2.0/pull/46

- `packages/core/src/repos/corte-caja-repo.ts`: `registrarCorte()` (una sola
  llamada, fondo inicial re-tipeado cada vez, período de fechas libre)
  reemplazado por `abrirTurno()`/`cerrarTurno()` reales, con ventana exacta
  por timestamp (no más doble conteo).
- `packages/core/src/db/migraciones/40-caja.ts`: primera migración real de
  la banda CAJA — índice único parcial, máximo un turno abierto a la vez.
- `packages/core/src/dominio/permisos.ts`: nuevo permiso `caja.abrir`
  (cajero+); `caja.cerrar` sigue siendo supervisor+, pero el que abrió su
  propio turno puede cerrarlo sin ese permiso (autocierre).
- `packages/ui/src/AppShell.tsx`: login abre turno (pide fondo inicial
  antes de mostrar cualquier módulo); logout pide cerrar el turno primero.
- `packages/ui/src/componentes/CambioRapidoUsuario.tsx` (Ctrl+U): cierra el
  turno del que sale antes de mostrar el selector de usuario; el turno del
  que entra lo abre la compuerta de `AppShell` sola.
- `packages/ui/src/pantallas/CorteCaja.tsx`: ahora es pantalla de
  supervisión (turno en vivo + historial + "forzar cierre"), no el punto de
  abrir/cerrar del día a día.
- `packages/ui/src/pantallas/Configuracion.tsx`: toggle
  `exige_caja_abierta` (apagado por defecto, cero impacto en instalaciones
  existentes hasta que el dueño lo prenda).
- Tests: 331 en `@sfr/core`, 44 en `@sfr/ui`, todos verdes.
  `pnpm -r typecheck` limpio.

## Pendiente — quién puede hacerlo

### 1. Mergear PR #46 — **solo el dueño** (yo no tengo permiso de merge)
Revisar en GitHub y aprobar. Sin esto nada más de lo de abajo debería
empezar (evita conflictos de rebase).

### 2. Correr el ALTER manual en Supabase — **solo el dueño** (credenciales)
La tabla `corte_caja` en Postgres tenía `fecha_apertura`/`fecha_cierre` como
`DATE`; el nuevo código guarda timestamps completos. Correr en el SQL editor
de Supabase, después de mergear #46:
```sql
ALTER TABLE corte_caja ALTER COLUMN fecha_apertura TYPE TIMESTAMPTZ USING fecha_apertura::timestamptz;
ALTER TABLE corte_caja ALTER COLUMN fecha_cierre TYPE TIMESTAMPTZ USING fecha_cierre::timestamptz;
CREATE UNIQUE INDEX ux_corte_caja_un_abierto ON corte_caja(estado) WHERE estado = 'abierto' AND deleted_at IS NULL;
```
Bajo riesgo si se retrasa: `packages/remoto` no lee `corte_caja` hoy, así
que nada se rompe mientras tanto — solo hace falta antes de confiar en la
copia sincronizada de esa tabla.

### 3. Reconstruir el instalador de escritorio — **agente/LLM, seguro después de mergear**
Mismo patrón ya usado en features anteriores de esta sesión (chatbot/fiscal,
restaurar-desde-la-nube, etc.): `pnpm --filter @sfr/desktop build` (o el
script de build de Tauri que ya usa el proyecto) tras mergear #46 a
`master`. No requiere decisiones de diseño, es mecánico.

### 4. Manual smoke test en la app real — **dueño únicamente**
No lo pude correr yo (sin browser hacia localhost, y esto es Tauri/desktop).
Pasos: activar `exige_caja_abierta` en Configuración → cerrar sesión →
entrar como cajero (debe pedir fondo inicial) → un par de ventas → Ctrl+U a
otro usuario (debe pedir cerrar turno primero) → cerrar sesión (debe pedir
cerrar turno) → entrar como supervisor/dueño → revisar Corte de Caja
(turno correcto, cajero correcto, sin números raros).

### 5. Gap identificado pero fuera de alcance — decisión pendiente del dueño
`factura.caja_id` está siempre en `null`: `Ventas.tsx` nunca lo pasa al
crear un ticket, así que la infraestructura MULTICAJA (banda 30-39, tabla
`instalacion`) nunca quedó conectada a las ventas reales. El turno de esta
feature se modeló como **un turno global por negocio**, no por caja física,
justamente por esto. Si el negocio alguna vez opera con más de una caja
registradora simultánea, hay que:
  a. decidir si de verdad hace falta (un colmado/negocio pequeño con una
     sola caja no lo necesita),
  b. si sí, cablear `caja_id` en `abrirTicket`/`Ventas.tsx` desde
     `instalacionRepo.obtenerCajaActual()`, y
  c. escalar el modelo de turno de "uno por negocio" a "uno por caja".
Esto es una tarea nueva, no una corrección de esta — no iniciar sin que el
dueño confirme que la necesita.

### 6. Documentación para cajeros/dueño — **seguro para otro agente/LLM**
`docs/manual-cajero.md` y `docs/manual-dueno.md` ya existen en el repo
(creados en otra sesión, todavía sin commitear). Si van a actualizarse para
explicar el nuevo flujo de turnos (abrir con fondo inicial al entrar, cerrar
al salir), es una tarea de redacción pura, sin tocar código — segura para
cualquier agente, con el contexto de este documento y del PR #46 como
fuente.

## Nada de esto debería tocar `packages/remoto`
Confirmado esta sesión: el panel remoto no tiene pantalla de ventas ni de
corte de caja (decisión explícita de una sesión anterior). Ningún ítem de
esta lista lo requiere.
