# CRM sobre Clientes

> Punto 1 del pedido. 7 tareas: CRM-01, CRM-02, CRM-03, CRM-04, CRM-05, CRM-06, CRM-07.
> Antes de despachar cualquier tarea de este archivo, lee [00-CONVENCIONES.md](./00-CONVENCIONES.md).

> [!IMPORTANT]
> **Los briefs de abajo dicen "migracion 11". Ignora ese numero.** Los escribieron ocho
> agentes en paralelo y los ocho reclamaron el id 11. La banda de ids de esta area es
> **`70-79`**; el reparto completo esta en
> [00-CONVENCIONES.md, seccion 2](./00-CONVENCIONES.md#2-reparto-de-ids-de-migracion-bandas).

> [!NOTE]
> **Decision 4 tomada: se mantiene la convencion real del repositorio.** Cabecera por archivo
> explicando el POR QUE de la decision no obvia, y cero comentarios inline decorativos. Donde
> algun brief de abajo diga "sin comentarios en el codigo", **esta superado por esta decision**.

## Estado actual

Hoy "Clientes" son exactamente tres cosas: la tabla `cliente` de la migración 1 (packages/core/src/db/migrations.ts:101-117), `cliente-repo.ts` (143 líneas, CRUD + búsqueda) y `Clientes.tsx` (297 líneas, ABM plano de 5 columnas). No existe ninguna otra tabla, repo, tipo, pantalla ni test relacionado con CRM. Concretamente: (1) El formulario de Clientes.tsx solo edita nombre, apellidos, teléfono, correo, dirección, documento y un checkbox "Aplica crédito" — NO expone `limite_credito` (aunque `ClienteInput` lo acepta, cliente-repo.ts:22) ni `comentarios` (también aceptado, cliente-repo.ts:20). O sea que en cualquier instalación real `limite_credito` es 0 y `comentarios` es NULL siempre. (2) `saldo_credito` se inicializa en 0 al crear (cliente-repo.ts:64) y el UPDATE de `actualizar()` NO lo incluye (cliente-repo.ts:90-108): ninguna línea de código en todo el monorepo escribe jamás `saldo_credito`. Es una columna muerta. (3) "Crédito" SÍ existe como método de pago en el cobro (ModalCobro.tsx:13, dominio/factura.ts:78) y `factura-repo.cobrar()` inserta la fila en `pago` con metodo='credito', marca la factura como 'cobrada' con monto_pagado = total y no valida cliente, ni límite, ni saldo (factura-repo.ts:395-442). Es decir: hoy una venta fiada se registra como venta COBRADA y nadie sabe quién debe. El único rastro es que `corte-caja-repo.calcularResumen()` suma ese monto en `total_credito` (corte-caja-repo.ts:61-84). (4) No hay tabla de movimientos de crédito, ni de notas/interacciones, ni de etiquetas/segmentos, ni campo de cumpleaños, ni recordatorios. (5) `cotizacion` tiene `estado` con valor 'convertida' y columna `factura_id` declarados (migrations.ts:476-478, tipos.ts:125/142) pero cotizacion-repo.ts NO tiene ningún método que los escriba: toda cotización queda 'vigente' para siempre. El "seguimiento de cotizaciones no convertidas" no tiene señal de conversión en la base. (6) El nivel de precio del cliente no existe: `esMayoreo` es un `useState(false)` local de Ventas.tsx:101, y la regla `esMayoreo && p.precio_mayoreo ? p.precio_mayoreo : p.precio_venta` está duplicada literal en 4 lugares de Ventas.tsx (548, 881, 1320 y en el listado de búsqueda). `cliente` no tiene ninguna columna de nivel de precio. (7) La búsqueda rápida desde Ventas ya existe y funciona (Ventas.tsx:918-941, 1536-1625: buscar, seleccionar, quitar, y alta rápida con nombre+teléfono), pero llama a `clientes.listar(q)` en cada tecla y ese método trae TODA la tabla de clientes y filtra en JavaScript (cliente-repo.ts:128-139), sin LIMIT ni debounce.

### Lo que ya existe y NO hay que reescribir

| Pieza | Evidencia | Se reutiliza como |
| --- | --- | --- |
| Tabla `cliente` con aplica_credito / limite_credito / saldo_credito / documento_tipo / documento_numero / comentarios / direccion ya creadas y en producción | `packages/core/src/db/migrations.ts:101-117` | No hace falta ALTER para el crédito básico: las tres columnas ya están. Falta SOLO poblarlas y exponerlas. El ALTER se necesita únicamente para lo nuevo (fecha_nacimiento, nivel_precio, etiquetas). |
| `crearClienteRepo(db)` con crear/actualizar/eliminar(soft)/obtener/listar(q) y `validarCliente()` pura | `packages/core/src/repos/cliente-repo.ts:47-141` | Base del CRM. Extender este mismo repo con los métodos de ficha/crédito en vez de crear otro; `validarCliente` (línea 28) es el punto donde meter validaciones nuevas. |
| `factura-repo.listarCobradas({clienteId, desde, hasta, tipo})` — el filtro por cliente YA está implementado | `packages/core/src/repos/factura-repo.ts:29-36 y 468-494` | Es directamente el 'historial de compras' de la ficha 360. NO escribir una query nueva; calcular ticket promedio / frecuencia / última visita sobre esto o con un agregado SQL nuevo en reportes-repo con el mismo WHERE. |
| `cotizacion-repo.listar({clienteId, desde, hasta})` — filtro por cliente ya implementado | `packages/core/src/repos/cotizacion-repo.ts:36-42 y 172-191` | Base del 'seguimiento de cotizaciones no convertidas'. Falta solo el estado de conversión (ver `falta`). |
| `estaVencida()` y `ETIQUETA_ESTADO` para cotizaciones, y el cálculo de vencida sin job (se compara fecha_vencimiento con hoy local) | `packages/ui/src/pantallas/ConsultaCotizaciones.tsx:24-42` | Copiar el criterio exacto (y `hoyIsoLocal()`, línea 33) para el panel de seguimiento en la ficha; ya resuelve el bug de timezone de `toISOString()`. |
| `registrarAccion(db, {accion, entidad, entidadId, resumen, usuarioId, origen})` append-only + índice ix_bitacora_accion_entidad sobre (entidad, entidad_id) | `packages/core/src/repos/bitacora-repo.ts:35-55; packages/core/src/db/migrations.ts:372` | El índice ya permite `WHERE entidad='cliente' AND entidad_id=?` barato. Sirve como timeline de AUDITORÍA de la ficha, pero NO como 'historial de interacciones' editable del CRM (es append-only y sin usuario real) — son dos cosas distintas. |
| `SeccionBitacora.tsx` (componente de listado de bitácora ya construido) | `packages/ui/src/componentes/SeccionBitacora.tsx` | Patrón visual del feed cronológico de la ficha 360; mirarlo antes de inventar otro. |
| Búsqueda de cliente desde Ventas: input con flechas ↑/↓ + Enter, badge del cliente activo, botón quitar, alta rápida inline (nombre + teléfono), atajo F4 | `packages/ui/src/pantallas/Ventas.tsx:918-941 y 1536-1625` | El requisito 'buscar al cliente rápido desde Ventas' YA está hecho. Lo que falta ahí es rendimiento (LIMIT/debounce) y mostrar saldo/límite/nivel de precio al seleccionarlo — no rehacer el buscador. |
| `normalizar()` (quita acentos/mayúsculas) exportado desde core | `packages/core/src/dominio/validacion.ts (export en packages/core/src/index.ts:16); usado en cliente-repo.ts:133 y ConsultaCotizaciones.tsx:120` | Filtrado de etiquetas/segmentos y búsqueda; ya es la convención del repo. |
| `ValidacionError` + patrón `validarX(): ErrorValidacion[]` lanzado desde el repo y capturado en la pantalla con `e instanceof ValidacionError` | `packages/core/src/repos/cliente-repo.ts:10,28-41,51; packages/ui/src/pantallas/Clientes.tsx:91-94` | Forma obligatoria de reportar 'excede el límite de crédito' o 'abono mayor al saldo' desde el repo. No inventar otro tipo de error. |
| Tokens de estilo `c.*` y `s.*` (tarjeta, tabla, th, td, badge, boton, botonPeligro, errorBox, formFooter) y la guía de diseño escrita | `packages/ui/src/estilos.ts:22-170; design-guidelines.md (23 KB, secciones 1 y 2)` | La ficha 360 se arma con `s.tarjeta` + `s.tabla` + `s.badge`. `estilos.ts` NO puede contener hex: todo color nuevo se declara en estilos-globales.css en :root Y en [data-theme="dark"] primero. |
| `useModalAccesible`, `useAtajosTeclado`, `useEsAngosto`/`useEsTactil`, `useAlertas().confirmar`, clase `.sfr-tabla-scroll` | `packages/ui/src/hooks/useModalAccesible.ts:18; useAtajosTeclado.ts:35; useBreakpoint.ts:69,97; contexto/Alertas.tsx:52; estilos-globales.css:237` | Cualquier modal nuevo (ficha, abono, nota) debe usar useModalAccesible + Escape vía useAtajosTeclado; toda tabla nueva va envuelta en div.sfr-tabla-scroll. |
| Patrón de inyección de repos: `Repos` interface + `ProveedorDatos` + `useRepos()` | `packages/ui/src/data/contexto.tsx:27-52 y 60-83` | Todo repo nuevo se registra en los DOS lugares (interface y objeto), y se exporta desde packages/core/src/repos/index.ts. Si falta uno de los tres, el typecheck lo atrapa. |

### Lo que falta

| Capa | Hueco | Por que importa |
| --- | --- | --- |
| esquema | No existe tabla de movimientos de crédito. `saldo_credito` es una columna que nunca se escribe: 0 en toda instalación real. | Sin libro de movimientos (cargo por venta a crédito, abono, ajuste, nota de crédito por devolución) no hay cuentas por cobrar, no hay antigüedad de saldo, y un `saldo_credito` mantenido a mano sería imposible de auditar o reconstruir. Se necesita `credito_movimiento` (id, cliente_id, tipo cargo\|abono\|ajuste\|nota_credito, monto, factura_id NULL, referencia, fecha, usuario_id, notas) con `saldo_credito` como caché derivada. |
| repo | `factura-repo.cobrar()` acepta metodo='credito' sin exigir cliente, sin verificar `aplica_credito`, sin verificar `limite_credito`, y sin generar ningún cargo. | Es el agujero central. La factura queda 'cobrada' con monto_pagado = total, así que reportes, corte de caja y ganancia la cuentan como cobrada en efectivo-equivalente. La regla 'no se puede fiar por encima del límite' es validación de negocio y por CLAUDE.md §4 tiene que vivir en el repo (factura-repo.cobrar), no en ModalCobro.tsx. |
| ui | `ModalCobro.tsx` ofrece 'Crédito' como un método más, sin pedir cliente ni mostrar saldo/límite disponible. | Si el repo empieza a rechazar crédito sin cliente, el cajero se choca con un error después de haber tecleado el monto. El modal necesita saber si el ticket tiene cliente y cuánto le queda disponible ANTES de dejar elegir Crédito (validación duplicada en UI como conveniencia, la autoritativa en el repo). |
| esquema | No hay tabla de interacciones/notas con fecha y usuario. `cliente.comentarios` es un único TEXT libre y ni siquiera está en el formulario. | El requisito pide historial con fecha y usuario. `bitacora_accion` no sirve: es append-only, no editable, y su `usuario_id` llega SIEMPRE null porque no hay sesión (hecho ya verificado). Hace falta `cliente_interaccion` (id, cliente_id, tipo llamada\|visita\|nota\|recordatorio, texto, fecha, fecha_recordatorio NULL, usuario_id, created/updated/deleted_at). |
| esquema | No hay segmentos/etiquetas ni ninguna tabla puente. | Etiquetas ('mayorista', 'moroso', 'colmado de la esquina') son muchos-a-muchos. Meterlas como TEXT/JSON en `cliente` rompe el filtrado por etiqueta y la convención del repo (no hay ningún campo JSON en el esquema salvo permisos_json y datos_extraidos_json). Hacen falta `etiqueta` + `cliente_etiqueta`. |
| esquema | `cliente` no tiene fecha de nacimiento ni ningún campo de fecha propio. | Cumpleaños y recordatorios no tienen dónde guardarse. Además la consulta 'cumpleaños de este mes' sobre SQLite necesita comparar strftime('%m-%d', ...) — conviene guardar la fecha como TEXT 'AAAA-MM-DD' igual que `fecha_vencimiento` de cotizacion. |
| repo | `cotizacion-repo` no tiene `marcarConvertida(cotizacionId, facturaId)` y Ventas.tsx nunca convierte una cotización en ticket. | El 'seguimiento de cotizaciones no convertidas' no se puede medir: hoy TODAS aparecerían como no convertidas para siempre. La columna `factura_id` y el estado 'convertida' ya están en el esquema y en los tipos, solo falta el método y el flujo que lo llame. |
| repo | `reportes-repo.ts` no tiene ni una sola consulta con `cliente_id`. No existen ticket promedio, frecuencia, última visita, ni top-productos-del-cliente. | Son los números de la ficha 360. Resolverlos en JS trayendo todas las facturas del cliente es lo que hace hoy ConsultaFacturas (N+1) y no escala. Van como agregados SQL nuevos en reportes-repo (o un cliente-repo.resumen360) siguiendo el estilo de resumenGanancia (reportes-repo.ts:76-109). |
| ui | `Clientes.tsx` no expone `limite_credito` ni `comentarios`, y no tiene ficha de detalle: la fila solo ofrece Editar / Eliminar. | Sin campo de límite, activar 'Aplica crédito' no significa nada (el límite queda en 0). Y no hay dónde colgar la ficha 360, el timeline, los abonos ni las etiquetas: hace falta un tercer estado en la pantalla (lista → ficha) o un panel lateral, no otro modal de edición. |
| ui | `cliente` no tiene nivel/lista de precio y `es_mayoreo` es un toggle de UI que no consulta al cliente. | El requisito pide que asignar el cliente al ticket cambie el precio. Hoy `agregarProducto` (Ventas.tsx:503-532) y `precioPara` (Ventas.tsx:544-548) no reciben el cliente. Enganchar esto toca 4 puntos duplicados en Ventas.tsx + `asignarCliente` (¿recalcula las líneas ya agregadas?) y depende del área de precios (no hay precio_2). |
| esquema | No hay índice sobre `factura(cliente_id)` ni sobre `cotizacion(cliente_id)`. | La ficha 360 hace exactamente esos dos filtros. En sql.js (base entera en memoria WASM) un scan de factura completo por cada apertura de ficha se nota. Los índices que sí existen están listados en migrations.ts (ninguno cubre cliente_id). |
| repo | `backup-repo.TABLAS` es una lista hardcodeada de 23 tablas. | Toda tabla nueva del CRM que no se agregue ahí queda FUERA del respaldo del usuario y se pierde en una migración de equipo. Es un olvido silencioso: no falla ningún test. |
| build | `packages/api/db/schema.sql` (traducción Postgres) y `sync-rules.yaml` no se actualizan desde hace varias migraciones. | schema.sql se corta en `bitacora_accion` (línea 318): ya le faltan devolucion, devolucion_linea, promocion, cotizacion y cotizacion_linea. sync-rules.yaml tampoco las lista. No rompe nada hoy (la API está muerta) pero cada tabla CRM nueva agranda la deuda; decidir explícitamente si se actualizan o se declara obsoleto el archivo. |

## Enfoque recomendado

La decisión central es hacer de `credito_movimiento` la ÚNICA verdad del saldo y tratar `cliente.saldo_credito` como caché reconstruible que nadie usa para decidir. Razón: `SqlDriver` no tiene transacciones (packages/core/src/db/driver.ts solo expone exec/run/all/get) y el driver de escritorio parte el SQL por ';' a lo bruto (packages/desktop/src/db/tauri-sql-driver.ts:17-22), así que NO se puede usar un TRIGGER ni garantizar atomicidad entre "INSERT movimiento" y "UPDATE saldo". Con el libro de movimientos como verdad, una escritura a medias deja la caché vieja pero el saldo real sigue siendo correcto y se reconstruye con un SUM(); sin el libro, cualquier fallo a media operación corrompe una cuenta por cobrar de forma silenciosa y no auditable. Todo guardia de negocio (fiar por encima del límite, abonar más que el saldo, borrar un cliente con deuda) lee el saldo con SUM sobre el libro, nunca la caché.

Cuatro decisiones derivadas que atan el resto del plan: (1) El orden es esquema → dominio puro → repo → UI, con la migración estructural (11) separada del backfill de deuda histórica (12); si el backfill falla, la 11 ya quedó registrada en `_migracion` y el reintento no choca con "table already exists" (migrator.ts:24-30 no envuelve nada en transacción). (2) `limite_credito = 0` significa SIN LÍMITE, no "no puede fiar": hoy la columna vale 0 en toda instalación real porque Clientes.tsx nunca la expuso, y tratar 0 como bloqueo rompería la venta a crédito de todos los usuarios el día del despliegue. Quien habilita o bloquea es `aplica_credito`. (3) La factura a crédito SIGUE quedando en estado 'cobrada': cambiarla a pendiente reescribiría `total_credito` de cortes de caja y la ganancia de reportes ya emitidos. Lo que cambia es que ahora además genera un cargo, así que por primera vez se sabe quién debe. (4) El CRM vive DENTRO de Clientes (Alt+3) como segundo estado de la pantalla (lista → ficha), no como décimo módulo: AppShell genera los atajos con `MODULOS.map((m,i) => 'Alt+'+(i+1))` y "Alt+10" no es una tecla, el atajo quedaría muerto sin error.

Además, todo lo que se puede decidir vive en `@sfr/core` porque `packages/ui` no tiene vitest ni script `test` (packages/ui/package.json): reglas de crédito, antigüedad de saldo y resumen 360 son funciones puras o consultas de repo testeadas con node:sqlite; la pantalla solo dibuja. Y la ficha 360 se apoya en lo que ya existe (`factura-repo.listarCobradas({clienteId})`, `cotizacion-repo.listar({clienteId})`, `SeccionBitacora.tsx`, tokens `s.*`/`c.*`) en vez de inventar consultas nuevas en JavaScript.

### Alternativas descartadas

- TRIGGER de SQLite para mantener `cliente.saldo_credito`: el driver de escritorio hace `sql.split(';')` (tauri-sql-driver.ts:17-22), así que el bloque `BEGIN ... ; ... END;` se parte y cada pedazo falla SOLO en escritorio — los tests en node:sqlite pasarían verdes y el bug llegaría a producción.
- `saldo_credito` como única verdad mantenida a mano (UPDATE incremental sin libro de movimientos): sin transacciones en SqlDriver, un abono (INSERT + UPDATE) que falle a la mitad deja el saldo mal para siempre y sin forma de reconstruirlo ni auditarlo. Tampoco permite antigüedad de saldo.
- Añadir begin/commit a `SqlDriver` ahora: obliga a tocar los tres drivers (node:sqlite, sql.js, tauri) y a re-verificar compra-repo y factura-repo, que ya viven con ese riesgo. Es una tarea de PLATAFORMA, no un prerrequisito del CRM si el libro de movimientos es la verdad.
- CRM como décimo módulo en la barra lateral de AppShell: los atajos son Alt+1..Alt+9 generados por índice; el décimo se quedaría sin atajo y la guía de diseño exige operar todo sin mouse.
- Etiquetas como TEXT o JSON dentro de `cliente`: rompe el filtrado por etiqueta y no hay precedente en el esquema (solo permisos_json y datos_extraidos_json). Van como `etiqueta` + `cliente_etiqueta` con índice único.
- Reutilizar `bitacora_accion` como 'historial de interacciones': es append-only, no editable, no permite fechas de recordatorio y su `usuario_id` llega siempre null. Sirve como pestaña de auditoría, no como CRM.
- Reutilizar `cliente-repo.actualizar()` para los sub-formularios del CRM: la línea 102 hace `input.aplica_credito ? 1 : 0` SIN fallback, así que cualquier update parcial (guardar una etiqueta, un cumpleaños) APAGA el crédito del cliente en silencio. Se escriben métodos específicos y estrechos.
- Pasar las ventas a crédito al estado 'pendiente de cobro': cambiaría `total_credito` de corte-caja-repo y la ganancia de reportes-repo para períodos ya cerrados e impresos. Se mantiene 'cobrada' + cargo en el libro (decisión a confirmar con el cliente).
- Aplicar cada abono a facturas concretas (FIFO real con saldo por factura) en la primera versión: contablemente es lo correcto pero multiplica pantallas y casos de prueba. V1 usa saldo global por cliente y calcula la antigüedad con FIFO sobre el libro, que da el mismo reporte de antigüedad sin la pantalla de aplicación.
- Empezar las cuentas por cobrar en cero (línea de corte) sin backfill: el colmadero abre el CRM y ve que nadie le debe nada, aunque tenga fiado real registrado como pago con metodo='credito'. Se hace backfill determinista en la migración 12 y se deja `ajuste` para el fiado sin cliente asignado.
- Crear un `DESIGN.md` nuevo: la guía real del repo es `design-guidelines.md` (23 KB) en la raíz; se extiende esa. Regla dura: `estilos.ts` no admite hex, todo color nuevo se declara en estilos-globales.css en `:root` Y en `[data-theme="dark"]`.
- Calcular ticket promedio / frecuencia / última visita en JavaScript trayendo todas las facturas del cliente: es el patrón N+1 que ya sufre ConsultaFacturas y en sql.js (base entera en WASM) se nota. Van como agregados SQL.
- Notificaciones reales de cumpleaños y recordatorios (correo, WhatsApp, push, job en segundo plano): no hay backend vivo (packages/api es un scaffold muerto) ni proceso en segundo plano. Se entrega un panel 'para hoy' que se consulta al abrir Clientes.
- Meter `nivel_precio` en la migración del CRM: la lista de precios pertenece al área PRECIOS (hoy no existe ni precio_2). El CRM solo consume el nivel del cliente cuando esa área lo publique.

## Trampas especificas de esta area

- TRAMPA DE DATOS EN PRODUCCIÓN: hay instalaciones reales con facturas cobradas con metodo='credito' cuyo saldo NUNCA se registró. Una migración que empiece a llevar cuentas por cobrar deja esas ventas históricas sin cargo: el saldo arranca en 0 aunque el colmadero sepa que le deben. Hay que decidir explícitamente (a) backfill: la migración genera un `credito_movimiento` tipo 'cargo' por cada `pago` con metodo='credito' de facturas cobradas no anuladas, o (b) línea de corte: se empieza de cero y se da una pantalla de 'saldo inicial'. Silencio = el usuario pierde la deuda vieja.
- EL DRIVER DE TAURI PARTE EL SQL POR ';' A LO BRUTO: `partirStatements()` hace `sql.split(";")` (packages/desktop/src/db/tauri-sql-driver.ts:17-22). Consecuencias duras para cualquier migración nueva: (1) NO se puede usar un TRIGGER para mantener `saldo_credito` — el `BEGIN ... ; ... END;` se parte y cada pedazo falla en escritorio (en web y en los tests de Node pasaría, o sea que el bug NO lo atrapa `pnpm test`). (2) Ningún literal de texto ni comentario `--` puede contener ';'. El saldo se mantiene desde el repo, en TypeScript, punto.
- `SqlDriver` NO TIENE TRANSACCIONES (packages/core/src/db/driver.ts:11-22: solo exec/run/all/get). Un abono es 2 escrituras (INSERT movimiento + UPDATE cliente.saldo_credito) y una venta a crédito son 3+ (pago + factura + movimiento). Si algo falla en medio, la base queda inconsistente y no hay rollback. Dos salidas: (a) tratar `credito_movimiento` como la ÚNICA verdad y calcular el saldo con SUM() al vuelo, dejando `saldo_credito` como caché reconstruible (recomendado: elimina la clase entera de bug); (b) añadir begin/commit al SqlDriver, lo que obliga a tocar los 3 drivers. Nadie en el repo hizo (b) todavía — `compra-repo.aplicarEfectosInventario` y `factura-repo.cobrar` ya viven con este riesgo.
- `cliente-repo.actualizar()` USA `input.aplica_credito ? 1 : 0` SIN FALLBACK (packages/core/src/repos/cliente-repo.ts:102), a diferencia de todos los demás campos que hacen `input.x ?? actual.x`. Si un panel nuevo del CRM (cambiar etiqueta, guardar nivel de precio, editar la nota) llama a `actualizar()` con un input parcial, APAGA EL CRÉDITO DEL CLIENTE en silencio. Y `nombre` es obligatorio, así que ningún update parcial pasa `validarCliente` sin reenviarlo. Conclusión práctica: no reutilizar `actualizar()` para los sub-formularios del CRM; escribir métodos específicos (`asignarEtiquetas`, `establecerLimiteCredito`, etc.).
- `cliente-repo.listar(q)` HACE UN SELECT DE TODA LA TABLA y filtra en JS con `normalizar()` (cliente-repo.ts:128-139), y Ventas.tsx lo llama en CADA PULSACIÓN sin debounce ni LIMIT (Ventas.tsx:918-921). Con 2.000 clientes en sql.js (SQLite en WASM, base entera en memoria) eso es 2.000 filas materializadas + 8.000 normalizaciones de string por tecla, en el camino crítico de la venta. Si el CRM engorda la fila de `cliente` (etiquetas, saldo, nivel de precio), empeora. Añadir LIMIT y una proyección de columnas mínima para el buscador de Ventas ANTES de agregar campos.
- LA MIGRACIÓN 11 (o las que sean) DEBE SER ADITIVA Y NUNCA MODIFICARSE DESPUÉS. `migrator.ts:17-30` salta cualquier id ya presente en `_migracion`: editar el SQL de una migración ya publicada NO tiene efecto en una base existente. Y `db.exec(m.sql)` no está envuelto en transacción, así que una migración que falle a la mitad deja la base con parte de las tablas creadas y SIN la fila en `_migracion` — al reintentar, el primer CREATE TABLE choca con 'table already exists' y la app no arranca nunca más. Cada migración nueva: solo CREATE TABLE / CREATE INDEX / ALTER TABLE ADD COLUMN con DEFAULT, nada que pueda fallar a medias.
- LA MISMA UI CORRE EN sql.js Y EN TAURI, PERO LOS TESTS CORREN EN node:sqlite. Tres motores SQLite distintos: node:sqlite (tests), sql.js/WASM (PWA) y rusqlite/sqlx (escritorio). Un test verde en core no prueba que funcione en escritorio (ver la trampa del split por ';'). Además `packages/ui` NO TIENE script `test` ni vitest en su package.json — no hay forma de testear la pantalla. Todo lo testeable (reglas de crédito, cálculo de antigüedad, resumen 360) tiene que vivir en `@sfr/core` para que el TDD que exige CLAUDE.md sea posible.
- sql.js PERSISTE CON DEBOUNCE DE 150 ms A IndexedDB (packages/web/src/db/sqljs-driver.ts:64-91). Una secuencia de escrituras del CRM que termine con el usuario cerrando la pestaña puede perder la última tanda; el driver ya mitiga con `pagehide`/`visibilitychange`, pero eso refuerza el punto anterior: cuantas MENOS escrituras separadas haga una operación (un solo INSERT de movimiento en vez de INSERT + UPDATE), menos ventanas de inconsistencia.
- `cliente.eliminar()` ES SOFT-DELETE (cliente-repo.ts:111-118) pero las facturas y cotizaciones conservan el `cliente_id`. `listar()` filtra `deleted_at IS NULL`, así que un cliente borrado con deuda DESAPARECE de la lista pero su saldo sigue existiendo. Antes de permitir el borrado hay que decidir: bloquear si saldo > 0 (validación en el repo) o mostrar los borrados-con-deuda en cuentas por cobrar.
- AppShell tiene 9 MÓDULOS Y LOS ATAJOS SON Alt+1..Alt+9 (AppShell.tsx:27-31 y 63-65, generados con `MODULOS.map((m,i) => ['Alt+'+(i+1)])`). Si el CRM entra como un décimo módulo, 'Alt+10' no es una tecla que exista: el atajo queda muerto sin error. Lo natural aquí es que el CRM viva DENTRO de 'Clientes' (Alt+3), no como módulo aparte.
- `Clientes.tsx` NO ES MOBILE-FIRST: el formulario usa `gridTemplateColumns: '1fr 1fr'` fijo (línea 189) y la pantalla no llama a `useEsAngosto`/`useEsTactil`, a diferencia de ConsultaCotizaciones.tsx:58 o Ventas.tsx. CLAUDE.md §6 exige mobile-first y design-guidelines.md dice que lo primero que cede es el cromo. Una ficha 360 con pestañas y tablas metida en esa pantalla empeora el problema si no se arregla el layout de base primero.
- `Clientes.tsx` REPITE LA LÓGICA DE NAVEGACIÓN POR FLECHAS DOS VECES, íntegra: una en un `useEffect` con listener de window (líneas 109-138) y otra en el `onKeyDown` del input de búsqueda (líneas 154-181), ~50 líneas duplicadas. Si la ficha agrega una tercera acción por fila ('Ver ficha'), hay que tocar los dos bloques y el array `['editar','eliminar']` en ambos (líneas 123 y 163). Considerar extraer eso a `utilidades/navegacionFilas.ts` (donde ya viven `moverIndiceFila`/`moverAccionFila`) antes de añadir acciones.
- EL CRM NO PUEDE REGISTRAR 'QUIÉN' PORQUE NO HAY SESIÓN. `registrarAccion()` acepta `usuarioId` (bitacora-repo.ts:12) pero cliente-repo solo lo llama en `eliminar()` y sin usuario (líneas 114-118). El requisito 'historial de interacciones con fecha y usuario' depende del área de usuarios/login; mientras tanto `usuario_id` en `cliente_interaccion` y en `credito_movimiento` va nullable y la UI muestra '—'. Dejar la columna puesta desde la primera migración para no tener que hacer un ALTER después.
- NO HAY DESIGN.md: la guía de diseño real es `design-guidelines.md` en la raíz (23 KB). No crear un DESIGN.md nuevo — se extiende ese. Regla dura de ahí (sección 1): `estilos.ts` NO puede contener ningún hex, solo `var(--sfr-*)`, y todo color nuevo se declara en `estilos-globales.css` en `:root` Y en `[data-theme="dark"]`; un color definido en un solo tema está declarado como bug. Ojo también: las claves `c.azul/azulOscuro/azulClaro` son ROLES, no matices — el acento real es rojo granate #991b1b.

## Preguntas para el dueno del negocio

- Las ventas fiadas YA registradas (pagos con metodo='credito' en facturas cobradas) ¿se convierten en deuda al migrar, o se arranca de cero con una pantalla de 'saldo inicial' por cliente? No hay opción neutra: si no se decide, el colmadero abre el CRM y ve que nadie le debe nada.
- ¿Una venta a crédito debe seguir marcando la factura como 'cobrada'? Hoy lo hace, y de ahí sale `total_credito` del corte de caja y la ganancia de Reportes. Si pasa a 'pendiente de cobro', cambian los números de cortes y reportes ya emitidos. Si sigue 'cobrada', el corte de caja sigue mezclando plata en mano con plata fiada.
- ¿Qué pasa cuando un cliente quiere fiar por encima de su límite? Tres opciones reales en un colmado: bloquear, advertir y dejar pasar, o pedir una autorización. La tercera no se puede hacer todavía (no hay login ni roles, no hay quién autorice). Sin login, ¿bloquear o advertir?
- ¿Un abono se cobra por una caja y aparece en el corte de caja del día como entrada de efectivo? Hoy `corte_caja` es un reporte de período que solo mira `pago` de facturas, no un arqueo real: un abono en efectivo no se vería por ningún lado y descuadraría la gaveta.
- Antigüedad de saldo: ¿qué tramos? (corriente / 1-30 / 31-60 / 60+ días es lo habitual) y ¿se cuenta desde la fecha de la venta o desde una fecha de vencimiento pactada por cliente (crédito a 15/30 días)? Lo segundo obliga a un campo `dias_credito` en cliente.
- ¿Un abono se aplica a facturas concretas (más viejas primero) o contra un saldo global del cliente? La primera opción es lo correcto contablemente y permite antigüedad por factura, pero es notablemente más trabajo y más pantalla.
- Etiquetas/segmentos: ¿libres (el usuario escribe las que quiera) o un catálogo cerrado que él administra en Configuración? Y ¿alguna etiqueta debe DISPARAR comportamiento (ej. 'mayorista' = nivel de precio 2) o son solo para filtrar?
- Cumpleaños y recordatorios: ¿qué hace el sistema el día que llega? No hay notificaciones, ni correo, ni WhatsApp, ni proceso en segundo plano — a lo sumo un panel 'para hoy' que el usuario ve al abrir Clientes. ¿Alcanza con eso?
- 'Cotizaciones no convertidas': ¿qué cuenta como convertida? Hoy no existe el flujo 'cotización → ticket' en Ventas. ¿Se construye ese flujo (botón 'Convertir en venta' que abre un ticket con las líneas) o alcanza con marcarla a mano como convertida?
- La ficha 360 ¿es una pantalla propia dentro de Clientes, o un módulo 'CRM' nuevo en la barra lateral? Hay 9 módulos y los atajos son Alt+1..Alt+9: un décimo módulo se queda sin atajo, y la guía de diseño dice que todo tiene que ser operable sin mouse.

## Tareas

### CRM-01 — Migraciones 11 y 12: esquema CRM (crédito, interacciones, etiquetas) y backfill de la deuda histórica

**Objetivo.** La base tiene credito_movimiento, cliente_interaccion, etiqueta y cliente_etiqueta, `cliente` gana fecha_nacimiento y dias_credito, existen los índices por cliente_id, la deuda ya fiada quedó convertida en cargos, y las cuatro tablas nuevas entran en el respaldo.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio — la migración es inmutable una vez publicada y el backfill escribe sobre datos reales de instalaciones en producción; un error de signo o de filtro deja saldos falsos que el usuario cree ciertos. | nada |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto, TODO en español: archivos, tipos, columnas). Tu tarea es SOLO esquema: añadir dos migraciones nuevas, los tipos TypeScript correspondientes y el registro en el respaldo. No escribes ni un método de repo ni tocas ninguna pantalla.

QUÉ HACER
1) En C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale/packages/core/src/db/migrations.ts añade al final del array `migrations` dos entradas nuevas con ids 11 y 12 (los ids 1..10 ya están usados; mira la entrada id:10 'cotizaciones', líneas 456-501, e imita exactamente su formato: `{ id, nombre, sql: /* sql */ `...` }`). El SQL exacto que debes usar está en el campo migracionSql de esta tarea; respétalo salvo que encuentres un error real.
   - Migración 11 'crm_credito_interacciones_etiquetas': solo CREATE TABLE / CREATE INDEX / ALTER TABLE ADD COLUMN.
   - Migración 12 'backfill_credito_historico': solo el INSERT...SELECT determinista y el UPDATE de la caché de saldo.
2) En packages/core/src/repos/tipos.ts añade las interfaces `CreditoMovimiento`, `ClienteInteraccion`, `Etiqueta` y `ClienteEtiqueta` siguiendo el estilo exacto del archivo (ver `Cliente` en la línea 35: `extends Auditoria`, booleanos como `number // 0 | 1`, uniones de strings literales para los enums de texto). Añade a la interfaz `Cliente` los campos nuevos: `fecha_nacimiento: string | null` y `dias_credito: number`. El tipo del movimiento usa `tipo: "cargo" | "abono" | "ajuste" | "nota_credito"`.
3) En packages/core/src/repos/cliente-repo.ts actualiza SOLO la constante `COLS` (líneas 43-45) y el INSERT de `crear()` para incluir fecha_nacimiento y dias_credito con valores por defecto (null y 0). Es un cambio mecánico: el INSERT usa `Array(15).fill("?")`, ese 15 debe subir a 17. NO cambies ninguna regla de negocio ni el UPDATE de `actualizar()`.
4) En packages/core/src/repos/backup-repo.ts añade "credito_movimiento", "cliente_interaccion", "etiqueta", "cliente_etiqueta" al array `TABLAS` (línea 10). Si no lo haces, las tablas quedan fuera del respaldo del usuario y no falla ningún test: por eso es criterio de aceptación.

REGLAS DURAS DE MIGRACIÓN EN ESTE REPO (violarlas rompe escritorio o deja la app sin arrancar)
- PROHIBIDO cualquier TRIGGER o bloque BEGIN...END: packages/desktop/src/db/tauri-sql-driver.ts:17-22 parte el SQL con `sql.split(";")`, así que el trigger se parte en pedazos inválidos. Eso NO lo atrapa `pnpm test` (los tests corren en node:sqlite).
- PROHIBIDO cualquier ';' dentro de un comentario `--` o de un literal de texto, por la misma razón.
- Una migración publicada NUNCA se edita después (migrator.ts:17-30 salta los ids ya presentes en `_migracion`). Escríbelas bien a la primera.
- La estructura va en la 11 y los datos en la 12 a propósito: `db.exec(m.sql)` no está en transacción, así que si el backfill fallara, la 11 ya quedó registrada y el reintento no choca con 'table already exists'.
- El backfill usa id determinista `'bf-' || p.id` y `NOT EXISTS` para poder reejecutarse sin duplicar.

CONTEXTO QUE NO DEBES REDESCUBRIR
- Hoy una venta fiada se registra como fila en `pago` con metodo='credito' y la factura queda estado='cobrada': ese es el único rastro de la deuda vieja y es lo que el backfill convierte en cargos. Las ventas a crédito SIN cliente_id no se pueden atribuir a nadie y quedan fuera a propósito (el usuario las corregirá con un movimiento de tipo 'ajuste' desde la UI, en otra tarea).
- Convención de signo que el resto del plan da por hecha: `monto` SIEMPRE positivo; 'cargo' y 'ajuste' suman al saldo, 'abono' y 'nota_credito' restan.
- `usuario_id` va nullable en todas las tablas nuevas porque todavía no hay login ni sesión (área RBAC). Déjalo puesto desde ahora para no tener que hacer un ALTER después.

QUÉ NO TOCAR
- NO toques factura-repo.ts, cotizacion-repo.ts, reportes-repo.ts ni ningún otro repo.
- NO crees credito-repo.ts ni ningún repo nuevo (es la tarea CRM-03).
- NO toques nada dentro de packages/ui, packages/web, packages/desktop ni packages/api.
- NO modifiques las migraciones 1..10 bajo ninguna circunstancia.
- NO añadas columna de nivel de precio a `cliente`: pertenece al área PRECIOS.

MÉTODO: TDD estricto (rojo-verde-refactor), es la regla del proyecto. Escribe primero packages/core/test/crm-esquema.test.ts imitando packages/core/test/migrations.test.ts (usa `createNodeSqliteDriver` de ../src/db/drivers/node-sqlite.js y `migrate`). Al terminar: `pnpm -r typecheck` y `pnpm test` verdes, y un reporte de tarea con archivos tocados y la decisión de backfill explicada.
```

#### SQL de la migracion

```sql
-- Migración 11 — nombre: crm_credito_interacciones_etiquetas
-- CRM (§ Clientes): cuentas por cobrar de verdad, historial de interacciones y
-- etiquetas. credito_movimiento es la unica verdad del saldo. El campo
-- cliente.saldo_credito queda como cache reconstruible con SUM sobre esta tabla.
-- monto es SIEMPRE positivo: el signo lo da el tipo (cargo y ajuste suman,
-- abono y nota_credito restan). Sin triggers a proposito, porque el driver de
-- escritorio parte el SQL por punto y coma.
CREATE TABLE credito_movimiento (
  id          TEXT PRIMARY KEY,
  cliente_id  TEXT NOT NULL REFERENCES cliente(id),
  tipo        TEXT NOT NULL, -- cargo|abono|ajuste|nota_credito
  monto       REAL NOT NULL DEFAULT 0,
  factura_id  TEXT REFERENCES factura(id),
  metodo_pago TEXT, -- solo en abonos: efectivo|tarjeta|transferencia
  caja_id     TEXT REFERENCES caja(id),
  referencia  TEXT,
  fecha       TEXT NOT NULL,
  usuario_id  TEXT REFERENCES usuario(id),
  notas       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX ix_credito_movimiento_cliente ON credito_movimiento(cliente_id, fecha);
CREATE INDEX ix_credito_movimiento_factura ON credito_movimiento(factura_id);

-- Historial de interacciones del CRM: editable y con fecha, a diferencia de
-- bitacora_accion que es append-only y de auditoria. usuario_id va nullable
-- porque todavia no hay sesion (area RBAC).
CREATE TABLE cliente_interaccion (
  id                 TEXT PRIMARY KEY,
  cliente_id         TEXT NOT NULL REFERENCES cliente(id),
  tipo               TEXT NOT NULL DEFAULT 'nota', -- nota|llamada|visita|recordatorio
  texto              TEXT NOT NULL,
  fecha              TEXT NOT NULL,
  fecha_recordatorio TEXT, -- fecha ISO (date) o NULL
  completada         INTEGER NOT NULL DEFAULT 0,
  usuario_id         TEXT REFERENCES usuario(id),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT
);
CREATE INDEX ix_cliente_interaccion_cliente ON cliente_interaccion(cliente_id, fecha);
CREATE INDEX ix_cliente_interaccion_recordatorio ON cliente_interaccion(fecha_recordatorio, completada);

CREATE TABLE etiqueta (
  id         TEXT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  color      TEXT, -- nombre del token de color, nunca un hex de marca
  activa     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE cliente_etiqueta (
  id          TEXT PRIMARY KEY,
  cliente_id  TEXT NOT NULL REFERENCES cliente(id),
  etiqueta_id TEXT NOT NULL REFERENCES etiqueta(id),
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_cliente_etiqueta ON cliente_etiqueta(cliente_id, etiqueta_id);
CREATE INDEX ix_cliente_etiqueta_etiqueta ON cliente_etiqueta(etiqueta_id);

-- Cumpleanos y plazo de credito pactado (dias_credito 0 = paga al momento).
ALTER TABLE cliente ADD COLUMN fecha_nacimiento TEXT;
ALTER TABLE cliente ADD COLUMN dias_credito INTEGER NOT NULL DEFAULT 0;

-- La ficha 360 filtra facturas y cotizaciones por cliente: sin estos indices,
-- en sql.js cada apertura de ficha escanea la tabla entera en memoria.
CREATE INDEX ix_factura_cliente ON factura(cliente_id);
CREATE INDEX ix_cotizacion_cliente ON cotizacion(cliente_id);


-- Migración 12 — nombre: backfill_credito_historico
-- Hasta ahora una venta fiada se registraba como un pago con metodo credito y
-- la factura quedaba cobrada: no habia rastro de la deuda. Cada uno de esos
-- pagos se convierte en un cargo con id determinista para poder reintentar.
-- Las ventas a credito sin cliente_id no se pueden atribuir y quedan fuera.
INSERT INTO credito_movimiento (
  id, cliente_id, tipo, monto, factura_id, metodo_pago, caja_id, referencia,
  fecha, usuario_id, notas, created_at, updated_at, deleted_at
)
SELECT 'bf-' || p.id, f.cliente_id, 'cargo', p.monto, f.id, NULL, NULL,
       CAST(f.numero_interno AS TEXT), f.fecha_hora, NULL, 'Saldo historico migrado',
       f.fecha_hora, f.fecha_hora, NULL
FROM pago p
JOIN factura f ON f.id = p.factura_id
WHERE p.metodo = 'credito'
  AND p.deleted_at IS NULL
  AND f.deleted_at IS NULL
  AND f.estado = 'cobrada'
  AND f.cliente_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM credito_movimiento cm WHERE cm.id = 'bf-' || p.id);

UPDATE cliente SET saldo_credito = COALESCE((
  SELECT SUM(CASE WHEN cm.tipo IN ('cargo','ajuste') THEN cm.monto ELSE -cm.monto END)
  FROM credito_movimiento cm
  WHERE cm.cliente_id = cliente.id AND cm.deleted_at IS NULL
), 0);
```

#### Archivos a tocar

- `packages/core/src/db/migrations.ts`
- `packages/core/src/repos/tipos.ts`
- `packages/core/src/repos/cliente-repo.ts`
- `packages/core/src/repos/backup-repo.ts`
- `packages/core/test/crm-esquema.test.ts`

#### Criterios de aceptacion

- [ ] `pnpm -r typecheck` y `pnpm test` verdes en todo el monorepo.
- [ ] Las migraciones 11 y 12 solo contienen CREATE TABLE, CREATE INDEX, ALTER TABLE ADD COLUMN, INSERT...SELECT y UPDATE: cero TRIGGER, cero BEGIN...END, cero ';' dentro de comentarios o literales.
- [ ] Partir el SQL de las migraciones 11 y 12 por ';' y ejecutar cada trozo por separado funciona (equivale a lo que hace el driver de Tauri en escritorio).
- [ ] Las migraciones 1..10 quedan byte a byte idénticas.
- [ ] `backup-repo.TABLAS` incluye las cuatro tablas nuevas y `exportarTodo()` devuelve sus claves.
- [ ] `migrate()` dos veces seguidas devuelve 0 pendientes en la segunda corrida.
- [ ] Ningún archivo de packages/ui, packages/web, packages/desktop o packages/api fue modificado.

#### Pruebas a escribir primero (TDD)

- migrate() sobre una db limpia crea credito_movimiento, cliente_interaccion, etiqueta y cliente_etiqueta (consultando sqlite_master).
- PRAGMA table_info(cliente) incluye fecha_nacimiento (nullable) y dias_credito (NOT NULL DEFAULT 0).
- Existen los índices ix_factura_cliente e ix_cotizacion_cliente (consultando sqlite_master WHERE type='index').
- Idempotencia: migrate() dos veces devuelve 0 pendientes la segunda vez.
- Compatibilidad con el driver de escritorio: tomar el sql de las migraciones 11 y 12, hacer split(';'), descartar los trozos vacíos y ejecutar cada uno por separado sobre una base con las migraciones previas aplicadas no lanza ningún error.
- Backfill: sembrar cliente + factura estado='cobrada' con cliente_id + pago metodo='credito' de 500, ejecutar el sql de la migración 12 DOS veces, y verificar que hay exactamente un credito_movimiento tipo 'cargo' de 500 con id 'bf-<pagoId>' y que cliente.saldo_credito quedó en 500.
- Backfill selectivo: un pago a crédito de una factura con deleted_at, o de una factura sin cliente_id, NO genera ningún movimiento.
- Un pago con metodo='efectivo' nunca genera cargo.
- backup-repo.exportarTodo() devuelve claves para credito_movimiento, cliente_interaccion, etiqueta y cliente_etiqueta.

---

### CRM-02 — Dominio puro de crédito: saldo, disponible, guardias de cargo/abono y antigüedad FIFO

**Objetivo.** Existe packages/core/src/dominio/credito.ts con funciones puras y testeadas que deciden cuánto debe un cliente, si puede fiar, si un abono es válido y cómo se reparte el saldo en tramos de antigüedad.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo — código puro, sin I/O ni migraciones; el único punto delicado es el FIFO de antigüedad, cubierto por tests. | CRM-01 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto sin `any`, TODO en español, SIN comentarios explicativos dentro de funciones salvo los docblocks al estilo del repo). Tu tarea es puro dominio: ni SQL, ni repos, ni React.

CREA packages/core/src/dominio/credito.ts imitando el estilo de packages/core/src/dominio/caja.ts y packages/core/src/dominio/inventario.ts (funciones exportadas sueltas, tipos exportados arriba, docblock corto por función). Expórtalo desde packages/core/src/dominio/index.ts siguiendo el formato exacto de los bloques `export { ... } from "./x.js"` que ya hay ahí (ojo: extensión .js en los imports, es ESM).

API que debes implementar:
- `export type TipoMovimientoCredito = "cargo" | "abono" | "ajuste" | "nota_credito"`
- `export const SIGNO_MOVIMIENTO: Record<TipoMovimientoCredito, 1 | -1>` — cargo y ajuste valen 1, abono y nota_credito valen -1.
- `export interface MovimientoCalculo { tipo: TipoMovimientoCredito; monto: number; fecha: string }`
- `calcularSaldo(movs: MovimientoCalculo[]): number` — suma con signo, redondeando con `redondear2` de ./dinero.js (no inventes otro redondeo).
- `creditoDisponible(limiteCredito: number, saldo: number): number | null` — devuelve null cuando limiteCredito es 0, que significa SIN LÍMITE.
- `validarCargoCredito(input: { aplicaCredito: boolean; limiteCredito: number; saldoActual: number; monto: number }): ErrorValidacion[]` — importa `ErrorValidacion` de ./validacion.js. Reglas: monto mayor que cero; `aplicaCredito` falso devuelve el error 'Este cliente no tiene crédito habilitado.'; con límite mayor que cero, saldoActual + monto no puede pasarlo y el mensaje debe decir cuánto le queda disponible en formato RD$.
- `validarAbono(input: { saldoActual: number; monto: number }): ErrorValidacion[]` — monto mayor que cero y monto no mayor que saldoActual (nada de saldo a favor en v1).
- `export interface AntiguedadSaldo { corriente: number; d1a30: number; d31a60: number; d61oMas: number; total: number }`
- `calcularAntiguedad(movs: MovimientoCalculo[], hoyIso: string, diasCredito: number): AntiguedadSaldo` — aplica los movimientos negativos (abono, nota_credito) contra los cargos MÁS VIEJOS primero (FIFO) y clasifica el remanente de cada cargo por días transcurridos desde su fecha menos `diasCredito`: 0 o menos = corriente, 1..30 = d1a30, 31..60 = d31a60, 61 o más = d61oMas. Compara solo la parte de fecha (los primeros 10 caracteres del ISO), nunca construyas un Date con `new Date(iso)` y uses toISOString para volver a fecha: eso desplaza el día por zona horaria. El repo ya resolvió esto en packages/ui/src/pantallas/ConsultaCotizaciones.tsx:33 (`hoyIsoLocal`) — mira ese criterio antes de escribir el tuyo.

POR QUÉ ES PURO: packages/ui NO tiene vitest ni script `test`, así que todo lo que se pueda decidir tiene que vivir en @sfr/core para poder hacer TDD. Y `limiteCredito = 0` significa sin límite porque hoy esa columna vale 0 en TODA instalación real (la pantalla nunca la expuso): si 0 bloqueara, el despliegue rompería la venta a crédito de todos los usuarios el primer día.

QUÉ NO TOCAR
- NO toques ningún archivo de packages/core/src/repos ni de packages/core/src/db.
- NO toques packages/ui, packages/web, packages/desktop, packages/api.
- NO importes SqlDriver ni nada que haga I/O: si una función necesita leer la base, va en el repo (tarea CRM-03), no aquí.
- NO dupliques `redondear2` ni `ErrorValidacion`: reutilízalos.

MÉTODO: TDD estricto. Escribe primero packages/core/test/credito.test.ts imitando packages/core/test/dinero.test.ts y packages/core/test/precio.test.ts (vitest, describe/it/expect, sin base de datos). Termina con `pnpm -r typecheck` y `pnpm test` verdes y un reporte de tarea.
```

#### Archivos a tocar

- `packages/core/src/dominio/credito.ts`
- `packages/core/src/dominio/index.ts`
- `packages/core/test/credito.test.ts`

#### Criterios de aceptacion

- [ ] `pnpm -r typecheck` y `pnpm test` verdes.
- [ ] credito.ts no importa SqlDriver ni ningún repo: es 100% puro y testeable sin base de datos.
- [ ] `limiteCredito = 0` se comporta como SIN LÍMITE en creditoDisponible y en validarCargoCredito.
- [ ] Los errores se devuelven como `ErrorValidacion[]` (campo + mensaje en español), nunca como excepción: lanzar es responsabilidad del repo.
- [ ] Ninguna función usa `new Date(iso).toISOString()` para derivar fechas locales.
- [ ] Sin `any` en todo el archivo.

#### Pruebas a escribir primero (TDD)

- calcularSaldo suma cargos y resta abonos: [cargo 1000, abono 300, cargo 250] da 950.
- calcularSaldo de una lista vacía da 0 y no NaN.
- calcularSaldo redondea a dos decimales (0.1 + 0.2 en montos no deja 0.30000000000000004).
- nota_credito resta igual que un abono, y ajuste suma igual que un cargo.
- creditoDisponible(0, 500) devuelve null (sin límite) y creditoDisponible(2000, 500) devuelve 1500.
- validarCargoCredito con aplicaCredito=false devuelve error aunque el monto sea pequeño.
- validarCargoCredito con límite 2000, saldo 1800 y monto 300 devuelve error mencionando el disponible (200).
- validarCargoCredito con límite 2000, saldo 1800 y monto 200 (justo el disponible) NO devuelve errores.
- validarCargoCredito con límite 0 (sin límite), aplicaCredito=true y monto 99999 NO devuelve errores.
- validarCargoCredito con monto 0 o negativo devuelve error.
- validarAbono con monto mayor al saldo devuelve error; con monto igual al saldo no devuelve ninguno.
- calcularAntiguedad con un solo cargo de hace 10 días y diasCredito=0 lo pone íntegro en d1a30.
- calcularAntiguedad con diasCredito=15 y un cargo de hace 10 días lo pone en corriente.
- calcularAntiguedad aplica FIFO: cargo viejo de 100 (hace 90 días) + cargo nuevo de 100 (hoy) + abono de 100 deja 0 en d61oMas y 100 en corriente.
- calcularAntiguedad con abonos que superan todos los cargos devuelve todos los tramos en 0 (no negativos).
- calcularAntiguedad: la suma de los cuatro tramos es igual a `total` y a calcularSaldo de los mismos movimientos.

---

### CRM-03 — credito-repo: libro de movimientos, abonos, cuentas por cobrar y guardia al borrar cliente con deuda

**Objetivo.** Existe crearCreditoRepo(db) registrado en el contexto de la UI, que registra cargos, abonos, ajustes y notas de crédito con validación en el repo, calcula el saldo por SUM sobre el libro, mantiene la caché cliente.saldo_credito y devuelve el reporte de cuentas por cobrar con antigüedad.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | medio — es el núcleo de las cuentas por cobrar y toca cliente-repo.eliminar, que ya está en uso; un guardia mal puesto bloquea borrados legítimos. | CRM-01, CRM-02 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto sin `any`, TODO en español, sin comentarios sueltos en el cuerpo del código). Ya existen la tabla `credito_movimiento` (migración 11) y el dominio puro packages/core/src/dominio/credito.ts. Tu tarea es el repo de cuentas por cobrar.

CREA packages/core/src/repos/credito-repo.ts imitando la forma de packages/core/src/repos/cotizacion-repo.ts y packages/core/src/repos/compra-repo.ts: `export function crearCreditoRepo(db: SqlDriver) { return { ... } }` al final `export type CreditoRepo = ReturnType<typeof crearCreditoRepo>`, ids con `newId()` y timestamps con `now()` de ../ids.js, una constante `COLS` con la lista de columnas, y los errores de negocio lanzados como `throw new ValidacionError(errores)` importando ValidacionError de ./producto-repo.js (es el patrón obligatorio del repo, no inventes otro tipo de error).

MÉTODOS:
- `movimientos(clienteId: string): Promise<CreditoMovimiento[]>` — ordenados por fecha, filtrando deleted_at IS NULL.
- `saldo(clienteId: string): Promise<number>` — SUM con signo sobre el libro usando `calcularSaldo` del dominio. NUNCA leas `cliente.saldo_credito` para decidir nada.
- `recalcularCache(clienteId: string): Promise<number>` — escribe el saldo calculado en cliente.saldo_credito y lo devuelve.
- `registrarCargo(input: { clienteId; monto; facturaId?; referencia?; usuarioId?; notas?; fecha? })` — lee el cliente, lee el saldo real, valida con `validarCargoCredito` del dominio, inserta el movimiento y DESPUÉS llama a recalcularCache. El orden importa: si falla el segundo paso, la verdad (el movimiento) ya está escrita y la caché se reconstruye sola en la próxima lectura.
- `registrarAbono(input: { clienteId; monto; metodoPago; cajaId?; usuarioId?; notas? })` — valida con `validarAbono` contra el saldo real.
- `registrarAjuste(input)` (saldo inicial o cargo manual: suma) y `registrarNotaCredito(input)` (resta, para devoluciones de ventas fiadas).
- `anularMovimiento(id: string)` — soft delete (deleted_at) + recalcularCache. Es la única forma de corregir un error de digitación.
- `cuentasPorCobrar(): Promise<FilaCuentaPorCobrar[]>` — una fila por cliente con saldo mayor que cero: clienteId, nombre, telefono, saldo, limite_credito, dias_credito, tramos de antigüedad (usa `calcularAntiguedad` del dominio), fecha del último movimiento y un flag `eliminado` cuando el cliente tiene deleted_at. Ordenada por saldo descendente. IMPORTANTE: incluye a los clientes borrados con deuda; `cliente-repo.eliminar()` es soft delete y hoy un cliente borrado con deuda desaparece de la lista pero su saldo sigue existiendo.
- Cada escritura llama a `registrarAccion(db, { accion, entidad: "credito_movimiento", entidadId, resumen, usuarioId })` de ./bitacora-repo.js, igual que hace cliente-repo.eliminar() (cliente-repo.ts:114-118). `usuarioId` llega null por ahora: todavía no hay sesión (área RBAC).

ADEMÁS, en packages/core/src/repos/cliente-repo.ts: añade en `eliminar(id)` un guardia que lance `ValidacionError` si el cliente tiene saldo mayor que cero, con mensaje en español. Hazlo con una consulta SUM inline dentro de cliente-repo, NO importando credito-repo: evitas un ciclo de imports entre los dos módulos.

REGISTRO (tres lugares, si falta uno el typecheck lo atrapa):
1. `export { crearCreditoRepo, type CreditoRepo, ... }` en packages/core/src/repos/index.ts (imita cualquier bloque existente).
2. `credito: ReturnType<typeof crearCreditoRepo>` en la interfaz `Repos` de packages/ui/src/data/contexto.tsx (línea 27 en adelante).
3. `credito: crearCreditoRepo(db)` en el objeto `repos` de `ProveedorDatos` en el mismo archivo.

CONTEXTO CRÍTICO
- `SqlDriver` (packages/core/src/db/driver.ts) NO tiene transacciones: solo exec/run/all/get. Por eso el libro de movimientos es la verdad y la caché es derivada; nunca hagas una operación que dependa de que dos escrituras ocurran juntas para ser correcta.
- `limite_credito = 0` significa SIN LÍMITE (hoy vale 0 en todas las instalaciones reales porque la pantalla nunca lo expuso). Quien bloquea es `aplica_credito`. Esa regla ya está implementada en el dominio: no la reimplementes ni la contradigas.
- El driver web (sql.js) persiste con debounce de 150 ms: cuantas menos escrituras separadas haga una operación, menos ventana de inconsistencia. Un abono debe ser un INSERT + un UPDATE de caché, nada más.

QUÉ NO TOCAR
- NO toques packages/core/src/db/migrations.ts (el esquema ya está hecho; si algo falta, repórtalo, no lo edites).
- NO toques factura-repo.ts (el enganche del cobro a crédito es la tarea CRM-04).
- NO toques ninguna pantalla de packages/ui/src/pantallas ni componentes: en contexto.tsx solo agregas las dos líneas del registro.
- NO uses TRIGGERs ni SQL con BEGIN...END por ningún motivo.

MÉTODO: TDD estricto. Escribe primero packages/core/test/credito-repo.test.ts imitando packages/core/test/corte-caja-repo.test.ts (helper `nuevaDb()` con createNodeSqliteDriver + migrate, beforeEach). Termina con `pnpm -r typecheck` y `pnpm test` verdes y un reporte de tarea.
```

#### Archivos a tocar

- `packages/core/src/repos/credito-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/src/repos/cliente-repo.ts`
- `packages/ui/src/data/contexto.tsx`
- `packages/core/test/credito-repo.test.ts`

#### Criterios de aceptacion

- [ ] `pnpm -r typecheck` y `pnpm test` verdes.
- [ ] Ninguna decisión de negocio lee `cliente.saldo_credito`: todas usan el SUM sobre credito_movimiento.
- [ ] Toda regla de negocio (límite, abono mayor al saldo, cliente sin crédito, borrar con deuda) se valida en el repo y lanza ValidacionError; ninguna vive solo en la UI.
- [ ] `credito` está registrado en repos/index.ts, en la interfaz `Repos` y en `ProveedorDatos`.
- [ ] cliente-repo no importa credito-repo (sin ciclo de imports).
- [ ] Cada escritura deja una fila en bitacora_accion.
- [ ] cuentasPorCobrar incluye clientes con deleted_at que tienen saldo, marcados con un flag.

#### Pruebas a escribir primero (TDD)

- registrarCargo de 1000 a un cliente con aplica_credito=1 y límite 0 (sin límite) inserta el movimiento y deja saldo() en 1000 y cliente.saldo_credito en 1000.
- registrarCargo a un cliente con aplica_credito=0 lanza ValidacionError y NO inserta nada.
- registrarCargo que excede el límite (límite 2000, saldo 1800, monto 300) lanza ValidacionError y el saldo no cambia.
- registrarAbono de 400 sobre un saldo de 1000 deja saldo() en 600 y actualiza la caché.
- registrarAbono mayor al saldo lanza ValidacionError.
- anularMovimiento de un cargo lo saca del saldo y recalcula la caché.
- recalcularCache reconstruye el saldo correcto aunque cliente.saldo_credito haya sido manipulado a un valor falso directamente por SQL (prueba de que la caché es derivada).
- cuentasPorCobrar devuelve solo clientes con saldo mayor que cero, ordenados descendente, con los cuatro tramos de antigüedad sumando el saldo.
- cuentasPorCobrar incluye un cliente soft-deleted con deuda y lo marca como eliminado.
- cliente-repo.eliminar() sobre un cliente con saldo mayor que cero lanza ValidacionError y el cliente sigue visible en listar().
- cliente-repo.eliminar() sobre un cliente con saldo 0 sigue funcionando igual que antes.
- Cada registrarCargo/registrarAbono deja una fila en bitacora_accion con entidad='credito_movimiento'.

---

### CRM-04 — Venta a crédito de verdad: guardia en factura-repo.cobrar, buscador de cliente con LIMIT y ModalCobro consciente del saldo

**Objetivo.** Fiar en Ventas exige un cliente con crédito habilitado, respeta su límite y genera automáticamente el cargo en el libro; el cajero ve el saldo y el disponible antes de elegir Crédito, y el buscador de cliente deja de traer la tabla completa en cada tecla.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto — toca `cobrar()`, el camino crítico de la venta, y un rechazo mal calibrado deja al colmadero sin poder cobrar; por eso los tests de no regresión de efectivo y de corte de caja son obligatorios. | CRM-02, CRM-03 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Misma forma: 'PARTE BACKEND' (guardia de credito en cobrar, cargo automatico al libro, buscarParaVenta con LIMIT) y despues 'PARTE UI (conveniencia, nunca la autoridad)' con el buscador de Ventas.tsx y el metodo Credito de ModalCobro.tsx. Ademas colisiona con PRECIOS-04, que reescribe exactamente los mismos dos archivos de UI y la misma funcion cobrar().
>   **Arreglo.** Cortar la tarea en el limite de core: guardia + cargo + buscarParaVenta con sus tests. Todo lo de Ventas.tsx y ModalCobro.tsx se acumula en VENTAS-UNIFICADA, que es donde ya se decidio resolver ese archivo de una sola pasada.
> - **Problema.** Su criterio de aceptacion es 'corte-caja-repo.calcularResumen() sigue devolviendo los mismos numeros que antes para los mismos datos', pero BACKOFFICE-02 cambia deliberadamente la semantica de fecha de ese mismo metodo (de date(fecha_hora) en UTC a rango de instante con desfase local) y esta en una ola anterior. El criterio se evalua contra una linea base que ya se movio a proposito: el agente de CRM-04 vera fallar un test de no regresion que es correcto que falle, y la reaccion natural sera 'arreglarlo' revirtiendo el trabajo de BACKOFFICE-02.
>   **Arreglo.** Reescribir el criterio como 'calcularResumen devuelve el mismo total_credito que la version de reportes ya migrada a dia local para los mismos datos' y congelar la linea base capturando los valores esperados en un fixture generado despues de BACKOFFICE-02, no antes.

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto sin `any`, TODO en español, sin comentarios sueltos, mobile-first). Ya existen `credito_movimiento` (migración 11), packages/core/src/dominio/credito.ts y packages/core/src/repos/credito-repo.ts. Tu tarea cierra el agujero central: hoy `factura-repo.cobrar()` acepta un pago con metodo='credito' sin exigir cliente y sin dejar rastro de la deuda.

PARTE BACKEND (es la autoritativa, va primero)
1. packages/core/src/repos/factura-repo.ts, método `cobrar()` (línea 395). Después de `validarPagos` y antes de insertar los pagos: si algún pago tiene metodo==='credito', suma esos montos y valida contra el dominio: la factura DEBE tener `cliente_id` (si no, ValidacionError 'Para fiar hay que asignar un cliente al ticket.'), el cliente debe existir y tener aplica_credito=1, y el total fiado debe pasar `validarCargoCredito` contra el saldo real (léelo con la misma consulta SUM que usa credito-repo, o inyectando el repo; NO leas cliente.saldo_credito). Si la validación falla, lanza ValidacionError ANTES de escribir nada: no puede quedar una factura cobrada a medias.
2. Cuando el cobro sí procede, tras marcar la factura como 'cobrada' registra UN cargo por el total fiado con `facturaId` y la referencia del número interno. La factura SIGUE quedando en estado 'cobrada' a propósito: cambiarla reescribiría `total_credito` de corte-caja-repo y la ganancia de reportes-repo para períodos ya cerrados e impresos. No cambies ese estado.
3. packages/core/src/repos/cliente-repo.ts: añade `buscarParaVenta(q: string, limite = 20)` que devuelva solo { id, nombre, apellidos, telefono, aplica_credito, limite_credito } más el saldo real, con LIMIT en SQL. Hoy `listar(q)` (líneas 128-139) hace SELECT de TODA la tabla y filtra en JS con `normalizar()`, y Ventas.tsx lo llama en cada pulsación: con 2.000 clientes en sql.js eso es la tabla entera materializada en el camino crítico de la venta. Deja `listar(q)` como está (lo usa la pantalla de Clientes) y usa el método nuevo solo en Ventas.

PARTE UI (conveniencia, nunca la autoridad)
4. packages/ui/src/pantallas/Ventas.tsx: el buscador de cliente ya existe y funciona (líneas 918-941 y 1536-1625) — NO lo rehagas. Cámbialo para (a) llamar a `buscarParaVenta` con debounce de ~200 ms en vez de `listar` en cada tecla, y (b) mostrar en el badge del cliente activo su saldo y su disponible (o 'sin límite'), usando los tokens de packages/ui/src/estilos.ts.
5. packages/ui/src/componentes/ModalCobro.tsx: el método 'Crédito' debe quedar deshabilitado con una explicación visible cuando el ticket no tiene cliente o el cliente no tiene crédito, y mostrar el disponible cuando sí lo tiene. Esto es solo para que el cajero no se choque con un error después de teclear el monto: la validación que manda es la del repo, que debes dejar intacta.

REGLAS DEL PROYECTO QUE APLICAN AQUÍ
- CLAUDE.md §4: la regla 'no se puede fiar por encima del límite' vive en el repo, nunca solo en el modal. Si escondes el botón y no pones guardia en core, la tarea está mal hecha.
- `limite_credito = 0` significa SIN LÍMITE (hoy vale 0 en toda instalación real): tratarlo como bloqueo rompería la venta a crédito de todos los usuarios el día del despliegue.
- packages/ui NO tiene vitest: todo lo testeable va en core. La parte de UI se verifica a mano a 375px, 768px y 1440px.
- Nada de emojis como iconos: usa lucide-react, que ya es la convención (ver AppShell.tsx).
- Los colores nuevos, si hacen falta, se declaran en packages/ui/src/estilos-globales.css en `:root` Y en `[data-theme="dark"]`; `estilos.ts` no admite ningún hex (regla dura de design-guidelines.md).

QUÉ NO TOCAR
- NO toques packages/core/src/db/migrations.ts.
- NO cambies el estado de la factura ni la lógica de `procesarCobro`/`validarPagos` del dominio.
- NO toques corte-caja-repo.ts ni reportes-repo.ts: cómo se refleja un abono en el corte de caja es una decisión pendiente del cliente y de las áreas CAJA/MULTICAJA.
- NO toques devolucion-repo.ts: que una devolución de venta fiada genere nota de crédito queda como seguimiento explícito en tu reporte de tarea.
- NO metas la lógica de nivel de precio del cliente: pertenece al área PRECIOS.

MÉTODO: TDD estricto. Escribe primero los casos en packages/core/test/factura-repo.test.ts (ya existe, imita su helper de base en memoria) y en el test de cliente-repo. Termina con `pnpm -r typecheck` y `pnpm test` verdes, captura mental de la verificación a 375/768/1440 y un reporte de tarea.
```

#### Archivos a tocar

- `packages/core/src/repos/factura-repo.ts`
- `packages/core/src/repos/cliente-repo.ts`
- `packages/core/test/factura-repo.test.ts`
- `packages/core/test/repos.test.ts`
- `packages/ui/src/pantallas/Ventas.tsx`
- `packages/ui/src/componentes/ModalCobro.tsx`

#### Criterios de aceptacion

- [ ] `pnpm -r typecheck` y `pnpm test` verdes.
- [ ] Es imposible cobrar con metodo='credito' sin cliente, sin aplica_credito o por encima del límite, llamando directamente al repo (con la UI fuera de la ecuación).
- [ ] Un cobro a crédito exitoso deja exactamente un credito_movimiento tipo 'cargo' enlazado a la factura, y el saldo del cliente sube en ese monto.
- [ ] Un cobro rechazado no deja pagos, ni cambia el estado de la factura, ni inserta movimientos.
- [ ] El estado de la factura para una venta fiada sigue siendo 'cobrada' y `corte-caja-repo.calcularResumen()` sigue devolviendo los mismos números que antes para los mismos datos.
- [ ] El buscador de Ventas usa una consulta con LIMIT y debounce; `listar(q)` sigue existiendo sin cambios para la pantalla de Clientes.
- [ ] ModalCobro deshabilita Crédito con explicación cuando no procede, y la validación del repo sigue siendo la que manda.

#### Pruebas a escribir primero (TDD)

- cobrar() con un pago metodo='credito' sobre un ticket SIN cliente lanza ValidacionError y la factura sigue en estado 'abierta'.
- cobrar() a crédito con un cliente que tiene aplica_credito=0 lanza ValidacionError y no inserta ni pagos ni movimientos.
- cobrar() a crédito por encima del límite (límite 1000, saldo 900, ticket 200) lanza ValidacionError.
- cobrar() a crédito justo en el límite (límite 1000, saldo 900, ticket 100) procede y deja saldo 1000.
- cobrar() a crédito con límite 0 (sin límite) procede.
- Cobro exitoso a crédito: la factura queda 'cobrada', existe un pago metodo='credito' y exactamente un credito_movimiento tipo 'cargo' con factura_id apuntando a esa factura.
- Cobro mixto (efectivo 500 + crédito 300): se genera un único cargo por 300, no por 800.
- Cobro 100% efectivo sigue funcionando exactamente igual y NO genera ningún movimiento de crédito (prueba de no regresión).
- corte-caja-repo.calcularResumen() sobre un período con una venta fiada devuelve el mismo total_credito que antes del cambio.
- cliente-repo.buscarParaVenta('mar', 5) devuelve como máximo 5 filas y cada una trae el saldo real del cliente.
- buscarParaVenta con una cadena vacía devuelve las primeras N por nombre, sin recorrer toda la tabla.

---

### CRM-05 — Consultas de la ficha 360 y seguimiento de cotizaciones no convertidas

**Objetivo.** El core sabe responder, con agregados SQL, cuánto compró un cliente, su ticket promedio, su frecuencia, su última visita y sus productos favoritos, y distingue por fin las cotizaciones convertidas de las que se quedaron en el camino.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo — solo lectura, salvo marcarConvertida, que es una escritura acotada con guardias propios. | CRM-01 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto sin `any`, TODO en español). Ya existen las tablas del CRM (migración 11) y los índices ix_factura_cliente e ix_cotizacion_cliente. Tu tarea son consultas de solo lectura más un método de estado: cero UI.

PARTE A — resumen 360 (agregados SQL, no JavaScript)
Añade en packages/core/src/repos/reportes-repo.ts (imita el estilo de `resumenGanancia`, líneas 76-109: interfaz exportada arriba, un `db.all`/`db.get` con la consulta y `redondear2` para el dinero):
- `resumenCliente(clienteId: string): Promise<ResumenCliente>` con: totalComprado, cantidadFacturas, ticketPromedio, primeraCompra, ultimaCompra, diasDesdeUltimaCompra y frecuenciaDias (promedio de días entre facturas). Todo sobre `factura` con estado='cobrada' AND deleted_at IS NULL AND cliente_id=?.
- `productosMasCompradosPorCliente(clienteId: string, limite = 5)` imitando el `productosMasVendidos` que ya existe en ese archivo, pero filtrando por cliente.
NO resuelvas esto trayendo todas las facturas y sumando en JS: ese es el patrón N+1 que ya sufre ConsultaFacturas y en sql.js (base entera en memoria WASM) se nota.

PARTE B — conversión de cotizaciones
En packages/core/src/repos/cotizacion-repo.ts (imita su método `anular(id)`, línea 194):
- `marcarConvertida(cotizacionId: string, facturaId: string): Promise<void>` — escribe estado='convertida' y factura_id. Las columnas YA existen en el esquema y en los tipos desde la migración 10; lo único que falta es el método. Guardias en el repo: no se puede convertir una cotización anulada, ni una ya convertida (ValidacionError de ./producto-repo.js, que es el patrón del repo), ni apuntar a una factura inexistente.
- Extiende `FiltroCotizaciones` con `estado?` y `soloNoConvertidas?: boolean` y añade `seguimientoNoConvertidas(filtro): Promise<CotizacionSeguimiento[]>` que devuelva las vigentes no convertidas con sus días transcurridos y un flag `vencida`. El criterio de vencida ya está resuelto en packages/ui/src/pantallas/ConsultaCotizaciones.tsx:24-42 (`estaVencida` y `hoyIsoLocal`): cópialo tal cual al core como función pura, porque ya evita el desfase de zona horaria de `toISOString()`. NO calcules 'vencida' con `new Date(iso).toISOString()`.

QUÉ REUTILIZAR SIN REESCRIBIR
- `factura-repo.listarCobradas({ clienteId, desde, hasta, tipo })` (líneas 29-36 y 468-494) ya filtra por cliente: es el historial de compras de la ficha, no escribas otra consulta para eso.
- `cotizacion-repo.listar({ clienteId })` (líneas 36-42 y 172-191) ya filtra por cliente.

QUÉ NO TOCAR
- NO toques packages/core/src/db/migrations.ts.
- NO toques factura-repo.cobrar ni credito-repo (son otras tareas).
- NO toques ninguna pantalla ni componente de packages/ui: el botón 'Convertir en venta' dentro de Ventas es una decisión de producto todavía abierta; tú dejas el método listo y lo anotas como seguimiento en tu reporte.
- NO cambies la semántica de `estado` de cotizacion (vigente|convertida|anulada): 'vencida' se sigue calculando al mostrar, no se guarda.

MÉTODO: TDD estricto. Escribe primero los casos en packages/core/test/reportes-repo.test.ts (ya existe) y crea packages/core/test/cotizacion-repo.test.ts si no existe, imitando el helper `nuevaDb()` de packages/core/test/repos.test.ts. Termina con `pnpm -r typecheck` y `pnpm test` verdes y un reporte de tarea.
```

#### Archivos a tocar

- `packages/core/src/repos/reportes-repo.ts`
- `packages/core/src/repos/cotizacion-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/test/reportes-repo.test.ts`
- `packages/core/test/cotizacion-repo.test.ts`

#### Criterios de aceptacion

- [ ] `pnpm -r typecheck` y `pnpm test` verdes.
- [ ] resumenCliente y productosMasCompradosPorCliente se resuelven con agregados SQL: ninguna función trae la lista completa de facturas para sumar en JavaScript.
- [ ] marcarConvertida valida en el repo (no en la UI) que la cotización no esté anulada ni ya convertida.
- [ ] El cálculo de 'vencida' no usa `new Date(iso).toISOString()` en ningún punto.
- [ ] Los tipos nuevos se exportan desde packages/core/src/repos/index.ts.
- [ ] Ningún archivo de packages/ui fue modificado.

#### Pruebas a escribir primero (TDD)

- resumenCliente sobre un cliente con 3 facturas cobradas de 100, 200 y 300 devuelve totalComprado 600, cantidadFacturas 3 y ticketPromedio 200.
- resumenCliente ignora facturas anuladas, borradas (deleted_at) y de otros clientes.
- resumenCliente de un cliente sin compras devuelve ceros y fechas nulas, sin lanzar.
- resumenCliente calcula diasDesdeUltimaCompra y frecuenciaDias sobre fechas controladas.
- productosMasCompradosPorCliente devuelve el top ordenado por cantidad y respeta el límite.
- marcarConvertida deja estado='convertida' y factura_id apuntando a la factura.
- marcarConvertida sobre una cotización anulada lanza ValidacionError.
- marcarConvertida sobre una ya convertida lanza ValidacionError y no pisa el factura_id original.
- seguimientoNoConvertidas excluye las convertidas y las anuladas.
- seguimientoNoConvertidas marca vencida=true una cotización cuya fecha_vencimiento es ayer y false una de mañana, sin depender de la zona horaria del entorno.

---

### CRM-06 — crm-repo: interacciones con fecha, etiquetas/segmentos, cumpleaños y panel de recordatorios

**Objetivo.** El core puede guardar y listar notas/llamadas/visitas de un cliente, administrar un catálogo de etiquetas y asignarlas, guardar el cumpleaños y responder qué recordatorios y cumpleaños tocan hoy o este mes.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo — todo es aditivo y aislado; el único riesgo real es reutilizar cliente-repo.actualizar(), que el test de no regresión del límite cubre. | CRM-01 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto sin `any`, TODO en español, sin comentarios sueltos). Las tablas `cliente_interaccion`, `etiqueta` y `cliente_etiqueta` y las columnas `cliente.fecha_nacimiento` y `cliente.dias_credito` ya existen (migración 11). Tu tarea es el repo del CRM blando: cero UI.

CREA packages/core/src/repos/crm-repo.ts imitando la forma de packages/core/src/repos/promocion-repo.ts y cotizacion-repo.ts (`export function crearCrmRepo(db: SqlDriver) { return { ... } }`, `export type CrmRepo = ReturnType<...>`, ids con `newId()` y timestamps con `now()` de ../ids.js, errores de negocio con `throw new ValidacionError(errores)` importando ValidacionError de ./producto-repo.js).

MÉTODOS
Interacciones:
- `crearInteraccion({ clienteId, tipo, texto, fecha?, fechaRecordatorio?, usuarioId? })` — valida que el texto no esté vacío y que el tipo sea uno de nota|llamada|visita|recordatorio, y que fechaRecordatorio tenga formato de fecha ISO (AAAA-MM-DD) si viene.
- `actualizarInteraccion(id, { texto, fechaRecordatorio, completada })`, `eliminarInteraccion(id)` (soft delete con deleted_at), `interaccionesDe(clienteId)` ordenadas por fecha descendente.
- `recordatoriosPendientes(hastaIso: string)` — interacciones con fecha_recordatorio no nula, completada=0 y fecha_recordatorio menor o igual a la fecha dada, con el nombre y teléfono del cliente. Este es el panel 'para hoy'.
Etiquetas:
- `crearEtiqueta({ nombre, color? })` con nombre obligatorio y único (compara con `normalizar()` de ../dominio/validacion.js, que es la convención del repo para ignorar acentos y mayúsculas), `renombrarEtiqueta`, `desactivarEtiqueta` (soft delete), `listarEtiquetas()`.
- `etiquetasDe(clienteId)` y `asignarEtiquetas(clienteId, etiquetaIds: string[])` — reemplaza el conjunto completo de forma idempotente respetando el índice único ux_cliente_etiqueta.
- `clientesPorEtiqueta(etiquetaId)`.
Cumpleaños y datos propios del CRM:
- `establecerFechaNacimiento(clienteId, fechaIso | null)`, `establecerLimiteCredito(clienteId, limite)`, `establecerDiasCredito(clienteId, dias)`.
  ATENCIÓN, es la trampa principal de esta tarea: NO llames a `cliente-repo.actualizar()` para estos sub-formularios. Ese método hace `input.aplica_credito ? 1 : 0` SIN fallback (cliente-repo.ts:102), así que un update parcial APAGA el crédito del cliente en silencio, y además exige reenviar `nombre`. Escribe UPDATEs estrechos de una sola columna más updated_at.
- `cumpleanosDelMes(mes: string)` — clientes cuyo fecha_nacimiento cae en ese mes, comparando con `strftime('%m', fecha_nacimiento)` en SQL (la fecha se guarda como TEXT 'AAAA-MM-DD', igual que cotizacion.fecha_vencimiento).

REGISTRO (tres lugares, si falta uno el typecheck lo atrapa): repos/index.ts, la interfaz `Repos` de packages/ui/src/data/contexto.tsx y el objeto `repos` de `ProveedorDatos` en ese mismo archivo, como `crm: crearCrmRepo(db)`.

CONTEXTO QUE NO DEBES REDESCUBRIR
- `bitacora_accion` NO sirve como historial de interacciones: es append-only, no editable y su usuario_id llega siempre null. Son dos cosas distintas y conviven: la bitácora es auditoría, cliente_interaccion es CRM.
- `usuario_id` llega null en todo porque no hay login ni sesión todavía (área RBAC). La columna ya está puesta; cuando exista sesión solo habrá que pasarla.
- Las etiquetas son muchos-a-muchos con tabla puente a propósito: nada de JSON ni TEXT separado por comas dentro de `cliente`.
- Cumpleaños y recordatorios NO disparan nada por sí solos: no hay proceso en segundo plano, ni correo, ni WhatsApp. Lo único que existe es este método de consulta, que una pantalla llamará al abrirse.

QUÉ NO TOCAR
- NO toques packages/core/src/db/migrations.ts.
- NO toques cliente-repo.actualizar() ni ninguno de sus métodos existentes.
- NO toques factura-repo, credito-repo, cotizacion-repo ni reportes-repo.
- NO toques ninguna pantalla ni componente de packages/ui: en contexto.tsx solo agregas las dos líneas del registro.

MÉTODO: TDD estricto. Escribe primero packages/core/test/crm-repo.test.ts imitando packages/core/test/promocion.test.ts y el helper `nuevaDb()` de packages/core/test/repos.test.ts. Termina con `pnpm -r typecheck` y `pnpm test` verdes y un reporte de tarea.
```

#### Archivos a tocar

- `packages/core/src/repos/crm-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/ui/src/data/contexto.tsx`
- `packages/core/test/crm-repo.test.ts`

#### Criterios de aceptacion

- [ ] `pnpm -r typecheck` y `pnpm test` verdes.
- [ ] Ningún método del repo llama a cliente-repo.actualizar(): los cambios parciales usan UPDATEs de una sola columna y no pueden apagar aplica_credito.
- [ ] Las validaciones (texto obligatorio, tipo válido, formato de fecha, nombre de etiqueta único) están en el repo y lanzan ValidacionError.
- [ ] asignarEtiquetas es idempotente y respeta el índice único ux_cliente_etiqueta.
- [ ] `crm` está registrado en repos/index.ts, en la interfaz `Repos` y en `ProveedorDatos`.
- [ ] Ninguna pantalla de packages/ui fue modificada.

#### Pruebas a escribir primero (TDD)

- crearInteraccion persiste y interaccionesDe(clienteId) la devuelve ordenada por fecha descendente.
- crearInteraccion con texto vacío o solo espacios lanza ValidacionError.
- crearInteraccion con un tipo fuera de nota|llamada|visita|recordatorio lanza ValidacionError.
- eliminarInteraccion hace soft delete: la fila sigue en la tabla pero no aparece en interaccionesDe.
- recordatoriosPendientes devuelve los recordatorios con fecha menor o igual a la dada y excluye los completada=1.
- crearEtiqueta con un nombre que ya existe ignorando acentos y mayúsculas ('Mayorista' vs 'mayorista') lanza ValidacionError.
- asignarEtiquetas llamado dos veces con la misma lista no duplica filas en cliente_etiqueta.
- asignarEtiquetas con una lista más corta quita las etiquetas que ya no están.
- clientesPorEtiqueta devuelve solo los clientes asignados y excluye los soft-deleted.
- establecerLimiteCredito(clienteId, 5000) sobre un cliente con aplica_credito=1 deja el límite en 5000 Y aplica_credito sigue en 1 (prueba de no regresión de la trampa de actualizar()).
- establecerFechaNacimiento guarda 'AAAA-MM-DD' y cumpleanosDelMes('03') devuelve a los nacidos en marzo de cualquier año y no a los de otros meses.

---

### CRM-07 — Pantalla Clientes: rediseño mobile-first y ficha 360 con pestañas (resumen, crédito, actividad, cotizaciones)

**Objetivo.** La pantalla Clientes pasa de ABM plano a CRM: lista mobile-first con saldo y etiquetas, y una ficha de cliente con resumen 360, cuenta corriente con abonos, notas/recordatorios, etiquetas, cumpleaños y cotizaciones pendientes, todo operable con teclado.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto — es la pantalla más grande del área y arrastra deuda previa (layout fijo a dos columnas y navegación duplicada); si el paso 1 y 2 se saltan, la ficha nace rota en teléfono y con atajos desincronizados. | CRM-03, CRM-05, CRM-06 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Arrastra deuda previa y construye pantalla nueva en la misma tarea. Paso 1: rehacer Clientes.tsx mobile-first (hoy tiene gridTemplateColumns fijo y nunca llama a useBreakpoint). Paso 2: extraer a un modulo la navegacion por flechas que esta duplicada integra en dos bloques del archivo. Paso 3: cuatro campos nuevos en el formulario. Paso 4: un segundo estado de pantalla con ficha 360 de CUATRO pestanas, incluyendo tabla de movimientos y modal de abono. Paso 5: dos paneles mas (cuentas por cobrar y 'para hoy'). Son cinco tareas con una etiqueta.
>   **Arreglo.** (A) deuda previa: responsive + extraccion de la navegacion duplicada + los cuatro campos del formulario; (B) ficha 360 con sus pestanas y el ModalAbono; (C) panel de cuentas por cobrar y panel 'para hoy'. La (A) es la que hay que hacer si o si, y sola ya mejora la pantalla.

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto sin `any`, TODO en español, SIN comentarios en el código, mobile-first). Todo el backend del CRM ya existe y está inyectado por packages/ui/src/data/contexto.tsx: `useRepos()` te da `cliente`, `credito` (cargos, abonos, saldo, cuentasPorCobrar con antigüedad), `crm` (interacciones, etiquetas, cumpleaños, recordatorios, límite y días de crédito), `reportes.resumenCliente` y `cotizacion.seguimientoNoConvertidas`. Tu tarea es SOLO la capa de presentación: no escribas ni una regla de negocio nueva, y si te falta un dato, pídelo al repo que corresponda o repórtalo — no lo calcules en la pantalla.

ORDEN DE TRABAJO (respétalo, el paso 1 es la deuda que hace posible el resto)
1. Arregla la base de packages/ui/src/pantallas/Clientes.tsx antes de agregar nada: hoy el formulario usa `gridTemplateColumns: '1fr 1fr'` fijo (línea 189) y la pantalla nunca llama a `useEsAngosto`/`useEsTactil` (packages/ui/src/hooks/useBreakpoint.ts:69,97), a diferencia de ConsultaCotizaciones.tsx:58 y de Ventas.tsx. Hazla mobile-first de verdad: una columna en teléfono, dos desde tableta, objetivos táctiles de 44px o más.
2. Extrae a packages/ui/src/utilidades/navegacionFilas.ts la navegación por flechas que hoy está DUPLICADA ÍNTEGRA en Clientes.tsx (un useEffect con listener de window en las líneas 109-138 y otra copia en el onKeyDown del buscador en las líneas 154-181, con el array de acciones ['editar','eliminar'] repetido en las líneas 123 y 163). Ese archivo ya existe y contiene `moverIndiceFila`/`moverAccionFila`: amplíalo en vez de crear otro. Sin esto, agregar la tercera acción 'Ver ficha' obliga a tocar los dos bloques y se desincronizan.
3. Añade al formulario de cliente los campos que el repo ya acepta pero la pantalla nunca expuso: `limite_credito`, `comentarios`, `fecha_nacimiento` y `dias_credito`. Sin límite visible, marcar 'Aplica crédito' no significa nada (queda en 0, que el sistema interpreta como sin límite).
4. Añade el segundo estado de pantalla: lista -> ficha del cliente (no otro modal de edición; un modal no aguanta pestañas y tablas). Vuelta con Escape y con un botón visible. Pestañas: Resumen (datos de contacto, etiquetas, cumpleaños, ticket promedio, frecuencia, última visita, productos más comprados), Crédito (saldo, límite, disponible, antigüedad por tramos, tabla de movimientos y botón Registrar abono), Actividad (feed de interacciones con alta de nota/llamada/visita/recordatorio, más la bitácora del cliente) y Cotizaciones (las no convertidas con su estado vencida/vigente).
5. Añade a la lista una columna de saldo y las etiquetas del cliente, y un acceso al panel de cuentas por cobrar (`credito.cuentasPorCobrar()`) y al panel 'para hoy' (`crm.recordatoriosPendientes` + `crm.cumpleanosDelMes`).

REGLAS DURAS DE ESTE REPO
- El CRM vive DENTRO de Clientes (Alt+3). NO lo agregues como décimo módulo en packages/ui/src/AppShell.tsx: los atajos se generan con `MODULOS.map((m, i) => 'Alt+' + (i + 1))` (líneas 27-31 y 63-65) y 'Alt+10' no es una tecla que exista, el atajo quedaría muerto sin error.
- No hay `DESIGN.md` y no debes crear uno: la guía real es design-guidelines.md en la raíz del repo (23 KB). Léela antes de tocar estilos y extiéndela con lo que agregues.
- packages/ui/src/estilos.ts NO admite ningún hex: solo `var(--sfr-*)`. Todo color nuevo se declara en packages/ui/src/estilos-globales.css en `:root` Y en `[data-theme="dark"]`; un color definido en un solo tema cuenta como bug. Las claves `c.azul/azulOscuro/azulClaro` son ROLES, no matices: el acento real de la marca es rojo granate.
- Arma la ficha con los tokens que ya existen (`s.tarjeta`, `s.tabla`, `s.th`, `s.td`, `s.badge`, `s.boton`, `s.botonPeligro`, `s.errorBox`, `s.formFooter`). Toda tabla nueva va envuelta en `div.sfr-tabla-scroll` (estilos-globales.css:237).
- Todo modal nuevo (abono, nota) usa `useModalAccesible` (packages/ui/src/hooks/useModalAccesible.ts:18) y cierra con Escape vía `useAtajosTeclado`. Las confirmaciones usan `useAlertas().confirmar` (packages/ui/src/contexto/Alertas.tsx:52), nunca `window.confirm`.
- Iconos de lucide-react, jamás emojis. El feed cronológico ya tiene patrón visual en packages/ui/src/componentes/SeccionBitacora.tsx: míralo antes de inventar otro.
- Los errores del repo llegan como `ValidacionError`: captúralos con `e instanceof ValidacionError` y píntalos en `s.errorBox`, igual que hace hoy Clientes.tsx:91-94. No repliques las reglas (límite de crédito, abono mayor al saldo): deja que el repo mande y muestra su mensaje.

QUÉ NO TOCAR
- NO toques nada dentro de packages/core: si falta un método o un dato, anótalo en tu reporte de tarea como seguimiento; no metas SQL ni reglas en la pantalla.
- NO toques packages/ui/src/pantallas/Ventas.tsx ni ModalCobro.tsx.
- NO agregues módulos ni atajos nuevos en AppShell.tsx.
- NO metas nivel de precio del cliente en la ficha: pertenece al área PRECIOS y todavía no existe.

PRUEBAS: packages/ui NO tiene vitest ni script `test` en su package.json, así que la lógica no se testea aquí — por eso toda decisión ya vive en core. Si necesitas un helper con lógica (agrupar el feed por día, formatear los tramos de antigüedad), créalo como función pura en packages/core/src/dominio/ y escríbele su test en packages/core/test/. Verifica la pantalla a mano a 375px, 768px y 1440px, en tema claro y oscuro, y operándola solo con teclado. Termina con `pnpm -r typecheck` verde, `pnpm test` verde y un reporte de tarea.
```

#### Archivos a tocar

- `packages/ui/src/pantallas/Clientes.tsx`
- `packages/ui/src/pantallas/FichaCliente.tsx`
- `packages/ui/src/componentes/ModalAbono.tsx`
- `packages/ui/src/utilidades/navegacionFilas.ts`
- `packages/ui/src/estilos.ts`
- `packages/ui/src/estilos-globales.css`
- `design-guidelines.md`

#### Criterios de aceptacion

- [ ] `pnpm -r typecheck` y `pnpm test` verdes.
- [ ] Cero archivos de packages/core modificados, salvo helpers puros nuevos con su test.
- [ ] La navegación por flechas de Clientes.tsx existe en UN solo lugar (utilidades/navegacionFilas.ts), no duplicada.
- [ ] El formulario expone limite_credito, comentarios, fecha_nacimiento y dias_credito, y guardarlos NO apaga 'Aplica crédito'.
- [ ] La pantalla funciona a 375px sin scroll horizontal (salvo tablas dentro de .sfr-tabla-scroll), a 768px y a 1440px, en tema claro y oscuro.
- [ ] Todo es operable con teclado: entrar a la ficha, cambiar de pestaña, registrar abono y salir con Escape.
- [ ] Ningún hex nuevo en estilos.ts y ningún color declarado en un solo tema.
- [ ] Ningún emoji usado como icono.
- [ ] Los mensajes de error mostrados vienen del repo (ValidacionError), no de comprobaciones reimplementadas en la pantalla.
- [ ] AppShell.tsx sigue con 9 módulos y los mismos atajos.
- [ ] design-guidelines.md documenta los patrones nuevos (ficha con pestañas, badges de etiqueta, tramos de antigüedad).

#### Pruebas a escribir primero (TDD)

- Helper puro en core: agrupar el feed de actividad por día devuelve los días en orden descendente y no pierde ningún elemento (test en packages/core/test/).
- Helper puro en core: formatear los cuatro tramos de antigüedad produce las etiquetas esperadas y el total coincide con la suma (test en packages/core/test/).
- QA manual a 375px: la lista no produce scroll horizontal y la ficha apila sus secciones en una columna.
- QA manual a 768px y 1440px: el formulario pasa a dos columnas y la ficha muestra las pestañas sin cortar.
- QA manual de teclado: flechas para moverse por la lista, Enter para abrir la ficha, Escape para volver, Escape para cerrar el modal de abono.
- QA manual de tema oscuro: ningún texto o badge queda ilegible (prueba de que los colores nuevos se declararon en los dos temas).
- QA manual de error: intentar un abono mayor al saldo muestra el mensaje del repo en s.errorBox y no escribe nada.
- QA manual de regresión: guardar un cliente desde el formulario ampliado conserva aplica_credito, el saldo y las etiquetas.

---
