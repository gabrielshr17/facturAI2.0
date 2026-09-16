# Plataforma transversal

> Base para los 8 puntos del pedido. 8 tareas: PLATAFORMA-01 a PLATAFORMA-07 (04 y 05 canceladas, ver aviso abajo) mas NEGOCIO-FLAGS.
> Antes de despachar cualquier tarea de este archivo, lee [00-CONVENCIONES.md](./00-CONVENCIONES.md).

> [!IMPORTANT]
> **Los briefs de abajo dicen "migracion 11". Ignora ese numero.** Los escribieron ocho
> agentes en paralelo y los ocho reclamaron el id 11. La banda de ids de esta area es
> **`90-94 (esta area no necesita migracion propia)`**; el reparto completo esta en
> [00-CONVENCIONES.md, seccion 2](./00-CONVENCIONES.md#2-reparto-de-ids-de-migracion-bandas).

> [!CAUTION]
> **PLATAFORMA-04 y PLATAFORMA-05 estan CANCELADAS.** Al ordenar el plan quedo claro que su
> contenido pertenece a otras tareas y mantenerlas aparte duplicaba trabajo:
>
> - El hash de PIN y el catalogo de permisos (PLATAFORMA-04) viven en **RBAC-02**, que los
>   necesita para existir y los define como funciones puras.
> - El guardia de permisos en los repos (PLATAFORMA-05) vive en **RBAC-04**, sobre el portador
>   de sesion adjunto al driver.
> - Lo unico que se rescata de PLATAFORMA-05 es `crearRepos(db)` y `repos/registro.ts`, que
>   pasan a ser parte de **PLATAFORMA-07**.
>
> Se dejan sus briefs abajo porque contienen detalle util, pero **no las despaches como tareas
> independientes**. Y ojo: PLATAFORMA-07 declara `dependeDe: PLATAFORMA-05` — esa dependencia
> hay que reescribirla como RBAC-02 mas el `crearRepos` que la propia PLATAFORMA-07 absorbe.

> [!NOTE]
> **Decision 4 tomada: se mantiene la convencion real del repositorio.** Cabecera por archivo
> explicando el POR QUE de la decision no obvia, y cero comentarios inline decorativos. Donde
> algun brief de abajo diga "sin comentarios en el codigo", **esta superado por esta decision**.

## Estado actual

No existe NADA de plataforma de sesion/permisos/router: cero ocurrencias de "sesion", "login", "permiso" o "autenticacion" en packages/ui/src y packages/core/src (grep); las unicas menciones son las columnas `pin_hash` y `permisos_json` en migrations.ts:50,52. `tipos.ts` no declara ni `Usuario` ni `Caja`. La navegacion es un `useState<Modulo>("Ventas")` en AppShell.tsx:51 sobre una union de 9 literales (AppShell.tsx:24-26), un array `MODULOS` (28-31), un `Record<Modulo, Icono>` (33-43) y una cadena de nueve `{activo === "X" && <X/>}` (189-199); no hay URL, no hay historial, no hay persistencia del modulo activo, no hay lazy loading. Los atajos Alt+N se derivan del INDICE del array (AppShell.tsx:64-66), techo que ya causo dano real: ConsultaFacturas.tsx:308-310 documenta en un comentario que las cotizaciones se metieron como pestana interna "para evitar sumar un decimo item al menu lateral, que romperia el esquema de atajos Alt+1..9". `contexto.tsx` expone solo repos (18 + proveedorFiscal, lineas 27-52) y construye el objeto sin `useMemo` (60-83). Migraciones: array lineal `Migration {id, nombre, sql}` sin `down` ni checksum (migrations.ts:16-20), ids 1..10; el migrador (migrator.ts:8-33) NO usa transacciones (la interfaz `SqlDriver` de driver.ts:11-22 no tiene begin/commit/rollback), calcula `yaAplicadas` UNA vez antes del bucle (17-22) y deduplica solo por `id`, nunca por nombre ni contenido. Los tres drivers divergen: node-sqlite.ts:24 y sqljs-driver.ts:62 hacen `PRAGMA foreign_keys = ON`, tauri-sql-driver.ts NO; y tauri-sql-driver.ts:17-22 parte el SQL de cada migracion por `;` con un `split(";")` ingenuo. Pruebas: solo `@sfr/core` y `@sfr/api` tienen script `test` (vitest 2.1.8); `@sfr/ui`, `@sfr/web` y `@sfr/desktop` no tienen ninguno, ni jsdom ni testing-library, asi que `pnpm -r test` los salta en silencio; 12 archivos de test duplican el mismo helper `nuevaDb()` copiado a mano. Diseno: existe design-guidelines.md (444 lineas, muy completo y con tokens reales) pero NO existe DESIGN.md, y la guia ya tiene drift contra el codigo (design-guidelines.md:293 afirma que `useAtajosTeclado` hace preventDefault antes de mirar el mapa; useAtajosTeclado.ts:42-45 hace lo contrario). No hay ESLint, ni Prettier, ni .github, ni hooks de git en todo el repo. El backend `@sfr/api` deja pasar todo como usuario `dev-local` (auth.ts:40-44) y su `db/schema.sql` (18 CREATE TABLE) mas `sync-rules.yaml` ya estan desincronizados de las migraciones 7, 8 y 10 (les faltan devolucion, devolucion_linea, promocion, cotizacion, cotizacion_linea).

### Lo que ya existe y NO hay que reescribir

| Pieza | Evidencia | Se reutiliza como |
| --- | --- | --- |
| Migrador idempotente con registro en tabla _migracion, ya probado en ambas direcciones (aplica limpio / no reaplica) | `packages/core/src/db/migrator.ts:8-33 y packages/core/test/migrations.test.ts:23-40` | Base para las 8 areas: cada una solo agrega objetos {id, nombre, sql} al array. NO reescribir el migrador; a lo sumo endurecerlo (ver `falta`). |
| Interfaz SqlDriver unica implementada por tres drivers (node:sqlite para tests, sql.js para PWA, tauri-plugin-sql para escritorio) | `packages/core/src/db/driver.ts:11-22` | Cualquier repo nuevo (usuario-repo, caja-repo) se escribe una sola vez contra SqlDriver y corre en los tres entornos sin cambios. |
| Patron uniforme de repo: las 18 factorias tienen exactamente la firma crearXxxRepo(db: SqlDriver) | `packages/core/src/repos/*.ts (grep '^export function crear' devuelve 18 coincidencias identicas)` | Agregar un segundo parametro opcional de contexto de sesion a TODAS es un cambio mecanico y de bajo riesgo; ninguna llamada existente se rompe si es opcional. |
| Tablas `usuario` y `caja` ya creadas en la migracion 1, con pin_hash, permisos_json, rol y activo | `packages/core/src/db/migrations.ts:46-56` | NO hace falta migracion nueva para el modelo base de usuarios/cajas: existe en toda instalacion real desde la version 1. Solo faltan repos y tipos. |
| Seed que ya crea el usuario admin `usuario-admin` y la caja `caja-1` | `packages/core/src/db/seed.ts:37-47` | Identidad por defecto para la primera sesion. OJO: el usuario se crea SIN pin_hash (linea 38-40), asi que el login tiene que soportar 'usuario sin PIN todavia'. |
| Contexto de React ya establecido como patron, con proveedor + hook que lanza si falta el proveedor | `packages/ui/src/data/contexto.tsx:54-89 y packages/ui/src/contexto/Alertas.tsx:49-56` | Molde exacto para ProveedorSesion/useSesion: mismo estilo de createContext<T\|null>(null) + hook que arroja Error con mensaje en espanol. |
| Sistema de diseno completo y coherente: tokens CSS --sfr-* en claro y oscuro, objetos `c` y `s`, y 444 lineas de guia con checklist de pantalla nueva | `packages/ui/src/estilos-globales.css:19-51 (claro) y :56-76 (oscuro); packages/ui/src/estilos.ts:22-41; design-guidelines.md:427-444` | El DESIGN.md que exige CLAUDE.md debe DERIVARSE de design-guidelines.md (renombrar/reencuadrar), no escribirse de cero: los tokens ya son la fuente de verdad y las pantallas ya los consumen. |
| Infraestructura de accesibilidad y teclado ya resuelta: foco atrapado en modales, salto al contenido, navegacion por flechas, tramos responsive | `packages/ui/src/hooks/useModalAccesible.ts:18-52; packages/ui/src/hooks/useBreakpoint.ts:24-121; packages/ui/src/AppShell.tsx:77-82,158` | La pantalla de login y los modulos nuevos (Backoffice, CRM, Usuarios, Caja) heredan esto gratis si usan useModalAccesible() y los hooks de tramo. |
| ErrorBoundary por modulo, remontada con key={activo} | `packages/ui/src/componentes/ErrorBoundary.tsx:19-46 y packages/ui/src/AppShell.tsx:189` | Cada modulo nuevo queda aislado automaticamente; un fallo en Backoffice no tumba Ventas. |
| Bitacora append-only con funcion libre registrarAccion(db, input) que ya acepta usuarioId | `packages/core/src/repos/bitacora-repo.ts:35-55 (campo usuarioId en la linea 12)` | El punto de enganche de la auditoria ya existe: cuando haya sesion, solo hay que pasarle el id real en vez del null actual. |
| crypto.randomUUID() global ya usado como unica fuente de ids, funcionando en Node 24, navegador y WebView de Tauri | `packages/core/src/ids.ts:7` | Precedente que justifica usar globalThis.crypto.subtle (PBKDF2) para el hash de PIN: mismo objeto global, cero dependencias nativas, ya probado en los tres entornos. |
| Vocabulario de permisos ya decidido en el diseno original: rol admin\|cajero y permisos_json con descuentos, anular, ver_corte | `plan.md:84` | Semilla del catalogo de permisos; evita inventar nombres nuevos y contradecir el documento que el cliente aprobo. |
| Patron de sub-navegacion por pestanas dentro de un modulo, ya implementado | `packages/ui/src/pantallas/ConsultaFacturas.tsx:311-340` | Molde listo para Backoffice y CRM, que van a agrupar varias sub-pantallas bajo un solo item del menu. |
| Configuracion.tsx ya funciona como pagina compuesta de secciones independientes (impresora, secuencias NCF, respaldo, bitacora) | `packages/ui/src/pantallas/Configuracion.tsx:153-167` | Lugar natural para colgar SeccionUsuarios y SeccionCajas sin tocar el menu lateral, si se decide no crear modulos nuevos. |
| Workaround de vitest ya resuelto para el postcss ajeno del home del usuario | `packages/core/vitest.config.ts:7-13 y packages/api/vitest.config.ts:5-9` | Copiar ese bloque css.postcss en el vitest.config.ts nuevo de @sfr/ui; sin el, la corrida de tests de UI se rompe en esta maquina. |

### Lo que falta

| Capa | Hueco | Por que importa |
| --- | --- | --- |
| esquema | Ningun rango de ids de migracion asignado por area. El migrador deduplica SOLO por id (migrator.ts:17-22) y no compara nombre ni contenido | Si dos areas eligen id 11, en una base donde ya se aplico el 11 de la primera, el 11 de la segunda NUNCA se ejecuta y su tabla nunca existe: fallo silencioso en tiempo de ejecucion, no en compilacion. Propuesta concreta: bloques de 10 (11-20 usuarios/sesion/permisos, 21-30 caja/turnos, 31-40 precios, 41-50 compras/recepcion, 51-60 CRM/cuentas por cobrar, 61-70 backoffice/reportes, 71-80 fiscal, 81-90 plataforma) y 91-99 reservado para correcciones urgentes, mas un test que falle si hay ids repetidos o huecos fuera de rango |
| esquema | No hay test que valide la integridad del array de migraciones (ids unicos, orden, ausencia de `;` dentro de literales/comentarios, aplicabilidad sobre una base ya migrada a una version anterior) | migrations.test.ts:23-40 solo prueba una base VACIA. Ninguna prueba simula el caso real: base de una instalacion existente con ids 1..10 aplicados a la que llegan los ids nuevos. Es exactamente el escenario que puede romper clientes reales |
| esquema | SqlDriver no expone transacciones (driver.ts:11-22) y migrator.ts no envuelve cada migracion | Una migracion de varios statements que falla a la mitad deja el esquema a medias SIN fila en _migracion; al reintentar, el primer CREATE/ALTER ya aplicado falla ('table already exists' / 'duplicate column name') y la app queda atascada en la pantalla de error (main.tsx:38-40) sin ninguna salida para el usuario. En escritorio es aun mas probable porque el driver aplica statement por statement |
| repo | No existe usuario-repo.ts ni caja-repo.ts, y tipos.ts no declara las interfaces Usuario ni Caja | Cuatro areas (Usuarios, Caja, Backoffice, CRM) dependen de leer y escribir estas dos tablas; sin el repo cada una improvisara su propio SQL suelto y romperan la convencion crearXxxRepo(db) |
| dominio | No hay modulo de hashing de PIN/clave. Cero usos de crypto.subtle en todo el repo (grep) | Sin un `packages/core/src/seguridad/pin.ts` compartido, cada area que toque credenciales inventara el suyo y quedaran hashes incompatibles entre PWA y escritorio. Debe ser PBKDF2-HMAC-SHA256 sobre globalThis.crypto.subtle (async, sin dependencias nativas, disponible en Node 24, navegador y WebView) con sal por usuario y formato versionado tipo `pbkdf2$sha256$<iteraciones>$<sal>$<hash>` para poder subir iteraciones despues sin invalidar PINs |
| repo | Ninguna comprobacion de permisos en ninguna capa. La validacion de negocio esta en los repos (patron ValidacionError) pero no hay equivalente para autorizacion | CLAUDE.md exige que la regla de seguridad viva en la capa de servicio, no en la UI. Filtrar MODULOS en AppShell es cosmetico: cualquiera con acceso al dispositivo llega igual a la operacion. Hace falta un punto unico tipo `exigirPermiso(sesion, 'anular')` que los repos invoquen en las operaciones sensibles (anular factura, aplicar descuento, cerrar caja, ver corte) |
| ui | contexto.tsx no expone sesion ni permisos, y construye el objeto de repos sin useMemo (contexto.tsx:60-83) | Es el unico punto por donde 16 archivos de UI obtienen datos (grep useRepos). Si se le agrega estado de sesion tal como esta, cada cambio de sesion o cada render del proveedor reconstruye las 18 factorias de repo y cambia la identidad del objeto para todos los consumidores |
| repo | Los repos no reciben quien es el actor: usuario_id llega hardcodeado como null incluso en escrituras internas | factura-repo.ts:147 inserta literalmente `null` como usuario_id en movimiento_inventario; lo mismo en producto-repo.ts:176, devolucion-repo.ts:127 y compra-repo.ts:81. La bitacora y los movimientos quedan sin trazabilidad. Hace falta decidir el seam: segundo parametro opcional `crearXxxRepo(db, ctx?)` o una factoria unica `crearRepos(db, sesion)` |
| ui | No hay router ni estado global de navegacion: el modulo activo es un useState local (AppShell.tsx:51) y los nueve modulos estan cableados en cuatro lugares distintos del mismo archivo (union de tipos 24-26, array 28-31, record de iconos 33-43, cadena de renders 189-199) | Agregar Backoffice, CRM, Usuarios y Caja implica editar los cuatro lugares y ademas cada area tocara el MISMO archivo: conflictos de merge garantizados entre las 8 areas. Falta un registro declarativo unico (id, etiqueta, icono, componente, permiso requerido, atajo) del que salgan menu, atajos y render |
| ui | El esquema de atajos Alt+N se calcula desde el indice del array (AppShell.tsx:64-66) | Con mas de 9 modulos genera claves 'Alt+10' que ningun teclado puede producir, y al filtrar por permisos el mismo atajo apunta a modulos distintos segun el rol. El atajo tiene que ser un dato fijo del registro de modulos, no la posicion |
| ui | No existe DESIGN.md; solo design-guidelines.md, que ademas ya tiene drift contra el codigo | CLAUDE.md exige DESIGN.md antes de cualquier trabajo de UI, y las 8 areas van a construir UI. Ademas design-guidelines.md:293 documenta al reves el comportamiento de useAtajosTeclado (useAtajosTeclado.ts:42-45 comprueba el mapa ANTES de preventDefault), asi que un agente que siga la guia al pie de la letra escribira atajos con una premisa falsa |
| build | @sfr/ui no tiene script test, ni vitest, ni jsdom, ni testing-library (packages/ui/package.json) | `pnpm test` (pnpm -r test) salta el paquete en silencio: hoy es imposible probar AppShell, el filtrado por permisos, el proveedor de sesion o cualquier pantalla. El TDD que exige CLAUDE.md solo es posible en core. Requiere decidir y montar: vitest + environment jsdom + @vitejs/plugin-react + @testing-library/react, mas el mismo workaround de css.postcss de core/vitest.config.ts:7-13 |
| build | No hay helper de pruebas compartido: `nuevaDb()` esta copiado a mano en 12 archivos de test | Cuando el arranque cambie (por ejemplo, si migrate pasa a requerir un seed de usuario o una transaccion), habra que editar 12 copias. Falta un packages/core/test/_ayuda.ts con nuevaDb() y helpers de sesion falsa que las 8 areas reutilicen |
| build | No hay ESLint ni Prettier ni CI ni hooks de git en todo el repo (ls de la raiz: sin .eslintrc, sin .prettierrc, sin .github, sin husky) | CLAUDE.md declara al linter autoridad sobre el formato y pide hooks post_tool_use y pre_commit; nada de eso existe. Con 8 areas trabajando en paralelo sobre los mismos archivos, no hay ninguna barrera automatica antes del commit |
| api | Cuatro listas de tablas que hay que mantener en sincronia a mano, y dos ya estan desincronizadas | Al agregar una tabla hay que tocar migrations.ts, backup-repo.ts:9-19 (TABLAS), packages/api/db/schema.sql y packages/api/sync-rules.yaml:14-37. Las migraciones 7, 8 y 10 (devolucion, promocion, cotizacion) nunca se replicaron en las dos ultimas: el respaldo de un cliente ya saldria incompleto si alguien confia en esa lista y el esquema Postgres ya no es traduccion fiel |
| repo | No hay importacion/restauracion de respaldo: backup-repo solo exporta (backup-repo.ts:27-37) | Es la unica red de seguridad ante una migracion que rompa una base real, y no existe. Antes de que ocho areas empiecen a migrar bases de instalaciones en produccion, el camino de vuelta deberia existir |
| esquema | seed() aborta entero si ya hay un negocio (seed.ts:10-11) | Cualquier dato semilla que una area agregue (catalogo de permisos, roles predefinidos, caja por defecto) NUNCA se aplicara en las instalaciones existentes, que son justamente las que importan. El dato inicial debe ir dentro de la migracion, no en seed() |
| ui | No hay estado de arranque para 'hay sesion o no'. Ambos mains montan ProveedorDatos y AppShell directamente y son archivos casi identicos duplicados | packages/web/src/main.tsx:44-48 y packages/desktop/src/main.tsx:44-48 son copias. Si la puerta de login se monta ahi, hay que duplicarla y mantenerla sincronizada en dos paquetes; conviene que viva dentro de @sfr/ui (en AppShell o anidada dentro de ProveedorDatos) para que los shells no cambien |

## Enfoque recomendado

Un solo punto de extension por concepto, y todo lo nuevo opcional para no romper instalaciones reales. Concretamente: (1) las migraciones siguen siendo el mismo array idempotente que ya esta probado — no se reescribe el migrador, se le pone un cinturon: rangos de ids por area documentados en MIGRACIONES.md y un test que falla si dos areas eligen el mismo id, porque hoy migrator.ts:17-22 deduplica solo por id y un choque se manifiesta como una tabla que nunca existe en el equipo del cliente, no como un error de compilacion; (2) atomicidad antes de que ocho areas migren bases de produccion: SqlDriver gana `enTransaccion`, el migrador envuelve cada migracion, y los tres drivers se igualan (hoy el de Tauri ni activa foreign_keys ni parte bien los statements), mas respaldo/restauracion real como camino de vuelta; (3) la autorizacion vive en core, no en la UI: un unico catalogo de permisos y un `exigirPermiso(sesion, permiso)` que invocan los repos en las operaciones sensibles — filtrar el menu en AppShell es cosmetico y cualquiera con acceso al dispositivo llega igual a la operacion; (4) el actor entra por un parametro opcional `crearXxxRepo(db, sesion?)` con un `SESION_LOCAL` por defecto que reproduce exactamente el comportamiento de hoy, asi ninguna de las 60+ llamadas existentes se rompe y el repo sigue compilando entre tarea y tarea; (5) la navegacion pasa de cuatro listas cableadas en AppShell.tsx (union 24-26, array 28-31, record de iconos 33-43, cadena de renders 189-199) a un registro declarativo unico donde el atajo es un dato fijo y no el indice del arreglo — sin eso, las cuatro areas que agregan modulo (Backoffice, CRM, Usuarios, Caja) editan el mismo archivo en los mismos cuatro puntos y el conflicto de merge es seguro, ademas de repetir el parche que ya deformo el producto en ConsultaFacturas.tsx:308-310; (6) sesion y repos en proveedores separados y memorizados, porque meter el estado de sesion en ProveedorDatos tal como esta hoy (contexto.tsx:61-81, sin useMemo) reconstruiria las 18 factorias en cada login para los 16 archivos que llaman useRepos. El orden es estricto de abajo hacia arriba y ninguna tarea mezcla migracion con pantalla.

### Alternativas descartadas

- Montar un router real (react-router / TanStack Router): agrega dependencia y un modelo de URLs que ni la PWA offline ni el WebView de Tauri aprovechan. El registro declarativo de modulos mas el modulo activo persistido cubre menu, atajos, permisos y 'volver donde estaba' sin dependencia nueva. Reconsiderar solo si aparece deep-linking real (abrir una factura por enlace).
- Reemplazar el migrador por uno con checksums y migraciones 'down' (estilo Prisma/Drizzle): el actual ya es idempotente y esta probado en ambas direcciones; sustituirlo justo antes de que ocho areas migren bases de clientes reales es el cambio de mayor riesgo posible. Se endurece (transaccion + deteccion de ids duplicados), no se reemplaza.
- Meter el estado de sesion dentro de ProveedorDatos: cada login, logout o cambio de permisos reconstruiria las 18 factorias de repo y cambiaria la identidad del objeto para los 16 archivos que usan useRepos, disparando efectos en cadena. Van dos proveedores separados y memorizados.
- Resolver la seguridad filtrando MODULOS en AppShell: es cosmetico. Sin exigirPermiso del lado de los datos, un cajero con el dispositivo llega igual a anular una factura. CLAUDE.md exige la regla en la capa de servicio.
- Hashear el PIN con bcrypt/argon2: obligan a dependencia nativa o WASM de terceros, y romperian la paridad PWA/escritorio. PBKDF2 sobre globalThis.crypto.subtle usa el mismo objeto global que ya funciona en los tres entornos (ids.ts:7 usa crypto.randomUUID desde hace meses).
- Sembrar roles, permisos o la caja por defecto en seed(): seed.ts:10-11 aborta entero si ya existe un negocio, asi que ese dato jamas llegaria a las instalaciones existentes, que son justamente las que no se pueden romper. El dato inicial va dentro del SQL de la migracion.
- Montar ESLint, Prettier y CI en esta tanda: el primer lint sobre un repo que nunca se linteo produce miles de cambios de formato justo cuando ocho areas editan en paralelo, y ademas hay un conflicto de convencion sin zanjar (CLAUDE.md exige codigo sin comentarios, el repo esta densamente comentado en espanol). Se difiere a despues del merge de las areas y requiere una decision explicita del cliente sobre los comentarios.
- Poner la puerta de acceso en packages/web/src/main.tsx y packages/desktop/src/main.tsx: son dos archivos casi identicos y habria que mantener la puerta duplicada. Vive dentro de @sfr/ui para que los dos shells no cambien.
- Renombrar design-guidelines.md a DESIGN.md y darlo por hecho: la guia ya tiene drift verificado contra el codigo (design-guidelines.md:293 describe al reves lo que hace useAtajosTeclado.ts:42-45), asi que un agente que la siga al pie de la letra escribiria atajos sobre una premisa falsa. DESIGN.md se deriva y se corrige, no se copia.

## Trampas especificas de esta area

- El driver de escritorio parte el SQL de cada migracion con un split(';') ingenuo (packages/desktop/src/db/tauri-sql-driver.ts:17-22). Consecuencia dura para las 8 areas: en una migracion NO puede haber un punto y coma dentro de un literal de texto, dentro de un comentario `--` ni en el cuerpo de un CREATE TRIGGER (BEGIN...END;). Hoy el repo se salva por casualidad: grep de '--.*;' en migrations.ts no devuelve nada. Un solo comentario en espanol del estilo '-- rol: admin; cajero' rompe el arranque en escritorio y NO en la PWA ni en los tests.
- No existe ninguna transaccion en todo el repo (grep de BEGIN/COMMIT/ROLLBACK/SAVEPOINT en packages/: cero resultados) y SqlDriver ni siquiera puede expresarlas. Una migracion que falle a la mitad deja la base a medias sin registrar nada en _migracion, y el reintento choca con lo ya creado: la app queda permanentemente en la pantalla 'Error al iniciar la base de datos' (main.tsx:38-40) sin boton de recuperacion. Con bases de instalaciones reales esto es perdida de servicio, no un bug de desarrollo.
- migrator.ts:17-22 calcula `yaAplicadas` UNA sola vez antes del bucle y solo compara ids. Dos migraciones con el mismo id en el array se ejecutan AMBAS y la segunda INSERT en _migracion viola la PK: crash en el arranque. Y al reves, si el id ya estaba aplicado en una base, la migracion nueva con ese id se salta en silencio y su tabla jamas se crea. No hay checksum ni comparacion por nombre que lo detecte.
- PRAGMA foreign_keys = ON esta en el driver de Node (node-sqlite.ts:24) y en el de la PWA (sqljs-driver.ts:62) pero NO esta declarado en el de Tauri (tauri-sql-driver.ts). Antes de apoyarse en claves foraneas para usuario_id/caja_id hay que verificar en escritorio real que sqlx las aplica: si no, los tests en Node pasaran validando integridad referencial que en el equipo del cliente no se exige.
- ProveedorDatos construye el objeto de 18 repos como literal en el cuerpo del componente, sin useMemo (contexto.tsx:61-81). Hoy no duele porque su padre casi no re-renderiza, pero meter el estado de sesion en ese mismo proveedor lo convierte en una trampa: cada login, logout o cambio de permisos reconstruye las 18 factorias y cambia la identidad de `repos` para los 16 archivos que llaman useRepos, disparando cualquier efecto que dependa de un repo.
- sql.js guarda en IndexedDB con un debounce de 150 ms (sqljs-driver.ts:64-72). Si migrate() falla a mitad de camino, el temporizador pendiente igual persiste el esquema a medias; y una escritura seguida de un cierre abrupto se pierde salvo que dispare pagehide/visibilitychange (lineas 86-91). Nada de esto ocurre en Node ni en Tauri, asi que un test verde en core no prueba el comportamiento real de la PWA.
- La app ya depende de contexto seguro: ids.ts:7 usa crypto.randomUUID(), que el navegador solo expone en HTTPS o localhost. crypto.subtle (PBKDF2 para el PIN) tiene exactamente la misma restriccion. Si alguien sirve la PWA por HTTP plano en una IP de la LAN — escenario normal para un POS en un colmado — el hashing de PIN no falla con un mensaje claro: crypto.subtle es undefined y revienta. El WebView de Tauri no tiene el problema (tauri.localhost cuenta como origen confiable).
- @sfr/core y @sfr/ui se consumen como codigo fuente TypeScript crudo (main y types apuntan a ./src/index.ts en ambos package.json, y no tienen script build). Cualquier runner de pruebas de UI tiene que transpilar TS y TSX que viene de paquetes del workspace, no de dist. Ademas hay una trampa concreta de este entorno: vitest busca un postcss.config.* hacia arriba y encuentra uno ajeno en el home del usuario — hay que copiar el bloque css.postcss de packages/core/vitest.config.ts:7-13 al config nuevo de UI o la corrida se rompe antes de empezar.
- tsconfig.base.json:16-17 activa noUnusedLocals y noUnusedParameters. Los andamios a medio hacer (un parametro `sesion` aun sin usar, un permiso declarado y no consumido) NO compilan. Hay que escribir el andamiaje ya conectado o el typecheck bloquea a las 8 areas a la vez.
- El repositorio esta densamente comentado en espanol (AppShell.tsx:45-49, useBreakpoint.ts:3-23, y practicamente todos los archivos), lo que contradice de frente la regla 'sin comentarios en el codigo' de CLAUDE.md. Antes de que 8 areas escriban codigo hay que zanjarlo: seguir la convencion real del repo o seguir CLAUDE.md, pero no mezclar ambos estilos en el mismo archivo.
- seed() sale inmediatamente si ya existe un negocio (seed.ts:10-11). Todo dato inicial que una area intente sembrar ahi (roles, permisos por defecto, la caja principal) sera invisible para las instalaciones existentes, que son justamente el caso que no se puede romper. El dato inicial va dentro del SQL de la migracion, no en seed().
- En SQLite, ALTER TABLE ADD COLUMN con clausula REFERENCES solo se admite si el valor por defecto es NULL. Las areas que quieran agregar usuario_id o caja_id con FK a tablas ya pobladas de clientes reales no pueden ponerle NOT NULL ni un DEFAULT: hay que aceptar la columna nullable, o hacer el baile completo de tabla nueva + copia + rename, que ademas es multi-statement y choca con la falta de transacciones y con el split por ';' del driver de Tauri.
- El techo de 9 modulos no es teorico, ya deformo el producto: ConsultaFacturas.tsx:308-310 declara por escrito que las cotizaciones se volvieron pestana interna 'para evitar sumar un decimo item al menu lateral, que romperia el esquema de atajos Alt+1..9'. Cualquier plan que agregue Backoffice, CRM, Usuarios y Caja como modulos nuevos tiene que resolver primero el esquema de atajos, o repetira el mismo parche.
- packages/api/db/schema.sql y packages/api/sync-rules.yaml se presentan como la traduccion a Postgres y las reglas de sincronizacion, pero ya perdieron las migraciones 7, 8 y 10 (no aparecen devolucion, devolucion_linea, promocion, cotizacion ni cotizacion_linea). Son copias manuales sin ninguna verificacion automatica: cualquier area que agregue una tabla y las ignore aumenta el drift, y quien las lea como referencia del esquema actual leera algo falso.
- backup-repo.ts:9-19 tiene la lista TABLAS hardcodeada y es solo exportacion, sin importacion. Una tabla nueva que no se agregue ahi queda fuera del respaldo del cliente sin ningun aviso, y ademas no existe camino de vuelta si una migracion rompe una base real.

## Preguntas para el dueno del negocio

- Al abrir la aplicacion, hay que iniciar sesion siempre, o solo cuando el negocio tiene mas de un usuario? En un colmado de un solo duenno, pedir PIN en cada arranque puede ser friccion pura; hoy el seed crea el admin SIN pin_hash (seed.ts:38-40), asi que hace falta definir el comportamiento por defecto en las instalaciones que ya estan funcionando.
- PIN numerico de 4-6 digitos (rapido, se teclea sin mirar, encaja con la filosofia teclado-primero del producto) o clave alfanumerica? Un PIN de 4 digitos tiene 10.000 combinaciones: se acepta esa debilidad a cambio de la velocidad en el mostrador, o hace falta bloqueo tras N intentos fallidos?
- Que pasa si el duenno olvida el PIN? No hay correo, no hay servidor, no hay recuperacion posible en modo 100% local. Opciones: una clave maestra impresa al instalar, una pregunta de seguridad, o reinstalar perdiendo el acceso. Hay que decidirlo ANTES de poner PIN a nadie.
- Cuanto dura una sesion: hasta cerrar la aplicacion, con cierre automatico por inactividad (cuantos minutos?), o un bloqueo rapido de pantalla entre venta y venta para que el cajero se aleje del mostrador sin cerrar su turno?
- Cuantos roles existen de verdad? plan.md:84 fijo admin y cajero con permisos_json de descuentos, anular y ver_corte. El cliente necesita ademas supervisor o contable (por ejemplo, alguien que solo vea Reportes y Compras)? Y los permisos se editan uno por uno por usuario o solo se elige un rol?
- Concretamente, que NO debe poder hacer un cajero: anular una factura cobrada, dar descuento por encima de X%, ver la ganancia y los costos, ver el corte de caja del dia, editar precios de productos, entrar a Configuracion? La lista exacta define el catalogo de permisos que consumiran las 8 areas.
- Se agregan Backoffice, CRM, Usuarios y Caja como cuatro items nuevos del menu lateral (llegando a 13 y obligando a rehacer los atajos Alt+1..9), o se agrupan bajo menos entradas con pestanas internas como ya se hizo con Cotizaciones (ConsultaFacturas.tsx:308-310)? Es una decision de producto sobre como quiere navegar el usuario, no solo tecnica.
- Un cajero que entra debe ver el menu SIN los modulos que no puede usar, o verlos deshabilitados con un candado? Ocultar es mas limpio; mostrar bloqueado le ensena al duenno que la funcion existe y se puede habilitar.
- La seleccion de caja (tabla caja, hoy siempre null en factura.caja_id) se hace al iniciar sesion, se fija una vez por equipo en Configuracion, o se elige en cada venta? Define si caja_id vive en la sesion o en la configuracion del dispositivo.
- Hay instalaciones reales en uso ahora mismo y cuantas? De eso depende cuanto se invierte en respaldo previo y en verificacion de migraciones. Si ya hay clientes facturando, antes de la primera migracion nueva conviene tener la importacion de respaldo, que hoy no existe (backup-repo.ts solo exporta).

## Tareas

### PLATAFORMA-01 — Convencion de migraciones: rangos por area, test de integridad y helper de pruebas compartido

**Objetivo.** Que ocho areas puedan agregar migraciones en paralelo y que cualquier choque de id, hueco de rango o SQL incompatible con el driver de escritorio falle en `pnpm test` y no en el arranque del cliente.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo | no cambia comportamiento de ejecucion: agrega pruebas, datos y documentacion; el unico cambio en codigo de produccion es un modulo nuevo de constantes | nada |

#### Brief para el agente

```text
Repo: C:\\Users\\saint\\Desktop\\Bootcamp Builder AA\\facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en espanol: nombres de archivo, tipos, columnas SQL, mensajes). No escribas comentarios en el codigo nuevo. Prohibido `any`. Trabaja en rama `chore/convencion-migraciones` (nunca en master).\n\nCONTEXTO: packages/core/src/db/migrations.ts exporta `export const migrations: Migration[]` con `{ id: number; nombre: string; sql: string }` e ids 1..10 ya usados. packages/core/src/db/migrator.ts aplica las pendientes y las registra en la tabla `_migracion`, deduplicando SOLO por `id` y calculando el conjunto de aplicadas UNA vez antes del bucle. Consecuencia real: si dos areas eligen el id 11, en una base donde ya se aplico el 11 de la primera, el 11 de la segunda NUNCA se ejecuta y su tabla no existe, sin error visible. Ademas packages/desktop/src/db/tauri-sql-driver.ts:17-22 parte el SQL de cada migracion con un `split(";")` ingenuo: un punto y coma dentro de un literal de texto, dentro de un comentario `--` o en un cuerpo de TRIGGER rompe el arranque SOLO en escritorio.\n\nQUE HACER (TDD, rojo primero):\n1. Crea packages/core/test/_ayuda.ts con helpers compartidos: `nuevaDb()` (envuelve createNodeSqliteDriver de ../src/db/drivers/node-sqlite.js, importado por ruta directa porque NO esta en el barrel), `nuevaDbMigrada()` (migrate + seed), `nuevaDbHasta(idMaximo: number)` (aplica solo las migraciones con id <= idMaximo, simulando una instalacion vieja) y `tablasDe(db)`. Copia la firma exacta que ya usan los tests: mira packages/core/test/migrations.test.ts:23-40.\n2. Reemplaza la copia manual de `nuevaDb()` en los 12 archivos de packages/core/test/*.test.ts por el import del helper. Cambio mecanico, sin tocar ninguna asercion.\n3. Crea packages/core/src/db/rangos-migracion.ts exportando `RANGOS_MIGRACION` como datos: base 1-10, RBAC 11-20, CAJA 21-30, PRECIOS 31-40, COMPRAS 41-50, CRM 51-60, BACKOFFICE 61-70, MULTICAJA 71-80, PLATAFORMA 81-90, CORRECCIONES 91-99. Exportalo desde packages/core/src/index.ts junto a `migrations`.\n4. Crea packages/core/test/migraciones-integridad.test.ts con los casos listados en `pruebas`.\n5. Crea MIGRACIONES.md en la raiz del repo: tabla de rangos, como reservar un id (anunciarlo en el PR), la prohibicion de `;` dentro de literales y comentarios por el driver de Tauri, la prohibicion de meter datos iniciales en seed() (seed.ts:10-11 aborta si ya hay negocio, asi que nunca llegaria a una instalacion existente) y la regla de SQLite de que ALTER TABLE ADD COLUMN con REFERENCES solo se admite si el default es NULL.\n\nNO TOQUES: packages/core/src/db/migrator.ts, packages/core/src/db/driver.ts, ninguno de los tres drivers, ningun archivo de packages/ui, packages/web, packages/desktop ni packages/api. No agregues ninguna migracion nueva al array. No cambies el SQL de las migraciones 1..10.\n\nAl terminar: `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde, y demuestra (agregando temporalmente una migracion con id duplicado y revirtiendola) que el test nuevo la caza.
```

#### Archivos a tocar

- `packages/core/test/_ayuda.ts`
- `packages/core/test/migraciones-integridad.test.ts`
- `packages/core/src/db/rangos-migracion.ts`
- `packages/core/src/index.ts`
- `packages/core/test/migrations.test.ts`
- `MIGRACIONES.md`

#### Criterios de aceptacion

- [ ] `pnpm --filter @sfr/core test` pasa y los 12 archivos de test existentes usan un unico `nuevaDb()` importado de test/_ayuda.ts
- [ ] Agregar al array una migracion con un id ya usado hace fallar un test con un mensaje que nombra el id y las dos migraciones en conflicto
- [ ] Agregar una migracion con un id fuera de todo rango declarado (por ejemplo 200) hace fallar un test que nombra los rangos validos
- [ ] Un `;` dentro de un literal de texto o de un comentario `--` en el SQL de cualquier migracion hace fallar un test, con el mensaje explicando que rompe el driver de escritorio
- [ ] MIGRACIONES.md existe en la raiz, asigna un rango a cada uno de los ocho prefijos de area y explica reserva de ids, la trampa del `;`, la prohibicion de sembrar en seed() y la restriccion de ALTER TABLE con REFERENCES
- [ ] No se agrego ninguna migracion nueva ni se modifico el SQL de las existentes

#### Pruebas a escribir primero (TDD)

- migraciones-integridad: los ids del array son unicos (detecta duplicados y nombra ambos)
- migraciones-integridad: los nombres del array son unicos
- migraciones-integridad: el array esta ordenado por id ascendente
- migraciones-integridad: todo id cae dentro de algun rango de RANGOS_MIGRACION y los rangos no se solapan entre si
- migraciones-integridad: ningun sql contiene `;` dentro de un literal entre comillas simples ni despues de `--` en la misma linea
- migraciones-integridad: para cada migracion N, aplicar nuevaDbHasta(N-1) y luego migrate() completo termina sin error y deja todas las tablas esperadas (simula instalacion existente que recibe las nuevas)
- migraciones-integridad: migrate() sobre nuevaDbHasta(10) aplica exactamente las migraciones con id > 10 y ninguna mas
- _ayuda: nuevaDbHasta(3) deja aplicadas 3 filas en _migracion y no crea las tablas de la migracion 4

---

### PLATAFORMA-02 — Atomicidad de migraciones y paridad de los tres drivers

**Objetivo.** Que una migracion que falle a la mitad deje la base exactamente como estaba (reintentable) y que PWA, escritorio y Node apliquen el mismo SQL con las mismas reglas.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto | toca el arranque de los tres entornos y el camino por el que se inicializa toda base existente; un error aqui deja a los clientes sin poder abrir la aplicacion | PLATAFORMA-01 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Pide implementar enTransaccion con BEGIN/COMMIT/ROLLBACK en los tres drivers, pero en tauri-sql-driver.ts cada db.execute() va contra un Pool de sqlx y toma una conexion distinta: el BEGIN no envuelve las llamadas siguientes y ademas puede dejar una conexion del pool con una transaccion abierta colgada. Su criterio de aceptacion ('una migracion que falla a la mitad no deja ningun objeto creado' y 'el de Tauri activa PRAGMA foreign_keys = ON') no es verificable por ningun test del repo: no hay arnes de Tauri y el propio brief lo admite al final.
>   **Arreglo.** Limitar enTransaccion a node:sqlite y sql.js y declararlo explicitamente opcional por driver (isTransaccional: boolean). Para escritorio, sustituir atomicidad por idempotencia statement-por-statement obligatoria mas registro previo en _migracion con estado. Bajar el criterio de PRAGMA foreign_keys a una verificacion manual documentada, no a un criterio de aceptacion automatico.

#### Brief para el agente

```text
Repo: C:\\Users\\saint\\Desktop\\Bootcamp Builder AA\\facturAIForSale. Monorepo pnpm, TypeScript estricto, todo en espanol, cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), sin `any`. Rama `fix/migraciones-atomicas` (nunca master).\n\nPROBLEMA VERIFICADO: no existe ninguna transaccion en todo el repo (grep de BEGIN/COMMIT/ROLLBACK en packages/: cero resultados) y la interfaz `SqlDriver` de packages/core/src/db/driver.ts:11-22 ni siquiera puede expresarlas. packages/core/src/db/migrator.ts:24-30 ejecuta `db.exec(m.sql)` y recien despues inserta en `_migracion`: si el SQL falla a la mitad, quedan tablas creadas SIN fila en `_migracion`, y el reintento choca con 'table already exists'; la app queda atascada para siempre en la pantalla de error de packages/web/src/main.tsx:38-40 sin salida para el usuario. Ademas packages/core/src/db/drivers/node-sqlite.ts:24 y packages/web/src/db/sqljs-driver.ts:62 hacen `PRAGMA foreign_keys = ON` pero packages/desktop/src/db/tauri-sql-driver.ts NO, y ese driver parte el SQL con un `split(";")` ingenuo (lineas 17-22).\n\nQUE HACER (TDD, rojo primero):\n1. Extiende `SqlDriver` en packages/core/src/db/driver.ts con un metodo OPCIONAL `enTransaccion?<T>(fn: () => Promise<T>): Promise<T>`. Opcional a proposito: ningun consumidor existente se rompe.\n2. Crea packages/core/src/db/sql-statements.ts con `partirStatements(sql: string): string[]` que respete `;` dentro de literales entre comillas simples, dentro de comentarios `--` y dentro de bloques BEGIN...END de un TRIGGER. Va en core justamente para poder probarlo sin cargar `@tauri-apps/plugin-sql`.\n3. Implementa `enTransaccion` en los tres drivers: packages/core/src/db/drivers/node-sqlite.ts, packages/web/src/db/sqljs-driver.ts y packages/desktop/src/db/tauri-sql-driver.ts (BEGIN / COMMIT / ROLLBACK, con rollback en el catch y re-lanzando el error original).\n4. En el driver de Tauri: agrega `PRAGMA foreign_keys = ON` al abrir y sustituye el split ingenuo por `partirStatements` de core.\n5. En packages/core/src/db/migrator.ts: antes del bucle, lanza un Error en espanol si `migrations` trae dos ids iguales (hoy se ejecutarian ambas y el segundo INSERT viola la PK de `_migracion`). Envuelve cada migracion en `db.enTransaccion` cuando el driver lo ofrezca (el exec del SQL y el INSERT en `_migracion` van juntos en la misma transaccion); si el driver no lo ofrece, mantiene el comportamiento actual.\n6. Importante para la PWA: packages/web/src/db/sqljs-driver.ts persiste en IndexedDB con un debounce de 150 ms (lineas 64-72); asegurate de que un rollback no deje programada la persistencia de un esquema a medias.\n\nUsa los helpers de packages/core/test/_ayuda.ts (`nuevaDb`, `nuevaDbHasta`) creados en PLATAFORMA-01 en vez de instanciar drivers a mano.\n\nNO TOQUES: el array de packages/core/src/db/migrations.ts (no agregues ni edites migraciones), packages/core/src/repos/*, nada de packages/ui, nada de packages/api. No cambies la firma de `migrate(db)`.\n\nEntrega ademas, en el reporte de tarea, la verificacion manual pendiente: comprobar en un escritorio Tauri real que sqlx respeta `PRAGMA foreign_keys = ON`, porque vitest no puede probarlo y las areas que vienen despues van a apoyarse en claves foraneas.
```

#### Archivos a tocar

- `packages/core/src/db/driver.ts`
- `packages/core/src/db/migrator.ts`
- `packages/core/src/db/sql-statements.ts`
- `packages/core/src/db/drivers/node-sqlite.ts`
- `packages/web/src/db/sqljs-driver.ts`
- `packages/desktop/src/db/tauri-sql-driver.ts`
- `packages/core/test/migrador-atomico.test.ts`
- `packages/core/test/sql-statements.test.ts`
- `packages/core/src/index.ts`

#### Criterios de aceptacion

- [ ] Una migracion que falla a la mitad no deja ningun objeto creado en la base y `_migracion` no registra la fila; el reintento con el SQL corregido aplica limpio
- [ ] `migrate` lanza un error en espanol que nombra el id duplicado ANTES de ejecutar cualquier SQL
- [ ] Los tres drivers implementan `enTransaccion` y el de Tauri activa `PRAGMA foreign_keys = ON`
- [ ] El driver de Tauri usa `partirStatements` de core y ya no un `split(";")`
- [ ] `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde; los tests previos de migraciones siguen pasando sin cambios
- [ ] Ningun consumidor existente de SqlDriver tuvo que cambiar (el metodo nuevo es opcional)

#### Pruebas a escribir primero (TDD)

- sql-statements: `INSERT INTO x VALUES ('a;b')` se parte en UN solo statement
- sql-statements: una linea `-- rol: admin; cajero` no genera un statement extra
- sql-statements: un CREATE TRIGGER con BEGIN ... ; ... END; sale como un unico statement
- migrador-atomico: migracion de dos statements cuyo segundo es SQL invalido -> migrate() lanza, la tabla del primer statement NO existe y COUNT(*) de _migracion no incluye ese id
- migrador-atomico: tras el fallo anterior, corregir el SQL y volver a migrate() aplica sin 'table already exists'
- migrador-atomico: dos migraciones con el mismo id en el array hacen que migrate() lance antes de ejecutar nada (la base queda intacta)
- migrador-atomico: enTransaccion del driver de Node hace rollback si el callback lanza y commit si resuelve
- migrador-atomico: migrate() sigue siendo idempotente (segunda corrida devuelve arreglo vacio) y sigue aplicando sobre nuevaDbHasta(10)

---

### PLATAFORMA-03 — Respaldo sin lista manual y restauracion transaccional

**Objetivo.** Que exista un camino de vuelta comprobado antes de que ocho areas empiecen a migrar bases de instalaciones reales, y que una tabla nueva entre al respaldo sin que nadie tenga que acordarse de agregarla a una lista.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio | escribe sobre todas las tablas a la vez, pero siempre dentro de una transaccion y solo cuando el usuario lo pide explicitamente | PLATAFORMA-02 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Manda hacer importarTodo dentro de db.enTransaccion con 'PRAGMA foreign_keys = OFF acotado a la operacion si hace falta por el orden de las tablas'. PRAGMA foreign_keys es un no-op dentro de una transaccion en SQLite: no se puede desactivar con un BEGIN pendiente. La restauracion fallara con violaciones de FK en cuanto el orden alfabetico de sqlite_master no coincida con el orden de dependencias (factura antes que cliente, por ejemplo).
>   **Arreglo.** Desactivar el PRAGMA fuera de la transaccion (o usar PRAGMA defer_foreign_keys = ON, que si funciona dentro de una transaccion y es exactamente el mecanismo previsto para restauraciones). Cambiar el criterio de aceptacion para que la prueba de ida y vuelta incluya tablas con FK cruzadas.

#### Brief para el agente

```text
Repo: C:\\Users\\saint\\Desktop\\Bootcamp Builder AA\\facturAIForSale. TypeScript estricto, todo en espanol, cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), sin `any`. Rama `feature/restauracion-respaldo` (nunca master).\n\nPROBLEMA VERIFICADO: packages/core/src/repos/backup-repo.ts:9-19 tiene la lista `TABLAS` escrita a mano y solo sabe EXPORTAR (lineas 27-37). Dos consecuencias: una tabla que una area agregue y olvide anotar ahi sale fuera del respaldo del cliente sin ningun aviso, y no hay ninguna forma de volver atras si una migracion rompe una base real. Ademas hay dos listas mas ya desincronizadas (packages/api/db/schema.sql y packages/api/sync-rules.yaml perdieron las migraciones 7, 8 y 10: devolucion, devolucion_linea, promocion, cotizacion, cotizacion_linea).\n\nQUE HACER (TDD, rojo primero):\n1. En packages/core/src/repos/backup-repo.ts, sustituye la constante `TABLAS` por un descubrimiento en tiempo de ejecucion: `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_migracion'`, ordenado por nombre. El formato `RespaldoCompleto` gana un campo `esquema: number` con el id maximo aplicado leido de `_migracion`; manten `version` y `generadoEn` para no romper los respaldos ya generados.\n2. Agrega `importarTodo(respaldo: RespaldoCompleto): Promise<void>` dentro de `db.enTransaccion` (metodo agregado en PLATAFORMA-02): valida primero, escribe despues. Validaciones, TODAS en el repo y no en la UI, lanzando `ValidacionError` (mismo patron que usan los demas repos de packages/core/src/repos/): respaldo sin `tablas`; `esquema` del respaldo mayor que el de la base actual (respaldo de una version mas nueva: se rechaza, no se intenta adivinar); tabla presente en el respaldo que no existe en la base. Borra e inserta dentro de la misma transaccion, con `PRAGMA foreign_keys = OFF` acotado a la operacion si hace falta por el orden de las tablas, restaurandolo al salir.\n3. Registra la restauracion en la bitacora con `registrarAccion` (packages/core/src/repos/bitacora-repo.ts:35-55), accion `restaurar_respaldo`, entidad `respaldo`.\n4. Imita en estilo a packages/core/src/repos/compra-repo.ts (factoria `crearBackupRepo(db: SqlDriver)` que devuelve un objeto de metodos asincronos y exporta `export type BackupRepo = ReturnType<typeof crearBackupRepo>`).\n5. Corrige las dos listas desincronizadas de packages/api: agrega a packages/api/db/schema.sql y packages/api/sync-rules.yaml las tablas de las migraciones 7, 8 y 10 (devolucion, devolucion_linea, promocion, cotizacion, cotizacion_linea) traduciendo tipos a Postgres igual que el resto del archivo. Ese paquete es un scaffold sin conectar; no arranques nada de el.\n\nUsa los helpers de packages/core/test/_ayuda.ts.\n\nNO TOQUES: ninguna pantalla de packages/ui (la seccion de respaldo de packages/ui/src/pantallas/Configuracion.tsx la conecta otra area despues), packages/core/src/db/migrations.ts, packages/core/src/db/migrator.ts, ni el resto de packages/api/src.
```

#### Archivos a tocar

- `packages/core/src/repos/backup-repo.ts`
- `packages/core/test/backup-repo.test.ts`
- `packages/api/db/schema.sql`
- `packages/api/sync-rules.yaml`

#### Criterios de aceptacion

- [ ] `exportarTodo` ya no depende de ninguna lista escrita a mano: una tabla creada en la sesion de test aparece en el respaldo sin tocar codigo
- [ ] Ida y vuelta completa: exportar una base con datos, restaurar sobre otra base migrada y vacia, y obtener los mismos conteos y las mismas filas en todas las tablas
- [ ] Un respaldo de un esquema mas nuevo que la base destino es rechazado con ValidacionError y mensaje en espanol; la base destino queda intacta
- [ ] Un fallo a mitad de la importacion deja la base exactamente como estaba (rollback)
- [ ] La restauracion queda registrada en bitacora_accion
- [ ] packages/api/db/schema.sql y sync-rules.yaml incluyen devolucion, devolucion_linea, promocion, cotizacion y cotizacion_linea
- [ ] `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde

#### Pruebas a escribir primero (TDD)

- backup-repo: exportarTodo incluye una tabla creada ad-hoc en el test (prueba de que no hay lista manual)
- backup-repo: exportarTodo excluye _migracion y las tablas internas sqlite_%, y reporta `esquema` igual al id maximo de _migracion
- backup-repo: ida y vuelta — seed, exportar, base nueva migrada, importar, y los conteos de producto/factura/factura_linea/pago coinciden fila por fila
- backup-repo: importar un respaldo con `esquema` mayor que el de la base lanza ValidacionError y no escribe nada
- backup-repo: importar un respaldo que nombra una tabla inexistente lanza ValidacionError y no escribe nada
- backup-repo: importar con una fila invalida a mitad de camino deja la base con los datos originales intactos (rollback)
- backup-repo: importar deja una fila en bitacora_accion con accion `restaurar_respaldo`
- backup-repo: importar dos veces el mismo respaldo deja el mismo resultado (no duplica filas)

---

### PLATAFORMA-04 — Nucleo de seguridad en core: hash de PIN y catalogo de permisos

**Objetivo.** Tener un unico modulo que hashea y verifica PIN igual en navegador y en Tauri, y un unico catalogo de permisos con `exigirPermiso` que las ocho areas invocan en vez de inventar el suyo.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo | son modulos nuevos de funciones puras; nada existente los llama todavia | nada |

#### Brief para el agente

```text
Repo: C:\\Users\\saint\\Desktop\\Bootcamp Builder AA\\facturAIForSale. TypeScript estricto, todo en espanol, cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), sin `any`, sin dependencias nuevas. Rama `feature/nucleo-seguridad` (nunca master).\n\nCONTEXTO: hoy NO hay nada de esto (cero usos de crypto.subtle, cero menciones de 'permiso' en packages/core/src y packages/ui/src). La tabla `usuario` ya existe desde la migracion 1 con `pin_hash`, `rol TEXT DEFAULT 'admin'` y `permisos_json` (packages/core/src/db/migrations.ts:46-56), asi que NO hace falta ninguna migracion. El vocabulario ya esta decidido en plan.md:84: roles admin|cajero y permisos_json con descuentos, anular y ver_corte. packages/core/src/ids.ts:7 ya usa `crypto.randomUUID()` global y funciona en Node, navegador y WebView de Tauri: ese es el precedente que justifica usar `globalThis.crypto.subtle` aqui.\n\nQUE HACER (TDD, rojo primero):\n1. packages/core/src/seguridad/pin.ts: `hashearPin(pin: string): Promise<string>` y `verificarPin(pin: string, hash: string): Promise<boolean>` con PBKDF2-HMAC-SHA256 sobre `globalThis.crypto.subtle`, sal aleatoria por usuario de 16 bytes via `crypto.getRandomValues`, iteraciones en una constante exportada (arranca en 120000) y formato versionado en una sola cadena: `pbkdf2$sha256$<iteraciones>$<salBase64>$<hashBase64>`. `verificarPin` lee las iteraciones DEL hash, no de la constante, para poder subirlas despues sin invalidar los PIN existentes. Comparacion en tiempo constante (recorrer siempre los mismos bytes, sin cortocircuito). Si `globalThis.crypto?.subtle` es undefined, lanza `ErrorCriptoNoDisponible` con un mensaje en espanol que diga explicitamente que la aplicacion debe servirse por HTTPS o desde localhost: es el escenario real de una PWA servida por HTTP plano en una IP de la LAN, donde hoy reventaria sin explicacion.\n2. packages/core/src/seguridad/permisos.ts: `PERMISOS` como arreglo constante y `Permiso` derivado con `typeof PERMISOS[number]` (no escribas la union a mano dos veces). Catalogo inicial: vender, aplicar_descuento, anular_factura, ver_costos, ver_corte, abrir_caja, editar_precios, gestionar_productos, gestionar_clientes, gestionar_compras, ver_reportes, gestionar_usuarios, configurar. Ademas: `Rol = "admin" | "cajero"`, `PERMISOS_POR_ROL: Record<Rol, readonly Permiso[]>`, `ContextoSesion { usuarioId: string | null; rol: Rol; permisos: readonly Permiso[]; cajaId: string | null }`, `resolverPermisos(rol, permisosJson: string | null): readonly Permiso[]` (parte del rol y aplica lo que diga permisos_json; un JSON corrupto cae a los permisos del rol y NO lanza), `tienePermiso(sesion, permiso)`, `exigirPermiso(sesion, permiso)` que lanza `SinPermisoError` (clase con `codigo = "sin_permiso"` y mensaje en espanol que nombra el permiso), y `SESION_LOCAL: ContextoSesion` con usuarioId null, rol admin y TODOS los permisos — es la sesion por defecto que preserva el comportamiento actual en instalaciones sin login.\n3. packages/core/src/seguridad/index.ts y re-export desde packages/core/src/index.ts.\n\nEl catalogo exacto de permisos esta pendiente de confirmacion del cliente: por eso vive como DATO en un unico archivo, para que ajustarlo sea una sola edicion. Deja esa nota en el reporte de tarea, no en comentarios de codigo.\n\nNO TOQUES: ninguna migracion, ningun repo de packages/core/src/repos (eso es PLATAFORMA-05), nada de packages/ui, packages/web, packages/desktop ni packages/api. No crees pantallas de login (eso es del area RBAC). No agregues dependencias al package.json.\n\nUsa los helpers de packages/core/test/_ayuda.ts si necesitas base; estos modulos son funciones puras y no deberian necesitarla.
```

#### Archivos a tocar

- `packages/core/src/seguridad/pin.ts`
- `packages/core/src/seguridad/permisos.ts`
- `packages/core/src/seguridad/index.ts`
- `packages/core/src/index.ts`
- `packages/core/test/pin.test.ts`
- `packages/core/test/permisos.test.ts`

#### Criterios de aceptacion

- [ ] `hashearPin`/`verificarPin` funcionan sin ninguna dependencia nueva, solo con globalThis.crypto.subtle
- [ ] El hash es una sola cadena con el formato `pbkdf2$sha256$<iteraciones>$<sal>$<hash>` y `verificarPin` acepta hashes con un numero de iteraciones distinto al actual
- [ ] Sin crypto.subtle disponible se lanza ErrorCriptoNoDisponible con un mensaje en espanol que menciona HTTPS o localhost
- [ ] `exigirPermiso` es el unico punto de autorizacion exportado por core y lanza SinPermisoError con el nombre del permiso
- [ ] `SESION_LOCAL` concede todos los permisos y tiene usuarioId null, de modo que el comportamiento actual del sistema no cambia
- [ ] No se creo ninguna migracion ni se toco ningun repo ni ninguna pantalla
- [ ] `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde

#### Pruebas a escribir primero (TDD)

- pin: el hash no contiene el PIN en claro y dos hashes del mismo PIN son distintos (sal aleatoria)
- pin: verificarPin devuelve true con el PIN correcto y false con uno incorrecto
- pin: verificarPin devuelve true con un hash generado con menos iteraciones que la constante actual
- pin: verificarPin devuelve false (no lanza) ante un hash malformado o vacio
- pin: hashearPin lanza ErrorCriptoNoDisponible cuando globalThis.crypto.subtle no existe (sustituyendo el global en el test y restaurandolo despues)
- permisos: PERMISOS_POR_ROL.admin incluye anular_factura y ver_corte; PERMISOS_POR_ROL.cajero no
- permisos: exigirPermiso no lanza con un rol que tiene el permiso y lanza SinPermisoError nombrando el permiso cuando no lo tiene
- permisos: resolverPermisos aplica un permisos_json que agrega un permiso al rol y otro que quita uno
- permisos: resolverPermisos con permisos_json corrupto devuelve los permisos del rol sin lanzar
- permisos: SESION_LOCAL tiene todos los permisos de PERMISOS y usuarioId null

---

### PLATAFORMA-05 — Seam de sesion en los repos: actor real en la bitacora y guardias de permiso del lado de los datos

**Objetivo.** Que cualquier repo pueda saber quien esta operando y que las operaciones sensibles se rechacen en core aunque la UI no esconda el boton.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | medio | toca diez repos a la vez, pero todos los cambios son aditivos y con valor por defecto compatible; el riesgo real es poner un guardia de mas y bloquear una operacion que hoy funciona | PLATAFORMA-04 |

#### Brief para el agente

```text
Repo: C:\\Users\\saint\\Desktop\\Bootcamp Builder AA\\facturAIForSale. TypeScript estricto, todo en espanol, cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), sin `any`. Rama `feature/seam-sesion-repos` (nunca master).\n\nCONTEXTO: las 18 factorias de packages/core/src/repos/*.ts tienen todas exactamente la firma `crearXxxRepo(db: SqlDriver)`. Ninguna sabe quien opera: `usuario_id` se inserta literalmente como `null` en packages/core/src/repos/factura-repo.ts:147, producto-repo.ts:176, devolucion-repo.ts:127 y compra-repo.ts:81, y `registrarAccion` (packages/core/src/repos/bitacora-repo.ts:35-55) acepta `usuarioId` pero siempre recibe null. No hay ninguna comprobacion de autorizacion en ninguna capa. PLATAFORMA-04 ya dejo en packages/core/src/seguridad/ los tipos `ContextoSesion`, `SESION_LOCAL`, `exigirPermiso` y `SinPermisoError`: usalos, no inventes otros.\n\nQUE HACER (TDD, rojo primero):\n1. Agrega un segundo parametro OPCIONAL de sesion, `crearXxxRepo(db: SqlDriver, sesion: ContextoSesion = SESION_LOCAL)`, SOLO a las factorias que realmente lo usan: factura-repo, producto-repo, devolucion-repo, compra-repo, corte-caja-repo, cotizacion-repo, bitacora-repo, promocion-repo y reportes-repo. Ojo: tsconfig.base.json:16-17 activa noUnusedParameters, asi que un repo que declare el parametro y no lo use NO compila; por eso no se lo pongas a los demas.\n2. Sustituye los `null` de usuario_id por `sesion.usuarioId` en las cuatro inserciones citadas y en todas las llamadas a `registrarAccion`.\n3. Agrega guardias reales, que son el patron que copiaran las otras siete areas: `exigirPermiso(sesion, "anular_factura")` al inicio de la anulacion en factura-repo; `exigirPermiso(sesion, "aplicar_descuento")` donde se aplique un descuento; `exigirPermiso(sesion, "ver_corte")` en las lecturas de corte-caja-repo; `exigirPermiso(sesion, "ver_costos")` en `resumenGanancia` de reportes-repo. Los guardias van ANTES de cualquier escritura o lectura, igual que ya se hace con ValidacionError en los repos existentes (imita el estilo de packages/core/src/repos/compra-repo.ts).\n4. Crea `crearRepos(db: SqlDriver, sesion?: ContextoSesion)` en packages/core/src/repos/index.ts, que devuelva el objeto con las 18 claves exactamente con los mismos nombres que usa hoy packages/ui/src/data/contexto.tsx:61-81 mas `proveedorFiscal: crearProveedorFiscalSimulado()`, y exporta el tipo del resultado. Asi la UI deja de enumerar 18 factorias y agregar un repo no obliga a editar la UI.\n5. Verifica que todas las llamadas actuales `crearXxxRepo(db)` siguen compilando y comportandose igual: con `SESION_LOCAL` el usuario_id sigue siendo null y ningun permiso se rechaza.\n\nUsa los helpers de packages/core/test/_ayuda.ts. En los tests construye sesiones a mano, por ejemplo `{ usuarioId: "u-cajero", rol: "cajero", permisos: PERMISOS_POR_ROL.cajero, cajaId: null }`.\n\nNO TOQUES: packages/ui/src/data/contexto.tsx (lo reescribe PLATAFORMA-07), AppShell.tsx, ninguna pantalla, ninguna migracion, packages/api. No crees usuario-repo.ts ni caja-repo.ts: son del area RBAC y de MULTICAJA; tu entregas el seam, no los repos de esas entidades.
```

#### Archivos a tocar

- `packages/core/src/repos/index.ts`
- `packages/core/src/repos/factura-repo.ts`
- `packages/core/src/repos/producto-repo.ts`
- `packages/core/src/repos/devolucion-repo.ts`
- `packages/core/src/repos/compra-repo.ts`
- `packages/core/src/repos/corte-caja-repo.ts`
- `packages/core/src/repos/cotizacion-repo.ts`
- `packages/core/src/repos/bitacora-repo.ts`
- `packages/core/src/repos/promocion-repo.ts`
- `packages/core/src/repos/reportes-repo.ts`
- `packages/core/test/sesion-repos.test.ts`

#### Criterios de aceptacion

- [ ] Todas las llamadas existentes `crearXxxRepo(db)` siguen compilando y comportandose igual que antes (SESION_LOCAL por defecto)
- [ ] Con una sesion real, bitacora_accion y movimiento_inventario guardan el usuario_id de esa sesion en vez de null
- [ ] Anular una factura con una sesion de cajero sin permiso lanza SinPermisoError y la factura sigue en estado 'cobrada' (el guardia es de datos, no de UI)
- [ ] `crearRepos(db, sesion)` devuelve las 18 claves que hoy enumera packages/ui/src/data/contexto.tsx mas proveedorFiscal
- [ ] Ningun repo declara un parametro de sesion que no use (noUnusedParameters activo)
- [ ] `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde; ninguna suite existente tuvo que cambiar de aserciones

#### Pruebas a escribir primero (TDD)

- sesion-repos: crearFacturaRepo(db) sin sesion se comporta exactamente como antes y deja usuario_id null
- sesion-repos: con sesion de admin, cobrar una factura deja movimiento_inventario.usuario_id igual al usuarioId de la sesion
- sesion-repos: con sesion de admin, anular una factura deja una fila en bitacora_accion con ese usuario_id
- sesion-repos: con sesion de cajero sin anular_factura, anular lanza SinPermisoError y la factura conserva su estado y sus lineas
- sesion-repos: con sesion de cajero sin ver_costos, resumenGanancia lanza SinPermisoError
- sesion-repos: con sesion de cajero sin ver_corte, la lectura de cortes lanza SinPermisoError
- sesion-repos: con sesion de cajero CON aplicar_descuento, el descuento se aplica normalmente (el guardia no bloquea de mas)
- sesion-repos: crearRepos(db) devuelve las mismas 18 claves que la interfaz Repos de la UI y crearRepos(db, sesion) las propaga a los repos que aceptan sesion

---

### PLATAFORMA-06 — Andamiaje de UI: DESIGN.md y banco de pruebas de @sfr/ui

**Objetivo.** Que exista el DESIGN.md que CLAUDE.md exige antes de cualquier pantalla y que `pnpm test` deje de saltarse en silencio todo el paquete de interfaz.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio | instalar el banco de pruebas de UI puede tropezar con la resolucion de node:sqlite bajo jsdom y con el postcss ajeno del entorno; no afecta codigo de produccion | nada |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Monta jsdom para @sfr/ui y crea renderConDatos, pero jsdom no implementa crypto.subtle. RBAC-02 basa el hash de PIN en globalThis.crypto.subtle y RBAC-05 construye la pantalla de Acceso sobre el. Cualquier prueba de UI que monte esa pantalla lanzara CriptoNoDisponibleError, que es precisamente el camino de error que el diseno reserva para 'PWA servida por http en la LAN'. Ademas cuatro briefs (RBAC-05, RBAC-06, RBAC-07, CRM-07) siguen diciendo 'packages/ui NO tiene runner de tests, NO agregues vitest', instruccion que queda falsa tras la ola 1.
>   **Arreglo.** Documentar en test/_render.tsx que hay que inyectar el webcrypto de Node (globalThis.crypto = require('node:crypto').webcrypto) en el setup de vitest de @sfr/ui, y purgar de los cuatro briefs la frase sobre el runner inexistente antes de despachar la ola 4.

#### Brief para el agente

```text
Repo: C:\\Users\\saint\\Desktop\\Bootcamp Builder AA\\facturAIForSale. TypeScript estricto, todo en espanol, cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), sin `any`. Rama `chore/andamiaje-ui` (nunca master). Invoca la skill `frontend-design:frontend-design` antes de escribir DESIGN.md (lo exige CLAUDE.md).\n\nPARTE A — DESIGN.md. Ya existe design-guidelines.md en la raiz (444 lineas, con tokens reales y checklist de pantalla nueva) pero NO existe DESIGN.md, y las ocho areas van a construir UI. DERIVA DESIGN.md de design-guidelines.md, no lo escribas de cero: la fuente de verdad de los tokens es packages/ui/src/estilos-globales.css:19-51 (tema claro) y :56-76 (oscuro), mas los objetos `c` y `s` de packages/ui/src/estilos.ts:22-41, y las pantallas ya los consumen. DESIGN.md debe: (1) recoger tokens de espaciado base-8, radios, escala tipografica y hex exactos tal como estan en el CSS; (2) declarar los breakpoints reales, leyendolos de packages/ui/src/hooks/useBreakpoint.ts:24-121, y el orden movil primero con verificacion a 375, 768 y 1440 px; (3) CORREGIR el drift verificado: design-guidelines.md:293 afirma que `useAtajosTeclado` hace preventDefault antes de mirar el mapa, y packages/ui/src/hooks/useAtajosTeclado.ts:42-45 hace exactamente lo contrario (busca el manejador y solo entonces hace preventDefault); documenta el comportamiento real; (4) agregar las pautas que las areas nuevas necesitan y hoy no existen: pantalla de acceso por PIN con teclado numerico grande y objetivos tactiles de 44 px minimo, tratamiento visual de un modulo al que el usuario no tiene permiso, patron de sub-pestanas dentro de un modulo tomado de packages/ui/src/pantallas/ConsultaFacturas.tsx:311-340, y pagina compuesta de secciones tomada de packages/ui/src/pantallas/Configuracion.tsx:153-167; (5) recordar que los iconos son de lucide-react y que no se usan emojis como iconos. Deja design-guidelines.md donde esta y haz que DESIGN.md lo referencie, sin duplicar las 444 lineas.\n\nPARTE B — banco de pruebas. packages/ui/package.json no tiene script `test`, ni vitest, ni jsdom, ni testing-library, asi que `pnpm -r test` salta el paquete en silencio. Agrega: devDependencies vitest (la misma version que usa core, 2.1.8), jsdom, @testing-library/react, @testing-library/user-event y @vitejs/plugin-react; script `"test": "vitest run"`; y packages/ui/vitest.config.ts con `environment: "jsdom"`, el plugin de react y —imprescindible en esta maquina— el bloque `css: { postcss: { plugins: [] } }` copiado tal cual de packages/core/vitest.config.ts:7-13: sin el, vitest busca un postcss.config hacia arriba, encuentra uno ajeno en el home del usuario y la corrida se rompe antes de empezar. Ten en cuenta que @sfr/core y @sfr/ui se consumen como TypeScript crudo (main y types apuntan a ./src/index.ts y no hay build), asi que el runner debe transpilar fuentes del workspace.\n\nCrea packages/ui/test/_render.tsx con `renderConDatos(ui)` que levante una base real en memoria (createNodeSqliteDriver de packages/core/src/db/drivers/node-sqlite.js, importado por ruta directa porque no esta en el barrel), aplique migrate y seed, y monte el arbol dentro de ProveedorDatos (packages/ui/src/data/contexto.tsx). Si `node:sqlite` diera problemas bajo jsdom, documenta la alternativa en el reporte de tarea en vez de inventar un doble de prueba.\n\nEscribe solo pruebas de humo en esta tarea: el AppShell actual renderiza sus nueve modulos y Alt+2 cambia de pantalla. NO refactorices AppShell: eso es PLATAFORMA-07.\n\nNO TOQUES: packages/ui/src/AppShell.tsx, packages/ui/src/data/contexto.tsx, ninguna pantalla, nada de packages/core/src, packages/web, packages/desktop ni packages/api. No agregues ESLint ni Prettier (decision diferida).
```

#### Archivos a tocar

- `DESIGN.md`
- `packages/ui/package.json`
- `packages/ui/vitest.config.ts`
- `packages/ui/test/_render.tsx`
- `packages/ui/test/appshell-humo.test.tsx`

#### Criterios de aceptacion

- [ ] `pnpm test` en la raiz ahora ejecuta tambien las pruebas de @sfr/ui y pasan
- [ ] DESIGN.md existe en la raiz, deriva de design-guidelines.md y no lo duplica, y describe el comportamiento REAL de useAtajosTeclado (no el que la guia documentaba al reves)
- [ ] DESIGN.md cubre tokens, breakpoints 375/768/1440, pantalla de acceso por PIN, modulo sin permiso, sub-pestanas y pagina de secciones
- [ ] packages/ui/vitest.config.ts incluye el bloque css.postcss vacio y la corrida no se rompe por el postcss ajeno del home
- [ ] Existe `renderConDatos` reutilizable que monta cualquier pantalla contra una base migrada y sembrada de verdad
- [ ] AppShell.tsx y contexto.tsx no fueron modificados

#### Pruebas a escribir primero (TDD)

- appshell-humo: el menu lateral renderiza exactamente los nueve modulos actuales por su etiqueta visible
- appshell-humo: Alt+2 cambia el contenido principal al segundo modulo
- appshell-humo: existe el enlace 'Saltar al contenido' como primer elemento enfocable
- appshell-humo: el modulo activo se marca con aria-current='page'
- _render: renderConDatos monta una pantalla que consume useRepos sin lanzar (la base esta migrada y sembrada)
- _render: dos llamadas consecutivas a renderConDatos no comparten estado de base entre si

---

### PLATAFORMA-07 — Registro declarativo de modulos, proveedor de sesion y filtrado por permiso en AppShell

**Objetivo.** Que agregar un modulo o esconderlo por permiso sea editar un solo arreglo, con el atajo como dato fijo y la sesion viviendo en su propio proveedor memorizado.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto | reescribe el archivo central por el que pasa toda la navegacion y del que dependen las ocho areas; una regresion aqui se nota en las nueve pantallas a la vez | PLATAFORMA-05, PLATAFORMA-06 |

#### Brief para el agente

```text
Repo: C:\\Users\\saint\\Desktop\\Bootcamp Builder AA\\facturAIForSale. TypeScript estricto, todo en espanol, cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada), sin `any`. Rama `refactor/registro-modulos-sesion` (nunca master). Lee DESIGN.md (creado en PLATAFORMA-06) antes de tocar UI.\n\nPROBLEMA VERIFICADO en packages/ui/src/AppShell.tsx: los nueve modulos estan cableados en CUATRO lugares del mismo archivo (union de tipos lineas 24-26, arreglo MODULOS 28-31, record de iconos 33-43 y cadena de nueve renders 189-199), el modulo activo es un `useState` local (linea 51) sin persistencia, y los atajos se derivan del INDICE del arreglo (lineas 64-66). Ese techo ya deformo el producto: packages/ui/src/pantallas/ConsultaFacturas.tsx:308-310 documenta que las cotizaciones se volvieron pestana interna 'para evitar sumar un decimo item al menu lateral, que romperia el esquema de atajos Alt+1..9'. Cuatro areas (Backoffice, CRM, Usuarios, Caja) van a agregar modulos: sin este refactor editan los mismos cuatro puntos y el conflicto de merge es seguro.\n\nQUE HACER (TDD, rojo primero — el banco de pruebas de @sfr/ui ya existe desde PLATAFORMA-06; usa packages/ui/test/_render.tsx):\n1. Crea packages/ui/src/navegacion/modulos.ts con `ModuloDef { id: string; etiqueta: string; icono: ComponentType<LucideProps>; atajo: string | null; permiso: Permiso | null; componente: ComponentType }` y `MODULOS: ModuloDef[]` con los nueve actuales, cada uno con su atajo FIJO ('Alt+1'..'Alt+9', nunca calculado por posicion) y su permiso de packages/core/src/seguridad/permisos.ts. Un modulo con `atajo: null` debe poder existir: es como entran el decimo y siguientes sin inventar 'Alt+10'.\n2. Reescribe AppShell.tsx para derivar de ese arreglo el menu, el mapa de atajos y el render (un solo `<ErrorBoundary key={activo}>` que monte el componente del modulo activo). Conserva intacto todo lo que ya funciona: cajon en movil, foco al abrir y cerrar, enlace 'Saltar al contenido', aria-current, alternancia de tema, useNavegacionFlechas y los tramos de useBreakpoint.\n3. Filtra los modulos visibles por `tienePermiso(sesion, modulo.permiso)` y —esto es lo que lo hace algo mas que cosmetica— tambien el mapa de atajos: un atajo de un modulo no permitido no debe cambiar de pantalla. El guardia de datos ya existe en los repos desde PLATAFORMA-05; aqui solo se evita ofrecer lo que el usuario no puede usar.\n4. Persiste el modulo activo (localStorage) y cae a 'Ventas' si el persistido ya no esta permitido o ya no existe en el registro.\n5. Crea packages/ui/src/sesion/contexto.tsx con `ProveedorSesion` y `useSesion(): { sesion: ContextoSesion; establecerSesion(s: ContextoSesion): void }`. Imita EXACTAMENTE el molde de packages/ui/src/data/contexto.tsx:54-89 y packages/ui/src/contexto/Alertas.tsx:49-56: createContext<T | null>(null) y un hook que lanza Error con mensaje en espanol si falta el proveedor. Valor por defecto SESION_LOCAL, para que las instalaciones sin login se comporten igual que hoy.\n6. Reescribe packages/ui/src/data/contexto.tsx: `ProveedorDatos` toma la sesion de `useSesion`, construye los repos con `crearRepos(db, sesion)` de @sfr/core (creado en PLATAFORMA-05) y lo envuelve en `useMemo` con dependencias [db, sesion]. Hoy el objeto de 18 repos se construye como literal en el cuerpo del componente (lineas 61-81): sin useMemo, cada cambio de sesion reconstruiria las factorias y cambiaria la identidad de `repos` para los 16 archivos que llaman useRepos.\n7. Exporta MODULOS, ModuloDef, ProveedorSesion y useSesion desde packages/ui/src/index.ts.\n\nNO TOQUES: packages/web/src/main.tsx ni packages/desktop/src/main.tsx (son copias casi identicas; todo debe seguir funcionando sin cambiarlos), ninguna pantalla de packages/ui/src/pantallas, ningun repo de core, ninguna migracion. NO crees la pantalla de acceso por PIN ni modulos nuevos: la pantalla es del area RBAC y cada area agrega su propia entrada al arreglo MODULOS.
```

#### Archivos a tocar

- `packages/ui/src/navegacion/modulos.ts`
- `packages/ui/src/sesion/contexto.tsx`
- `packages/ui/src/AppShell.tsx`
- `packages/ui/src/data/contexto.tsx`
- `packages/ui/src/index.ts`
- `packages/ui/test/modulos.test.tsx`
- `packages/ui/test/sesion.test.tsx`

#### Criterios de aceptacion

- [ ] Agregar un modulo nuevo requiere editar UNICAMENTE packages/ui/src/navegacion/modulos.ts; AppShell.tsx no menciona ningun modulo por nombre
- [ ] El atajo es un dato del registro: filtrar modulos por permiso no reasigna Alt+N a otro modulo
- [ ] Un modulo con atajo null se renderiza en el menu y no genera ninguna combinacion imposible tipo Alt+10
- [ ] Un modulo sin permiso no se renderiza y su atajo no navega hacia el
- [ ] El modulo activo sobrevive al remontaje y cae a Ventas si el persistido ya no esta disponible
- [ ] packages/web/src/main.tsx y packages/desktop/src/main.tsx siguen sin cambios y la aplicacion arranca igual que antes en ambos shells
- [ ] ProveedorDatos memoriza los repos: con el mismo db y la misma sesion, la identidad del objeto no cambia entre renders
- [ ] Se conservan cajon movil, manejo de foco, salto al contenido, aria-current, alternancia de tema y navegacion por flechas
- [ ] `pnpm test` y `pnpm typecheck` en verde

#### Pruebas a escribir primero (TDD)

- modulos: el menu renderiza un boton por cada entrada de MODULOS (el test cuenta a partir del arreglo importado, no de una lista escrita en el test)
- modulos: agregar una entrada de prueba al registro la hace aparecer en el menu sin tocar AppShell
- modulos: con una sesion sin ver_reportes, el boton Reportes no se renderiza
- modulos: con una sesion sin ver_reportes, pulsar el atajo de Reportes NO cambia el contenido principal
- modulos: quitar un modulo por permiso no cambia a que modulo lleva Alt+3 (los atajos no se recorren)
- modulos: un modulo con atajo null aparece en el menu y no registra ningun atajo
- modulos: el modulo activo se guarda y se recupera al volver a montar AppShell
- modulos: si el modulo persistido ya no esta permitido, se abre Ventas
- sesion: useSesion fuera de ProveedorSesion lanza un Error con mensaje en espanol
- sesion: sin ProveedorSesion explicito, la aplicacion opera con SESION_LOCAL y todos los modulos visibles (compatibilidad con instalaciones actuales)
- sesion: ProveedorDatos devuelve el MISMO objeto de repos en dos renders con el mismo db y la misma sesion, y uno distinto al cambiar de sesion

---

### NEGOCIO-FLAGS — Ampliar `negocio-repo` para los seis interruptores nuevos

**Objetivo.** Los seis interruptores de negocio que introducen las areas de Caja, Compras y Backoffice se pueden leer y escribir desde la aplicacion, en vez de quedarse clavados en su valor por defecto para siempre.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio — toca el unico repo singleton de la app y arregla de paso un bug de datos existente | CENSO-COLUMNAS (ola 2) |

> [!WARNING]
> **Esta tarea la anadieron los revisores.** El borrador daba por hecho que el dueno podia encender
> el turno obligatorio "desde Configuracion", y eso **nunca era posible**: `negocio-repo` no tiene
> `crear()` ni `actualizar()` — tiene un `guardar()` con la lista de columnas escrita a mano, y
> ninguna tarea la ampliaba. Tres briefs (COMPRAS-01, BACKOFFICE-01, CAJA-01) citan metodos de este
> repo que no existen.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript
estricto, TODO en espanol incluidos nombres de columna SQL). TDD con vitest: rojo primero.
Lee antes plan/00-CONVENCIONES.md.

CONTEXTO YA VERIFICADO, no lo re-verifiques:
- packages/core/src/repos/negocio-repo.ts NO tiene crear() ni actualizar(). Tiene UN solo metodo
  de escritura, guardar() (lineas 56-110), que es un upsert: si no hay fila hace INSERT, si la hay
  hace UPDATE.
- Ese metodo tiene TRES sitios que hay que ampliar A LA VEZ o se rompe en runtime:
  (a) la constante COLS, lineas 41-43;
  (b) el contador `Array(15).fill("?")` del INSERT, linea 78;
  (c) la lista de columnas escrita a mano del UPDATE, lineas 88-105.
  Si anades una columna a COLS y no subes el 15, TypeScript NO lo detecta y el INSERT explota en
  la maquina del cliente. Es la trampa numero uno de este repositorio.
- Las COLUMNAS ya existen cuando llegas: las crea CENSO-COLUMNAS en la banda 11-19 (ola 2). Esta
  tarea NO escribe ninguna migracion.

BUG EXISTENTE QUE TIENES QUE ARREGLAR DE PASO:
  negocio-repo.ts:73-74 y 97-98 hacen `input.inventario_activo ? 1 : 0` y
  `input.redondeo_centavo === false ? 0 : 1`, en vez del `input.x ?? actual.x` que usan todos los
  demas campos. Consecuencia real: cualquier guardar() con un input parcial APAGA el inventario en
  silencio. Es el mismo patron que cliente-repo.actualizar() tiene con aplica_credito. Arreglalo:
  los seis flags nuevos usan `?? actual.x`, y inventario_activo tambien — COMPRAS-08 depende de
  que el inventario no se apague solo despues de encenderlo.

QUE HACER:
1. Escribe primero packages/core/test/negocio-repo.test.ts (hoy NO existe; imita el patron de
   packages/core/test/repos.test.ts: createNodeSqliteDriver() + migrate()). El primer test rojo es
   el del bug: guardar({nombre_comercial:"X"}) sobre un negocio con inventario_activo=1 debe
   dejarlo en 1, y hoy lo deja en 0.
2. Amplia NegocioInput y la interfaz Negocio de packages/core/src/repos/tipos.ts con los seis:
     exige_caja_abierta      INTEGER  (0|1)   — turno obligatorio para vender
     arqueo_ciego            INTEGER  (0|1)   — el cajero cuenta sin ver el esperado
     umbral_diferencia_caja  REAL             — a partir de cuanto se exige motivo y autorizacion
     politica_costo          TEXT             — 'ultimo' | 'promedio_ponderado'
     umbral_aviso_costo_pct  REAL             — % de subida de costo que dispara el aviso
     desfase_horario_min     INTEGER          — minutos respecto a UTC (Rep. Dominicana: -240)
3. Amplia validarNegocio() con la validacion de negocio, que va AQUI y no en la pantalla:
   - umbral_diferencia_caja >= 0
   - umbral_aviso_costo_pct entre 0 y 100
   - politica_costo solo 'ultimo' o 'promedio_ponderado'
   - desfase_horario_min entre -720 y 840 (los husos reales)
   - exige_caja_abierta solo se puede ENCENDER si existe al menos una caja activa; si no, un
     ValidacionError que lo explique. Encenderlo sin cajas deja el negocio sin poder facturar.
4. Amplia los tres sitios de guardar() (COLS, el contador del INSERT, la lista del UPDATE).
5. Configuracion.tsx: anade una seccion con los seis controles. El patron ya esta hecho: el
   formulario carga entero en el useEffect (lineas 31-47) y guarda entero (linea 52), y ya hay una
   casilla de inventario_activo en la linea 136. Anade los seis a VACIO, al useEffect y al render.
   Texto en espanol llano: "Exigir turno de caja abierto para vender", no "exige_caja_abierta".

DECISION DE NEGOCIO YA TOMADA que tienes que respetar (decision 8 del cliente):
  exige_caja_abierta se instala APAGADO en instalaciones que ya existen y ENCENDIDO en las nuevas.
  Esa asimetria vive en la migracion (DEFAULT 0 en el ALTER TABLE) y en el seed, NO en este repo.
  Tu solo tienes que permitir cambiarlo.

NO TOQUES: ninguna migracion, ningun otro repo, ninguna otra pantalla, Ventas.tsx.
```

#### Archivos a tocar

- `packages/core/src/repos/negocio-repo.ts`
- `packages/core/src/repos/tipos.ts`
- `packages/ui/src/pantallas/Configuracion.tsx`
- `packages/core/test/negocio-repo.test.ts` (nuevo)

#### Criterios de aceptacion

- [ ] `guardar()` con un input parcial no apaga `inventario_activo` ni ningun flag nuevo
- [ ] `COLS`, el contador `Array(N)` del INSERT y la lista del UPDATE coinciden, verificado por un test que los cuente y no por inspeccion visual
- [ ] Los seis interruptores se leen y se escriben desde Configuracion, con etiquetas en espanol llano
- [ ] Toda la validacion esta en `validarNegocio()`, ninguna en el componente
- [ ] `exige_caja_abierta` no se puede encender si no hay ninguna caja activa
- [ ] `pnpm -r test` y `pnpm -r typecheck` en verde, sin editar ningun test preexistente

#### Pruebas a escribir primero (TDD)

- `guardar({nombre_comercial})` sobre un negocio con `inventario_activo=1` lo deja en 1 (hoy lo apaga: este es el test rojo de partida)
- Ida y vuelta de cada uno de los seis flags: se guarda y se vuelve a leer con el mismo valor
- `umbral_diferencia_caja` negativo lanza `ValidacionError`
- `umbral_aviso_costo_pct` en 150 lanza `ValidacionError`
- `politica_costo: "inventado"` lanza `ValidacionError`
- `desfase_horario_min: -900` lanza `ValidacionError`
- Encender `exige_caja_abierta` sin ninguna caja activa lanza `ValidacionError`; con una caja activa pasa
- El numero de `?` del INSERT coincide con el numero de columnas de `COLS`

---

