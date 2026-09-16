# Multiples cajas simultaneas

> Punto 7 del pedido. 7 tareas: MULTICAJA-01, MULTICAJA-02, MULTICAJA-03, MULTICAJA-04, MULTICAJA-05, MULTICAJA-06, MULTICAJA-07.
> Antes de despachar cualquier tarea de este archivo, lee [00-CONVENCIONES.md](./00-CONVENCIONES.md).

> [!IMPORTANT]
> **Los briefs de abajo dicen "migracion 11". Ignora ese numero.** Los escribieron ocho
> agentes en paralelo y los ocho reclamaron el id 11. La banda de ids de esta area es
> **`30-39`**; el reparto completo esta en
> [00-CONVENCIONES.md, seccion 2](./00-CONVENCIONES.md#2-reparto-de-ids-de-migracion-bandas).

> [!NOTE]
> **Decision 4 tomada: se mantiene la convencion real del repositorio.** Cabecera por archivo
> explicando el POR QUE de la decision no obvia, y cero comentarios inline decorativos. Donde
> algun brief de abajo diga "sin comentarios en el codigo", **esta superado por esta decision**.

## Estado actual

Hoy NO existe nada de multi-caja mas alla de dos tablas vacias de catalogo. `caja` y `usuario` existen en la migracion 1 (migrations.ts:46-66) y `factura.caja_id`/`factura.usuario_id` son columnas reales con FK (migrations.ts:127-128), pero no hay `caja-repo.ts` ni `usuario-repo.ts` en packages/core/src/repos/ (listado del directorio: 19 archivos, ninguno de los dos), no hay interfaces `Caja` ni `Usuario` en tipos.ts (las 36 exportaciones no los incluyen), no hay login, no hay sesion, no hay nada que persista "esta instalacion es la caja X" (ni tabla, ni localStorage, ni env: el unico VITE_ del repo es VITE_API_URL en chatbotCliente.ts:8). `AbrirTicketInput` YA acepta caja_id/usuario_id (factura-repo.ts:23-27) y los escribe (factura-repo.ts:183-184), pero los dos unicos llamadores de la UI invocan `repo.abrirTicket()` sin argumentos (Ventas.tsx:285 y Ventas.tsx:440), asi que siempre quedan null; identico con `RegistrarCorteInput.cajaId` (corte-caja-repo.ts:22-29) que CorteCaja.tsx:61-66 nunca pasa. Cada instalacion corre migrate()+seed() contra su propio SQLite aislado (web/src/main.tsx:28-31, desktop/src/main.tsx:28-31) y @sfr/api solo expone /health, /fiscal/transmitir (501 fijo, fiscal.ts:18) y /chatbot; auth.ts:41-44 deja pasar todo como 'dev-local'. Los dos bloqueadores duros para compartir datos hoy: (1) `numero_interno` se calcula con `SELECT MAX(numero_interno)+1 FROM factura` (factura-repo.ts:172-175, mismo patron en cotizacion-repo.ts:81) — colision garantizada apenas haya dos cajas; (2) `consumirSiguiente` es un read-then-write sin transaccion ni compare-and-swap (secuencia-ncf-repo.ts:121-132) sobre `secuencia_ncf.proximo_numero`, y como cada instalacion tiene su propia fila de secuencia, DOS CAJAS EMITEN EL MISMO NCF con certeza matematica, no por carrera. RECOMENDACION: opcion (c), caja-servidor en LAN, es el camino mas barato y el unico que no rompe el modo local. La razon tecnica concreta es que `SqlDriver` tiene solo 4 metodos (exec/run/all/get — driver.ts:11-22) y se inyecta en UN solo punto (`ProveedorDatos db={driver}`, contexto.tsx:60-83): se puede escribir `crearSqlDriverRemoto(baseUrl)` que implemente esa misma interfaz contra un par de endpoints de @sfr/api (que ya escucha en 0.0.0.0 con CORS origin:true — server.ts:20,26) y las 19 repos, las 9 pantallas y toda la logica de negocio siguen intactas y en el servidor. El modo 100% local queda literalmente sin tocar: se elige driver local o remoto en main.tsx segun config. (a) Supabase implica reescribir reportes/corte en SQL de Postgres y depender de internet para cobrar. (b) PowerSync es el peor camino AHORA: su modelo es last-write-wins sobre `updated_at` (plan.md:68), que es exactamente lo que NO se puede aplicar a `secuencia_ncf.proximo_numero` ni a `producto.existencia`, ademas de costo mensual y de que schema.sql y sync-rules.yaml estan desactualizados 4 migraciones. Orden incremental sugerido: (1) migracion 11 que añada `instalacion` (o `negocio.caja_id_local`) + `factura.numero_caja`/prefijo por caja + UNIQUE(caja_id, numero_interno); (2) caja-repo.ts y usuario-repo.ts + tipos + pantalla de seleccion de caja y login PIN, todo funcionando en modo local (una sola caja) — esto solo ya da trazabilidad de cajero, corte por caja y bitacora con usuario_id; (3) rangos NCF disjuntos por caja (columna `caja_id` en secuencia_ncf + validacion de no solapamiento en el repo), que resuelve el problema fiscal SIN red y sigue siendo correcto si luego se centraliza; (4) recien entonces el driver remoto HTTP y el ApiClient centralizado en @sfr/ui.

### Lo que ya existe y NO hay que reescribir

| Pieza | Evidencia | Se reutiliza como |
| --- | --- | --- |
| Tabla `caja` (id, nombre, ubicacion, activa) con auditoria completa | `packages/core/src/db/migrations.ts:58` | Catalogo de cajas tal cual. No hace falta migracion para la tabla, solo para la columna que diga QUE caja es esta instalacion. |
| Tabla `usuario` (rol admin\|cajero, pin_hash, activo, permisos_json) | `packages/core/src/db/migrations.ts:46` | Login con PIN y permisos por rol sin tocar el esquema: pin_hash y permisos_json ya estan. |
| `factura.caja_id` y `factura.usuario_id` con FK reales, ya en COLS_FACTURA del INSERT | `packages/core/src/repos/factura-repo.ts:83 y :203` | El INSERT ya persiste ambos. Solo falta que la UI pase los valores. |
| `AbrirTicketInput` acepta caja_id/usuario_id/cliente_id y los escribe | `packages/core/src/repos/factura-repo.ts:23` | Punto de inyeccion listo: pasar el contexto de sesion desde Ventas.tsx:285 y :440 es un cambio de dos lineas. |
| `RegistrarCorteInput.cajaId`/`usuarioId` existen y se persisten en corte_caja | `packages/core/src/repos/corte-caja-repo.ts:22` | Corte por caja: falta el filtro en calcularResumen y que la UI pase el id, no la columna. |
| Interfaz `SqlDriver` de solo 4 metodos asincronos (exec/run/all/get) | `packages/core/src/db/driver.ts:11` | EL SEAM CLAVE. Un `crearSqlDriverRemoto(baseUrl)` que implemente esta interfaz contra @sfr/api convierte cualquier caja en cliente sin tocar ninguna repo ni pantalla. |
| `ProveedorDatos` inyecta UN driver y construye las 19 repos en un solo lugar | `packages/ui/src/data/contexto.tsx:60` | Unico punto donde se decide local vs remoto. La misma UI sirve para caja-servidor y caja-cliente. |
| `migrate()` idempotente con tabla `_migracion` y ids 1..10 usados | `packages/core/src/db/migrator.ts:8` | Añadir migracion id 11 aplica sola sobre bases de instalaciones reales sin romperlas. |
| PKs = UUID v4 generado en cliente (`newId()`), no autoincrement | `packages/core/src/ids.ts:6` | Las PKs YA son seguras entre cajas: ninguna fila colisiona por id al unir bases. El problema es solo numero_interno y NCF. |
| UNIQUE INDEX `ux_comprobante_fiscal_ncf` sobre comprobante_fiscal(ncf) | `packages/core/src/db/migrations.ts:219` | Ultima linea de defensa contra NCF duplicado dentro de una base. Al centralizar, este indice es el que detectaria la duplicacion (rechazando el insert). |
| `consumirSiguiente` es el UNICO consumidor de numeros NCF, con solo 2 llamadores | `packages/core/src/repos/secuencia-ncf-repo.ts:120 (llamado en fiscal/cobro-fiscal.ts:95 y fiscal/devolucion-fiscal.ts:61)` | Toda la politica de NCF multi-caja (rangos disjuntos o consumo remoto) se cambia en UN metodo. Superficie minima. |
| `registrarAccion(db, {usuarioId})` compartida, append-only, ya acepta usuarioId | `packages/core/src/repos/bitacora-repo.ts:35` | Auditoria por usuario sin cambios de esquema: basta propagar el usuario de sesion a los repos que ya la llaman. |
| @sfr/api Fastify escuchando en 0.0.0.0 con CORS origin:true y bodyLimit 10MB | `packages/api/src/server.ts:20 y :26` | Ya es alcanzable desde la LAN. Para la opcion (c) solo hay que añadirle rutas de datos y montar el SqlDriver del servidor. |
| `chatbotCliente.ts` con BASE_URL desde VITE_API_URL y manejo de error de red | `packages/ui/src/data/chatbotCliente.ts:8 y :43` | Patron existente de cliente HTTP y de configuracion por env. Es el molde para el ApiClient centralizado que exige CLAUDE.md §1. |
| `backup-repo.exportarTodo()` vuelca las 23 tablas a JSON | `packages/core/src/repos/backup-repo.ts:9` | Sembrar la base del servidor LAN con los datos de la instalacion que hoy tiene la informacion real, sin escribir un exportador nuevo. |
| schema.sql (traduccion Postgres) y sync-rules.yaml de referencia | `packages/api/db/schema.sql:15 y packages/api/sync-rules.yaml:14` | Punto de partida para (a) o (b), pero ojo: ambos estan 4 migraciones atrasados (ver huecos). |

### Lo que falta

| Capa | Hueco | Por que importa |
| --- | --- | --- |
| repo | No existe `caja-repo.ts`. La tabla `caja` no tiene ninguna forma de listarse, crearse ni editarse desde la app. | Sin repo no hay pantalla de cajas, y sin pantalla no hay forma de que el usuario de una instalacion diga cual caja es. El seed crea 'caja-1' y ahi muere. |
| dominio | No existe `usuario-repo.ts` ni interfaces `Usuario`/`Caja` en tipos.ts (las 36 exportaciones del archivo no las incluyen). | El cliente pidio 'usuarios distintos logueados'. Hoy no hay ni el tipo. Hay que crear tipo + repo + hash de PIN + validacion de rol en la capa de repo (CLAUDE.md §4: la validacion no puede vivir solo en el front). |
| esquema | No hay identidad de instalacion persistida: ninguna tabla, columna, localStorage ni env dice 'esta instalacion es la caja X'. | Es el prerequisito de TODO lo demas (numeracion por caja, rango NCF por caja, corte por caja). Necesita migracion 11 o una tabla `instalacion` de una sola fila. |
| repo | `numero_interno` se calcula con `SELECT MAX(numero_interno)+1 FROM factura`, sin prefijo de caja y sin UNIQUE. | Dos cajas emiten factura numero 1, numero 2, numero 3... El numero sale impreso en el recibo y en el nombre del PDF (Ventas.tsx:995). Es el primer sintoma visible que va a reportar el cliente. |
| repo | `secuencia_ncf` no tiene `caja_id` y `consumirSiguiente` hace SELECT y luego UPDATE sin transaccion ni WHERE de version (compare-and-swap). | CRITICO Y SANCIONABLE FISCALMENTE. Con bases separadas cada caja tiene su propio proximo_numero y ambas emiten E32 0000000001. Aunque se compartiera la base, el read-then-write sin CAS duplica bajo concurrencia. Es el hueco numero uno a cerrar. |
| repo | `SqlDriver` no expone transaccion ni batch, y no hay un solo BEGIN/COMMIT en todo el repo (grep sobre core/web/desktop/ui: cero coincidencias). | Sin una primitiva de transaccion no se puede hacer atomico 'consumir NCF + crear comprobante', ni 'descontar existencia de N lineas'. Agregar el metodo a la interfaz obliga a implementarlo en los 3 drivers (node, sql.js, tauri). |
| repo | `descontarExistenciaPorVenta` lee `producto.existencia` y escribe el valor calculado (read-modify-write), en vez de `UPDATE producto SET existencia = existencia - ?`. | Con dos cajas vendiendo el mismo producto a la vez, la segunda escritura pisa la primera y se pierde un descuento. Es inventario fantasma. El fix es reescribir el UPDATE como delta relativo. |
| repo | `calcularResumen` del corte agrega TODAS las facturas cobradas del periodo, sin filtro por caja ni por usuario. | El cliente pidio 'corte por caja'. Hoy cada cajero cerraria contra el total del negocio completo, incluyendo el efectivo que tiene fisicamente la otra caja. El arqueo no cuadraria nunca. |
| repo | Las 5 consultas de `reportes-repo.ts` (ventasPorDia, productosMasVendidos, resumenGanancia, resumenItbis, ventasPorMetodoPago) tampoco aceptan caja ni usuario. | Sin esto no se puede responder 'cuanto vendio el cajero Juan' ni 'cuanto vendio la caja 2', que es lo primero que se pide al tener multi-caja. |
| repo | `listarAbiertos()` devuelve todos los tickets abiertos sin filtrar por caja. | En cuanto la base se comparta (cualquiera de las 3 opciones), la caja 2 ve y puede cobrar el ticket a medio armar de la caja 1. Es un bug de negocio inmediato, no una mejora. |
| esquema | `schema.sql` cubre solo las migraciones 1-6: le faltan devolucion, devolucion_linea, promocion, producto.favorito, cotizacion y cotizacion_linea. | Si se elige (a) o (b), el Postgres arranca sin 5 tablas y sin una columna que el codigo cliente usa. Son ~150 lineas de SQL que hay que escribir y mantener sincronizadas a mano con migrations.ts. |
| api | `sync-rules.yaml` lista 18 tablas y tampoco incluye devolucion, devolucion_linea, promocion, cotizacion ni cotizacion_linea. | Con PowerSync esas tablas simplemente no se sincronizarian, en silencio. Refuerza que (b) hoy no esta listo. |
| api | @sfr/api no tiene ninguna ruta de datos: solo /health, /fiscal/transmitir (501) y /chatbot. No hay CRUD, ni endpoint de consumo de NCF, ni nada que hable con una base. | Para la opcion (c) hay que crear la ruta que ejecuta el SqlDriver del servidor (o endpoints por caso de uso) mas el arranque de migrate() en el servidor. Es el grueso del trabajo de esa opcion. |
| api | `auth.ts` no valida nada: sin Supabase todo pasa como 'dev-local' (auth.ts:41-44); con Supabase responde 501. | Cualquier opcion que ponga datos en red necesita autenticacion real. Para (c) en LAN alcanza con un token por caja emitido por el servidor; para (a)/(b) hay que implementar supabase.auth.getUser. |
| repo | No hay restauracion de respaldo: backup-repo solo tiene `exportarTodo`, no `importar`. | Al activar multi-caja hay que consolidar los datos de las instalaciones existentes en una sola base. Sin importador eso es trabajo manual con SQL a mano. |
| ui | Ni el AppShell ni el recibo impreso muestran caja o cajero (grep de 'caja'/'cajero' sobre packages/ui/src/impresion/: cero coincidencias). | Requisito practico y de auditoria: el ticket tiene que decir quien cobro y en cual caja. Ademas el operador necesita ver en pantalla en cual caja esta parado antes de cobrar. |
| ui | `MODULOS` esta hardcoded en AppShell.tsx:28-31 y todos los modulos son siempre visibles; no hay ningun punto donde colgar permisos por rol. | Si hay cajeros, el cajero no deberia ver Configuracion (donde se editan secuencias NCF y se exporta toda la base). Filtrar MODULOS por rol requiere tocar el shell y los atajos Alt+1..Alt+9 que se derivan del mismo array (AppShell.tsx:64-66). |

## Enfoque recomendado

Opcion (c): caja-servidor en LAN, construida en cuatro etapas donde las TRES PRIMERAS valen por si solas en modo 100% local y no requieren red. La razon tecnica es el seam: `SqlDriver` (packages/core/src/db/driver.ts:11) tiene solo exec/run/all/get y se inyecta en un unico punto (`ProveedorDatos db={driver}`, packages/ui/src/data/contexto.tsx:60), asi que un `crearSqlDriverRemoto(baseUrl)` que implemente esa misma interfaz contra @sfr/api convierte cualquier instalacion en cliente sin tocar las 19 repos ni las 9 pantallas: toda la logica de negocio sigue viviendo en core y se ejecuta en el servidor. Cero costo mensual, sin internet, y el modo local se elige en main.tsx.

Pero antes del driver remoto hay que cerrar tres agujeros que HOY ya estan rotos y que cualquiera de las tres opciones (a/b/c) heredaria igual: (1) `numero_interno` = SELECT MAX+1 global (factura-repo.ts:172) colisiona apenas haya dos cajas; (2) `consumirSiguiente` (secuencia-ncf-repo.ts:120) es read-then-write sobre una secuencia que ademas no tiene dueño, de modo que dos instalaciones emiten el MISMO NCF con certeza matematica, no por carrera: es el riesgo fiscal sancionable y es el primero a cerrar; (3) `descontarExistenciaPorVenta` (factura-repo.ts:138) lee y escribe el valor calculado en vez de aplicar un delta relativo, asi que la segunda venta concurrente pisa a la primera.

Decisiones de diseño que sostienen todo el plan: IDENTIDAD DE INSTALACION como una tabla `instalacion` de una sola fila (CHECK id='instalacion-local'), no localStorage ni env, porque tiene que viajar con la base y ser legible desde los repos (la validacion no puede vivir en el front). NUMERACION por caja con prefijo persistido (`caja.prefijo` + `factura.prefijo_caja`, se imprime C1-000123) respaldada por UNIQUE(caja_id, numero_interno) parcial: el indice es la garantia real, no la aritmetica. NCF por RANGOS DISJUNTOS por caja, no secuencia centralizada: es la unica politica que deja a la caja seguir facturando con NCF cuando se cae la red o se apaga el servidor, que es exactamente lo que el codigo ya asume (cobro-fiscal.ts:111 aborta el cobro completo si no hay conexion), y sigue siendo correcta si mañana se centraliza. RESOLUCION DE LA CAJA EN EL REPO, no en la UI: `abrirTicket` lee `instalacion.caja_id` cuando el llamador no pasa caja, de modo que una pantalla que se olvide de pasarla no puede generar una colision.

Ninguna tarea de este plan rompe una instalacion que hoy corre sola: sin fila en `instalacion` el comportamiento es identico al actual (caja_id null, numeracion global, secuencia compartida). El modo multi-caja se activa el dia que el operador elige una caja.

### Alternativas descartadas

- (a) Supabase/Postgres en la nube como base unica: obliga a reescribir en SQL de Postgres las 5 consultas de reportes-repo y el corte (hoy usan date() y agregados de SQLite), depende de internet para COBRAR (un colmado sin internet deja de vender), tiene costo mensual, y arranca roto porque packages/api/db/schema.sql cubre solo las migraciones 1-6: le faltan devolucion, devolucion_linea, promocion, cotizacion, cotizacion_linea y producto.favorito.
- (b) PowerSync offline-first sobre el esquema actual: su modelo es last-write-wins sobre updated_at, que es precisamente lo que NO se puede aplicar a secuencia_ncf.proximo_numero (duplicaria NCF) ni a producto.existencia (perderia descuentos). Ademas sync-rules.yaml lista 18 tablas y omite en silencio las 5 que faltan, y suma costo mensual. Es el peor camino AHORA; queda viable despues de que existan rangos NCF disjuntos y existencia por delta.
- Secuencia NCF unica y centralizada que se pide al servidor en cada venta fiscal: desperdicia menos numeros, pero convierte al servidor en punto unico de falla para facturar. Si se apaga la PC que hace de servidor, ninguna caja puede emitir NCF. Con rangos disjuntos cada caja sigue emitiendo sola. Confirmar con el contable antes de cerrar la decision.
- Resolver la unicidad de NCF o de numero_interno con un TRIGGER de SQLite: el driver de escritorio parte el SQL por ';' con un split ingenuo (packages/desktop/src/db/tauri-sql-driver.ts:17-22), asi que un TRIGGER (BEGIN ... ; ... END;) se rompe SOLO en Tauri y pasa verde en los tests, que usan node:sqlite. Toda garantia de unicidad tiene que ser un UNIQUE INDEX (un solo statement) o logica en el repo.
- Mantener un unico contador global de numero_interno compartido entre cajas (via servidor): funciona solo mientras haya red, y deja de funcionar en el primer corte de conexion, justo cuando la caja mas necesita seguir vendiendo. El prefijo por caja es offline-safe por construccion.
- Que una instalacion PWA haga de caja servidor: la base de la PWA es una copia en memoria volcada a IndexedDB con debounce de 150 ms (packages/web/src/db/sqljs-driver.ts:60-72); dos pestañas ya son dos copias independientes. La caja servidor tiene que ser el proceso Node de @sfr/api o una instalacion Tauri, nunca la web.
- Agregar ahora un metodo transaccion() a SqlDriver para hacer atomico 'consumir NCF + crear comprobante': obliga a implementarlo en los tres drivers (node:sqlite, sql.js/WASM, tauri) y sql.js no da transacciones utiles si la persistencia real es un dump a IndexedDB. Se difiere a un trabajo de plataforma; mientras tanto el incremento atomico (SET proximo_numero = proximo_numero + 1) mas el UNIQUE INDEX ux_comprobante_fiscal_ncf cubren el caso real.
- Actualizar ya schema.sql y sync-rules.yaml para dejarlos al dia: son artefactos de las opciones (a) y (b), que quedan descartadas en esta ronda. Mantenerlos a mano en paralelo con migrations.ts es deuda que no se paga sola; se retoman el dia que se decida ir a la nube.

## Trampas especificas de esta area

- El driver de Tauri parte el SQL por `;` con un split ingenuo (packages/desktop/src/db/tauri-sql-driver.ts:17-22). Cualquier migracion nueva que use un TRIGGER (`BEGIN ... ; ... END;`) o que tenga un `;` dentro de un literal de texto se rompe SOLO en escritorio y pasa verde en los tests (que usan node:sqlite, que si acepta lotes). Hoy no hay ningun TRIGGER en el repo. Consecuencia directa: NO se puede resolver la unicidad de NCF con un trigger de base de datos; tiene que ser un UNIQUE INDEX (esos si son un statement solo) o logica en el repo.
- No existe ninguna transaccion en el codigo: `SqlDriver` solo tiene exec/run/all/get (driver.ts:11-22) y el grep de BEGIN/COMMIT/ROLLBACK sobre core, web, desktop y ui no devuelve nada. `cobrarConFiscal` consume el NCF (secuencia-ncf-repo.ts:129) y DESPUES transmite y crea el comprobante (cobro-fiscal.ts:95-146): si el proceso muere en medio, el NCF queda consumido sin comprobante. Añadir un metodo `transaccion()` a la interfaz obliga a implementarlo en los tres drivers y sql.js/WASM no da transacciones utiles si la persistencia real es un dump a IndexedDB.
- `seed()` usa IDs FIJOS y corre en cada arranque de cada instalacion (seed.ts:21-143, invocado en web/src/main.tsx:30 y desktop/src/main.tsx:30): 'negocio-demo', 'usuario-admin', 'caja-1', 'prod-arroz', 'cli-demo', 'fac-demo' con numero_interno=1. Al unir dos instalaciones reales, las dos creen ser 'caja-1' y las dos tienen la factura 'fac-demo'. Hay que generar la caja con newId() y/o excluir las filas demo de cualquier consolidacion — y tener presente que `seed` corta apenas encuentra un negocio (seed.ts:10-11), asi que una base ya sembrada no se corrige sola.
- La base de la PWA es una copia en MEMORIA que se vuelca a IndexedDB con debounce de 150 ms (sqljs-driver.ts:60-72). Dos pestañas de la misma PWA = dos copias independientes y la ultima en persistir pisa a la otra. Corolario: una PWA jamas puede ser la 'caja servidor' de la opcion (c), y ninguna caja puede ser web si comparte disco logico con otra.
- `migrate()` no corre dentro de una transaccion (migrator.ts:24-30). Si una migracion multi-statement falla a mitad en Tauri (donde los statements se ejecutan uno por uno), la base queda a medio migrar y `_migracion` sin el registro: el siguiente arranque reintenta desde el primer statement y muere con 'table already exists', dejando la instalacion inarrancable. Al escribir la migracion 11 hay que asumir que se aplica sobre bases de clientes reales y que no hay rollback.
- La PWA servida por HTTPS no puede hacer fetch a `http://192.168.x.x:3001` (contenido mixto, bloqueado sin error visible). El precedente existente (chatbotCliente.ts:8) apunta a `http://localhost:3001`, que si es contexto seguro y por eso funciona hoy. Para la opcion (c) con IP de LAN: o se sirve la PWA por HTTP plano, o hay que poner TLS en la caja servidor. En Tauri el capability actual solo trae core:default, sql:default y sql:allow-execute (capabilities/default.json:6-10) — no esta el plugin http; habria que usar el fetch del WebView (csp esta en null, tauri.conf.json:22) o añadir el plugin y su permiso.
- `agregarLinea` dispara `verificarDisponibilidad`, que hace DOS consultas (negocio + producto) por cada linea agregada (factura-repo.ts:99-120), y `recalcularTotales` relee todas las lineas despues de cada cambio (factura-repo.ts:151-167). Con un driver HTTP ingenuo eso son varios round-trips por cada beep del escaner de codigo de barra: la venta se vuelve inusable. Un driver remoto necesita o cache local de catalogo o endpoints por caso de uso (agregarLinea completo en una llamada) en vez de proxyear SQL crudo.
- `ux_producto_codigo_barra` es un indice unico PARCIAL (`WHERE codigo_barra IS NOT NULL AND deleted_at IS NULL`, migrations.ts:99-100). Dos cajas que creen offline el mismo producto generan dos UUID distintos con el mismo codigo de barra; al consolidar, ese indice rechaza la segunda fila y la consolidacion falla a mitad. Mismo problema, pero fiscal, con `ux_comprobante_fiscal_ncf` (migrations.ts:219).
- `Ventas.tsx:283-287` abre un ticket automaticamente si `listarAbiertos()` viene vacio, y `listarAbiertos()` no filtra por caja (factura-repo.ts:212-218). Apenas la base se comparta, la caja 2 ve los tickets a medio armar de la caja 1 en su barra de tickets y puede cobrarlos. Hay que añadir el filtro por caja ANTES de compartir la base, no despues.
- `numero_interno` no es solo un dato interno: sale impreso en el recibo y define el nombre del PDF (`Factura-${factura.numero_interno}.pdf`, Ventas.tsx:995). Cambiarlo a prefijo por caja (C1-000123) cambia lo que el cliente ve en el papel y lo que el contable ya tiene archivado. Es una decision de negocio, no una decision tecnica.
- @sfr/ui no tiene ninguna dependencia HTTP y el unico fetch del repo vive en data/chatbotCliente.ts, con su propio BASE_URL y su propio manejo de errores. CLAUDE.md §1 exige un ApiClient centralizado: si se elige (c), hay que crear ese ApiClient en packages/ui/src/data/ y migrar chatbotCliente a el en el mismo paso, no despues.
- La politica fiscal actual es 'sin conexion no se emite NCF': si el proveedor fiscal falla, se aborta todo el cobro (cobro-fiscal.ts:111-118) y el NCF ya fue consumido unas lineas antes (linea 95), quedando quemado. Esa politica es hoy inofensiva porque `crearProveedorFiscalSimulado()` nunca falla (contexto.tsx:80), pero define la respuesta a 'que pasa si se cae la red': con rangos NCF disjuntos por caja la caja sigue emitiendo offline, con secuencia centralizada la caja se detiene. Elegir rangos disjuntos preserva el comportamiento offline que el codigo ya asume.

## Preguntas para el dueno del negocio

- Cuantas cajas y donde estan fisicamente: 2-3 en el mismo local con la misma red WiFi, o sucursales separadas? Si es un solo local, la caja-servidor en LAN (opcion c) resuelve todo sin costo mensual. Si son sucursales, no queda mas remedio que nube.
- Como quiere que se vea el numero de factura con varias cajas: prefijo por caja (C1-000123, C2-000456) o un rango de numeros asignado a cada caja (caja 1: del 1 al 50000, caja 2: del 50001 en adelante)? Esto cambia lo que sale IMPRESO en el recibo y lo que el contable ya tiene archivado.
- NCF: prefiere asignar a cada caja su propio rango autorizado (ej. caja 1 del 1 al 500, caja 2 del 501 al 1000) o una sola secuencia compartida que pida el numero al servidor en cada venta fiscal? Los rangos separados siguen funcionando si se cae la red; la secuencia compartida no, pero desperdicia menos numeros. Conviene confirmarlo con el contable.
- Que debe hacer una caja cuando se cae la red o se apaga el servidor: (1) seguir vendiendo normal pero sin poder emitir NCF, (2) seguir vendiendo con NCF usando su propio rango, o (3) detenerse hasta que vuelva? Hoy el codigo aborta el cobro completo si el proveedor fiscal falla.
- El corte de caja debe pasar a ser por caja y por turno (con apertura real, fondo inicial, entradas y salidas de efectivo y arqueo), o sigue siendo un reporte de periodo del negocio completo como hoy? Es una diferencia grande de alcance.
- Login: el cajero se identifica una vez al abrir su turno, o hay que pedir PIN en cada venta / en cada accion sensible (anular, dar descuento, abrir gaveta)?
- Que puede y que no puede hacer un cajero? En particular: deberia ver la pantalla de Configuracion, donde se editan las secuencias NCF y se exporta la base completa del negocio?
- Hay presupuesto para un costo mensual fijo (Supabase + PowerSync), o la prioridad es cero costo recurrente? Esto decide (a)/(b) contra (c).
- Las instalaciones que ya estan en uso hoy tienen datos reales de ventas que haya que consolidar en una sola base al activar multi-caja, o se puede partir de cero eligiendo una de ellas como la buena?
- Quien queda como 'la caja servidor' si se va por LAN: hay una computadora que siempre este encendida durante el horario, y que pasa cuando esa maquina se apaga o se reinicia?

## Tareas

### MULTICAJA-01 — Migracion 11: identidad de instalacion, prefijo de caja y columnas para NCF por caja

**Objetivo.** La base puede decir que caja es esta instalacion y el esquema admite numeracion y secuencias NCF por caja, sin cambiar en nada el comportamiento de una instalacion que hoy corre sola.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| S | medio: se aplica sobre bases de clientes reales y migrate() no corre en transaccion, asi que un statement invalido en Tauri deja la instalacion inarrancable; se mitiga prohibiendo triggers y backfills. | nada |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Crea CREATE UNIQUE INDEX ux_factura_caja_numero sobre datos de produccion dentro de una migracion que no corre en transaccion. Si alguna instalacion tiene un numero_interno repetido para la misma caja (una carrera pasada, una restauracion, un merge manual), el CREATE INDEX falla, la migracion no se registra, y la app queda inarrancable en cada arranque — el modo de falla que el propio plan declara como riesgo maximo.
>   **Arreglo.** Anteponer en la misma migracion un UPDATE de saneamiento determinista que reasigne numeros duplicados, o crear primero un indice NO unico y promoverlo a unico en una migracion posterior una vez verificado por telemetria. Anadir como prueba: 'sembrar dos facturas con (caja_id, numero_interno) repetido, correr migrate() y comprobar que no lanza'.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en español: nombres de archivo, tipos, columnas SQL y textos de UI). Reglas del proyecto: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), nada de `any`, TDD rojo-verde-refactor con vitest, la validacion de negocio vive en core.

TAREA: agregar la migracion id 11 al array `migrations` de packages/core/src/db/migrations.ts. Los ids 1..10 ya estan usados (grep 'id: ' en ese archivo); imita exactamente el estilo de la migracion id 10 ('cotizaciones', al final del archivo): objeto { id, nombre, sql } con el SQL en un template literal marcado /* sql */.

SQL exacto a aplicar (esta en el campo migracionSql de esta tarea, copialo tal cual). Crea la tabla `instalacion` (una sola fila, forzada por CHECK (id = 'instalacion-local')), agrega `caja.prefijo`, `factura.prefijo_caja`, `cotizacion.caja_id`, `cotizacion.prefijo_caja`, `secuencia_ncf.caja_id`, y los indices, incluido el UNIQUE parcial ux_factura_caja_numero ON factura(caja_id, numero_interno) WHERE deleted_at IS NULL.

RESTRICCIONES DURAS, no negociables:
1. PROHIBIDO usar TRIGGER. El driver de escritorio parte el SQL por ';' con un split ingenuo (packages/desktop/src/db/tauri-sql-driver.ts:17-22), asi que un TRIGGER se rompe SOLO en Tauri y los tests (que usan node:sqlite) pasan verde igual. Cada statement de la migracion tiene que ser autocontenido y terminar en un unico ';'.
2. PROHIBIDO un ';' dentro de un literal de texto o de un comentario SQL, por la misma razon.
3. En SQLite, ALTER TABLE ADD COLUMN con REFERENCES solo es legal si la columna es nullable y sin DEFAULT. Respetalo.
4. La migracion se aplica sobre bases de clientes REALES y `migrate()` no corre en transaccion (packages/core/src/db/migrator.ts:24-30): si falla a la mitad la instalacion queda inarrancable. Nada de DROP, nada de recrear tablas, nada de backfills que puedan violar una restriccion.
5. NO cambies el comportamiento actual: sin fila en `instalacion`, todo sigue igual que hoy. NO insertes la fila de `instalacion` en la migracion ni en el seed.

Seed (packages/core/src/db/seed.ts): solo si hace falta para que los tests existentes sigan pasando; el seed ya crea la caja con id fijo 'caja-1'. Si le agregas el prefijo, usa 'C1'. No toques el resto del seed.

Tests: escribe PRIMERO los casos en packages/core/test/migrations.test.ts (ya existe, imita su estilo y su helper de creacion de base con createNodeSqliteDriver de packages/core/src/db/drivers/node-sqlite.ts). Corre con: pnpm --filter @sfr/core test

NO TOCAR: ninguna repo de packages/core/src/repos/, ningun archivo de packages/ui/, packages/web/, packages/desktop/, packages/api/db/schema.sql ni packages/api/sync-rules.yaml (estan 4 migraciones atrasados a proposito y no son de esta tarea). No crees pantallas. No agregues tipos a packages/core/src/repos/tipos.ts: eso es MULTICAJA-02.
```

#### SQL de la migracion

```sql
CREATE TABLE instalacion (
  id          TEXT PRIMARY KEY CHECK (id = 'instalacion-local'),
  caja_id     TEXT REFERENCES caja(id),
  alias       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
ALTER TABLE caja ADD COLUMN prefijo TEXT;
ALTER TABLE factura ADD COLUMN prefijo_caja TEXT;
CREATE UNIQUE INDEX ux_factura_caja_numero ON factura(caja_id, numero_interno) WHERE deleted_at IS NULL;
CREATE INDEX ix_factura_caja_estado ON factura(caja_id, estado);
ALTER TABLE cotizacion ADD COLUMN caja_id TEXT REFERENCES caja(id);
ALTER TABLE cotizacion ADD COLUMN prefijo_caja TEXT;
CREATE UNIQUE INDEX ux_cotizacion_caja_numero ON cotizacion(caja_id, numero_interno) WHERE deleted_at IS NULL;
ALTER TABLE secuencia_ncf ADD COLUMN caja_id TEXT REFERENCES caja(id);
CREATE INDEX ix_secuencia_ncf_caja ON secuencia_ncf(caja_id, tipo_ecf);
```

#### Archivos a tocar

- `packages/core/src/db/migrations.ts`
- `packages/core/src/db/seed.ts`
- `packages/core/test/migrations.test.ts`

#### Criterios de aceptacion

- [ ] El array `migrations` tiene un elemento con id 11 y nombre en español; `migrate()` lo aplica y lo registra en `_migracion`.
- [ ] Correr `migrate()` dos veces seguidas sobre la misma base no lanza (idempotencia ya garantizada por el migrador, hay que no romperla).
- [ ] La migracion 11 no contiene la palabra TRIGGER ni un ';' dentro de ningun literal ni comentario: cada statement es ejecutable de a uno, como lo hace el driver de Tauri.
- [ ] Una base que ya tiene las migraciones 1..10 aplicadas y datos sembrados acepta la 11 sin error y sin perder filas.
- [ ] ux_factura_caja_numero rechaza dos facturas con la misma caja_id y el mismo numero_interno, y permite N facturas con caja_id NULL (comportamiento legado intacto).
- [ ] El seed sigue sin crear fila en `instalacion`: una instalacion recien migrada se comporta exactamente como hoy.
- [ ] pnpm --filter @sfr/core test en verde y pnpm -r typecheck limpio.

#### Pruebas a escribir primero (TDD)

- migrations.test.ts: tras migrate(), `SELECT id FROM _migracion` incluye 11.
- migrations.test.ts: PRAGMA table_info confirma caja.prefijo, factura.prefijo_caja, cotizacion.caja_id, cotizacion.prefijo_caja y secuencia_ncf.caja_id.
- migrations.test.ts: INSERT en `instalacion` con id distinto de 'instalacion-local' falla por el CHECK.
- migrations.test.ts: dos INSERT en factura con caja_id='caja-1' y numero_interno=1 -> el segundo lanza por ux_factura_caja_numero.
- migrations.test.ts: dos INSERT en factura con caja_id NULL y numeros 1 y 2 -> ambos pasan (NULL distinto en indice unico de SQLite).
- migrations.test.ts: aplicar a mano migrations.slice(0,10) con db.exec, correr seed(db) y recien entonces migrate(db) no lanza y registra la 11.
- migrations.test.ts: migrate(db) dos veces sobre la misma base no lanza.
- migrations.test.ts: ningun `sql` del array contiene la subcadena 'TRIGGER' (guardia contra la trampa del driver de Tauri).

---

### MULTICAJA-02 — Tipos Caja e Instalacion, caja-repo e instalacion-repo

**Objetivo.** Core puede listar y administrar cajas y fijar cual caja es esta instalacion, con toda la validacion del lado de los datos.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo: son dos repos nuevos y dos tipos nuevos, nada de codigo existente cambia de comportamiento. | MULTICAJA-01 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en español). Reglas: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), nada de `any`, TDD con vitest, la validacion vive en la repo (nunca solo en la UI).

CONTEXTO: la tabla `caja` existe desde la migracion 1 (packages/core/src/db/migrations.ts:58) y la tabla `instalacion` mas `caja.prefijo` los agrega la migracion 11 (tarea MULTICAJA-01, ya hecha). Hoy NO existe caja-repo.ts ni instalacion-repo.ts y `tipos.ts` no exporta ni Caja ni Instalacion.

TAREA:
1. packages/core/src/repos/tipos.ts: agrega `export interface Caja extends Auditoria { nombre: string; ubicacion: string | null; activa: number; prefijo: string | null; }` y `export interface Instalacion extends Auditoria { caja_id: string | null; alias: string | null; }`. Respeta el patron del archivo: campos con el nombre EXACTO de la columna SQL (snake_case), booleanos como number.
2. packages/core/src/repos/caja-repo.ts: `export function crearCajaRepo(db: SqlDriver)` con crear, listar (solo no borradas, ordenadas por nombre), listarActivas, obtener, actualizar y desactivar. Imita fielmente packages/core/src/repos/proveedor-repo.ts o producto-repo.ts: constante COLS, `newId()` y `now()` de ../ids.js, `ValidacionError` importada de ./producto-repo.js, funcion `validarCaja(input): ErrorValidacion[]` exportada igual que `validarProducto`, y `registrarAccion(db, {...})` de ./bitacora-repo.js en crear/actualizar/desactivar.
   Validaciones obligatorias en la repo: nombre requerido; prefijo requerido al crear, normalizado a mayusculas, de 1 a 6 caracteres [A-Z0-9-]; prefijo unico entre cajas no borradas; no se puede desactivar ni borrar la caja que esta asignada en `instalacion`.
3. packages/core/src/repos/instalacion-repo.ts: `export function crearInstalacionRepo(db: SqlDriver)` con `obtener(): Promise<Instalacion | undefined>`, `fijarCaja(cajaId: string, alias?: string | null): Promise<Instalacion>` (upsert de la unica fila con id 'instalacion-local'), `obtenerCajaActual(): Promise<Caja | undefined>` y `estaConfigurada(): Promise<boolean>`. `fijarCaja` valida que la caja exista, no este borrada y este activa; si no, lanza ValidacionError con mensaje en español. Registra la accion en bitacora.
4. packages/core/src/repos/index.ts: exporta crearCajaRepo, validarCaja, CajaInput, CajaRepo, crearInstalacionRepo, InstalacionRepo, siguiendo el estilo de los demas bloques export del archivo.
5. packages/ui/src/data/contexto.tsx: agrega `caja` e `instalacion` a la interfaz `Repos` y a `ProveedorDatos`, imitando las 18 entradas que ya estan. Es cableado mecanico: NO crees ninguna pantalla ni cambies ninguna existente.

Tests: escribe PRIMERO packages/core/test/caja-repo.test.ts y packages/core/test/instalacion-repo.test.ts. Imita packages/core/test/corte-caja-repo.test.ts (helper nuevaDb() con createNodeSqliteDriver + migrate). Corre: pnpm --filter @sfr/core test

NO TOCAR: factura-repo.ts, secuencia-ncf-repo.ts, corte-caja-repo.ts, reportes-repo.ts (son MULTICAJA-03, 04 y 05). No toques migrations.ts. No crees pantallas en packages/ui/src/pantallas/. No toques packages/web, packages/desktop ni packages/api.
```

#### Archivos a tocar

- `packages/core/src/repos/tipos.ts`
- `packages/core/src/repos/caja-repo.ts`
- `packages/core/src/repos/instalacion-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/ui/src/data/contexto.tsx`
- `packages/core/test/caja-repo.test.ts`
- `packages/core/test/instalacion-repo.test.ts`

#### Criterios de aceptacion

- [ ] `crearCajaRepo` y `crearInstalacionRepo` siguen el patron crearXxxRepo(db: SqlDriver) y se exportan desde @sfr/core.
- [ ] Toda la validacion (prefijo unico, formato de prefijo, caja activa, no desactivar la caja en uso) esta en la repo y lanza ValidacionError con mensaje en español; ningun chequeo queda reservado para la UI.
- [ ] `instalacion` nunca puede tener mas de una fila: fijarCaja hace upsert sobre id 'instalacion-local'.
- [ ] Los repos nuevos aparecen en `Repos` y en `ProveedorDatos` sin alterar ningun repo existente.
- [ ] Una base sin fila de instalacion devuelve undefined en obtener() y false en estaConfigurada(), sin lanzar.
- [ ] pnpm --filter @sfr/core test en verde y pnpm -r typecheck limpio.

#### Pruebas a escribir primero (TDD)

- caja-repo: crear devuelve la caja con id UUID, prefijo normalizado a mayusculas y activa=1.
- caja-repo: crear sin nombre lanza ValidacionError con campo 'nombre'.
- caja-repo: crear con prefijo 'c1' cuando ya existe una caja con prefijo 'C1' lanza ValidacionError por prefijo duplicado.
- caja-repo: crear con prefijo 'DEMASIADOLARGO' o con caracteres invalidos lanza ValidacionError.
- caja-repo: listar excluye las borradas (deleted_at) y listarActivas excluye activa=0.
- caja-repo: desactivar la caja asignada en instalacion lanza ValidacionError y la caja sigue activa.
- caja-repo: crear y actualizar dejan una linea en bitacora_accion.
- instalacion-repo: estaConfigurada() es false y obtener() devuelve undefined en una base recien migrada.
- instalacion-repo: fijarCaja con un id inexistente lanza ValidacionError y no crea fila.
- instalacion-repo: fijarCaja con una caja inactiva lanza ValidacionError.
- instalacion-repo: fijarCaja dos veces con cajas distintas deja UNA sola fila y obtenerCajaActual() devuelve la ultima.

---

### MULTICAJA-03 — factura-repo y cotizacion-repo seguros entre cajas: numeracion propia, tickets por caja y existencia por delta

**Objetivo.** Dos cajas pueden facturar contra la misma base sin repetir numeros, sin verse los tickets abiertos y sin pisarse el descuento de inventario.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | alto: cambia el numero que sale IMPRESO en el recibo y el nombre del PDF en cuanto se asigna una caja, y toca el camino de cobro y de inventario, que es el nucleo del producto. | MULTICAJA-01, MULTICAJA-02 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Cambia la numeracion a MAX(numero_interno) WHERE caja_id IS ?, pero en toda instalacion real las facturas historicas tienen caja_id NULL (abrirTicket nunca recibio caja). Al asignar caja por primera vez, el MAX de esa caja es NULL y la numeracion reinicia en 1 mientras ya existen facturas 1..N con caja_id NULL. El indice ux_factura_caja_numero no lo impide (NULL y 'caja-1' son distintos) y ConsultaFacturas.tsx:122 busca por numero_interno como texto: el colmadero tendra dos tickets #1. Ademas no hay reintento ante la colision del indice en la misma caja: abrirTicket lanzaria un error crudo de SQLite al cajero.
>   **Arreglo.** En instalacion-repo.fijarCaja, al asignar caja por primera vez, hacer backfill de factura.caja_id/prefijo_caja para las facturas historicas con caja_id NULL (hay una sola caja por definicion en ese momento) y arrancar la numeracion en MAX global + 1. Y envolver el INSERT de abrirTicket en un reintento acotado que recalcule el MAX ante violacion del indice unico, traduciendo el error a ValidacionError si se agotan los intentos.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en español). Reglas: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), nada de `any`, TDD con vitest, validacion en core.

CONTEXTO VERIFICADO (no lo revalides, construye sobre esto):
- packages/core/src/repos/factura-repo.ts:172 calcula `SELECT MAX(numero_interno) as max FROM factura` global: dos cajas emiten la factura 1, la 2, la 3. Mismo patron en packages/core/src/repos/cotizacion-repo.ts:81.
- `AbrirTicketInput` (factura-repo.ts:23) YA acepta caja_id/usuario_id y el INSERT ya los escribe, pero la UI nunca los pasa.
- factura-repo.ts:212 `listarAbiertos()` no filtra por caja, y `obtenerUltimaCobrada()` tampoco.
- factura-repo.ts:138 hace `const nuevaExistencia = (producto.existencia ?? 0) - l.cantidad` y luego `UPDATE producto SET existencia=?`: read-modify-write, se pierden descuentos concurrentes.
- La migracion 11 ya agrego `caja.prefijo`, `factura.prefijo_caja`, `cotizacion.caja_id`, `cotizacion.prefijo_caja` y el indice UNIQUE parcial ux_factura_caja_numero(caja_id, numero_interno).

TAREA:
1. Nuevo packages/core/src/dominio/numeracion.ts con `export function formatearNumeroFactura(prefijoCaja: string | null, numeroInterno: number): string`: con prefijo devuelve `C1-000123` (numero con padding a 6); sin prefijo devuelve el numero tal cual, sin padding, para no cambiar lo ya impreso en instalaciones de una sola caja. Exportalo desde packages/core/src/index.ts. Imita el estilo de packages/core/src/dominio/factura.ts (funciones puras, sin acceso a db).
2. factura-repo.ts `abrirTicket`: si `input.caja_id` es undefined, resuelve la caja leyendo `SELECT caja_id FROM instalacion LIMIT 1` (guardia del lado de los datos: una pantalla que se olvide de pasar la caja no puede generar colisiones). Con caja resuelta, el numero sale de `SELECT MAX(numero_interno) as max FROM factura WHERE caja_id IS ?` (SQLite acepta `IS ?`, es NULL-safe) y `prefijo_caja` sale de `SELECT prefijo FROM caja WHERE id=?`. Sin caja (caja_id null) el comportamiento queda IDENTICO al de hoy.
3. factura-repo.ts `listarAbiertos(opciones?: { cajaId?: string | null; todas?: boolean })`: por defecto filtra por la caja de la instalacion; con `{ todas: true }` devuelve todo (para vistas de administracion). Mismo criterio en `obtenerUltimaCobrada`.
4. factura-repo.ts `descontarExistenciaPorVenta`: reemplaza el read-modify-write por `UPDATE producto SET existencia = COALESCE(existencia, 0) - ?, updated_at = ? WHERE id = ?`. Sigue necesitando leer el costo para la fila de movimiento_inventario, pero la existencia ya no se recalcula en JS. Haz un grep de `SET existencia=` sobre packages/core/src/repos/ y convierte a delta relativo TODOS los que aparezcan (compra-repo.ts aplicarEfectosInventario, devolucion-repo.ts, movimiento-inventario-repo.ts si corresponde). No cambies ninguna otra regla de inventario: si negocio.inventario_activo no es 1, se sigue sin tocar existencia.
5. cotizacion-repo.ts: mismo tratamiento de numeracion por caja (caja_id + prefijo_caja + MAX por caja).

Tests: escribelos PRIMERO. Amplia packages/core/test/factura-repo.test.ts e packages/core/test/inventario-factura-repo.test.ts y crea packages/core/test/numeracion.test.ts. Para el caso de interleaving de existencia usa un decorador del SqlDriver: un objeto que implementa SqlDriver delegando en el real y que, la primera vez que ve un UPDATE sobre producto, ejecuta antes un `UPDATE producto SET existencia = existencia - 1 WHERE id=?` simulando a la otra caja; con delta relativo los dos descuentos sobreviven, con read-modify-write se pierde uno. Corre: pnpm --filter @sfr/core test

OJO (decision de negocio ya tomada, no la re-abras): el numero pasa a imprimirse como C1-000123 cuando hay caja asignada. Si no hay caja, se imprime como hoy.

NO TOCAR: secuencia-ncf-repo.ts ni packages/core/src/fiscal/ (es MULTICAJA-04). corte-caja-repo.ts ni reportes-repo.ts (es MULTICAJA-05). Ninguna pantalla de packages/ui/src/pantallas/ (es MULTICAJA-06): esta tarea cambia solo core y deja la UI funcionando igual porque los parametros nuevos son opcionales. No toques migrations.ts.
```

#### Archivos a tocar

- `packages/core/src/dominio/numeracion.ts`
- `packages/core/src/index.ts`
- `packages/core/src/repos/factura-repo.ts`
- `packages/core/src/repos/cotizacion-repo.ts`
- `packages/core/src/repos/compra-repo.ts`
- `packages/core/src/repos/devolucion-repo.ts`
- `packages/core/test/factura-repo.test.ts`
- `packages/core/test/inventario-factura-repo.test.ts`
- `packages/core/test/numeracion.test.ts`

#### Criterios de aceptacion

- [ ] abrirTicket resuelve la caja desde `instalacion` cuando el llamador no la pasa: la garantia no depende de que la UI se acuerde.
- [ ] Con dos cajas distintas, cada una numera desde 1 y el indice UNIQUE nunca se dispara; con una sola caja jamas se repite un numero.
- [ ] Sin fila en `instalacion`, abrirTicket produce exactamente el mismo resultado que antes de esta tarea (caja_id null, numero global +1, prefijo_caja null).
- [ ] listarAbiertos y obtenerUltimaCobrada no devuelven nada de otra caja salvo que se pida { todas: true }.
- [ ] Ningun UPDATE de existencia en packages/core/src/repos/ recalcula el valor en JS: todos aplican un delta relativo en SQL.
- [ ] formatearNumeroFactura es una funcion pura exportada desde @sfr/core y es la unica forma de armar el numero visible.
- [ ] Los tests existentes de factura-repo, inventario y cotizaciones siguen pasando sin cambios de expectativa (salvo los que verifican explicitamente lo viejo).
- [ ] pnpm --filter @sfr/core test en verde y pnpm -r typecheck limpio.

#### Pruebas a escribir primero (TDD)

- factura-repo: sin instalacion configurada, abrirTicket() da caja_id null y numero_interno = MAX global + 1 (regresion del comportamiento actual).
- factura-repo: con instalacion fijada en caja A, abrirTicket() sin argumentos escribe caja_id=A y prefijo_caja='C1'.
- factura-repo: abrir 10 tickets seguidos en la misma caja da numeros 1..10 sin repetir.
- factura-repo: caja A y caja B abren cada una su primer ticket; ambas obtienen numero_interno=1 y ningun INSERT falla por ux_factura_caja_numero.
- factura-repo: insertar a mano una factura duplicando (caja_id, numero_interno) lanza (el indice es la garantia real, no la aritmetica).
- factura-repo: con tickets abiertos en A y en B, listarAbiertos() desde la instalacion A devuelve solo los de A; con { todas: true } devuelve los cuatro.
- factura-repo: obtenerUltimaCobrada() no devuelve la ultima venta de la otra caja.
- inventario: decorador de SqlDriver que intercala un descuento de otra caja entre lectura y escritura -> existencia final refleja AMBOS descuentos (falla con read-modify-write, pasa con delta).
- inventario: con negocio.inventario_activo=0 la existencia no cambia (regresion).
- cotizacion-repo: dos cajas generan cada una su cotizacion numero 1 sin colisionar.
- numeracion: formatearNumeroFactura('C1', 123) === 'C1-000123'; formatearNumeroFactura(null, 123) === '123'.

---

### MULTICAJA-04 — NCF por caja: rangos disjuntos validados y consumo atomico del siguiente numero

**Objetivo.** Dos cajas nunca pueden emitir el mismo NCF, ni con bases separadas ni compartiendo una sola, y cada caja sigue emitiendo si se cae la red.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto: es el camino fiscal; un error aqui produce NCF duplicados, que son sancionables por la DGII. Exige tests de interleaving reales, no solo de camino feliz. | MULTICAJA-01, MULTICAJA-02, MULTICAJA-03 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Prescribe 'UPDATE secuencia_ncf SET proximo_numero = proximo_numero + 1 WHERE ... y despues relee la fila: el numero consumido es proximo_numero - 1', y al mismo tiempo exige un test con un decorador de SqlDriver que intercale un consumo ajeno ENTRE el UPDATE y la relectura. La implementacion prescrita falla ese test por construccion: dos consumidores concurrentes hacen 5->6->7 y ambos releen 7, ambos concluyen que les toco el 6. El NCF duplicado, que es el riesgo fiscal sancionable del proyecto, sobrevive.
>   **Arreglo.** Usar UPDATE ... RETURNING proximo_numero (SQLite >= 3.35, disponible en node:sqlite, sql.js 1.8+ y sqlx), leido con db.all(). Si se descarta RETURNING por compatibilidad, hacer compare-and-swap en bucle: leer n, UPDATE ... SET proximo_numero = n+1 WHERE id=? AND proximo_numero = n, releer y reintentar si no avanzo. run() no devuelve filas afectadas, asi que la relectura de confirmacion es obligatoria en ambos casos.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en español). Reglas: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), nada de `any`, TDD con vitest, validacion en core.

ESTO ES EL HUECO CRITICO Y FISCALMENTE SANCIONABLE DEL PRODUCTO. Leelo entero antes de escribir nada.

CONTEXTO VERIFICADO:
- packages/core/src/repos/secuencia-ncf-repo.ts:120 `consumirSiguiente` hace SELECT del proximo_numero y despues UPDATE con el valor calculado en JS, sin transaccion ni compare-and-swap.
- Cada instalacion tiene hoy su propia fila de secuencia, asi que dos cajas emiten E32 0000000001 las dos, con certeza, no por carrera.
- `consumirSiguiente` es el UNICO consumidor de numeros y tiene solo dos llamadores: packages/core/src/fiscal/cobro-fiscal.ts:95 y packages/core/src/fiscal/devolucion-fiscal.ts:61. Toda la politica cabe en ese metodo.
- La migracion 11 ya agrego `secuencia_ncf.caja_id` (nullable) y el indice ix_secuencia_ncf_caja.
- Ya existe UNIQUE INDEX ux_comprobante_fiscal_ncf sobre comprobante_fiscal(ncf) (migrations.ts:219): es la ultima linea de defensa y tiene que seguir siendo la ultima linea de defensa, no la primera.
- `SqlDriver` (packages/core/src/db/driver.ts:11) NO expone transacciones ni devuelve numero de filas afectadas: run() retorna void. Diseña con esa limitacion, NO agregues metodos a la interfaz (eso obliga a tocar los tres drivers y es trabajo de plataforma, fuera de alcance).

POLITICA ELEGIDA (no la re-abras): RANGOS DISJUNTOS POR CAJA, no secuencia centralizada. Es la unica que deja a la caja emitir NCF con la red caida, que es lo que el codigo ya asume (cobro-fiscal.ts:111-118 aborta el cobro completo si no hay conexion).

TAREA en packages/core/src/repos/secuencia-ncf-repo.ts:
1. `SecuenciaNcfInput` gana `cajaId?: string | null`. `crear` lo persiste en la columna caja_id y valida que la caja exista, no este borrada y este activa.
2. `crear` valida SOLAPAMIENTO: para el mismo tipo_ecf, el rango [rangoDesde, rangoHasta] no puede intersectar el de ninguna otra secuencia no borrada, sea de la caja que sea. Mensaje en español que nombre la secuencia en conflicto. Esta es la regla que impide fisicamente el NCF duplicado y va en la repo, nunca en la UI.
3. `obtenerVigente(tipoEcf, cajaId?)`: primero busca una secuencia disponible con caja_id = cajaId; si no hay, cae a una con caja_id IS NULL (secuencia compartida, que es lo que tienen hoy las instalaciones existentes); NUNCA devuelve la secuencia de otra caja. Mantiene el recalculo de estado vencida/agotada que ya hace.
4. `consumirSiguiente(secuenciaId)`: incremento atomico en SQL, `UPDATE secuencia_ncf SET proximo_numero = proximo_numero + 1, updated_at = ? WHERE id = ? AND proximo_numero <= rango_hasta`, y despues relee la fila: el numero consumido es `proximo_numero - 1`. Si la relectura muestra que no avanzo, lanza ValidacionError('La secuencia esta agotada.'). Deja el estado 'agotada' actualizado como hoy. Nada de calcular el siguiente numero en JS y escribirlo.
5. packages/core/src/fiscal/cobro-fiscal.ts y devolucion-fiscal.ts: pasa la caja a obtenerVigente tomandola de `factura.caja_id` (la factura ya sabe en que caja se abrio gracias a MULTICAJA-03; no agregues plumbing nuevo ni leas `instalacion` desde el flujo fiscal).
6. Cuando la transmision falla despues de haber consumido el numero, registra la accion en bitacora con `registrarAccion` (packages/core/src/repos/bitacora-repo.ts:35) dejando constancia del NCF quemado. No cambies la politica de abortar el cobro.

Tests: PRIMERO. Amplia packages/core/test/fiscal.test.ts y crea packages/core/test/secuencia-ncf-repo.test.ts. Para el consumo concurrente usa un decorador de SqlDriver que, entre el UPDATE y la relectura, ejecute un consumo 'de la otra caja'. Corre: pnpm --filter @sfr/core test

NO TOCAR: packages/core/src/db/driver.ts (no agregues transaccion()), migrations.ts, factura-repo.ts, corte-caja-repo.ts, reportes-repo.ts, ninguna pantalla de packages/ui/. La pantalla Configuracion sigue creando secuencias sin caja y tiene que seguir funcionando igual: el parametro cajaId es opcional.
```

#### Archivos a tocar

- `packages/core/src/repos/secuencia-ncf-repo.ts`
- `packages/core/src/fiscal/cobro-fiscal.ts`
- `packages/core/src/fiscal/devolucion-fiscal.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/test/secuencia-ncf-repo.test.ts`
- `packages/core/test/fiscal.test.ts`

#### Criterios de aceptacion

- [ ] Es imposible crear dos secuencias del mismo tipo_ecf con rangos que se solapan, aunque sean de cajas distintas: lo impide la repo con ValidacionError.
- [ ] consumirSiguiente no calcula el proximo numero en JavaScript: el incremento ocurre en un unico statement SQL sobre la propia columna.
- [ ] Dos consumos intercalados sobre la misma secuencia devuelven numeros DISTINTOS (con el codigo actual devuelven el mismo).
- [ ] obtenerVigente jamas devuelve una secuencia asignada a otra caja, y sigue cayendo a la secuencia sin caja para no romper instalaciones existentes.
- [ ] El flujo fiscal toma la caja de factura.caja_id: no hay parametro nuevo que la UI pueda olvidar.
- [ ] Una transmision fallida deja constancia en bitacora_accion del numero consumido.
- [ ] No se agrego ningun metodo a la interfaz SqlDriver.
- [ ] Todas las pruebas fiscales existentes siguen pasando; pnpm --filter @sfr/core test en verde y pnpm -r typecheck limpio.

#### Pruebas a escribir primero (TDD)

- secuencia-ncf-repo: crear rango 1-100 y luego 50-150 del mismo tipo lanza ValidacionError por solapamiento.
- secuencia-ncf-repo: crear 1-100 para caja A y 101-200 para caja B pasa; crear 100-200 para caja B lanza (el 100 se solapa).
- secuencia-ncf-repo: crear con cajaId inexistente o inactiva lanza ValidacionError.
- secuencia-ncf-repo: obtenerVigente(tipo, cajaB) no devuelve la secuencia de cajaA aunque sea la unica disponible.
- secuencia-ncf-repo: obtenerVigente(tipo, cajaA) devuelve la secuencia sin caja cuando A no tiene una propia.
- secuencia-ncf-repo: consumirSiguiente 5 veces devuelve 5 numeros distintos y consecutivos y deja proximo_numero coherente.
- secuencia-ncf-repo: decorador de SqlDriver que intercala un consumo de otra caja entre el UPDATE y la relectura -> los dos numeros devueltos son distintos.
- secuencia-ncf-repo: consumir el ultimo numero del rango marca estado 'agotada'; el consumo siguiente lanza ValidacionError y no mueve proximo_numero.
- fiscal: dos cajas con rangos disjuntos cobran con NCF y obtienen NCF distintos; el UNIQUE ux_comprobante_fiscal_ncf nunca se dispara.
- fiscal: con un proveedorFiscal que lanza, el cobro se aborta (comportamiento actual) y queda una linea en bitacora_accion mencionando el NCF consumido.

---

### MULTICAJA-05 — Corte de caja y reportes filtrados por caja y por usuario

**Objetivo.** Cada cajero cierra contra el efectivo de SU caja y los reportes pueden responder cuanto vendio cada caja y cada cajero.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio: son cambios de consulta con parametros opcionales, pero un WHERE mal armado altera en silencio cifras contables que el cliente ya usa. | MULTICAJA-01, MULTICAJA-02, MULTICAJA-03 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en español). Reglas: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), nada de `any`, TDD con vitest, validacion en core.

CONTEXTO VERIFICADO:
- packages/core/src/repos/corte-caja-repo.ts:47 `calcularResumen(desde, hasta)` agrega TODAS las facturas cobradas del periodo, sin filtro de caja ni de usuario. Hoy un cajero cerraria contra el efectivo del negocio completo, incluido el que tiene fisicamente la otra caja: el arqueo no cuadra nunca.
- `RegistrarCorteInput` (corte-caja-repo.ts:22) ya acepta cajaId/usuarioId y los persiste; la UI nunca los pasa.
- packages/core/src/repos/reportes-repo.ts tiene cinco consultas (ventasPorDia:49, productosMasVendidos:61, resumenGanancia:76, resumenItbis:111, ventasPorMetodoPago:126), ninguna acepta caja ni usuario.
- `factura.caja_id` y `factura.usuario_id` son columnas reales y desde MULTICAJA-03 vienen pobladas.

TAREA:
1. corte-caja-repo.ts: agrega `export interface FiltroCorte { cajaId?: string | null; usuarioId?: string | null }` y un tercer parametro OPCIONAL a `calcularResumen(desde, hasta, filtro?)`. Los dos SELECT (el agregado y el de pagos por metodo) suman `AND f.caja_id = ?` / `AND f.usuario_id = ?` solo cuando el filtro trae valor. Sin filtro, el resultado tiene que ser byte a byte el de hoy.
2. `registrarCorte`: si `input.cajaId` es undefined, resuelve la caja leyendo `SELECT caja_id FROM instalacion LIMIT 1` y pasa ese filtro a calcularResumen. Este es el guardia del lado de los datos: aunque la pantalla no mande nada, el corte no puede incluir ventas de otra caja.
3. `listar`/historial de cortes: acepta filtro opcional por caja.
4. reportes-repo.ts: agrega `export interface FiltroReporte { cajaId?: string | null; usuarioId?: string | null }` como ultimo parametro opcional de las cinco consultas, con el mismo criterio de no alterar el resultado sin filtro. Agrega ademas `ventasPorCaja(desde, hasta)` y `ventasPorUsuario(desde, hasta)` (JOIN a caja y a usuario para traer el nombre; agrupan cantidad de facturas y total). Exporta los tipos nuevos desde packages/core/src/repos/index.ts siguiendo el estilo del archivo.

Construye los WHERE dinamicos acumulando condiciones y parametros en arreglos tipados, como ya se hace en packages/core/src/repos/bitacora-repo.ts y en el filtro de facturas cobradas de factura-repo.ts. Nada de concatenar valores en el SQL: siempre parametros posicionales.

Tests: PRIMERO. Amplia packages/core/test/corte-caja-repo.test.ts y packages/core/test/reportes-repo.test.ts (ambos existen; imita su helper nuevaDb()). Corre: pnpm --filter @sfr/core test

NO TOCAR: secuencia-ncf-repo.ts ni packages/core/src/fiscal/. factura-repo.abrirTicket (ya quedo resuelto en MULTICAJA-03). Ninguna pantalla de packages/ui/src/pantallas/: los parametros nuevos son opcionales, asi que CorteCaja.tsx y Reportes.tsx compilan y funcionan sin cambios. La UI de filtros por caja en Reportes es trabajo posterior, no de esta tarea.
```

#### Archivos a tocar

- `packages/core/src/repos/corte-caja-repo.ts`
- `packages/core/src/repos/reportes-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/test/corte-caja-repo.test.ts`
- `packages/core/test/reportes-repo.test.ts`

#### Criterios de aceptacion

- [ ] registrarCorte sin cajaId explicito usa la caja de la instalacion: el aislamiento del arqueo no depende de la pantalla.
- [ ] calcularResumen y las cinco consultas de reportes devuelven exactamente lo mismo que hoy cuando no se pasa filtro (regresion cubierta por los tests existentes, que no deben modificarse).
- [ ] Existen ventasPorCaja y ventasPorUsuario devolviendo nombre, cantidad de facturas y total.
- [ ] Todos los filtros viajan como parametros posicionales; no hay interpolacion de valores en las cadenas SQL.
- [ ] El corte registrado guarda caja_id y usuario_id en la fila de corte_caja.
- [ ] pnpm --filter @sfr/core test en verde y pnpm -r typecheck limpio.

#### Pruebas a escribir primero (TDD)

- corte: ventas en caja A (100 efectivo) y caja B (50 efectivo); calcularResumen con filtro cajaId=A da totalEfectivo 100.
- corte: calcularResumen sin filtro sigue dando 150 (regresion del comportamiento actual).
- corte: con instalacion fijada en A, registrarCorte() sin cajaId calcula sobre A y guarda caja_id=A.
- corte: registrarCorte con usuarioId filtra tambien por usuario y lo persiste.
- corte: el historial filtrado por caja no devuelve cortes de la otra caja.
- reportes: ventasPorDia con filtro de caja excluye las ventas de la otra caja.
- reportes: resumenItbis y resumenGanancia con filtro de usuario responden solo por ese cajero.
- reportes: ventasPorCaja devuelve una fila por caja con el nombre de la caja y su total.
- reportes: ventasPorUsuario devuelve el nombre del usuario y su total; las ventas con usuario_id null no revientan la consulta.
- reportes: las cinco consultas sin filtro devuelven lo mismo que antes del cambio.

---

### MULTICAJA-06 — Identidad de caja en la aplicacion: seleccion, administracion, indicador en pantalla y en el recibo

**Objetivo.** El operador elige y ve en que caja esta parado, y el numero de factura, la caja y el cajero salen impresos en el ticket.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | medio: es la primera vez que el operador ve el cambio de numeracion en el papel; el riesgo real es de expectativa del cliente y del contable, no tecnico. | MULTICAJA-02, MULTICAJA-03, MULTICAJA-05, RBAC-02 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en español, UI compartida entre PWA y escritorio). Reglas del proyecto: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), nada de `any`, mobile-first (verificar a 375px, 768px y 1440px), PROHIBIDO usar emojis como iconos (se usa lucide-react, ya instalado), toques de al menos 44px.

ANTES DE ESCRIBIR UI: lee el DESIGN.md del repo y respeta sus tokens (espaciado base-8, escala de radios, tipografia, hex exactos). Invoca la skill frontend-design. Los estilos en este paquete son inline via packages/ui/src/estilos.ts (helpers `c` y `sombra`): usalos, no introduzcas CSS-in-JS ni una libreria de componentes.

CONTEXTO VERIFICADO:
- packages/ui/src/data/contexto.tsx ya expone los repos `caja` e `instalacion` (MULTICAJA-02).
- packages/core exporta `formatearNumeroFactura(prefijoCaja, numeroInterno)` (MULTICAJA-03): usala en TODO lugar donde hoy se muestre `factura.numero_interno`, incluido el nombre del PDF en packages/ui/src/pantallas/Ventas.tsx:995 (`Factura-${...}.pdf`).
- factura-repo ya resuelve la caja solo: NO agregues caja_id a las llamadas de Ventas.tsx:285 ni :440. Lo unico que la pantalla sigue debiendo pasar es usuario_id.
- packages/ui/src/AppShell.tsx tiene MODULOS hardcodeado (lineas 28-31) y los atajos Alt+1..Alt+9 se derivan del mismo arreglo (lineas 64-66): si tocas el arreglo, los atajos se recalculan solos.
- packages/ui/src/impresion/ no menciona caja ni cajero en ningun lado.

TAREA:
1. Nueva pantalla packages/ui/src/pantallas/SeleccionCaja.tsx: si `instalacion.estaConfigurada()` es false, AppShell la muestra ANTES de cualquier modulo. Lista las cajas activas, permite crear una nueva (nombre, ubicacion, prefijo) y fija la elegida con `instalacion.fijarCaja`. Al crear, el id sale de la repo (UUID): no reutilices ids fijos como 'caja-1', porque dos instalaciones con el mismo id se pisan al consolidar.
2. Seccion Cajas en packages/ui/src/pantallas/Configuracion.tsx: listar, crear, editar y desactivar cajas, mas un boton para cambiar la caja de esta instalacion (con confirmacion, porque cambia la numeracion del papel). Los errores de ValidacionError se muestran tal cual vienen de core; no repliques ninguna validacion en la pantalla.
3. AppShell.tsx: indicador permanente con el nombre de la caja actual (y el cajero cuando exista sesion), con icono de lucide-react. En telefono tiene que caber sin romper la barra ni el cajon.
4. Ventas.tsx y ConsultaFacturas.tsx: mostrar el numero con formatearNumeroFactura, incluido el nombre del PDF.
5. CorteCaja.tsx: mostrar de que caja es el corte que se esta cerrando. No hace falta pasar cajaId (la repo la resuelve), pero si el nombre de la caja en pantalla para que el cajero sepa que esta arqueando.
6. packages/ui/src/impresion/: agregar al ticket la linea de caja y cajero y el numero formateado. Manten el ancho de 58/80 mm que ya maneja el modulo.

SESION DE USUARIO: si la tarea RBAC-02 (login con PIN y sesion) ya esta, toma el usuario de ahi y pasalo como usuario_id en `abrirTicket` y en `registrarCorte`. Si todavia no esta, deja usuario_id en null, no inventes un mecanismo de sesion propio, y limita el alcance a la caja.

NO TOCAR: ninguna repo de packages/core/src/repos/ ni migrations.ts (si te falta un dato, es señal de que falta una tarea previa, no de que haya que consultar SQL desde la pantalla). No filtres MODULOS por rol (eso es RBAC). No toques packages/api/. Ningun fetch nuevo.

Fuera de alcance explicito, para una tarea posterior: el selector de caja dentro de la pantalla Reportes (core ya lo soporta desde MULTICAJA-05).
```

#### Archivos a tocar

- `packages/ui/src/pantallas/SeleccionCaja.tsx`
- `packages/ui/src/AppShell.tsx`
- `packages/ui/src/pantallas/Configuracion.tsx`
- `packages/ui/src/pantallas/Ventas.tsx`
- `packages/ui/src/pantallas/ConsultaFacturas.tsx`
- `packages/ui/src/pantallas/CorteCaja.tsx`
- `packages/ui/src/impresion/`
- `DESIGN.md`

#### Criterios de aceptacion

- [ ] Una instalacion sin caja configurada entra directo a la seleccion de caja y no deja operar Ventas hasta elegir una.
- [ ] Las cajas creadas desde la app usan id UUID de la repo; en ningun lado del codigo nuevo aparece el literal 'caja-1'.
- [ ] El nombre de la caja (y el cajero si hay sesion) se ve siempre en el AppShell, con icono de lucide-react, sin romper el layout a 375px.
- [ ] Todo numero de factura visible o impreso pasa por formatearNumeroFactura, incluido el nombre del PDF.
- [ ] El ticket impreso incluye caja y cajero, en 58 mm y en 80 mm.
- [ ] Ninguna regla de negocio nueva vive en la pantalla: las validaciones de prefijo, caja activa y caja en uso siguen viniendo de core como ValidacionError.
- [ ] DESIGN.md queda al dia con los componentes nuevos (indicador de caja, pantalla de seleccion).
- [ ] pnpm -r typecheck limpio y pnpm -r test en verde.

#### Pruebas a escribir primero (TDD)

- Con base recien migrada y sembrada (sin fila de instalacion), la app muestra la seleccion de caja y no la pantalla de Ventas.
- Crear una caja desde la seleccion con prefijo duplicado muestra el mensaje de error que viene de core y no crea la caja.
- Tras fijar la caja, recargar la app entra directo a Ventas y el indicador muestra el nombre de esa caja.
- Un ticket abierto despues de fijar la caja muestra el numero como C1-000001 en pantalla y el PDF se llama Factura-C1-000001.pdf.
- Una factura legada (caja_id null) sigue mostrandose con su numero sin prefijo, sin romper la lista de ConsultaFacturas.
- El ticket impreso a 58 mm y a 80 mm incluye las lineas de caja y cajero sin desbordar el ancho.
- A 375px el indicador de caja no empuja ni corta la navegacion; a 1440px sigue alineado.
- Desactivar desde Configuracion la caja asignada a esta instalacion muestra el error de core y la caja sigue activa.

---

### MULTICAJA-07 — Caja servidor en LAN: ApiClient centralizado, ruta de datos en @sfr/api y SqlDriver remoto

**Objetivo.** Varias cajas trabajan contra una sola base compartida en la red local eligiendo un driver remoto, y el modo 100% local sigue siendo el comportamiento por defecto, sin un solo fetch.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto: pone los datos en la red por primera vez, toca autenticacion y el arranque de los tres shells, y un driver HTTP ingenuo puede volver la venta inusable por latencia; por eso va ultimo y solo despues de que numeracion, NCF e inventario ya sean seguros entre cajas. | MULTICAJA-03, MULTICAJA-04, MULTICAJA-05 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en español). Reglas: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), nada de `any`, TDD con vitest, sin secretos hardcodeados (todo por .env, que va gitignorado), un fallo de red NUNCA puede tumbar la app entera.

CONTEXTO VERIFICADO:
- `SqlDriver` (packages/core/src/db/driver.ts:11) tiene solo exec/run/all/get (+close opcional). Es el seam: implementarlo contra HTTP convierte cualquier instalacion en cliente sin tocar las 19 repos ni las 9 pantallas.
- packages/ui/src/data/contexto.tsx:60 es el UNICO punto donde se inyecta el driver.
- packages/api/src/server.ts:20 ya levanta Fastify en 0.0.0.0 con CORS origin:true y bodyLimit 10MB. Solo tiene /health, /fiscal/transmitir (501 fijo) y /chatbot. packages/api/src/plugins/auth.ts:41-44 deja pasar todo como 'dev-local'.
- packages/core/src/db/drivers/node-sqlite.ts es el driver de Node que usan los tests: es el que debe correr en el servidor.
- packages/ui/src/data/chatbotCliente.ts:8 es el unico fetch del repo, con su propio BASE_URL desde VITE_API_URL y su propio manejo de error de red.

TAREA:
1. packages/ui/src/data/apiClient.ts: ApiClient centralizado (CLAUDE.md §1), con baseUrl por env, token en cabecera, timeout, y traduccion de fallos de red y de 400/401/403/404/500 a errores tipados en español. MIGRA chatbotCliente.ts a este cliente en el mismo paso; no pueden quedar dos clientes HTTP.
2. packages/core/src/db/drivers/http-remoto.ts: `export function crearSqlDriverRemoto(opciones: { baseUrl: string; token: string }): SqlDriver`. Implementa los cuatro metodos contra la API. Incluye un metodo de lote interno para no pagar un round-trip por statement donde se pueda agrupar. Exportalo desde packages/core/src/index.ts. Prohibido cambiar la interfaz SqlDriver.
3. packages/api/src/routes/datos.ts: rutas POST para consultar (all/get), ejecutar (run) y lote. Exigen token por caja; sin token valido devuelven 401. Registra en el log la caja que ejecuta.
4. packages/api/src/db/servidor.ts: crea el driver node-sqlite contra un archivo cuya ruta viene de .env, corre migrate() al arrancar y expone el driver a las rutas. El servidor NO debe correr seed() sobre una base con datos.
5. packages/api/src/plugins/auth.ts: token por caja (lista de tokens desde .env). Sin token configurado, el servidor arranca pero rechaza las rutas de datos y lo dice en el log: nada de dejar pasar todo como hoy.
6. packages/web/src/main.tsx y packages/desktop/src/main.tsx: si la variable de entorno del servidor NO esta definida, se usa el driver local EXACTAMENTE como hoy (mismo codigo, mismo orden migrate+seed). Si esta definida, se usa el driver remoto y NO se corre migrate() ni seed() en el cliente. La rama local es la de por defecto.
7. README de packages/api: como levantar la caja servidor, que maquina puede serlo y que pasa si se apaga.

TRAMPAS QUE TENES QUE RESPETAR (verificadas en este repo):
- Una PWA NUNCA puede ser la caja servidor: su base es una copia en memoria volcada a IndexedDB con debounce de 150 ms (packages/web/src/db/sqljs-driver.ts:60-72) y dos pestañas ya son dos copias. El servidor es el proceso Node de @sfr/api.
- Una PWA servida por HTTPS no puede hacer fetch a http://192.168.x.x (contenido mixto, bloqueado sin error visible). Documenta que la PWA se sirve por HTTP plano en la LAN o que el servidor lleva TLS.
- En Tauri el capability actual (packages/desktop/src-tauri/capabilities/default.json) trae solo core:default, sql:default y sql:allow-execute: el plugin http NO esta. Usa el fetch del WebView (csp esta en null) o agrega el plugin con su permiso, y dilo en el README.
- Round-trips: `agregarLinea` dispara `verificarDisponibilidad` con dos consultas por linea y `recalcularTotales` relee todas las lineas (factura-repo.ts:99-167). Con un driver HTTP ingenuo, cada beep del lector de codigo de barra se vuelve varios viajes y la venta se vuelve inusable. Mide esto con un test de conteo (abajo) y deja escrito el numero.

Tests: PRIMERO. packages/core/test/http-remoto.test.ts con un `fetch` simulado (nada de red real) y packages/api/test/datos.test.ts con app.inject de Fastify. Corre: pnpm --filter @sfr/core test y pnpm --filter @sfr/api test

NO TOCAR: ninguna repo de packages/core/src/repos/, migrations.ts, ni ninguna pantalla de packages/ui/src/pantallas/. Si una pantalla necesita cambiar para que esto funcione, el diseño esta mal: el driver remoto tiene que ser transparente.
```

#### Archivos a tocar

- `packages/ui/src/data/apiClient.ts`
- `packages/ui/src/data/chatbotCliente.ts`
- `packages/core/src/db/drivers/http-remoto.ts`
- `packages/core/src/index.ts`
- `packages/api/src/routes/datos.ts`
- `packages/api/src/db/servidor.ts`
- `packages/api/src/plugins/auth.ts`
- `packages/api/src/server.ts`
- `packages/api/src/config.ts`
- `packages/web/src/main.tsx`
- `packages/desktop/src/main.tsx`
- `packages/api/README.md`
- `packages/core/test/http-remoto.test.ts`
- `packages/api/test/datos.test.ts`

#### Criterios de aceptacion

- [ ] Sin la variable de entorno del servidor, la PWA y el escritorio se comportan exactamente como hoy y no emiten ni un solo fetch de datos.
- [ ] `crearSqlDriverRemoto` implementa SqlDriver sin agregar metodos a la interfaz, y ninguna repo ni pantalla cambia para soportarlo.
- [ ] Las rutas de datos exigen token por caja: sin token o con token invalido responden 401 y no tocan la base.
- [ ] El servidor corre migrate() al arrancar y no corre seed() sobre una base que ya tiene negocio.
- [ ] Existe un unico cliente HTTP en @sfr/ui (apiClient.ts) y chatbotCliente.ts pasa por el.
- [ ] Una caida de la red produce un error tipado con mensaje en español y degrada solo la operacion afectada; la app no queda en blanco.
- [ ] No hay ninguna URL ni token hardcodeado: todo por .env, con .env gitignorado.
- [ ] Esta medido y escrito en el README cuantos viajes de red cuesta agregar una linea a un ticket.
- [ ] pnpm -r test en verde y pnpm -r typecheck limpio.

#### Pruebas a escribir primero (TDD)

- http-remoto: all/get/run/exec arman la peticion esperada contra un fetch simulado y devuelven las filas tipadas.
- http-remoto: un fetch que rechaza produce un error tipado en español, no un TypeError crudo.
- http-remoto: una respuesta 401 y una 500 producen errores distinguibles.
- http-remoto: el driver remoto pasa la misma bateria de casos que ya cubre node-sqlite para una repo simple (crear y listar un producto) usando una API simulada montada sobre node-sqlite.
- conteo de round-trips: envolver un SqlDriver en un contador y afirmar que `agregarLinea` no supera el numero de llamadas acordado; el test falla si una refactorizacion futura lo empeora.
- api/datos: POST sin cabecera de token responde 401 y no ejecuta nada.
- api/datos: POST con token valido ejecuta un SELECT y devuelve las filas.
- api/datos: el endpoint de lote aplica N statements en una sola peticion.
- api: arrancar el servidor sobre un archivo nuevo aplica las 11 migraciones; arrancarlo dos veces no duplica datos.
- main de web y desktop: sin variable de entorno se construye el driver local (verificable con un test de la funcion de seleccion de driver, extraida a una funcion pura y testeable).

---
