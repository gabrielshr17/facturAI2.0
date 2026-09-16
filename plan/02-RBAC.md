# Usuarios, roles y permisos

> Punto 3 del pedido. 10 tareas: RBAC-01 a RBAC-10.
> Antes de despachar cualquier tarea de este archivo, lee [00-CONVENCIONES.md](./00-CONVENCIONES.md).

> [!IMPORTANT]
> **Los briefs de abajo dicen "migracion 11". Ignora ese numero.** Los escribieron ocho
> agentes en paralelo y los ocho reclamaron el id 11. La banda de ids de esta area es
> **`20-29`**; el reparto completo esta en
> [00-CONVENCIONES.md, seccion 2](./00-CONVENCIONES.md#2-reparto-de-ids-de-migracion-bandas).

> [!NOTE]
> **Decision 4 tomada: se mantiene la convencion real del repositorio.** Cabecera por archivo
> explicando el POR QUE de la decision no obvia, y cero comentarios inline decorativos. Donde
> algun brief de abajo diga "sin comentarios en el codigo", **esta superado por esta decision**.

## Estado actual

Hoy la app no tiene identidad de ningun tipo: arranca directo en Ventas (packages/ui/src/AppShell.tsx:51 `useState<Modulo>("Ventas")`) y los nueve modulos estan disponibles siempre para cualquiera. Lo unico que existe es infraestructura de datos SIN comportamiento: (a) la tabla `usuario` con TODAS las columnas necesarias ya creada en la migracion 1 (packages/core/src/db/migrations.ts:46-57 — id, nombre, rol TEXT DEFAULT 'admin' con comentario "admin | cajero", pin_hash TEXT nullable, activo, permisos_json TEXT, mas created_at/updated_at/deleted_at); (b) su traduccion a Postgres ya escrita (packages/api/db/schema.sql:33-42, permisos_json JSONB); (c) la fila semilla `usuario-admin` con rol 'admin' y pin_hash NULL (packages/core/src/db/seed.ts:38-41); (d) la columna `usuario_id` presente en cinco entidades (Factura tipos.ts:65, Cotizacion tipos.ts:135, CorteCaja tipos.ts:201, MovimientoInventario tipos.ts:229, BitacoraAccion tipos.ts:293) y aceptada como parametro opcional por cuatro repos. NO existe `usuario-repo.ts` ni `caja-repo.ts` (verificado con find sobre todo el repo), NO existe la interfaz `Usuario` ni `Caja` en packages/core/src/repos/tipos.ts (la lista completa de `export interface` va de Producto a Negocio y no las incluye), NO hay pantalla de login, NO hay contexto de sesion, NO hay ni una sola lectura o escritura de `permisos_json` en todo el codigo, y `grep -rn "usuarioId|usuario_id" packages/ui/src` devuelve CERO resultados: la UI nunca pasa el usuario a ningun repo, por lo que las ocho llamadas a `registrarAccion()` graban `usuario_id = NULL` y la bitacora de auditoria no puede decir quien hizo nada. La pantalla que la muestra (packages/ui/src/componentes/SeccionBitacora.tsx:42-64) ni siquiera tiene columna "Usuario". Peor para el caso de uso del cliente: desde la propia pantalla de Ventas cualquiera puede editar el precio y el costo de un producto (packages/ui/src/pantallas/Ventas.tsx:564 `abrirEdicionProducto`, :602 `productos.actualizar(...)`), que es exactamente lo que un cajero no deberia poder hacer.

### Lo que ya existe y NO hay que reescribir

| Pieza | Evidencia | Se reutiliza como |
| --- | --- | --- |
| Tabla `usuario` completa (id, nombre, rol, pin_hash, activo, permisos_json, auditoria) creada en la migracion 1 | `packages/core/src/db/migrations.ts:46-57` | No hace falta tabla nueva ni recrearla. `pin_hash` y `permisos_json` ya estan; solo falta escribirlos. La migracion 11 se limita a ALTER TABLE ADD COLUMN para lo que falte (ej. ultimo_acceso, intentos_fallidos, bloqueado_hasta). |
| Traduccion a Postgres de `usuario` ya escrita, con permisos_json JSONB | `packages/api/db/schema.sql:33-42` | Espejo obligatorio: cualquier columna que agregue la migracion 11 hay que replicarla aqui o la Fase 2 (sync) nace rota. |
| Fila semilla `usuario-admin` con rol 'admin', activo=1, pin_hash NULL | `packages/core/src/db/seed.ts:38-41` | Es el unico usuario existente en toda instalacion. Sirve como el DUENO inicial, pero hay que decidir su rol nuevo y forzarle un PIN en el primer arranque. |
| `usuario_id` ya existe en el esquema y en los tipos de factura, cotizacion, corte_caja, movimiento_inventario y bitacora_accion | `packages/core/src/repos/tipos.ts:65, :135, :201, :229, :293` | La trazabilidad ya esta modelada; solo falta llenarla. Ninguna migracion de columnas es necesaria para atribuir ventas a usuarios. |
| Puntos de entrada de los repos que YA aceptan el usuario como parametro opcional | `packages/core/src/repos/factura-repo.ts:25 (AbrirTicketInput.usuario_id), corte-caja-repo.ts:24 (RegistrarCorteInput.usuarioId), cotizacion-repo.ts:29, bitacora-repo.ts:12` | Son la superficie de conexion ya lista. Si la sesion se inyecta en `crearXxxRepo`, estos campos se pueden llenar por defecto desde adentro sin cambiar ninguna firma publica. |
| `registrarAccion(db, input)` compartida, append-only, llamada desde ocho sitios que son exactamente las acciones sensibles | `packages/core/src/repos/bitacora-repo.ts:35; llamadas en cliente-repo.ts:114, compra-repo.ts:163, corte-caja-repo.ts:138, devolucion-repo.ts:198, factura-repo.ts:386 y :435, producto-repo.ts:150 y :180, proveedor-repo.ts:77` | Es el inventario ya hecho de 'acciones que importan'. El conjunto de permisos granulares debe derivarse de esta lista real, no del plan. Cada una de las ocho es tambien el punto natural donde meter el guardia. |
| `ValidacionError` exportada desde producto-repo y compartida entre todos los repos | `packages/core/src/repos/producto-repo.ts:41-46` | Modelo exacto a copiar para un `PermisoError` (clase exportada desde un repo, importada por los demas, sin dependencia circular). La UI ya sabe atrapar errores de repo. |
| `ProveedorDatos` — un unico lugar donde se construyen los 18 repos y se inyecta el driver | `packages/ui/src/data/contexto.tsx:60-83` | Punto unico para inyectar la sesion a todos los repos de golpe. Un `ProveedorSesion` envuelve a este y le pasa el usuario activo. |
| `useAlertas()` con confirmar/avisar/elegir en zIndex 500 y `useModalAccesible` (trampa de foco + retorno de foco) | `packages/ui/src/contexto/Alertas.tsx:52 y :62; packages/ui/src/hooks/useModalAccesible.ts:19` | El modal de PIN y el de cambio rapido de usuario se construyen con esto, no desde cero. El teclado y el lector de pantalla ya estan resueltos. |
| `useAtajosTeclado(mapa, activo)` con soporte de Ctrl/Alt/Shift y desactivacion condicional | `packages/ui/src/hooks/useAtajosTeclado.ts:35` | Atajo de cambio rapido de usuario (ej. Ctrl+U) y bloqueo manual (ej. Ctrl+L). El flag `activo` sirve para apagar los atajos de pantalla mientras la app esta bloqueada. |
| `crypto.randomUUID()` usado directamente en core sin polyfill ni dependencia | `packages/core/src/ids.ts:7` | Prueba de que el objeto WebCrypto global esta disponible en los tres runtimes (sql.js/navegador, Tauri/webview, node:sqlite/tests). `crypto.subtle.deriveBits` con PBKDF2 es la unica via de hash viable sin agregar dependencias — core no tiene NINGUNA dependencia de runtime (packages/core/package.json). |
| `MODULOS` + `ICONO` + el switch de render en AppShell | `packages/ui/src/AppShell.tsx:28-31, :33-43, :190-198` | El filtrado de navegacion por rol se hace filtrando el array `MODULOS`; es un cambio de pocas lineas. Pero ver trampas: los Alt+N se generan por indice y el switch de render no consulta el rol. |
| Guia de diseno con tabla de capas zIndex y convenciones de teclado ya fijadas | `design-guidelines.md:133-146 (zIndex) y :267-288 (teclado)` | La pantalla de login/bloqueo y el modal de PIN entran con tokens y capas ya definidos; no hace falta un DESIGN.md nuevo, se extiende este (los atajos nuevos hay que documentarlos ahi). |

### Lo que falta

| Capa | Hueco | Por que importa |
| --- | --- | --- |
| repo | No existe `packages/core/src/repos/usuario-repo.ts` — ni CRUD, ni listar, ni activar/desactivar, ni cambiar PIN | Es la pieza base de todo lo demas. El cliente pide 'gestion de personal' para el DUENO y hoy no hay forma de crear un segundo usuario ni desde la UI ni desde codigo (fuera del seed). |
| dominio | No existe la interfaz `Usuario` en tipos.ts (ni `Caja`, ni `RolUsuario`, ni `Permiso`) | Todos los repos tipan sus filas contra tipos.ts. Sin `Usuario` no hay tipo de retorno para el repo ni forma de tipar la sesion sin `any`, que esta prohibido. |
| esquema | `rol` solo contempla 'admin' \| 'cajero' (comentario en migrations.ts:46-57 y schema.sql:35); faltan los cuatro niveles cajero/supervisor/dueno/superadmin | Hay que definir la union de TypeScript y decidir a que rol mapean las filas existentes con rol='admin' en bases ya instaladas. No hay CHECK en el esquema, asi que la migracion es de datos, no de estructura. |
| dominio | `pin_hash` nunca se escribe ni se lee; no hay funcion de hash ni de verificacion en ningun lado | Sin hash no hay login. Y no se puede usar bcrypt/argon2 (ver trampas): hay que escribir un derivador PBKDF2 sobre crypto.subtle en core, con salt por usuario y numero de iteraciones versionado en el propio string del hash. |
| dominio | `permisos_json` existe en el esquema pero no hay ni un solo lector ni escritor en todo el repo | El cliente pide permisos granulares 'no solo el rol'. Falta definir la lista cerrada de permisos, el mapeo rol -> permisos por defecto, y la logica de override por usuario (el JSON solo guarda las excepciones, no la lista completa, para que un cambio de defaults no quede congelado en filas viejas). |
| esquema | No hay entidad ni almacenamiento de sesion: ni tabla `sesion`, ni contexto React, ni persistencia entre recargas | El cliente pide bloqueo y expiracion de sesion. Hay que decidir si la sesion vive solo en memoria (se pierde al recargar la pestana, lo que en la PWA pasa seguido) o se persiste, y donde. |
| repo | No hay guardia en la capa de repos: `crearXxxRepo(db)` solo recibe el driver, sin excepcion (contexto.tsx:62-80) | CLAUDE.md exige que la validacion de negocio viva en el repo, no en la UI. Hoy esconder un boton es la unica barrera posible. Falta decidir la forma del guardia: segundo argumento `sesion` en cada factory, o un objeto de sesion mutable compartido que los repos consultan. |
| ui | No hay pantalla de login ni de seleccion de usuario; AppShell arranca en Ventas sin preguntar nada (AppShell.tsx:51) | Es el punto de entrada de toda la funcionalidad pedida. Tambien falta el paso de 'primer arranque: define el PIN del dueno' para bases ya sembradas sin PIN. |
| ui | No hay cambio rapido de usuario en el punto de venta ni bloqueo manual/por inactividad | Pedido explicito del cliente. Requiere decidir que pasa con el ticket abierto al cambiar de usuario y resetear el modulo activo (ver trampas). |
| ui | La UI no pasa `usuario_id` a ningun repo (cero ocurrencias en packages/ui/src) — ni en `abrirTicket()` (Ventas.tsx:285 y :440) ni en el corte de caja | Aunque el login exista, sin este cableado las facturas, cortes, cotizaciones y la bitacora siguen con usuario_id NULL y no hay auditoria real de quien vendio que. |
| ui | La bitacora no muestra el usuario: la tabla tiene Fecha / Accion / Entidad / Detalle, sin columna de quien | El dato existira en la fila pero seguira invisible. Ademas hace falta resolver el id a nombre (join o cache de usuarios). |
| repo | `backup-repo` exporta la tabla `usuario` entera, incluido `pin_hash`, a un archivo descargable | packages/core/src/repos/backup-repo.ts:10 lista 'usuario' y packages/ui/src/pantallas/Configuracion.tsx:66 llama a `exportarTodo()`. En cuanto el pin_hash tenga valor, el boton de respaldo entrega los hashes de todo el personal a cualquiera que pueda pulsarlo. |
| dominio | No existe `caja-repo.ts` ni seleccion de caja en la UI (cero ocurrencias de `caja_id`/`cajaId` en packages/ui/src) | Va pegado a esto: la sesion realista de un POS fija usuario Y caja a la vez. Si se disena la sesion solo con usuario, hay que reabrirla despues para meter la caja. |
| api | El backend de la API no participa: `registrarAuth` deja pasar todo como 'dev-local' cuando no hay Supabase | packages/api/src/plugins/auth.ts:41-44. Cualquier modelo de permisos que se construya ahora es 100% local; no hay servidor que lo haga cumplir. No es bloqueante hoy (la API no esta conectada) pero define el alcance real de la palabra 'seguridad'. |

## Enfoque recomendado

La decision central no es "que permisos existen" sino COMO llega la sesion a los 18 repos y a las 9 llamadas sueltas a registrarAccion(db, input) sin romper nada. Recomiendo adjuntar la sesion AL DRIVER, no a los factories: un `conSesion(db, portador)` que devuelve un SqlDriver envuelto llevando una referencia a `{ actual: SesionRepo | null }`, mas helpers `sesionDe(db)`, `usuarioDe(db)` y `exigirPermiso(db, permiso)` en packages/core/src/db/sesion.ts. Esto resuelve de un golpe los cuatro problemas mas caros del area: (1) la firma publica `crearXxxRepo(db)` no cambia, asi que los 18 archivos de test existentes siguen verdes sin tocarlos y ProveedorDatos no necesita reescribirse; (2) `registrarAccion(db, input)` solo tiene `db` en el closure de los 9 sitios que la llaman, y con la sesion pegada al driver rellena usuario_id sola, sin cambiar su firma ni esos 9 sitios; (3) el portador es un objeto de identidad ESTABLE con un campo mutable, asi que cambiar de usuario o correr un temporizador de inactividad NO recrea los repos y no dispara el bucle de useEffect(..., [repo]) que hoy provoca contexto.tsx al construir los repos sin useMemo; (4) driver sin sesion adjunta = modo permisivo, que es exactamente el comportamiento actual, asi que la version se puede publicar sin romper instalaciones ya en uso. El guardia va ANTES de cualquier escritura, en los mismos 9 puntos donde ya se llama registrarAccion, porque esa lista es el inventario real de acciones sensibles (plan.md:84 nombra permisos que no corresponden a acciones existentes: no hay descuento manual ni anular factura). El modelo de permisos es catalogo cerrado en TypeScript + mapa rol->defaults en codigo + permisos_json guardando SOLO las excepciones por usuario, para que cambiar los defaults manana no quede congelado en filas viejas. El hash es PBKDF2 sobre crypto.subtle con salt por usuario e iteraciones versionadas dentro del propio string, porque packages/core no tiene NINGUNA dependencia de runtime y el mismo codigo corre en sql.js, Tauri y node:sqlite. La migracion 11 es un solo bloque de dos statements individualmente idempotentes (CREATE TABLE IF NOT EXISTS de una tabla satelite usuario_seguridad + un UPDATE de normalizacion de rol), nunca un ALTER multiple ni una recreacion de `usuario`: el migrador no envuelve en transaccion y registra despues de aplicar, y el exec() de Tauri parte el SQL por ';' a ciegas. Un detalle operativo que condiciona todo el tramo de UI: packages/ui NO tiene runner de tests (su package.json solo define `typecheck`), asi que toda decision testeable — que modulos ve un rol, cuando toca bloquear, como se resuelven los overrides — se implementa como funcion pura en packages/core/src/dominio/ y se prueba con la suite que ya existe; los componentes solo orquestan. Y un limite que hay que decirle al cliente por escrito antes de prometer nada: la base vive en IndexedDB del navegador o en un archivo SQLite sin cifrar, y packages/api/src/plugins/auth.ts deja pasar todo como 'dev-local'; esto es control de disciplina y auditoria, NO una barrera de seguridad frente a alguien con acceso a la maquina.

### Alternativas descartadas

- Pasar la sesion como segundo argumento (crearXxxRepo(db, sesion)): rompe los 18 archivos de test de packages/core/test de golpe, obliga a cambiar la firma de registrarAccion y sus 9 sitios de llamada, y fuerza a reconstruir los 18 repos cada vez que cambia el usuario, que es justo lo que dispara el bucle de re-render en packages/ui/src/data/contexto.tsx (construye los repos en el cuerpo del render, sin useMemo).
- Guardar los permisos completos en usuario.permisos_json: congela los defaults del dia en que se creo cada usuario. Al agregar un permiso nuevo en la version siguiente, ningun usuario existente lo tendria y habria que escribir una migracion de datos por cada cambio de permisos. Se guardan solo las excepciones.
- Filtrar el array MODULOS en AppShell y esconder botones como unica barrera: lo prohibe CLAUDE.md §4 y ademas no funciona, porque el cuerpo de AppShell.tsx:190-198 renderiza con `activo === "Compras" && <Compras />` sin consultar el rol — tras un cambio rapido a cajero con `activo` en Compras, el cajero ve Compras igual. El filtro de nav es cosmetico; el guardia real va en los repos.
- Poner un CHECK sobre usuario.rol con los cuatro niveles: SQLite no soporta ALTER TABLE ADD CONSTRAINT y recrear la tabla usuario reventaria las FK de factura, corte_caja, cotizacion, movimiento_inventario y bitacora_accion en instalaciones reales (los tres drivers traen PRAGMA foreign_keys = ON). El rol se valida en TypeScript.
- bcrypt o argon2 para el PIN: packages/core/package.json no tiene ninguna dependencia de runtime y el mismo bundle corre en navegador (sql.js), webview de Tauri y Node. Cualquier binding nativo rompe dos de los tres entornos.
- Una tabla `sesion` persistida en SQLite como fuente de verdad de la sesion activa: sql.js persiste con debounce de 150 ms y solo fuerza el guardado en pagehide/visibilitychange, asi que cerrar la pestana en el momento justo pierde la escritura. La sesion vive en memoria + sessionStorage por pestana, y solo ultimo_acceso / intentos_fallidos se escriben a la base como mejor esfuerzo y registro de auditoria, no como control.
- Agregar vitest a packages/ui para probar las pantallas nuevas: el paquete hoy solo tiene `typecheck` y montar un entorno de DOM es un proyecto aparte. En cambio, toda decision testeable se implementa como funcion pura en packages/core/src/dominio/ y se prueba con la suite que ya existe.

## Trampas especificas de esta area

- El `SqlDriver` NO tiene transacciones: la interfaz solo expone exec/run/all/get/close (packages/core/src/db/driver.ts:11-22). Crear un usuario + registrar en bitacora, o 'login que actualiza ultimo_acceso e inserta sesion', no son atomicos en ningun driver. No inventes `db.exec('BEGIN')`: en el driver de Tauri eso se ejecuta como statement suelto sobre un pool de sqlx y no envuelve las llamadas siguientes.
- El `exec()` del driver de Tauri parte el SQL por `;` a ciegas (packages/desktop/src/db/tauri-sql-driver.ts:17-22, `sql.split(";")`). Una migracion con un `;` dentro de un string literal, un TRIGGER con BEGIN...END, o un DEFAULT que contenga punto y coma se rompe SOLO en escritorio y no en los tests de Node ni en la PWA. La migracion 11 debe ser CREATE TABLE / ALTER TABLE ADD COLUMN plano y nada mas.
- No se puede anadir un CHECK a `rol` para los cuatro niveles: SQLite no soporta ALTER TABLE ADD CONSTRAINT, y recrear la tabla `usuario` reventaria las FK de factura, corte_caja, cotizacion, movimiento_inventario y bitacora_accion en instalaciones reales — los tres drivers tienen `PRAGMA foreign_keys = ON` (node-sqlite.ts:24, sqljs-driver.ts:62, y sqlx lo trae por defecto). El rol se valida en TypeScript, no en el esquema.
- El migrador no envuelve cada migracion en una transaccion y registra en `_migracion` DESPUES de aplicarla (packages/core/src/db/migrator.ts:24-30). Si la migracion 11 tiene tres statements y falla en el segundo sobre una base real, queda a medio aplicar y sin registrar: el siguiente arranque la reintenta desde el primero y muere con 'duplicate column name'. La migracion 11 debe ser de un solo statement, o idempotente statement por statement.
- `ProveedorDatos` construye los 18 repos en el cuerpo del render, sin `useMemo` (packages/ui/src/data/contexto.tsx:61-81). Hoy no molesta porque AppShell casi no re-renderiza. En cuanto metas un `ProveedorSesion` con temporizador de inactividad (que re-renderiza cada minuto o cada tick), el objeto `repos` cambia de identidad en cada tick y TODOS los `useEffect(..., [repo])` se vuelven a disparar en bucle — ejemplo real: packages/ui/src/componentes/SeccionBitacora.tsx:22-24. O envuelves en useMemo, o inyectas la sesion por referencia mutable estable en vez de recrear repos.
- Los atajos Alt+1..Alt+9 se generan por INDICE sobre el array MODULOS (packages/ui/src/AppShell.tsx:64-66) y el numero se pinta en cada boton (:126 y :144). Si filtras MODULOS por rol, el cajero tendra Alt+1=Ventas y el dueno una numeracion completamente distinta para los mismos modulos, lo que contradice la regla de la guia de diseno de que el atajo se escribe en el boton (design-guidelines.md:290-292). Hay que decidir: numeracion fija por modulo (con huecos) o renumerada por rol, y documentarlo.
- El cuerpo de AppShell renderiza con `activo === "Compras" && <Compras />` (AppShell.tsx:190-198), sin consultar el rol. Filtrar la barra lateral NO impide que la pantalla se monte: tras un cambio rapido de usuario a cajero, si `activo` seguia en 'Compras', el cajero ve Compras. Hay que resetear `activo` a un modulo permitido al cambiar de sesion, ademas de filtrar la nav.
- `crypto.subtle` solo existe en contexto seguro. La PWA servida por http:// sobre la LAN (no localhost) no lo tiene, y el login se caeria ahi sin error evidente. `crypto.randomUUID` (packages/core/src/ids.ts:7) ya arrastra la misma restriccion y hoy funciona, asi que el riesgo ya esta asumido — pero un fallo de hash es peor que un fallo de id. Hay que detectar la ausencia y dar un mensaje claro, no un catch vacio (prohibido por CLAUDE.md).
- No se puede usar bcrypt ni argon2: `packages/core/package.json` no tiene NINGUNA dependencia de runtime (solo devDependencies) y el mismo codigo corre en sql.js (navegador), Tauri (webview) y node:sqlite (tests de vitest). Cualquier binding nativo rompe dos de los tres entornos. PBKDF2 via crypto.subtle es la unica opcion realista sin cambiar la arquitectura del paquete.
- En la PWA la base entera vive en IndexedDB del navegador ('sfr-db', packages/web/src/db/sqljs-driver.ts:15-17) y es legible desde DevTools; en escritorio es un archivo SQLite local sin cifrar. El 'guardia en la capa de repos' es una barrera de disciplina y auditoria, NO una barrera de seguridad — no hay servidor que valide nada (packages/api/src/plugins/auth.ts:41-44 deja pasar todo como 'dev-local'). Hay que decirselo al cliente en esos terminos antes de prometer 'permisos seguros'.
- sql.js persiste con debounce de 150 ms (sqljs-driver.ts:64-80) y solo fuerza el guardado en `pagehide`/`visibilitychange`. Cualquier estado de sesion que se guarde en la DB (ultimo_acceso, bloqueado_hasta, intentos_fallidos) puede perderse si la pestana muere en el peor momento — justamente lo que un cajero malicioso provocaria para resetear el contador de intentos fallidos. Contar intentos fallidos en memoria no sirve (se resetea al recargar); en DB tampoco es fiable. Decidir conscientemente.
- Todos los tests de repos crean la base con `createNodeSqliteDriver()` + `migrate()` SIN seed y llaman a los repos directamente (packages/core/test/repos.test.ts:10-14, mismo patron en los 18 archivos de test). Si el guardia exige sesion por defecto, toda la suite existente se cae de golpe. El guardia necesita un modo explicito 'sin sesion configurada = permitir' (compatible con instalaciones actuales) o hay que tocar los 18 archivos de test. Decidelo ANTES de escribir el primer test rojo.
- `registrarAccion` es una funcion suelta que recibe `(db, input)`, no un metodo del repo (packages/core/src/repos/bitacora-repo.ts:35), y se invoca desde ocho sitios que solo tienen `db` en su closure. Si la sesion se inyecta en `crearXxxRepo(db, sesion)`, esas ocho llamadas siguen sin ver el usuario: o cambias la firma de `registrarAccion` a `(db, sesion, input)` y tocas los ocho, o la sesion viaja pegada al propio objeto driver. Elige una sola via y se consistente.
- `backup-repo.ts:10` incluye 'usuario' en la lista de tablas del volcado y `Configuracion.tsx:66` lo baja como archivo. Hoy es inofensivo porque pin_hash es NULL; el dia que tenga valor, el respaldo pasa a ser un volcado de credenciales. Y `packages/api/sync-rules.yaml:18` hace `SELECT * FROM usuario` para el bucket global, o sea que en Fase 2 el pin_hash de todo el personal se replicaria a cada cliente. Ambos hay que arreglarlos en el mismo cambio, no despues.
- El plan original define los permisos como 'descuentos, anular, ver_corte' (plan.md:84), pero DOS de esos tres no corresponden a acciones que existan: no hay descuento manual por linea (los descuentos solo vienen de promociones automaticas, Ventas.tsx:498 `aplicarDescuento`) y no hay 'anular factura' — lo unico parecido es `eliminarTicket` sobre tickets abiertos (factura-repo.ts:378-386) y `cotizacion.anular` (cotizacion-repo.ts:194). Deriva la lista de permisos de las ocho llamadas reales a `registrarAccion`, no del plan.
- El caso de uso mas obvio del cliente ya esta abierto de par en par y es facil de pasar por alto: desde la pantalla de Ventas cualquiera puede abrir el formulario completo del producto y cambiarle precio y costo (Ventas.tsx:564 `abrirEdicionProducto`, :602 `productos.actualizar`, modal en :1910-1927). 'El cajero solo ve Ventas' NO alcanza: hay que bloquear esa edicion dentro de Ventas, y el guardia tiene que estar en `producto-repo.actualizar`, no en el boton.

## Preguntas para el dueno del negocio

- SUPERADMIN: es una fila mas en la tabla `usuario` de cada instalacion (y entonces el DUENO la ve y la puede borrar desde la pantalla de personal), o es un acceso maestro fuera de la base (PIN derivado del RNC/serie del negocio, o un usuario oculto que no aparece en los listados)?
- Las instalaciones reales ya tienen la fila `usuario-admin` con rol='admin' (seed.ts:38-41). Al migrar, ese usuario pasa a DUENO o a SUPERADMIN? Y si el dueno real nunca puso un PIN, la app le exige definirlo en el proximo arranque o le deja seguir entrando sin login?
- La app puede seguir funcionando SIN login (modo de un solo usuario, como hoy), o desde la proxima version exige identificarse siempre? Esto define si el guardia arranca en modo permisivo o restrictivo, y si se puede publicar sin romper a quien ya la usa.
- PIN numerico de 4-6 digitos (rapido en el mostrador, debil) o contrasena? Se bloquea la cuenta tras N intentos fallidos? Cuantos, y por cuanto tiempo? (Ojo: contar intentos es poco fiable en la PWA, ver trampas.)
- Cuanto dura la sesion antes de bloquearse por inactividad? Al bloquearse pide el PIN del MISMO usuario (bloqueo de pantalla) o vuelve a la seleccion de usuario (cierre de sesion)?
- Al cambiar rapido de usuario en el punto de venta con un ticket abierto: el ticket se queda abierto a nombre del cajero anterior, se transfiere al nuevo, o se obliga a cerrarlo/cobrarlo primero?
- SUPERVISOR 'cuadrar caja': solo crear el corte del periodo, o tambien ver el resumen de ganancias y margenes (reportes-repo tiene `resumenGanancia`, que expone el costo de los productos)? Es la diferencia entre ver cuanto entro y ver cuanto se gana.
- El CAJERO puede editar precio y costo de un producto desde la pantalla de Ventas (hoy puede, Ventas.tsx:564/:602)? Puede crear clientes nuevos al vuelo? Puede eliminar un ticket abierto? Puede reimprimir una factura de ayer?
- Existe la autorizacion por excedencia: el supervisor teclea SU PIN para autorizar una accion puntual del cajero sin cambiar de sesion (patron estandar de POS)? Cambia por completo el diseno del guardia — dejaria de ser 'quien esta logueado' para ser 'quien autorizo esta operacion'.
- El archivo de respaldo (Configuracion > Respaldo) debe seguir incluyendo los usuarios y sus PIN? Si se excluyen, restaurar un respaldo en una maquina nueva dejaria al negocio sin usuarios; si se incluyen, el archivo es un volcado de credenciales.

## Tareas

### RBAC-01 — Migracion 11 (tabla usuario_seguridad + normalizacion de rol) y tipos de dominio Usuario/Caja/RolUsuario

**Objetivo.** La base tiene la tabla satelite usuario_seguridad y los roles normalizados a los cuatro niveles, y @sfr/core exporta los tipos Usuario, Caja, UsuarioSeguridad y RolUsuario, sin que ningun repo ni pantalla cambie.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| S | bajo — es una tabla nueva mas un UPDATE idempotente; no altera ninguna tabla existente ni ninguna FK, y el unico riesgo real (reintento a medias del migrador) queda cubierto por la idempotencia statement por statement. | nada |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en espanol: nombres de archivo, tipos y columnas SQL). Estilo: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada). Sin `any`, TDD con vitest (rojo primero).

CONTEXTO YA VERIFICADO, no lo re-verifiques: la tabla `usuario` YA existe con id, nombre, rol TEXT DEFAULT 'admin', pin_hash TEXT nullable, activo, permisos_json TEXT, created_at/updated_at/deleted_at (packages/core/src/db/migrations.ts:46-57). La tabla `caja` tambien existe (id, nombre, ubicacion, activa). El seed crea la fila 'usuario-admin' con rol 'admin' y pin_hash NULL (packages/core/src/db/seed.ts:37-41) y 'caja-1' (seed.ts:43-47). Las migraciones usan ids 1..10; la tuya es la 11. NO existen las interfaces Usuario ni Caja en packages/core/src/repos/tipos.ts.

QUE HACER:
1. Escribe primero los tests en packages/core/test/migrations.test.ts (imita el estilo que ya tiene: createNodeSqliteDriver() + migrate()).
2. Agrega la migracion id 11, nombre 'usuarios-seguridad', al final del array `migrations` en packages/core/src/db/migrations.ts, imitando exactamente el formato de la migracion 10 (objeto { id, nombre, sql: /* sql */ `...` }). El SQL exacto esta en el campo migracionSql de esta tarea: son DOS statements y ni uno mas.
3. En packages/core/src/repos/tipos.ts agrega, siguiendo el estilo de `interface Producto extends Auditoria` y de `export type EstadoFactura = ...`: `export type RolUsuario = "cajero" | "supervisor" | "dueno" | "superadmin"`, `export interface Usuario extends Auditoria` (id, nombre, rol: RolUsuario, activo: number, permisos_json: string | null — OJO: NO incluyas pin_hash en la interfaz publica, el repo nunca lo devuelve), `export interface Caja extends Auditoria` (id, nombre, ubicacion, activa) y `export interface UsuarioSeguridad` (usuario_id, ultimo_acceso, intentos_fallidos, bloqueado_hasta, pin_actualizado_at). Fijate que los booleanos en este repo se modelan como `number` (0/1), mira Producto.activo.
4. Cambia el rol de la fila semilla en packages/core/src/db/seed.ts de 'admin' a 'dueno'.
5. Replica la tabla nueva en packages/api/db/schema.sql (Postgres) junto a la definicion de `usuario` que ya esta en las lineas 33-42, y actualiza ahi tambien el comentario del rol a los cuatro niveles. Si no lo haces, la Fase 2 de sync nace rota.

TRAMPAS QUE TE VAN A MORDER SI LAS IGNORAS:
- El migrador (packages/core/src/db/migrator.ts:24-30) NO envuelve cada migracion en transaccion y registra en `_migracion` DESPUES de aplicarla. Si tu migracion falla a mitad sobre una base real, queda a medio aplicar y sin registrar, y el siguiente arranque la reintenta desde el primer statement. Por eso ambos statements tienen que ser idempotentes POR SEPARADO (CREATE TABLE IF NOT EXISTS, y un UPDATE que despues de correr ya no matchea nada).
- El exec() del driver de escritorio parte el SQL por ';' a ciegas (packages/desktop/src/db/tauri-sql-driver.ts:17-22, sql.split(";")). NO pongas ningun ';' dentro de un literal de string ni dentro de un comentario `--` de tu SQL: se rompe solo en escritorio y los tests de Node no lo detectan.
- NO recrees la tabla `usuario` ni le agregues un CHECK: SQLite no soporta ALTER TABLE ADD CONSTRAINT, y recrearla reventaria las FK de factura, corte_caja, cotizacion, movimiento_inventario y bitacora_accion en instalaciones reales (los tres drivers tienen PRAGMA foreign_keys = ON). El rol se valida en TypeScript, no en el esquema.

NO TOQUES: ningun archivo dentro de packages/core/src/repos/ salvo tipos.ts; ni packages/ui, packages/web, packages/desktop; ni packages/core/src/db/migrator.ts; ni las migraciones 1..10 (nunca se editan migraciones ya aplicadas).

AL TERMINAR: `pnpm -r test` y `pnpm -r typecheck` verdes, con los 17 archivos de test que ya existian intactos.
```

#### SQL de la migracion

```sql
CREATE TABLE IF NOT EXISTS usuario_seguridad (
  usuario_id         TEXT PRIMARY KEY REFERENCES usuario(id),
  ultimo_acceso      TEXT,
  intentos_fallidos  INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta    TEXT,
  pin_actualizado_at TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
UPDATE usuario SET rol = 'dueno' WHERE rol = 'admin';
```

#### Archivos a tocar

- `packages/core/src/db/migrations.ts`
- `packages/core/src/db/seed.ts`
- `packages/core/src/repos/tipos.ts`
- `packages/core/test/migrations.test.ts`
- `packages/api/db/schema.sql`

#### Criterios de aceptacion

- [ ] La migracion 11 es un unico bloque con exactamente dos statements, ambos idempotentes por separado, sin ningun ';' dentro de literales ni de comentarios.
- [ ] No se recrea la tabla usuario ni se agrega ningun CHECK ni constraint nuevo sobre ella.
- [ ] tipos.ts exporta RolUsuario con los cuatro niveles, Usuario, Caja y UsuarioSeguridad; la interfaz Usuario NO tiene campo pin_hash.
- [ ] packages/api/db/schema.sql contiene el espejo Postgres de usuario_seguridad y el comentario de rol actualizado.
- [ ] seed() crea el usuario semilla con rol 'dueno' y pin_hash NULL.
- [ ] pnpm -r test y pnpm -r typecheck verdes; ningun archivo de test preexistente modificado salvo migrations.test.ts.

#### Pruebas a escribir primero (TDD)

- migrations.test.ts: tras migrate(), sqlite_master contiene la tabla 'usuario_seguridad' con las columnas usuario_id, ultimo_acceso, intentos_fallidos, bloqueado_hasta, pin_actualizado_at (verificar con PRAGMA table_info).
- migrate() sigue siendo idempotente: la segunda corrida devuelve un array vacio (test que ya existe, debe seguir verde).
- Sobre una base que ya tiene una fila usuario con rol='admin' insertada antes de correr la 11, tras migrate() esa fila queda con rol='dueno'.
- Aplicar db.exec(migrations.find(m => m.id === 11).sql) DOS veces seguidas sobre la misma base no lanza — simula el reintento del migrador tras un fallo a medias.
- El texto de la migracion 11 no contiene ningun ';' fuera de los dos separadores de statement (assert sobre el string del sql, por el split ciego del driver de Tauri).
- seed() deja usuario-admin con rol 'dueno' y pin_hash null.
- El test existente de TABLAS_MVP sigue pasando (no se elimino ni renombro ninguna tabla).

---

### RBAC-02 — Dominio puro: catalogo cerrado de permisos, defaults por rol, overrides por usuario y hash de PIN con PBKDF2

**Objetivo.** @sfr/core expone funciones puras para saber que puede hacer un rol, resolver las excepciones por usuario y hashear/verificar un PIN, sin tocar la base de datos ni agregar dependencias.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo — codigo nuevo, puro y aislado, sin escrituras a la base; el unico punto delicado es el formato del hash, y queda blindado por el test de iteraciones versionadas. | RBAC-01 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en espanol). Estilo: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada). Sin `any`, TDD con vitest (escribe el test rojo primero).

QUE CONSTRUIR: dos modulos de dominio PUROS, sin SqlDriver, imitando el estilo de packages/core/src/dominio/precio.ts y packages/core/src/dominio/validacion.ts (funciones exportadas sueltas, tipos exportados, nada de clases salvo los errores).

A) packages/core/src/dominio/permisos.ts
- `export type Permiso` como union cerrada de literales. DERIVA LA LISTA DE LA REALIDAD, no de plan.md: abre los 9 sitios que hoy llaman a registrarAccion() y nombra un permiso por cada accion real que registran — packages/core/src/repos/producto-repo.ts:150 y :180, cliente-repo.ts:114, proveedor-repo.ts:77, compra-repo.ts:163, corte-caja-repo.ts:138, devolucion-repo.ts:198, factura-repo.ts:386 y :435. IGNORA plan.md:84: nombra 'descuentos' y 'anular' y NINGUNO de los dos corresponde a una accion que exista (no hay descuento manual por linea, los descuentos solo vienen de promociones automaticas; y no hay anular factura, lo unico parecido es eliminar un ticket abierto). Suma ademas un permiso de visibilidad por cada uno de los 9 modulos de packages/ui/src/AppShell.tsx:28-31 (Ventas, Productos, Clientes, Facturas, Compras, Corte de caja, Reportes, Promociones, Configuracion), mas 'reporte.ganancia' aparte (packages/core/src/repos/reportes-repo.ts expone resumenGanancia, que revela el costo de los productos) y 'personal.gestionar'.
- `export const PERMISOS: readonly Permiso[]`.
- `export function permisosDeRol(rol: RolUsuario): ReadonlySet<Permiso>` con el mapa de defaults. Reparto pedido por el cliente: CAJERO = solo la ventana de Ventas y cobrar; SUPERVISOR = todo lo del cajero + Compras + cuadrar caja; DUENO = todo lo del supervisor + personal.gestionar + practicamente todo; SUPERADMIN = todo, incluido lo de soporte.
- `export function resolverPermisos(usuario: { rol: RolUsuario; permisos_json: string | null }, alAvisar?: (mensaje: string) => void): ReadonlySet<Permiso>`: parte de permisosDeRol y aplica encima las EXCEPCIONES del JSON. El JSON es un Record<string, boolean> que guarda SOLO excepciones (true concede, false quita), NUNCA la lista completa — asi cambiar los defaults manana no queda congelado en filas viejas. Claves desconocidas se ignoran sin lanzar. JSON malformado NO se traga en silencio (CLAUDE.md prohibe catch vacio): devuelve los permisos del rol y reporta por el callback alAvisar.
- `export function modulosPermitidos(permisos: ReadonlySet<Permiso>): string[]` devolviendo los nombres de modulo tal cual estan escritos en el array MODULOS de AppShell. Esta funcion es la que consumira la UI mas adelante; vive aqui, en core, porque packages/ui NO tiene runner de tests (solo `typecheck`), asi que toda decision testeable tiene que estar de este lado.

B) packages/core/src/dominio/pin.ts
- `export async function hashearPin(pin: string): Promise<string>` y `export async function verificarPin(pin: string, hash: string): Promise<boolean>`.
- Formato del hash, versionado dentro del propio string: pbkdf2$<iteraciones>$<saltBase64>$<hashBase64>. verificarPin lee las iteraciones del string, NO de una constante, para que subir el numero manana no invalide los PIN viejos.
- Implementacion: crypto.subtle.deriveBits con PBKDF2-SHA256, minimo 100000 iteraciones, salt de 16 bytes de crypto.getRandomValues. Comparacion del hash en tiempo constante (recorre todos los bytes acumulando XOR, no cortes al primer byte distinto).
- `export class CriptoNoDisponibleError extends Error` con mensaje accionable: crypto.subtle solo existe en contexto seguro, y la PWA servida por http:// sobre la LAN (no localhost) no lo tiene. Detecta la ausencia y lanza este error con un mensaje que diga que hay que servir la app por https o por localhost. Nada de catch vacio.
- Prueba de que WebCrypto global esta disponible en los tres runtimes: packages/core/src/ids.ts:7 ya usa crypto.randomUUID() sin polyfill ni dependencia.

C) Exporta ambos modulos desde packages/core/src/dominio/index.ts y verifica que salgan por packages/core/src/index.ts (hace export * from "./dominio/index.js").

NO TOQUES: packages/core/package.json — el paquete NO tiene NINGUNA dependencia de runtime y tiene que seguir asi (nada de bcrypt, argon2 ni ninguna lib de crypto: el mismo codigo corre en sql.js/navegador, en el webview de Tauri y en node:sqlite bajo vitest, y cualquier binding nativo rompe dos de los tres). Tampoco toques ningun repo de packages/core/src/repos/ (salvo LEER tipos.ts para importar RolUsuario), ni las migraciones, ni packages/ui.

AL TERMINAR: `pnpm -r test` y `pnpm -r typecheck` verdes.
```

#### Archivos a tocar

- `packages/core/src/dominio/permisos.ts`
- `packages/core/src/dominio/pin.ts`
- `packages/core/src/dominio/index.ts`
- `packages/core/test/permisos.test.ts`
- `packages/core/test/pin.test.ts`

#### Criterios de aceptacion

- [ ] El catalogo PERMISOS se deriva de los 9 sitios reales que llaman registrarAccion mas los 9 modulos de AppShell, no de plan.md:84.
- [ ] permisos_json solo guarda excepciones; resolverPermisos nunca depende de que el JSON liste todos los permisos.
- [ ] packages/core/package.json sigue sin ninguna dependencia de runtime.
- [ ] El string del hash lleva las iteraciones dentro, y verificarPin las lee de ahi.
- [ ] La ausencia de crypto.subtle lanza CriptoNoDisponibleError con mensaje accionable; no hay ningun catch vacio.
- [ ] Todo es funcion pura: ningun modulo de esta tarea importa SqlDriver.

#### Pruebas a escribir primero (TDD)

- permisosDeRol('cajero') incluye el permiso del modulo Ventas y el de cobrar, y NO incluye producto.editar ni el de eliminar ticket ni reporte.ganancia.
- permisosDeRol('supervisor') es superconjunto estricto del de cajero e incluye compra.registrar y el del corte de caja.
- permisosDeRol('dueno') es superconjunto estricto del de supervisor e incluye personal.gestionar.
- permisosDeRol('superadmin') contiene todos los elementos de PERMISOS.
- resolverPermisos({rol:'cajero', permisos_json:'{"producto.editar":true}'}) concede producto.editar y no concede ningun otro permiso extra.
- resolverPermisos con un permisos_json que pone en false un permiso propio del rol lo quita del set resultante.
- resolverPermisos ignora claves desconocidas del JSON sin lanzar (una version vieja pudo guardar un permiso que ya no existe).
- resolverPermisos con JSON malformado devuelve los permisos del rol Y llama al callback alAvisar con un mensaje (no se traga el error).
- modulosPermitidos(permisos de cajero) devuelve exactamente ['Ventas'].
- hashearPin('1234') devuelve un string con cuatro segmentos separados por '$' cuyo primer segmento es 'pbkdf2', y dos llamadas seguidas con el mismo PIN dan hashes distintos (salt aleatorio).
- verificarPin('1234', hash) es true y verificarPin('1235', hash) es false.
- verificarPin contra un hash construido a mano con un numero de iteraciones distinto al actual sigue validando correctamente.
- Con globalThis.crypto.subtle stubbeado a undefined, hashearPin rechaza con CriptoNoDisponibleError y el mensaje menciona el contexto seguro.

---

### RBAC-03 — usuario-repo.ts (CRUD, autenticar, cambiar PIN) y blindaje del respaldo y del sync para que no filtren pin_hash

**Objetivo.** Existe un repo real de usuarios con autenticacion validada del lado de los datos, y el boton de respaldo y las reglas de sync dejan de exportar los hashes de PIN en el mismo cambio que les da valor.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio — el repo en si es rutinario, pero tocar backup-repo cambia la forma del archivo de respaldo y hay que confirmar que la restauracion sigue funcionando; la regla del ultimo dueno es la que evita dejar una instalacion sin acceso. | RBAC-01, RBAC-02 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en espanol incluidos los nombres de columna). Estilo: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada). Sin `any`, TDD con vitest.

PATRON A IMITAR, literalmente: packages/core/src/repos/proveedor-repo.ts y packages/core/src/repos/producto-repo.ts. Es decir: una constante `const COLS = \`id, nombre, ...\`` con las columnas, una funcion `export function validarUsuario(input): ErrorValidacion[]`, y `export function crearUsuarioRepo(db: SqlDriver) { return { ... } }` con `export type UsuarioRepo = ReturnType<typeof crearUsuarioRepo>`. Importa ValidacionError desde ./producto-repo.js (es la clase compartida entre todos los repos, ver producto-repo.ts:41-46) y ErrorValidacion, tieneValor, normalizar desde ../dominio/validacion.js. Usa newId() y now() de ../ids.js. Registra las acciones sensibles con registrarAccion(db, {...}) de ./bitacora-repo.js, igual que hacen los otros repos.

QUE CONSTRUIR en packages/core/src/repos/usuario-repo.ts:
- listar(), obtener(id), crear(input), actualizar(id, input), desactivar(id), cambiarPin({usuarioId, pinActual, pinNuevo, omitirPinActual}), autenticar({usuarioId, pin}).
- NINGUN metodo devuelve pin_hash. La interfaz Usuario de tipos.ts a proposito no lo tiene; el SELECT no lo incluye salvo dentro de autenticar/cambiarPin, donde se lee a una variable local y no sale del repo.
- autenticar devuelve un resultado discriminado (por ejemplo { ok: true, usuario, permisos } | { ok: false, motivo: "pin_incorrecto" | "inactivo" | "bloqueado" | "sin_pin" }), nunca un boolean pelado. Usa verificarPin y hashearPin de ../dominio/pin.js y resolverPermisos de ../dominio/permisos.js.
- Intentos fallidos, ultimo_acceso y bloqueado_hasta se leen y escriben en la tabla usuario_seguridad (creada por RBAC-01). Si la fila del usuario no existe todavia, se crea al vuelo con intentos_fallidos 0.
- Reglas de negocio que van EN EL REPO, no en la UI: nombre obligatorio; rol tiene que ser uno de los cuatro de RolUsuario; PIN de 4 a 6 digitos numericos; no se puede desactivar ni degradar de rol al ULTIMO usuario activo con rol dueno o superadmin (dejaria la instalacion sin dueno y sin forma de entrar); un usuario inactivo nunca autentica aunque el PIN sea correcto.

ADEMAS, EN EL MISMO CAMBIO (no despues — hoy es inofensivo porque pin_hash es NULL, y esta tarea es justo la que le da valor):
- packages/core/src/repos/backup-repo.ts:9-19 lista 'usuario' entre las TABLAS que vuelca, y packages/ui/src/pantallas/Configuracion.tsx:66 baja ese volcado como archivo descargable. Haz que el respaldo siga incluyendo la tabla usuario (si la excluyes, restaurar en una maquina nueva deja al negocio sin usuarios) pero con pin_hash forzado a null en todas las filas, y que usuario_seguridad no se exporte.
- packages/api/sync-rules.yaml:18 hace SELECT * FROM usuario para el bucket global, o sea que en Fase 2 el pin_hash de todo el personal se replicaria a cada cliente. Cambialo a una lista explicita de columnas sin pin_hash.

REGISTRA EL REPO: agrega el bloque de export en packages/core/src/repos/index.ts imitando los que ya estan (export { crearUsuarioRepo, validarUsuario, type UsuarioInput, type UsuarioRepo } from "./usuario-repo.js";).

TRAMPA IMPORTANTE: el SqlDriver NO tiene transacciones — la interfaz de packages/core/src/db/driver.ts:11-22 solo expone exec/run/all/get/close. Crear un usuario y registrar la accion en bitacora NO es atomico, y "autenticar + actualizar ultimo_acceso" tampoco. NO inventes db.exec('BEGIN'): en el driver de Tauri eso se ejecuta como statement suelto sobre un pool de sqlx y no envuelve las llamadas siguientes. Ordena las escrituras para que el peor caso sea inofensivo (primero la fila que importa, despues la bitacora).

NO TOQUES: packages/ui (Configuracion.tsx NO se toca en esta tarea: el arreglo del respaldo va del lado de backup-repo), ni packages/web, ni packages/desktop, ni AppShell, ni migraciones, ni el guardia de permisos (eso es RBAC-04, aqui solo se construye el repo).

AL TERMINAR: `pnpm -r test` y `pnpm -r typecheck` verdes, con los archivos de test preexistentes intactos.
```

#### Archivos a tocar

- `packages/core/src/repos/usuario-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/src/repos/backup-repo.ts`
- `packages/api/sync-rules.yaml`
- `packages/core/test/usuario-repo.test.ts`
- `packages/core/test/backup-repo.test.ts`

#### Criterios de aceptacion

- [ ] Ningun metodo publico de usuario-repo devuelve pin_hash, ni siquiera dentro del objeto Usuario de autenticar.
- [ ] Todas las reglas (nombre, rol valido, longitud de PIN, ultimo dueno, usuario inactivo) se aplican dentro del repo y lanzan ValidacionError, no en la UI.
- [ ] autenticar devuelve un resultado discriminado con motivo, no un boolean.
- [ ] backup.exportarTodo() sigue trayendo la tabla usuario pero con pin_hash null en todas las filas, y no trae usuario_seguridad.
- [ ] sync-rules.yaml ya no hace SELECT * sobre usuario.
- [ ] No se usa BEGIN/COMMIT en ningun lado; el orden de escrituras deja el peor caso inofensivo.
- [ ] pnpm -r test y pnpm -r typecheck verdes sin modificar tests preexistentes.

#### Pruebas a escribir primero (TDD)

- crear({nombre:'Ana', rol:'cajero', pin:'1234'}) persiste una fila cuyo pin_hash no es null y no es igual a '1234'.
- crear con nombre vacio lanza ValidacionError; crear con rol:'gerente' lanza ValidacionError.
- crear con pin de 3 digitos y con pin no numerico lanzan ValidacionError.
- autenticar con el PIN correcto devuelve ok:true con el set de permisos resuelto del rol.
- autenticar con PIN incorrecto devuelve ok:false motivo 'pin_incorrecto' y deja intentos_fallidos en 1; el segundo intento fallido lo deja en 2.
- autenticar correcto despues de dos fallidos resetea intentos_fallidos a 0 y escribe ultimo_acceso.
- autenticar de un usuario con activo=0 devuelve ok:false motivo 'inactivo' aunque el PIN sea correcto.
- autenticar de un usuario con bloqueado_hasta en el futuro devuelve motivo 'bloqueado' sin llegar a verificar el PIN.
- autenticar del usuario semilla (pin_hash NULL) devuelve motivo 'sin_pin' — es el disparador del primer arranque.
- desactivar al unico usuario activo con rol 'dueno' lanza ValidacionError; con dos duenos activos, desactivar a uno funciona.
- actualizar el rol del unico dueno activo a 'cajero' lanza ValidacionError.
- cambiarPin con pinActual incorrecto lanza ValidacionError; con omitirPinActual true funciona (la usara quien tenga personal.gestionar).
- listar() devuelve objetos cuyas claves no incluyen 'pin_hash'.
- backup.exportarTodo() con un usuario que tiene pin_hash devuelve esa fila con pin_hash null y el resto de columnas intactas.
- backup.exportarTodo() no incluye la clave 'usuario_seguridad' en tablas.

---

### RBAC-04 — Portador de sesion sobre el driver, exigirPermiso y guardia en los 9 puntos sensibles de los repos

**Objetivo.** Los repos rechazan con PermisoError las acciones que la sesion activa no tiene permitidas y atribuyen solos el usuario_id, sin cambiar ninguna firma publica y sin tocar ninguno de los 18 archivos de test existentes.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto — toca 9 repos que son el corazon transaccional de la app; un exigirPermiso mal colocado bloquea ventas en produccion o, peor, deja pasar lo que deberia frenar. El seguro es que los 18 tests existentes tienen que quedar verdes sin editarse. | RBAC-02, RBAC-03 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Marcada L y es la tarea de mayor riesgo del area: crea sesion.ts completo (portador, conSesion, sesionDe, usuarioDe, exigirPermiso, PermisoError), cablea registrarAccion, coloca guardias en NUEVE repos distintos y rellena el usuario por defecto en cuatro puntos de entrada, todo bajo la restriccion de que los 18 archivos de test existentes tienen que pasar sin editarse. Nueve repos en una sesion es mucho, y un exigirPermiso mal colocado bloquea ventas en produccion.
>   **Arreglo.** (A) sesion.ts + cableado de registrarAccion + los cuatro puntos de entrada que ya aceptan usuario_id, sin ningun guardia todavia (entrega la atribucion, que ya vale por si sola y es de riesgo bajo); (B) los guardias en los nueve sitios, uno a uno, con un test por sitio que ademas RELEA la fila para confirmar que el guardia corto antes de escribir.
> - **Problema.** Su criterio estrella ('los 18 archivos de test preexistentes pasan SIN ninguna modificacion') es correcto para RBAC-04 aislada, pero el plan sintetizado lo contradice en al menos tres puntos de otras olas: BACKOFFICE-02 manda 'adapta los tests viejos, no los borres' sobre reportes-repo.test.ts y corte-caja-repo.test.ts; CAJA-05 advierte que factura-repo.test.ts, inventario-factura-repo.test.ts y devolucion.test.ts se romperan al activar exige_caja_abierta; CENSO-COLUMNAS toca los INSERT que repos.test.ts ejerce. La invariante mas importante del plan no se sostiene a nivel global y no hay ningun punto donde se declare cuando deja de aplicar.
>   **Arreglo.** Convertirlo en una invariante con fecha de caducidad explicita por archivo: una tabla en MIGRACIONES.md que liste que test preexistente puede cambiar, en que ola, y por que decision de negocio. Fuera de esa tabla, cualquier edicion a un test viejo es motivo de rechazo en revision.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en espanol). Estilo: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada). Sin `any`, TDD con vitest. ESTA ES LA TAREA CLAVE DEL AREA: lee el brief entero antes de escribir una linea.

EL PROBLEMA: hay 18 repos construidos con la firma crearXxxRepo(db: SqlDriver) y una funcion suelta registrarAccion(db, input) (packages/core/src/repos/bitacora-repo.ts:35) llamada desde 9 sitios que solo tienen db en su closure. Hay que hacer llegar "quien esta operando" a todos ellos SIN cambiar firmas, porque: (a) los 18 archivos de packages/core/test/ construyen los repos con createNodeSqliteDriver() + migrate() y los llaman directo, sin sesion — si el guardia exige sesion, la suite entera se cae; (b) packages/ui/src/data/contexto.tsx:60-83 construye los 18 repos en el CUERPO del render, sin useMemo, asi que si la sesion se pasara como argumento a los factories, cada tick de un temporizador de inactividad cambiaria la identidad del objeto `repos` y volveria a disparar en bucle todos los useEffect(..., [repo]) de la app (ejemplo real: packages/ui/src/componentes/SeccionBitacora.tsx:22-24).

LA SOLUCION, ya decidida, implementala tal cual: la sesion viaja PEGADA AL DRIVER.

Crea packages/core/src/db/sesion.ts con:
- export interface SesionRepo { usuarioId: string; rol: RolUsuario; permisos: ReadonlySet<Permiso> }
- export interface PortadorSesion { actual: SesionRepo | null } — objeto de identidad ESTABLE con campo mutable. Ese es todo el truco: cambiar de usuario muta portador.actual, no recrea nada.
- export function conSesion(db: SqlDriver, portador: PortadorSesion): SqlDriver — devuelve un driver que delega exec/run/all/get/close en el original y lleva la referencia al portador.
- export function sesionDe(db: SqlDriver): SesionRepo | null y export function usuarioDe(db: SqlDriver): string | null.
- export class PermisoError extends Error — mismo patron que ValidacionError en packages/core/src/repos/producto-repo.ts:41-46 (clase exportada, importada por los demas repos, sin dependencia circular). Expone el permiso faltante y el rol.
- export function exigirPermiso(db: SqlDriver, permiso: Permiso): void — si sesionDe(db) es null NO LANZA (modo permisivo: driver sin sesion adjunta = comportamiento actual = instalaciones existentes y los 18 tests siguen funcionando; deja esta decision explicita en el codigo como una constante o funcion con nombre, no como un if mudo). Si hay sesion y no tiene el permiso, lanza PermisoError.
Exporta todo desde packages/core/src/index.ts.

CABLEADO:
1. En bitacora-repo.ts, registrarAccion rellena usuario_id con input.usuarioId ?? usuarioDe(db). Un usuarioId explicito SIEMPRE gana. Los 9 sitios que la llaman NO se modifican por esto.
2. Mete exigirPermiso(db, "...") como PRIMERA linea de escritura (antes de validar y antes de cualquier INSERT/UPDATE) en los 9 puntos sensibles, que son exactamente donde ya se llama registrarAccion: producto-repo.ts:150 y :180, cliente-repo.ts:114, proveedor-repo.ts:77, compra-repo.ts:163, corte-caja-repo.ts:138, devolucion-repo.ts:198, factura-repo.ts:386 y :435. Sube la llamada al principio del metodo, no la dejes junto a registrarAccion al final: el guardia tiene que impedir la escritura, no anotarla despues.
3. EL CASO DE USO MAS OBVIO DEL CLIENTE, no lo pases por alto: hoy desde la pantalla de Ventas cualquiera abre el formulario completo de un producto y le cambia precio y costo (packages/ui/src/pantallas/Ventas.tsx:564 abrirEdicionProducto, :602 productos.actualizar). "El cajero solo ve Ventas" NO alcanza. El guardia de producto.editar tiene que estar en productoRepo.actualizar, no en el boton.
4. Rellena el usuario por defecto desde la sesion en los puntos de entrada que ya aceptan usuario_id como parametro opcional y hoy reciben null siempre: factura-repo.ts:25 (AbrirTicketInput.usuario_id), corte-caja-repo.ts:24 (RegistrarCorteInput.usuarioId), cotizacion-repo.ts:29, bitacora-repo.ts:12. El parametro explicito siempre gana sobre el de la sesion.

NO TOQUES: packages/ui, packages/web, packages/desktop (el cableado de la UI es RBAC-05), las migraciones, ni NINGUNO de los 18 archivos de packages/core/test/ que ya existen — que sigan verdes sin editarlos es el criterio de aceptacion mas importante de esta tarea. Tampoco cambies la firma de crearXxxRepo ni la de registrarAccion. No uses BEGIN/COMMIT: el SqlDriver no tiene transacciones (packages/core/src/db/driver.ts:11-22).

AL TERMINAR: `pnpm -r test` y `pnpm -r typecheck` verdes, y `git diff --stat packages/core/test/` mostrando SOLO el archivo de test nuevo.
```

#### Archivos a tocar

- `packages/core/src/db/sesion.ts`
- `packages/core/src/index.ts`
- `packages/core/src/repos/bitacora-repo.ts`
- `packages/core/src/repos/producto-repo.ts`
- `packages/core/src/repos/cliente-repo.ts`
- `packages/core/src/repos/proveedor-repo.ts`
- `packages/core/src/repos/compra-repo.ts`
- `packages/core/src/repos/corte-caja-repo.ts`
- `packages/core/src/repos/devolucion-repo.ts`
- `packages/core/src/repos/factura-repo.ts`
- `packages/core/src/repos/cotizacion-repo.ts`
- `packages/core/test/sesion-guardia.test.ts`

#### Criterios de aceptacion

- [ ] La firma crearXxxRepo(db) no cambia en ningun repo, y registrarAccion sigue siendo (db, input).
- [ ] Los 18 archivos de test preexistentes pasan SIN ninguna modificacion.
- [ ] Driver sin sesion adjunta = permisivo, y esa decision esta expresada con un nombre en el codigo, no como un if suelto.
- [ ] El portador es un objeto de identidad estable con campo mutable: cambiar de usuario no obliga a reconstruir los repos.
- [ ] En los 9 puntos sensibles exigirPermiso se ejecuta antes de cualquier escritura, no junto a registrarAccion al final.
- [ ] productoRepo.actualizar esta guardado (es la puerta que hoy deja a un cajero cambiar precio y costo desde Ventas).
- [ ] PermisoError se exporta desde sesion.ts, es instanceof Error y expone permiso y rol.
- [ ] No hay BEGIN/COMMIT en ningun archivo tocado.

#### Pruebas a escribir primero (TDD)

- Con un driver SIN sesion adjunta, productoRepo.actualizar funciona igual que hoy (modo permisivo).
- Con sesion de cajero, productoRepo.actualizar lanza PermisoError Y la fila del producto queda sin cambios al releerla (el guardia corta antes de escribir).
- Con sesion de cajero, productoRepo.crear lanza PermisoError.
- Con sesion de cajero, facturaRepo.eliminarTicket lanza PermisoError.
- Con sesion de supervisor, compraRepo.registrar funciona y la fila de bitacora queda con usuario_id igual al del supervisor.
- Con sesion de cajero, corteCajaRepo.registrarCorte lanza PermisoError; con sesion de supervisor funciona.
- Con sesion adjunta, registrarAccion sin usuarioId explicito graba el usuario de la sesion en lugar de NULL.
- Un usuarioId explicito en el input de registrarAccion gana sobre el de la sesion.
- abrirTicket() sin usuario_id explicito guarda factura.usuario_id con el usuario de la sesion.
- registrarCorte() y cotizacion.crear() guardan usuario_id de la sesion.
- Tras mutar portador.actual a otro usuario, el MISMO objeto repo creado antes del cambio ya escribe el usuario nuevo (no hace falta reconstruir repos).
- PermisoError es instanceof Error, expone el permiso faltante y el rol, y su mensaje es legible para mostrar en la UI.
- El driver envuelto por conSesion delega correctamente exec, run, all, get y close en el driver original.

---

### RBAC-05 — Sesion en la UI: ProveedorSesion, pantalla de acceso por PIN y primer arranque, cableada en PWA y escritorio

**Objetivo.** La app pide identificarse al arrancar, la sesion vive en un contexto propio que envuelve a ProveedorDatos, y desde ese momento todos los repos escriben con el usuario activo.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio — es el punto de entrada de toda la app: si el proveedor de sesion queda mal ordenado respecto de ProveedorDatos, o el portador se reemplaza en vez de mutarse, la app arranca en bucle de re-render o sin repos. | RBAC-03, RBAC-04 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en espanol). Estilo: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada). Sin `any`. Mobile-first (la app se usa en mostrador y en telefono), sin emojis como iconos — usa lucide-react, que ya es dependencia de @sfr/ui.

OJO ANTES DE EMPEZAR: packages/ui NO tiene runner de tests (su package.json solo define `typecheck`). NO agregues vitest ahi. Toda logica que se pueda probar va en packages/core/src/dominio/ y se prueba con la suite de packages/core/test/ que ya existe; los componentes de React solo orquestan.

PASO 0 (obligatorio, CLAUDE.md §2 pide diseno antes de UI): extiende el archivo YA EXISTENTE design-guidelines.md — NO crees un DESIGN.md nuevo. Agrega la pantalla de acceso y el modal de PIN a la tabla de capas zIndex que esta en design-guidelines.md:133-146 (el modal de PIN tiene que quedar por encima de useAlertas, que esta en zIndex 500), y documenta los atajos nuevos en la seccion de teclado de design-guidelines.md:267-288. Recien despues escribe componentes.

QUE CONSTRUIR:
1. packages/ui/src/contexto/Sesion.tsx — ProveedorSesion + useSesion(), imitando el patron de packages/ui/src/contexto/Alertas.tsx (createContext + hook que lanza si se usa fuera del proveedor). Mantiene: usuario activo, permisos resueltos, y las acciones iniciarSesion / cerrarSesion. Internamente crea UN portador { actual: SesionRepo | null } con useRef (identidad estable, se muta, NUNCA se reemplaza) y se lo pasa a conSesion(db, portador) de @sfr/core. Ese driver envuelto es el que recibe ProveedorDatos.
2. packages/ui/src/pantallas/Acceso.tsx — seleccion de usuario (lista de usuarios activos con nombre y rol) + teclado numerico de PIN grande, usable con dedo y con teclado fisico. Usa useModalAccesible (packages/ui/src/hooks/useModalAccesible.ts:19) para la trampa de foco y useAlertas (packages/ui/src/contexto/Alertas.tsx:52) para los avisos de error — no construyas modales desde cero. Los mensajes de fallo salen del motivo que devuelve usuarioRepo.autenticar (pin_incorrecto / inactivo / bloqueado / sin_pin), sin re-implementar ninguna regla del lado del cliente.
3. Primer arranque: si autenticar devuelve motivo 'sin_pin' para el usuario semilla (la instalacion existente tiene usuario-admin con pin_hash NULL), la pantalla pide definir un PIN nuevo y lo guarda con usuarioRepo.cambiarPin. Es el unico camino para que una instalacion ya en uso pase a tener login.
4. Cablea el orden de proveedores: <ProveedorSesion db={driverCrudo}> envuelve a <ProveedorDatos db={driverConSesion}> y este a <AppShell>. Hazlo en packages/web/src/main.tsx (fijate en el guard `iniciado` contra el doble montaje de StrictMode que ya tiene) y en packages/desktop/src/main.tsx. Exporta lo nuevo desde packages/ui/src/index.ts.
5. Manejo del contexto inseguro: si crypto.subtle no existe (PWA servida por http:// sobre la LAN), @sfr/core lanza CriptoNoDisponibleError. Atrapala y muestra un mensaje claro de que hay que servir la app por https o localhost. Nada de catch vacio (CLAUDE.md §4).

DECISION YA TOMADA sobre persistencia de sesion, respetala: la sesion vive EN MEMORIA, espejada en sessionStorage (por pestana) solo para sobrevivir un recargue, y al restaurarla hay que RE-VALIDAR contra la base que el usuario siga activo antes de confiar en ella. NO guardes la sesion activa en SQLite: sql.js persiste con debounce de 150 ms (packages/web/src/db/sqljs-driver.ts:64-80) y solo fuerza el guardado en pagehide/visibilitychange, asi que cerrar la pestana en el momento justo pierde la escritura.

DI ESTO EN EL INFORME FINAL, textualmente: esto es control de disciplina y auditoria, NO una barrera de seguridad. La base entera vive en IndexedDB del navegador (legible desde DevTools) o en un archivo SQLite local sin cifrar, y packages/api/src/plugins/auth.ts:41-44 deja pasar todo como 'dev-local'. No hay servidor validando nada.

NO TOQUES: packages/core/src/repos ni src/db (ya quedaron listos en RBAC-01..04; lo unico nuevo en core es la funcion pura de vigencia de sesion), el array MODULOS ni el switch de render de packages/ui/src/AppShell.tsx (el filtrado por permisos es RBAC-06), packages/ui/src/pantallas/Ventas.tsx, ni ninguna pantalla existente. ProveedorDatos solo cambia en lo minimo necesario para recibir el driver ya envuelto.

AL TERMINAR: `pnpm -r typecheck` verde, `pnpm -r test` verde, y verificacion manual del layout a 375px, 768px y 1440px.
```

#### Archivos a tocar

- `design-guidelines.md`
- `packages/ui/src/contexto/Sesion.tsx`
- `packages/ui/src/pantallas/Acceso.tsx`
- `packages/ui/src/data/contexto.tsx`
- `packages/ui/src/index.ts`
- `packages/web/src/main.tsx`
- `packages/desktop/src/main.tsx`
- `packages/core/src/dominio/sesion-vigencia.ts`
- `packages/core/test/sesion-vigencia.test.ts`

#### Criterios de aceptacion

- [ ] design-guidelines.md actualizado (capas zIndex y teclado) ANTES de los componentes.
- [ ] El portador de sesion se crea con useRef y se muta, nunca se reemplaza: el objeto repos de ProveedorDatos no cambia de identidad al cambiar de usuario ni en ningun tick.
- [ ] Ninguna regla de autenticacion se reimplementa en la UI: los mensajes salen del motivo que devuelve usuarioRepo.autenticar.
- [ ] La sesion restaurada desde sessionStorage se re-valida contra la base antes de usarse.
- [ ] CriptoNoDisponibleError se atrapa y se muestra con un mensaje accionable; no hay catch vacio.
- [ ] No se agrego vitest a packages/ui; la logica testeable quedo en packages/core/src/dominio/.
- [ ] Layout verificado a 375px, 768px y 1440px; objetivos tactiles del teclado de PIN de 44px o mas.
- [ ] pnpm -r typecheck y pnpm -r test verdes.

#### Pruebas a escribir primero (TDD)

- packages/core/test/sesion-vigencia.test.ts: restaurarSesion() con una marca de sessionStorage cuyo usuario ya no esta activo devuelve null.
- restaurarSesion() con una marca cuya ultimaActividad supera el limite de inactividad devuelve null (expirada).
- restaurarSesion() con una marca valida y usuario activo devuelve la sesion con los permisos resueltos del rol.
- restaurarSesion() con contenido de sessionStorage malformado devuelve null sin lanzar y reporta por el callback de aviso.
- Aceptacion manual: en una base ya sembrada (usuario-admin con pin_hash NULL) el arranque lleva a 'define tu PIN' y no a la pantalla de Ventas.
- Aceptacion manual: tras iniciar sesion y cobrar una venta, la fila de factura tiene usuario_id no nulo (verificar con una consulta directa a la base).
- Aceptacion manual: recargar la pestana mantiene la sesion; abrir una pestana nueva la pide de cero.
- Aceptacion manual: la pantalla de acceso es operable solo con teclado (Tab, digitos, Enter) y a 375px de ancho.

---

### RBAC-06 — Navegacion y pantallas por permiso: filtrar modulos, fijar los atajos, resetear el modulo activo y mostrar el usuario en la bitacora

**Objetivo.** Cada rol ve solo sus modulos, cambiar de sesion no deja abierta una pantalla prohibida, la edicion de producto desaparece de Ventas para quien no puede hacerla, y la bitacora por fin dice quien hizo cada cosa.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio — AppShell es el archivo por el que pasa toda la navegacion y el filtrado por rol toca la numeracion de atajos que ya esta documentada; un reset de modulo mal hecho deja pantallas prohibidas montadas. | RBAC-04, RBAC-05 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en espanol). Estilo: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada). Sin `any`, mobile-first, iconos de lucide-react (nunca emojis).

OJO: packages/ui NO tiene runner de tests (solo `typecheck`). NO agregues vitest ahi. La logica de "que modulos ve este set de permisos" ya vive en packages/core/src/dominio/permisos.ts (funcion modulosPermitidos, creada en RBAC-02) y se prueba en packages/core/test/permisos.test.ts. La UI solo la consume.

QUE HACER en packages/ui/src/AppShell.tsx:
1. Filtra el array MODULOS (AppShell.tsx:28-31) con modulosPermitidos(permisos) usando useSesion().
2. TRAMPA DE LOS ATAJOS: hoy los Alt+1..Alt+9 se generan por INDICE sobre MODULOS (AppShell.tsx:64-66) y el numero se pinta dentro de cada boton (:126 y :144). Si filtras el array sin mas, el cajero tendria Alt+1=Ventas y el dueno una numeracion distinta para los mismos modulos, lo que contradice la regla de design-guidelines.md:290-292 (el atajo se escribe en el boton). Adopta NUMERACION FIJA POR MODULO: el numero se deriva del indice en el array COMPLETO, no en el filtrado, asi Compras es siempre Alt+5 para todo el mundo y la lista del cajero simplemente tiene huecos. Documenta la decision en design-guidelines.md.
3. TRAMPA DEL RENDER: el cuerpo renderiza con `activo === "Compras" && <Compras />` (AppShell.tsx:190-198) sin consultar nada. Filtrar la barra lateral NO impide que la pantalla se monte: tras un cambio de usuario a cajero, si `activo` seguia en 'Compras', el cajero ve Compras. Resetea `activo` al primer modulo permitido cada vez que cambia el usuario de la sesion, y ademas condiciona el render a que `activo` este dentro de los modulos permitidos. Las dos cosas, no una.
4. Muestra el usuario activo y su rol en la cabecera, con boton de cerrar sesion.

QUE HACER en packages/ui/src/pantallas/Ventas.tsx:
5. Esconde el boton "Modificar" que abre abrirEdicionProducto (Ventas.tsx:564) y el modal de edicion (Ventas.tsx:1910-1927) cuando la sesion no tiene el permiso producto.editar. IMPORTANTE: esto es SOLO cosmetica. El guardia real ya esta en productoRepo.actualizar desde RBAC-04 — NO lo dupliques aqui ni muevas ninguna regla a la UI. Lo que si tienes que hacer es atrapar PermisoError (exportado por @sfr/core) alrededor de productos.actualizar (Ventas.tsx:602) y mostrarlo con useAlertas().avisar, para que si alguna ruta llega igual, el usuario vea un mensaje y no un error crudo.

QUE HACER en packages/ui/src/componentes/SeccionBitacora.tsx:
6. Agrega la columna 'Usuario' a la tabla (hoy tiene Fecha / Accion / Entidad / Detalle, SeccionBitacora.tsx:42-64). El id se resuelve a nombre con un mapa cargado una sola vez desde usuarioRepo.listar(), no con una consulta por fila. Ojo con el colSpan={4} de la fila vacia: hay que subirlo. Filas antiguas con usuario_id NULL se muestran como '—'.

NO TOQUES: packages/core/src/repos ni src/db (quedaron cerrados en RBAC-04: no agregues reglas de negocio en la UI; lo unico que puedes ampliar en core es permisos.ts y su test), packages/ui/src/contexto/Sesion.tsx (es de RBAC-05), packages/web ni packages/desktop, ni ninguna otra pantalla. No agregues comprobaciones de permiso que no tengan ya su contraparte en un repo — si una accion necesita guardia y no lo tiene, reportalo, no lo resuelvas en el componente.

AL TERMINAR: `pnpm -r typecheck` y `pnpm -r test` verdes, y verificacion manual a 375px, 768px y 1440px con cada uno de los cuatro roles.
```

#### Archivos a tocar

- `packages/ui/src/AppShell.tsx`
- `packages/ui/src/pantallas/Ventas.tsx`
- `packages/ui/src/componentes/SeccionBitacora.tsx`
- `packages/core/src/dominio/permisos.ts`
- `packages/core/test/permisos.test.ts`
- `design-guidelines.md`

#### Criterios de aceptacion

- [ ] Los Alt+N quedan fijos por modulo (numeracion sobre el array completo), la lista del cajero tiene huecos, y la decision esta documentada en design-guidelines.md.
- [ ] Al cambiar de usuario, `activo` se resetea al primer modulo permitido Y el render esta condicionado a los modulos permitidos: las dos protecciones.
- [ ] Ninguna regla de negocio nueva vive en un componente; la UI solo consume modulosPermitidos y el set de permisos.
- [ ] PermisoError se atrapa en Ventas y se muestra con useAlertas, no como error crudo.
- [ ] La bitacora muestra el nombre del usuario, resuelto con un solo listar() cacheado, y el colSpan de la fila vacia esta corregido.
- [ ] pnpm -r typecheck y pnpm -r test verdes.

#### Pruebas a escribir primero (TDD)

- permisos.test.ts: modulosPermitidos para cajero devuelve exactamente ['Ventas'].
- permisos.test.ts: modulosPermitidos para supervisor incluye Ventas, Compras y 'Corte de caja' y NO incluye Configuracion.
- permisos.test.ts: modulosPermitidos para dueno y superadmin incluye los 9 modulos del array MODULOS de AppShell (assert contra la lista literal, para que agregar un modulo sin mapearlo rompa el test).
- permisos.test.ts: el numero de atajo derivado de un modulo es el mismo para cajero y para dueno (funcion pura de numeracion fija, probada en core).
- Aceptacion manual: entrando como cajero la barra lateral muestra solo Ventas y Alt+5 no abre Compras.
- Aceptacion manual: estando en Compras como dueno y cambiando de sesion a cajero, la pantalla pasa a Ventas y Compras no se monta.
- Aceptacion manual: como cajero no aparece el boton Modificar en la busqueda de productos de Ventas.
- Aceptacion manual: la bitacora muestra el nombre del cajero en las ventas hechas tras el login, y '—' en las filas viejas.

---

### RBAC-07 — Gestion de personal, bloqueo por inactividad y cambio rapido de usuario en el punto de venta

**Objetivo.** El dueno puede crear, editar y desactivar usuarios desde la app, la sesion se bloquea sola por inactividad o a mano, y en el mostrador se cambia de cajero sin reiniciar nada.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto — junta una pantalla CRUD nueva con un temporizador global, y el temporizador es exactamente el detonante del bucle de re-render de ProveedorDatos (repos construidos sin useMemo); si esa parte se hace mal, la app queda lenta de forma dificil de diagnosticar. Se puede partir en dos si el agente no llega en una sesion: Personal por un lado, bloqueo y cambio rapido por el otro. | RBAC-05, RBAC-06 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** El propio plan lo admite por escrito en su campo de riesgo: 'Se puede partir en dos si el agente no llega en una sesion'. Junta una pantalla CRUD completa (Personal, con edicion de excepciones de permiso por usuario), un temporizador global de inactividad con modal de bloqueo, el cambio rapido de usuario en el punto de venta con una decision de producto sin cerrar sobre el ticket abierto, mas funciones puras nuevas en core con sus tests, mas dos secciones de design-guidelines. Ademas es la tarea que puede detonar el bucle de re-render del proveedor de datos.
>   **Arreglo.** Partirla, no 'poder partirla': (A) pantalla Personal con su CRUD y las excepciones de permiso; (B) bloqueo por inactividad + cambio rapido de usuario, con la verificacion manual explicita de que la bitacora no se recarga sola en cada tick. Y cerrar con el cliente lo del ticket abierto ANTES de arrancar (B), porque si no el agente se queda esperando una decision a mitad de sesion.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en espanol). Estilo: cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada). Sin `any`, mobile-first, iconos de lucide-react (nunca emojis).

OJO: packages/ui NO tiene runner de tests (solo `typecheck`). NO agregues vitest ahi. Toda logica testeable (cuando toca bloquear, que pasa con un ticket abierto al cambiar de usuario) va como funcion pura a packages/core/src/dominio/ y se prueba en packages/core/test/.

A) Pantalla Personal — packages/ui/src/pantallas/Personal.tsx
- CRUD de usuarios contra usuarioRepo (creado en RBAC-03): listar, crear, editar nombre y rol, resetear PIN, activar/desactivar, y editar las excepciones de permiso por usuario (el override de permisos_json, que guarda SOLO excepciones sobre los defaults del rol).
- Imita el patron de una pantalla CRUD que ya existe: packages/ui/src/pantallas/Clientes.tsx (estructura, tabla con s.tabla/s.th/s.td de packages/ui/src/estilos.ts, modal de formulario, confirmaciones con useAlertas().confirmar).
- Se registra como modulo nuevo en AppShell (array MODULOS, mapa ICONO y el switch de render), visible solo con el permiso personal.gestionar. Como RBAC-06 dejo la numeracion de atajos fija por modulo, agregarlo al final del array no reordena los atajos de nadie.
- NO reimplementes ninguna regla: que no se pueda desactivar al ultimo dueno, la longitud del PIN, los roles validos — todo eso ya lanza ValidacionError desde el repo. Atrapalo y muestralo con useAlertas.

B) Bloqueo de sesion
- Un hook useBloqueoInactividad en packages/ui/src/hooks/ que, pasado el limite sin actividad, pone la sesion en estado bloqueado y muestra el modal de PIN pidiendo el PIN DEL MISMO usuario (bloqueo de pantalla, no cierre de sesion — confirma este comportamiento con el cliente antes de fijarlo, esta en la lista de decisiones abiertas).
- La decision de si toca bloquear va como funcion PURA en packages/core/src/dominio/sesion-vigencia.ts (ya creada en RBAC-05): debeBloquear(ultimaActividad, ahora, limiteMinutos). El hook solo la llama.
- TRAMPA CRITICA: packages/ui/src/data/contexto.tsx:60-83 construye los 18 repos en el cuerpo del render, SIN useMemo. Si tu temporizador provoca un re-render del proveedor cada minuto, el objeto repos cambia de identidad en cada tick y TODOS los useEffect(..., [repo]) de la app se re-disparan en bucle (ejemplo real: packages/ui/src/componentes/SeccionBitacora.tsx:22-24). El temporizador tiene que vivir en refs y no propagar re-renders del proveedor de datos; el portador de sesion creado en RBAC-05 es un ref mutable justamente para esto. Verifica el bucle a mano: abre la bitacora y comprueba que no recarga sola cada tick.
- Bloqueo manual con atajo, usando useAtajosTeclado (packages/ui/src/hooks/useAtajosTeclado.ts:35). Mientras la app este bloqueada, apaga los atajos de las pantallas pasando activo = false — para eso existe ese segundo parametro.

C) Cambio rapido de usuario en el punto de venta
- Atajo global (por ejemplo Ctrl+U) que abre el modal de PIN sobre la pantalla de Ventas sin desmontar nada, cambia el usuario del portador de sesion y sigue.
- DECISION QUE HAY QUE CONFIRMAR CON EL CLIENTE ANTES DE IMPLEMENTAR: que pasa con un ticket abierto al cambiar de usuario — se queda a nombre del cajero anterior, se transfiere al nuevo, o hay que cerrarlo primero. Implementa la que confirme y deja la regla como funcion pura en core, no enterrada en el componente.
- Tras el cambio, el reseteo del modulo activo ya lo hace AppShell desde RBAC-06; no lo dupliques.

D) Documenta los atajos nuevos en la seccion de teclado de design-guidelines.md:267-288 y el modal de bloqueo en la tabla de capas zIndex de design-guidelines.md:133-146 (tiene que quedar por encima de useAlertas, que esta en zIndex 500).

NO TOQUES: ningun repo de packages/core/src/repos/ (quedaron cerrados en RBAC-03 y RBAC-04), el guardia de sesion.ts, packages/web ni packages/desktop, ni las pantallas Ventas/Productos/Clientes salvo para colgar el atajo de cambio rapido. No metas reglas de negocio en componentes.

AL TERMINAR: `pnpm -r typecheck` y `pnpm -r test` verdes, verificacion manual a 375px/768px/1440px, y comprobacion explicita de que la bitacora no se recarga sola en cada tick del temporizador.
```

#### Archivos a tocar

- `packages/ui/src/pantallas/Personal.tsx`
- `packages/ui/src/hooks/useBloqueoInactividad.ts`
- `packages/ui/src/contexto/Sesion.tsx`
- `packages/ui/src/AppShell.tsx`
- `packages/ui/src/index.ts`
- `packages/core/src/dominio/sesion-vigencia.ts`
- `packages/core/test/sesion-vigencia.test.ts`
- `design-guidelines.md`

#### Criterios de aceptacion

- [ ] La pantalla Personal solo aparece con el permiso personal.gestionar y no reimplementa ninguna regla del repo.
- [ ] Las excepciones por usuario se guardan en permisos_json como diferencias respecto del rol, nunca como la lista completa.
- [ ] debeBloquear vive en core como funcion pura y esta cubierta por tests; el hook solo la invoca.
- [ ] El temporizador de inactividad NO provoca re-renders de ProveedorDatos: verificado a mano con la bitacora abierta durante varios ticks.
- [ ] Mientras la app esta bloqueada, los atajos de las pantallas estan apagados via el parametro activo de useAtajosTeclado.
- [ ] El comportamiento del ticket abierto al cambiar de usuario esta confirmado con el cliente y expresado como funcion pura en core.
- [ ] Atajos nuevos y capa del modal de bloqueo documentados en design-guidelines.md.
- [ ] pnpm -r typecheck y pnpm -r test verdes; layout verificado a 375px, 768px y 1440px.

#### Pruebas a escribir primero (TDD)

- sesion-vigencia.test.ts: debeBloquear devuelve false justo por debajo del limite y true justo por encima.
- sesion-vigencia.test.ts: debeBloquear con limite 0 o negativo no bloquea (bloqueo desactivado) y no lanza.
- sesion-vigencia.test.ts: la funcion que decide que hacer con un ticket abierto al cambiar de usuario devuelve el resultado esperado para ticket vacio, ticket con lineas y ticket ya cobrado.
- usuario-repo.test.ts (ampliar): guardar una excepcion de permiso para un usuario y releerlo devuelve permisos_json con SOLO esa clave, y resolverPermisos sobre el usuario releido refleja la excepcion.
- Aceptacion manual: como dueno, crear un cajero nuevo, cerrar sesion, entrar con el cajero y comprobar que solo ve Ventas.
- Aceptacion manual: como dueno, quitarle a un cajero el permiso de cobrar y comprobar que la accion falla con un mensaje claro (PermisoError atrapado), no con un error crudo.
- Aceptacion manual: intentar desactivar al unico dueno muestra el mensaje de ValidacionError y no desactiva nada.
- Aceptacion manual: dejar la app quieta hasta pasar el limite y comprobar que aparece el modal de bloqueo, que Esc no lo cierra y que los atajos de pantalla no responden.
- Aceptacion manual: con la bitacora abierta, dejar correr el temporizador varios minutos y confirmar que la tabla no se recarga sola (el bucle de useEffect no se disparo).
- Aceptacion manual: con un ticket abierto en Ventas, hacer el cambio rapido de usuario y confirmar que el ticket queda como se acordo con el cliente.

---

### RBAC-08 — Pantalla Soporte (solo superadmin)

**Objetivo.** El superadmin tiene herramientas de soporte que el dueno no tiene, de modo que el rol deja de ser "el dueno con otro nombre" y sirve para lo que el cliente lo pidio: dar soporte a distancia.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | medio — toca respaldo y restauracion, que son las operaciones mas destructivas de la app | RBAC-02, RBAC-03, RBAC-04, PLATAFORMA-03, PLATAFORMA-07 |

> [!WARNING]
> **Esta tarea la anadieron los revisores.** El borrador definia el superadmin como "todos los
> permisos" y nada mas. Pediste ese rol con dos verbos — *dar soporte* y *modificar la app* — y
> ninguno tenia tarea: el resultado era `superadmin == dueno`.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript
estricto, TODO en espanol). TDD con vitest: rojo primero. Lee antes plan/00-CONVENCIONES.md.

CONTEXTO YA VERIFICADO, no lo re-verifiques:
- La tabla `_migracion` (id, nombre, aplicada_at) la crea el migrador en
  packages/core/src/db/migrator.ts:9-14 y HOY NO LA LEE NADIE. Es la fuente de verdad de que
  version de esquema tiene la instalacion del cliente.
- packages/core/src/repos/backup-repo.ts solo EXPORTA, con una lista TABLAS escrita a mano
  (lineas 9-23) que ya perdio tablas al agregarse migraciones. PLATAFORMA-03 la sustituye por
  descubrimiento sobre sqlite_master y anade importarTodo(). REUSA eso, no reimplementes el volcado.
- bitacora-repo.listar() (bitacora-repo.ts:62-80) filtra por entidad y fecha y tiene LIMIT 100
  fijo. No tiene paginacion por desplazamiento.
- El permiso `soporte.acceder` lo declara RBAC-02 en el catalogo cerrado, EXCLUSIVO del superadmin:
  no entra en los defaults del rol dueno.

QUE HACER — cinco piezas, todas detras del mismo permiso:

1. DIAGNOSTICO (solo lectura). Un metodo nuevo en core, `soporte-repo.diagnostico()`, que devuelva:
   - version de la app (importala de package.json, no la escribas a mano)
   - las migraciones aplicadas leidas de `_migracion`: id, nombre y fecha, ordenadas
   - el conteo de filas por tabla, descubriendo las tablas con sqlite_master igual que hace el
     respaldo de PLATAFORMA-03. NO escribas otra lista de tablas a mano: es el bug que acabamos
     de quitar del respaldo.
   - tamano aproximado de la base (page_count * page_size via PRAGMA)
   Esto es lo que te va a permitir contestar "que version tiene el cliente" sin pedirle capturas.

2. RESPALDO Y RESTAURACION. Boton de exportar (reusa backup.exportarTodo) y de restaurar (reusa
   el importarTodo de PLATAFORMA-03). La restauracion PIDE CONFIRMACION ESCRITA: el usuario tiene
   que teclear el nombre del negocio para confirmar. Es la unica operacion de la app que destruye
   datos del cliente de forma irreversible.

3. RESETEAR EL PIN DE CUALQUIER USUARIO SIN CONOCER EL ACTUAL. Es el caso real que hoy no tiene
   salida: el dueno se bloquea solo y nadie puede entrar. usuarioRepo.cambiarPin() de RBAC-03 debe
   aceptar una opcion `omitirPinActual` que SOLO se concede con el permiso soporte.acceder,
   verificado con exigirPermiso() dentro del repo. Registra SIEMPRE en bitacora quien resetea el
   PIN de quien; es una accion que hay que poder auditar despues.

4. BITACORA SIN FILTRO CON PAGINACION. Anade `desplazamiento` (offset) a FiltroBitacora y al
   listar() del repo, y una vista que recorra toda la bitacora sin el filtro por entidad. El dueno
   ve la bitacora resumida en Configuracion; el superadmin la ve entera.

5. MODO MANTENIMIENTO. Un flag que bloquee la venta mientras se restaura un respaldo, para que
   nadie facture contra una base a medio restaurar. Coordina con NEGOCIO-FLAGS: si ya existe la
   seccion de flags de negocio, este vive ahi; si no, ponlo en el mismo sitio y avisalo.

DONDE VA EL GUARDIA: en el REPO, con exigirPermiso(db, 'soporte.acceder') al principio de CADA
metodo de escritura y de diagnostico. Un dueno que llame soporteRepo.diagnostico() a mano desde la
consola tiene que recibir PermisoError. Esconder la pantalla no es el control; es la cortesia.

COMO ENTRA EN LA NAVEGACION: NO anadas un decimo item al menu lateral — rompe el esquema de
atajos Alt+1..Alt+9 y es el parche que el proyecto ya tuvo que hacer una vez (ver el comentario en
ConsultaFacturas.tsx:308-310). PLATAFORMA-07 deja el registro de modulos con soporte para
`atajo: null`: registra Soporte con atajo null y permiso 'soporte.acceder'.

DEFINE POR ESCRITO, en el reporte de la tarea, que significa "modificar la app" en el pedido
original del cliente. Hoy es una frase sin contenido tecnico: puede ser actualizar la version,
cambiar configuracion en remoto, o nada de eso. No lo implementes adivinando.

NO TOQUES: factura-repo.ts, Ventas.tsx, ninguna migracion de otra banda.
```

#### Archivos a tocar

- `packages/core/src/repos/soporte-repo.ts` (nuevo)
- `packages/core/src/repos/bitacora-repo.ts` (anadir desplazamiento)
- `packages/core/src/repos/usuario-repo.ts` (opcion `omitirPinActual`)
- `packages/core/src/repos/index.ts`
- `packages/ui/src/pantallas/Soporte.tsx` (nuevo)
- `packages/ui/src/navegacion/modulos.ts`
- `packages/ui/src/data/contexto.tsx`
- `packages/core/test/soporte-repo.test.ts` (nuevo)

#### Criterios de aceptacion

- [ ] Un usuario con rol dueno recibe `PermisoError` al llamar cualquier metodo de `soporte-repo` directamente, sin pasar por la pantalla
- [ ] El diagnostico lista las migraciones reales leidas de `_migracion`, no una lista escrita a mano
- [ ] El conteo de filas descubre las tablas por `sqlite_master`: una tabla nueva aparece sola, sin tocar codigo
- [ ] Restaurar un respaldo exige confirmacion escrita y deja la base con los mismos conteos que el archivo
- [ ] El superadmin puede resetear el PIN de un dueno bloqueado, y queda registrado en bitacora quien lo hizo
- [ ] Soporte no ocupa ninguna combinacion `Alt+N` ni desplaza los atajos de los nueve modulos existentes
- [ ] El reporte de la tarea contiene la definicion escrita de "modificar la app"
- [ ] `pnpm -r test` y `pnpm -r typecheck` en verde

#### Pruebas a escribir primero (TDD)

- `diagnostico()` con sesion de cajero lanza `PermisoError`; con dueno lanza `PermisoError`; con superadmin responde
- `diagnostico()` devuelve tantas migraciones como filas tenga `_migracion` tras `migrate()`
- El conteo de filas incluye una tabla creada en una migracion posterior sin tocar el codigo del repo
- `cambiarPin(id, nuevo, { omitirPinActual: true })` sin permiso `soporte.acceder` lanza `PermisoError`
- `cambiarPin` con `omitirPinActual` escribe una fila en `bitacora_accion` con el usuario que lo ejecuto
- Tras restaurar un respaldo exportado, el conteo de filas por tabla coincide fila por fila con el original
- `bitacora.listar({ desplazamiento: 100 })` devuelve la segunda pagina y no repite filas de la primera

---

### RBAC-09 — Versionado real y actualizacion de la app

**Objetivo.** Que una instalacion sepa que version tiene, se entere de que hay una nueva, y se actualice sola sin interrumpir una venta ni un turno abierto.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto — un actualizador mal puesto rompe la caja de un negocio en marcha, y firmar mal deja la app sin poder actualizarse nunca mas | RBAC-08, CAJA-03 |

> [!WARNING]
> **Esta tarea sale de tu definicion de "modificar la app".** No existia en el plan.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Lee antes
plan/00-CONVENCIONES.md. Estilo: cabecera por archivo explicando el por que; sin `any`.

CONTEXTO YA VERIFICADO, y es peor de lo que parece:
- TODOS los package.json del monorepo estan en "version": "0.0.0", y tauri.conf.json tambien
  (linea 4). NO HAY VERSIONADO DE NINGUN TIPO. Un actualizador no tiene nada que comparar: esto
  es lo primero que hay que arreglar, no un detalle.
- packages/desktop/src-tauri/Cargo.toml NO incluye tauri-plugin-updater, tauri.conf.json NO tiene
  bloque "plugins.updater" ni clave publica, y capabilities/default.json solo concede
  core:default, sql:default y sql:allow-execute. El actualizador de escritorio no existe.
- LA PWA YA SE AUTOACTUALIZA EN SILENCIO: vite-plugin-pwa con registerType:"autoUpdate"
  (packages/web/vite.config.ts:10). El service worker se activa al recargar sin avisar a nadie.
  Eso hoy es un riesgo, no una funcionalidad: puede cambiar la app a mitad de una venta.

QUE HACER:

1. VERSIONADO REAL, primero y por separado. Adopta SemVer de verdad: sube la version en el
   package.json raiz, en los de cada paquete y en tauri.conf.json, y haz que la version sea UNA
   sola fuente de verdad que el codigo lea (no una constante escrita a mano en dos sitios).
   La version tiene que aparecer en el diagnostico de RBAC-08. Sin esto el resto no significa nada.

2. ESCRITORIO — tauri-plugin-updater:
   - Anade el plugin a Cargo.toml y a la inicializacion en src-tauri/src/lib.rs.
   - Anade "updater:default" a capabilities/default.json (hoy no esta) y el bloque plugins.updater
     a tauri.conf.json con endpoint y pubkey.
   - GENERA EL PAR DE CLAVES DE FIRMA y guarda la privada FUERA DEL REPOSITORIO. Documenta donde
     vive. Si se pierde, ninguna instalacion ya desplegada podra volver a actualizarse jamas:
     es la clave que valida las actualizaciones futuras. Esto es lo mas delicado de la tarea.
   - La clave privada NO va en .env commiteado ni en el repo. Es un secreto de publicacion.
   - Alojamiento del manifiesto: usa GitHub Releases del repositorio que ya existe. Es lo mas
     barato y no anade infraestructura.

3. PWA — quitar el silencio: cambia registerType a "prompt" y muestra un aviso
   ("Hay una version nueva. Actualizar ahora"). El usuario decide cuando. Que el service worker
   se active solo a mitad de una venta es exactamente lo que hay que evitar.

4. LA REGLA QUE PROTEGE LA CAJA — y es el corazon de esta tarea:
   NUNCA actualizar con un turno de caja abierto o un ticket en progreso. Consulta
   sesionCajaRepo.obtenerAbierta() (CAJA-03) y facturaRepo.listarAbiertos() antes de ofrecer la
   actualizacion. Si hay cualquiera de los dos, aplaza y dilo en pantalla: "Se actualizara al
   cerrar el turno". Una actualizacion que reinicia la app con un ticket a medio armar le cuesta
   una venta al negocio y la confianza al producto.

5. El disparador va en la pantalla Soporte de RBAC-08: "buscar actualizaciones", ver la version
   actual y la disponible, y aplicar. Registra en bitacora quien actualizo y a que version.

6. Documenta el procedimiento de publicacion en un RELEASES.md: como se sube la version, como se
   firma, como se publica el release, y como se verifica que una instalacion lo recibio.

NO TOQUES: ninguna migracion, factura-repo.ts, ni la logica de venta. Esta tarea LEE el estado de
caja y de tickets; no lo modifica.
```

#### Archivos a tocar

- `package.json` y los `packages/*/package.json` (versionado real)
- `packages/desktop/src-tauri/tauri.conf.json`
- `packages/desktop/src-tauri/Cargo.toml`
- `packages/desktop/src-tauri/src/lib.rs`
- `packages/desktop/src-tauri/capabilities/default.json`
- `packages/web/vite.config.ts`
- `packages/ui/src/pantallas/Soporte.tsx`
- `RELEASES.md` (nuevo)

#### Criterios de aceptacion

- [ ] La version sale de **una sola** fuente de verdad y aparece en el diagnostico de Soporte
- [ ] El escritorio detecta, descarga y aplica una actualizacion firmada desde GitHub Releases
- [ ] La clave privada de firma vive **fuera del repositorio** y su ubicacion esta documentada
- [ ] La PWA **pregunta** antes de activar una version nueva; ya no se actualiza en silencio
- [ ] Con un turno abierto **o** un ticket en progreso, la actualizacion se aplaza y lo explica en pantalla
- [ ] Queda en bitacora quien actualizo y a que version
- [ ] `RELEASES.md` describe el procedimiento completo de publicacion
- [ ] `pnpm -r test` y `pnpm -r typecheck` en verde

#### Pruebas a escribir primero (TDD)

- La funcion pura que decide si se puede actualizar devuelve `false` con un turno abierto
- Devuelve `false` con un ticket en estado `abierta`, aunque no haya turno
- Devuelve `true` solo con caja cerrada y sin tickets abiertos
- La comparacion de versiones SemVer ordena correctamente `0.9.0 < 0.10.0` (el caso que rompe la comparacion de cadenas)
- Una version igual o menor a la instalada no se ofrece como actualizacion

---

### RBAC-10 — Configuracion remota (solo superadmin)

**Objetivo.** Poder cambiar la configuracion de una instalacion sin viajar hasta el negocio, sin que eso se convierta en una puerta de entrada al sistema.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | **alto** — es un canal para cambiar el comportamiento de la app de un cliente desde fuera | MULTICAJA-07, RBAC-04, RBAC-08, NEGOCIO-FLAGS |

> [!WARNING]
> **Esta tarea sale de tu definicion de "modificar la app".** No existia en el plan.

> [!CAUTION]
> **Leelo antes de aprobar esta tarea.** Un canal de configuracion remota sobre una app cuyo
> backend hoy **deja pasar todo como `dev-local`** (`packages/api/src/plugins/auth.ts:41-44`), cuya
> base de datos esta **sin cifrar**, y cuyo WebView corre con **`csp: null`**
> (`tauri.conf.json:22`), es una forma de controlar el negocio de tu cliente desde fuera. No se
> construye hasta que la autenticacion real de `@sfr/api` exista y funcione — la que hoy es un
> andamio. Si alguna vez hay que elegir entre comodidad de soporte y esta barrera, gana la barrera.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Lee antes
plan/00-CONVENCIONES.md. Estilo: cabecera por archivo explicando el por que; sin `any`.

NO EMPIECES si no se cumplen las dos condiciones previas:
  (a) MULTICAJA-07 aterrizo: existe el ApiClient centralizado y @sfr/api con token por caja.
      La configuracion remota VIAJA POR ESA MISMA INFRAESTRUCTURA. No inventes un segundo canal
      ni un segundo cliente HTTP: CLAUDE.md exige un unico ApiClient y hoy el unico fetch del repo
      es packages/ui/src/data/chatbotCliente.ts, con su propio BASE_URL y su propio manejo de
      errores — migralo tambien.
  (b) La verificacion real de JWT en packages/api/src/plugins/auth.ts existe. Hoy ese archivo
      deja pasar TODA solicitud como usuario 'dev-local' si no hay Supabase configurado. Construir
      configuracion remota encima de eso es abrir la puerta y quitarle la cerradura.

LAS CUATRO REGLAS QUE DEFINEN ESTA TAREA. Si una se rompe, la tarea esta mal hecha:

1. SOLO TIRA (pull), NUNCA EMPUJA. La instalacion pregunta cada cierto tiempo si hay
   configuracion nueva. El servidor NO abre conexiones hacia la caja del cliente. Una caja que
   acepta conexiones entrantes es una caja expuesta.

2. LISTA BLANCA DE CLAVES, NUNCA CODIGO. Solo se pueden cambiar en remoto claves de configuracion
   declaradas explicitamente en una constante del codigo — los flags de NEGOCIO-FLAGS y poco mas.
   NADA de SQL, nada de JavaScript, nada de rutas de archivo, nada de "ejecuta esto". Si el
   payload trae una clave que no esta en la lista, se descarta entera y se registra el intento.

3. VALIDACION EN CORE, IGUAL QUE SI LO TECLEARA EL DUENO. La configuracion remota entra por el
   MISMO negocioRepo.guardar() con la MISMA validacion. Un umbral negativo o una politica_costo
   invalida se rechazan vengan de donde vengan. No hay un camino privilegiado que se salte las
   reglas de negocio.

4. AUDITORIA Y REVERSIBILIDAD. Cada cambio remoto deja fila en bitacora_accion con quien lo
   ordeno, que clave cambio, valor anterior y valor nuevo. El dueno tiene que poder VER en
   Configuracion que su instalacion esta bajo configuracion remota y poder DESACTIVARLA. Es su
   negocio, no el tuyo: no puede ser un canal que el no ve y no puede cerrar.

QUE HACER:
- Interruptor de aceptacion en la instalacion (apagado por defecto; el dueno lo enciende).
- Endpoint en @sfr/api que devuelva la configuracion pendiente para una instalacion, autenticado
  con el token por caja de MULTICAJA-07 y exigiendo el permiso soporte.acceder del lado del
  servidor, no solo del cliente.
- Aplicacion en el arranque y cada N minutos, con degradacion: si no hay red, la app sigue
  funcionando con su configuracion local. Una falla de red NUNCA puede dejar la caja sin vender —
  es la regla de resiliencia del proyecto.
- Seccion en la pantalla Soporte (RBAC-08) para ver y ordenar cambios, y seccion en Configuracion
  para que el dueno vea el estado y pueda desconectarse.

NO TOQUES: la logica de venta, las migraciones de otras bandas, factura-repo.ts.
```

#### Archivos a tocar

- `packages/api/src/routes/configuracion.ts` (nuevo)
- `packages/api/src/plugins/auth.ts`
- `packages/ui/src/data/apiClient.ts` (de MULTICAJA-07)
- `packages/core/src/repos/negocio-repo.ts`
- `packages/ui/src/pantallas/Soporte.tsx`
- `packages/ui/src/pantallas/Configuracion.tsx`
- `packages/core/test/configuracion-remota.test.ts` (nuevo)

#### Criterios de aceptacion

- [ ] Solo se aplican claves de la lista blanca; un payload con una clave desconocida se descarta **entero** y queda registrado
- [ ] La configuracion remota pasa por la misma validacion que la manual: un valor invalido se rechaza igual
- [ ] Sin red, la app arranca y opera con su configuracion local, sin degradar la venta
- [ ] Cada cambio remoto deja bitacora con quien, que clave, valor anterior y valor nuevo
- [ ] El dueno ve en Configuracion que su instalacion acepta configuracion remota y puede desactivarla
- [ ] El interruptor viene **apagado** por defecto
- [ ] Nunca se transporta ni se ejecuta codigo, SQL ni rutas de archivo
- [ ] `pnpm -r test` y `pnpm -r typecheck` en verde

#### Pruebas a escribir primero (TDD)

- Un payload con una clave fuera de la lista blanca no aplica **ninguna** de sus claves, ni siquiera las validas
- Un payload con `umbral_diferencia_caja: -5` se rechaza con el mismo `ValidacionError` que la via manual
- Con el interruptor apagado, un payload valido no cambia nada
- Un fallo de red al consultar la configuracion no lanza al arranque: la app queda operativa
- Cada aplicacion exitosa escribe exactamente una fila de bitacora con el valor anterior
- Un payload que intente traer una clave tipo `sql` o `script` se descarta y se registra como intento

---

