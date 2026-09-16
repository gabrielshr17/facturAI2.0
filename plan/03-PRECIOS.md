# Tres niveles de precio

> Punto 5 del pedido. 7 tareas: PRECIOS-01, PRECIOS-02, PRECIOS-03, PRECIOS-04, PRECIOS-05, PRECIOS-06, PRECIOS-07.
> Antes de despachar cualquier tarea de este archivo, lee [00-CONVENCIONES.md](./00-CONVENCIONES.md).

> [!IMPORTANT]
> **Los briefs de abajo dicen "migracion 11". Ignora ese numero.** Los escribieron ocho
> agentes en paralelo y los ocho reclamaron el id 11. La banda de ids de esta area es
> **`50-59`**; el reparto completo esta en
> [00-CONVENCIONES.md, seccion 2](./00-CONVENCIONES.md#2-reparto-de-ids-de-migracion-bandas).

> [!NOTE]
> **Decision 4 tomada: se mantiene la convencion real del repositorio.** Cabecera por archivo
> explicando el POR QUE de la decision no obvia, y cero comentarios inline decorativos. Donde
> algun brief de abajo diga "sin comentarios en el codigo", **esta superado por esta decision**.

## Estado actual

Hoy existen DOS precios por producto y CERO relación con el cliente. `producto` tiene `precio_venta REAL NOT NULL DEFAULT 0` y `precio_mayoreo REAL` (nullable) creados en la migración 1 (packages/core/src/db/migrations.ts:86-87); no hay `precio_2` ni tabla de niveles ni catálogo de niveles. `cliente` (migrations.ts:103-119) no tiene ningún campo de precio: solo crédito y documento. `factura_linea` guarda `es_mayoreo INTEGER NOT NULL DEFAULT 0` (migrations.ts:150), un booleano que es el ÚNICO rastro de "qué precio se usó"; `cotizacion_linea` (migrations.ts:484-499) y `devolucion_linea` (migrations.ts:398-413) ni siquiera tienen eso. La resolución del precio NO vive en el dominio: `dominio/precio.ts` solo deriva precio desde costo+%ganancia+impuesto y no sabe nada de niveles; la decisión real está en la UI, en una sola línea — `Ventas.tsx:548 return esMayoreo && p.precio_mayoreo ? p.precio_mayoreo : p.precio_venta` — donde `esMayoreo` es un booleano de estado de React alternado con F8 (Ventas.tsx:196). La promoción se aplica DESPUÉS y SOBRE ese base en `agregarProducto` (Ventas.tsx:494-497: `base = precioBase(p); precio = promo ? aplicarDescuento(base, promo) : base`), es decir la precedencia actual "nivel primero, promoción encima, se componen" existe de facto pero no está escrita en ninguna regla ni test; peor, `alternarMayoreoLinea` (Ventas.tsx:881) recalcula el precio SIN volver a aplicar la promoción, así que el mismo producto termina con precio distinto según si se agregó ya en mayoreo o si se alternó después. El repo `factura-repo.agregarLinea` acepta `esMayoreo?: boolean` y lo persiste sin validar nada (factura-repo.ts:53, 256) — el precio unitario llega ya cocinado desde la UI, o sea que hoy NO hay ninguna validación de precio en la capa de servicio. `actualizarPrecioEnTicketsAbiertos` (factura-repo.ts:350-377) es la única lógica de servidor que interpreta el flag: reprecia líneas de tickets abiertos con `l.es_mayoreo ? input.precioMayoreo : input.precioVenta`. La importación masiva ya mapea la columna "mayoreo" (importacion/mapeo.ts:8,21,35; ImportarProductos.tsx:141) y la exportación CSV la incluye (Productos.tsx:228-241). Reportes (reportes-repo.ts) no agrupa ni distingue por nivel y estima margen con el costo ACTUAL del producto. No existe sesión, usuario ni permisos en ninguna parte, así que el "cambiar de nivel con permiso" que pide el cliente no tiene sobre qué apoyarse.

### Lo que ya existe y NO hay que reescribir

| Pieza | Evidencia | Se reutiliza como |
| --- | --- | --- |
| Columna precio_mayoreo en producto (nullable) y su tipo TS | `packages/core/src/db/migrations.ts:87 ; packages/core/src/repos/tipos.ts:25` | Es el nivel 'mayoreo' ya existente: NO crear una columna nueva para mayoreo, renombrar conceptualmente y agregar solo precio_2. Sus datos son la fuente del backfill. |
| Flag es_mayoreo en factura_linea (INTEGER 0\|1, NOT NULL DEFAULT 0) | `packages/core/src/db/migrations.ts:150 ; packages/core/src/repos/tipos.ts:85` | Es el lugar exacto donde debe vivir 'qué nivel se usó'. Se puede agregar nivel_precio TEXT al lado y derivar su valor inicial de es_mayoreo (1 -> 'mayoreo', 0 -> 'normal') sin romper nada. |
| Dominio de precio puro y testeado (deriva precio, invierte el %) | `packages/core/src/dominio/precio.ts:26-62 ; packages/core/test/precio.test.ts:1-40` | Es el archivo donde debe entrar resolverPrecio(producto, nivel, cantidad, promocion). Ya está exportado por dominio/index.ts:3-8 y por el barrel core (src/index.ts:9). |
| aplicarDescuento(precioBase, promocion) acepta CUALQUIER precio base, no lee producto.precio_venta | `packages/core/src/dominio/promocion.ts:13-16` | Ya es componible con un precio de nivel. La precedencia 'nivel primero, promo encima' se implementa pasándole el precio del nivel resuelto; no hay que tocar esta función. |
| promocionRepo.obtenerAplicable(productoId, departamentoId, fecha) con precedencia producto > departamento > todo | `packages/core/src/repos/promocion-repo.ts:109-124` | Resolver la promo vigente. OJO: ordena por especificidad y hace LIMIT 1, NO elige el mayor descuento — si el cliente quiere 'el mejor precio para el cliente' esta consulta hay que cambiarla. |
| factura-repo.agregarLinea con parámetro esMayoreo y persistencia de la línea | `packages/core/src/repos/factura-repo.ts:46-56, 237-276` | Punto de entrada único para agregar líneas: ahí entra `nivel: NivelPrecio` sustituyendo a esMayoreo, y ahí debe ir la validación server-side del nivel permitido para el cliente de la factura. |
| factura-repo.actualizarPrecioEnTicketsAbiertos + su input tipado | `packages/core/src/repos/factura-repo.ts:38-44, 350-377` | Ya reprecia tickets abiertos según el régimen de cada línea. Extender SincronizarPrecioProductoInput a los tres precios y mapear por nivel. Lo llaman Productos.tsx:177-184 y Ventas.tsx:606-613. |
| Ventas.alternarMayoreoLinea: cambio de precio de una línea YA agregada, con fusión de líneas equivalentes y registro de undo/redo | `packages/ui/src/pantallas/Ventas.tsx:874-916` | Es el esqueleto literal de 'cambiar de nivel en la línea'. Convertirlo de toggle binario a cambio de nivel (ciclo o menú) en vez de escribir algo nuevo. |
| Punto único donde la UI decide el precio a usar | `packages/ui/src/pantallas/Ventas.tsx:544-549 (funcion precioBase)` | Reemplazar su cuerpo por una llamada al resolverPrecio del dominio. Es el único lugar de la UI con esa decision (el otro es Ventas.tsx:881, que hoy la duplica mal). |
| FormularioProducto controlado + diferenciasProducto (diff previo a guardar) con el campo 'Precio mayoreo' ya implementado | `packages/ui/src/componentes/FormularioProducto.tsx:49-53 (diff), 172-187 (campo)` | Copiar el bloque del campo mayoreo para precio_2 y agregar su entrada al diff. Lo usan Productos.tsx y el 'Modificar' dentro de Ventas, así que se arregla en un solo sitio. |
| Pipeline completo de importación masiva con auto-mapeo por pistas de nombre de columna | `packages/ui/src/importacion/mapeo.ts:3-41 ; packages/ui/src/componentes/ImportarProductos.tsx:137-146` | Agregar 'precio_2' a CampoDestino, ETIQUETA_CAMPO y PISTAS (p.ej. ['precio2','pvp2','preciob','segundo']) y una línea en el ProductoInput. Cero infraestructura nueva. |
| Exportación CSV del catálogo con las mismas columnas que espera la importación | `packages/ui/src/pantallas/Productos.tsx:228-241` | Agregar la columna 'Precio 2' aquí en el mismo orden que en mapeo.ts para que el round-trip exportar->importar siga cerrando. |
| Migrador idempotente con tabla _migracion, ids 1..10 usados, y un precedente exacto de ALTER TABLE ADD COLUMN | `packages/core/src/db/migrator.ts:8-33 ; packages/core/src/db/migrations.ts:445-454 (migración 9: ALTER TABLE producto ADD COLUMN favorito)` | La migración 9 es la plantilla literal para agregar precio_2/nivel_precio sobre bases ya instaladas. Siguiente id libre: 11. |
| ClienteInput + COLS de cliente-repo y el formulario de Clientes | `packages/core/src/repos/cliente-repo.ts:14-25, 43-45, 90-108 ; packages/ui/src/pantallas/Clientes.tsx:10-18, 192-235` | Donde entra el nivel/los niveles permitidos del cliente. El patrón de checkbox+select ya está (aplica_credito, documento_tipo). |
| ValidacionError + validarProducto/validarCliente (errores por campo, se traducen solos a la UI) | `packages/core/src/repos/producto-repo.ts:27-46 ; packages/core/src/repos/cliente-repo.ts:28-41` | Canal ya establecido para la validación server-side de 'ese cliente no tiene acceso a ese nivel' y 'precio negativo'. |
| Patrón de test de repo: driver node:sqlite en memoria + migrate() + crearXxxRepo | `packages/core/test/promocion.test.ts:7-11, 33-50` | Copiar tal cual para los tests rojo-verde de resolverPrecio, del backfill y de la validación de nivel. |
| backup-repo hace SELECT * por tabla | `packages/core/src/repos/backup-repo.ts:32` | Las columnas nuevas viajan solas en el respaldo, no hay que tocar este archivo. |
| Traducción Postgres del esquema (espejo, inactiva) | `packages/api/db/schema.sql:74 (precio_mayoreo), packages/api/db/schema.sql:137 (es_mayoreo)` | Hay que reflejar ahí los mismos cambios para que la Fase 2 no arranque desincronizada, aunque nada de eso corre hoy. |

### Lo que falta

| Capa | Hueco | Por que importa |
| --- | --- | --- |
| esquema | Columna precio_2 en producto (y decisión de si mayoreo se renombra o se queda como precio_mayoreo) | Es el requisito literal del cliente. Sin ella no hay tercer nivel. Afecta a COLS de producto-repo.ts:48-51 (SELECT explícito, no SELECT *), al INSERT con 19 '?' hardcodeados (producto-repo.ts:95) y al UPDATE de producto-repo.ts:126-143. |
| esquema | Campo de nivel de precio en cliente: un nivel por defecto, o una lista de niveles permitidos | El cliente dijo 'el acceso a cada precio lo asigna el dueño A CADA CLIENTE', que se lee como permiso (posiblemente varios niveles habilitados), no necesariamente como un único nivel fijo. Hoy `cliente` no tiene absolutamente nada (migrations.ts:103-119) y `factura` solo guarda cliente_id. |
| esquema | Columna nivel_precio en factura_linea reemplazando/acompañando es_mayoreo | El cliente pide explícitamente 'guardar en la línea QUE nivel se usó'. Con un booleano no se distingue precio_2 de normal. Además es la única forma de hacer reportes de margen por nivel, porque el precio de la línea está congelado y el nivel del cliente puede cambiar después. |
| esquema | Columna de nivel en cotizacion_linea y devolucion_linea | Hoy ni siquiera tienen es_mayoreo (migrations.ts:484-499 y 398-413). Una cotización a precio mayoreo se guarda como un precio suelto sin explicación, y al reimprimirla o convertirla no se puede reconstruir por qué ese precio. La devolución copia precio_unitario desde factura_linea (devolucion-repo.ts:96-104) y pierde el nivel. |
| esquema | Migración de datos de precio_mayoreo y de las líneas históricas con es_mayoreo=1 | Hay instalaciones reales con productos con precio_mayoreo cargado y con facturas cobradas (contablemente cerradas, algunas con NCF reportado a DGII). El backfill tiene que ser idempotente y no puede tocar ningún monto ya cobrado: solo etiquetar el nivel derivándolo de es_mayoreo. |
| dominio | Tipo NivelPrecio y función resolverPrecio() en el dominio | Hoy la regla de negocio 'qué precio aplica' vive en una expresión ternaria de la UI (Ventas.tsx:548) y está duplicada e inconsistente en Ventas.tsx:881. Eso viola la regla del proyecto de que la validación de negocio va en la capa de servicio, y hace imposible testearla. |
| dominio | Regla de precedencia explícita entre promoción y nivel de precio, escrita y con tests | El cliente lo señala como el riesgo principal. Hoy en agregarProducto la promo se compone sobre el precio del nivel (Ventas.tsx:494-497) pero en alternarMayoreoLinea la promo desaparece (Ventas.tsx:881): el mismo producto sale a dos precios distintos según el camino que tomó el cajero. Es un bug de dinero en producción, hoy. |
| dominio | Resolución por CANTIDAD (umbral de cantidad para mayoreo automático) | El cliente pide 'qué precio aplica según cliente + cantidad + promoción'. En el código no existe ninguna noción de cantidad mínima: el mayoreo hoy es 100% manual (F8). Requiere columna nueva (cantidad_minima_mayoreo) o decisión explícita de no hacerlo. |
| repo | Validación server-side del nivel en factura-repo.agregarLinea (y en actualizarCantidadLinea al re-evaluar umbrales) | Hoy el repo acepta cualquier precioUnitario que le mande la UI sin verificar contra el producto ni contra el cliente (factura-repo.ts:237-276). Con niveles con permiso, la comprobación 'este cliente puede usar este nivel' tiene que estar en el repo o el permiso no existe realmente — cualquiera con la app abierta lo salta. |
| repo | ProductoInput.precio_2 + validación (no negativo) y capacidad de BORRAR un precio | producto-repo.ts:136 hace `input.precio_mayoreo ?? actual.precio_mayoreo`: hoy es imposible quitar un precio_mayoreo ya puesto, el null nunca gana. Con tres niveles el defecto se triplica y el dueño no puede desactivar un nivel de un producto. |
| repo | ClienteInput con el nivel/los niveles + validación de que el valor es un nivel conocido | Sin esto el 'lo asigna el dueño a cada cliente' no se puede guardar. cliente-repo.ts:90-108 (UPDATE) tiene además el mismo patrón `?? actual.x` que impide volver a un valor vacío. |
| repo | actualizarPrecioEnTicketsAbiertos con tres precios y con re-aplicación de promoción | factura-repo.ts:363 solo conoce dos precios. Si una línea quedó en precio_2 y el dueño corrige el producto, hoy la línea se repreciaría al precio normal (el ternario cae al else). Además pisa el precio promocional. |
| ui | Selector de nivel por línea en Ventas (hoy es un botón binario 'mayoreo') | Ventas.tsx:1428-1448 es un botón aria-pressed booleano y F8 es un toggle (Ventas.tsx:196). Tres estados no caben en un toggle; y el chip global de la barra (Ventas.tsx:1236-1243) también es binario. |
| ui | Campo 'Precio 2' en FormularioProducto y su fila en diferenciasProducto | Sin la entrada en diferenciasProducto (FormularioProducto.tsx:35-61), el modal de confirmación de cambios diría 'nada cambió' al tocar solo el precio 2 y Productos.guardar() cerraría el formulario sin guardar (Productos.tsx:155-162 retorna si cambios.length===0). |
| ui | Selector de nivel/permisos en la ficha de Cliente | Es donde el dueño hace la asignación que pide el cliente. Clientes.tsx:192-235 no tiene el control. |
| ui | Modelo de permiso para cambiar de nivel en la línea | El cliente pide 'cambiar de nivel en la línea, con permiso'. No existe login, sesión, usuario activo ni comprobación de permisos en ninguna parte del código; usuario_id siempre llega null. O se construye una puerta mínima (PIN del dueño en el modal) o el requisito queda sin cumplir — no hay sobre qué apoyarlo. |
| ui | Columna precio_2 en la importación masiva y en la exportación CSV | mapeo.ts:3-41 y Productos.tsx:228-241. El cliente lo pide explícitamente y es el camino real por el que estos negocios cargan su catálogo. |
| ui | Consulta de precio (F9) y los resultados de búsqueda muestran solo dos precios | Ventas.tsx:1320 y Ventas.tsx:1894-1896 muestran precio_venta y 'Mayoreo: ...'. Con tres niveles el cajero necesita ver los tres, y cuál corresponde al cliente del ticket. |
| repo | Reporte de margen por nivel de precio | reportes-repo.ts no agrupa por nivel y `resumenGanancia` (reportes-repo.ts:76-109) estima el costo con `p.costo` ACTUAL porque no hay costo histórico en la línea. Un reporte de margen por nivel construido sobre eso será estructuralmente aproximado; conviene decidir si se agrega costo_unitario a factura_linea en la misma migración. |
| api | Reflejo de las columnas nuevas en packages/api/db/schema.sql | Es el espejo Postgres del esquema (schema.sql:74,137). No corre hoy, pero si se deja atrás la Fase 2 arranca con divergencia silenciosa. |
| ui | DESIGN.md | La regla del proyecto exige DESIGN.md antes de UI. En el repo solo existe design-guidelines.md (raíz); no hay DESIGN.md. Hay que decidir si ese archivo cumple el rol o si se crea, antes de dibujar el selector de tres niveles. |

## Enfoque recomendado

TRES COLUMNAS, UN ENUM TEXT, UNA SOLA FUNCION DE RESOLUCION, Y EL GUARDIA EN factura-repo.

1) Esquema minimo, no tabla de catalogo. `producto` ya tiene precio_venta y precio_mayoreo: se agrega SOLO `precio_2 REAL` (nullable). Nada de tabla `nivel_precio` ni `producto_precio`: con tres niveles fijos una tabla de precios es un join por linea de ticket a cambio de cero flexibilidad real, y el repo no tiene transacciones para mantenerla consistente. El nivel es un enum TEXT cerrado `'normal' | 'precio_2' | 'mayoreo'` (TEXT y no INTEGER porque sqlx/Tauri y sql.js no coinciden en el tipeo de INTEGER 0|1, trampa ya documentada).

2) El nombre interno del nivel se congela; la ETIQUETA se centraliza. El cliente todavia no decidio como se llaman los tres niveles en palabras del negocio. Eso NO puede bloquear la implementacion: el enum interno queda fijo y las etiquetas viven en una sola constante exportada `ETIQUETA_NIVEL_PRECIO` en packages/core/src/dominio/nivel-precio.ts (mismo patron que ETIQUETA_TIPO_ECF en dominio/ecf.ts y ETIQUETA_CAMPO en ui/src/importacion/mapeo.ts). Cuando el dueno diga "Precio 2 se llama Precio Colmado", es una linea, no una migracion.

3) Asignacion al cliente = permiso + preferencia, en dos columnas. `cliente.niveles_permitidos_json TEXT NOT NULL DEFAULT '["normal"]'` (LISTA de niveles habilitados — el permiso duro) y `cliente.nivel_precio TEXT NOT NULL DEFAULT 'normal'` (el que se aplica solo). Esto cubre las DOS lecturas de "el acceso lo asigna el dueno a cada cliente" sin decidir por el cliente: si quiere un nivel fijo, pone permitidos=[X] y default=X; si quiere que el cajero elija entre dos, pone permitidos=[normal,mayoreo]. Cero tablas nuevas, cero joins.

4) Precedencia escrita, testeada, y en UN solo lugar. Hoy la regla vive en un ternario de Ventas.tsx:548 y esta DUPLICADA MAL en Ventas.tsx:881 (ahi la promocion desaparece): el mismo producto sale a dos precios distintos segun si el cajero lo agrego en mayoreo o lo alterno despues. Es un bug de dinero en produccion hoy. La regla queda asi, en `resolverPrecio()` del dominio, y la llaman TODOS los caminos:
   a. Nivel candidato = eleccion explicita del cajero (si esta permitida) > automatico por cantidad (si producto.cantidad_minima_mayoreo esta cargado y cantidad >= umbral y mayoreo esta permitido) > cliente.nivel_precio > 'normal'.
   b. Precio base = el precio de ese nivel. Si el producto NO tiene precio cargado para ese nivel, cae a 'normal' PERO LO REPORTA (motivo 'sin_precio_en_nivel'); nunca en silencio.
   c. La promocion vigente se aplica ENCIMA del precio del nivel (se componen), usando el aplicarDescuento que ya existe y que ya acepta cualquier base. Es lo que el codigo hace hoy en el camino bueno, asi que no cambia ningun precio existente: solo deja de perderse en el otro camino.
   d. resolverPrecio devuelve {nivelAplicado, precioNivel, precioFinal, promocionId, motivo} — no un numero suelto — para que la UI pueda mostrar "RD$ 120 -> RD$ 108 (promo)" y avisar de la caida a normal.

5) El permiso es SERVER-SIDE o no existe. El guardia real no es esconder el boton: `factura-repo.agregarLinea` deja de confiar en el `precioUnitario` que manda la UI para productos del catalogo y RECALCULA el precio con resolverPrecio, leyendo el producto y el cliente_id de la factura desde la base. Si el nivel pedido no esta en niveles_permitidos_json del cliente, lanza ValidacionError. Asi el permiso sobrevive aunque alguien abra la consola. El `precioUnitario` de la UI sigue mandando solo para articulos sueltos (producto_id null), que no tienen nivel.

6) El "con permiso de usuario" (PIN del dueno) se DIFIERE a RBAC. No hay login, ni sesion, ni usuario activo: usuario_id siempre llega null. Inventar un PIN aqui seria un guardia falso. El permiso que SI se puede construir hoy y es durable es el del cliente (punto 5). La puerta por usuario queda como seguimiento de RBAC y se engancha despues en el mismo punto unico.

7) Se aprovecha la migracion para congelar el costo en la linea (`factura_linea.costo_unitario`). Sin esto el reporte de margen por nivel que pide el cliente es estructuralmente falso: reportes-repo.resumenGanancia hoy multiplica por `p.costo` ACTUAL. Es un ALTER de un segundo ahora e imposible de reconstruir despues.

8) UNA MIGRACION = UN STATEMENT (ids 11..19). No hay transacciones en ninguna parte del repo y el migrador registra en _migracion DESPUES de ejecutar; en Tauri el driver ademas parte el SQL por ';' a ciegas. Si un ALTER de tres falla, la mitad queda aplicada, la migracion no queda registrada, el siguiente arranque la reaplica y muere con "duplicate column name" EN CADA ARRANQUE, para siempre: la app del cliente queda tapiada. Nueve migraciones feas de una linea es el precio correcto por no tapiar instalaciones reales.

9) `es_mayoreo` NO se borra. SQLite no deja soltar columnas de forma confiable en las versiones que corren sql.js y tauri-plugin-sql. Se deja fisicamente, se marca deprecada, se sigue escribiendo como espejo (`nivel === 'mayoreo' ? 1 : 0`) y se deja de LEER.

### Alternativas descartadas

- Tabla de catalogo `nivel_precio` + tabla `producto_precio` (un renglon por producto y nivel). Es lo 'correcto' de libro y es la respuesta equivocada aqui: los niveles son tres y fijos por decision del cliente, asi que la flexibilidad no se usa; a cambio mete un JOIN o un SELECT extra en el camino caliente de agregar una linea al ticket (el cajero escanea, no espera), obliga a mantener consistencia N:M sin transacciones (no existe un solo BEGIN/COMMIT en core, web ni desktop) y convierte una migracion de 9 ALTER idempotentes en una creacion de tablas con backfill masivo sobre instalaciones con facturas cobradas y NCF ya reportado. Si algun dia aparece un cuarto nivel, agregar una columna sigue siendo mas barato que haber cargado con el join todo el tiempo.
- Tabla puente `cliente_nivel_precio` para los niveles permitidos. Mismo problema en chico: tres filas maximo por cliente, un SELECT extra por cada resolucion de precio, y altas/bajas que hay que mantener a mano sin transaccion. Una columna TEXT con un array JSON corto se lee en el mismo SELECT del cliente que ya se hace, y el repo la valida contra el enum al escribir, asi que la integridad se conserva donde importa (en la escritura).
- Renombrar `precio_mayoreo` a `precio_3` (o a un `precio_nivel_3` generico) para que los tres precios queden simetricos. SQLite soporta RENAME COLUMN solo desde 3.25 y las versiones efectivas de sql.js en la PWA y de sqlx en Tauri no estan garantizadas; ademas romperia la importacion masiva (mapeo.ts ya mapea 'mayoreo'), la exportacion CSV, el schema.sql espejo de Postgres y cualquier respaldo ya generado. La simetria cosmetica no vale una migracion destructiva: el enum interno da la simetria sin tocar el disco.
- Dropear `es_mayoreo` de factura_linea ahora que hay `nivel_precio`. DROP COLUMN en SQLite es reciente y con restricciones, y aqui no hay transacciones para recuperarse de un fallo a medias. Queda como columna espejo deprecada: se escribe, no se lee. Se borra en una limpieza aparte cuando se decida el piso minimo de version de SQLite.
- Dejar la resolucion del precio en la UI y solo agregar el tercer caso al ternario de Ventas.tsx:548. Es la opcion de 20 minutos y es exactamente el bug que ya esta en produccion: la misma regla esta escrita dos veces en el mismo archivo y las dos copias no coinciden. Con tres niveles serian seis caminos. Ademas viola la regla del proyecto de que la validacion de negocio vive en la capa de servicio, y hace que 'el acceso lo asigna el dueno' sea un boton escondido y no un permiso.
- Que el repo siga aceptando el `precioUnitario` ya cocinado por la UI y solo VALIDE que coincida con alguno de los tres precios del producto. Parece mas conservador pero no lo es: obliga a comparar floats por igualdad (el mismo error que ya causa el bug de fusion de lineas en Ventas.tsx:504), y no funciona en absoluto cuando hay promocion encima, porque el precio final ya no es ninguno de los tres. Recalcular en el servidor es mas simple Y mas estricto.
- Resolver el nivel automaticamente por cantidad SIEMPRE (umbral global de mayoreo en la configuracion del negocio). Cambiaria el precio de ventas que hoy salen a precio normal, en instalaciones vivas, sin que nadie lo pida. El umbral va por producto (`cantidad_minima_mayoreo` nullable) y NULL significa 'solo manual', que es el comportamiento de hoy: ninguna instalacion existente cambia de precio hasta que el dueno cargue un umbral a proposito.
- 'Shift+F8 retrocede de nivel' para ciclar los tres niveles con el teclado. No funciona: useAtajosTeclado.ts:19-27 solo agrega 'Shift' al nombre de la combinacion si la tecla es una letra, asi que 'Shift+F8' se normaliza a 'F8' y se pisa con el atajo simple. Hay que cambiar el hook o usar otro control; se elige el otro control (F8 cicla hacia adelante y hay un menu con clic), para no tocar el hook que usan las nueve pantallas.
- Inventar un PIN del dueno en el modal para cumplir 'cambiar de nivel con permiso' sin esperar a RBAC. Un PIN comparado en el cliente contra un hash que la propia app tiene en mano no es un permiso, es un cartel. Y se llevaria por delante el diseno del modulo de usuarios cuando llegue. El permiso que si es real hoy (el del cliente, verificado en el repo) se implementa completo; la puerta por usuario se engancha en el mismo punto cuando exista sesion.
- Migracion unica con los 9 ALTER juntos, que es como se ven mas limpias en el diff. El driver de Tauri (packages/desktop/src/db/tauri-sql-driver.ts:17-22) parte por ';' y ejecuta uno por uno, y el migrador (migrator.ts:24-30) registra en _migracion solo al final. Un fallo en el statement 5 deja la base a medias y sin registrar: al reabrir, la app reintenta desde el ALTER 1 y muere con 'duplicate column name' en cada arranque, para siempre, en la maquina del cliente. Es un modo de falla que no se puede arreglar en remoto.

## Trampas especificas de esta area

- El driver de Tauri parte el SQL de cada migración por ';' a ciegas (packages/desktop/src/db/tauri-sql-driver.ts:17-22): un ';' dentro de un literal de texto o de un comentario -- rompe la migración en escritorio aunque pase en tests (node:sqlite y sql.js sí aceptan lotes). Nada de ';' salvo entre statements.
- NO HAY TRANSACCIONES EN NINGUNA PARTE: grep de BEGIN/COMMIT/ROLLBACK en packages/core|web|desktop devuelve cero. El migrador ejecuta el SQL y solo DESPUÉS inserta en _migracion (packages/core/src/db/migrator.ts:24-30). En Tauri, si el statement 2 de 3 falla, la mitad del cambio queda aplicada y la migración NO queda registrada: el siguiente arranque la reaplica desde el principio y muere con 'duplicate column name' para siempre. En una instalación real eso es una app tapiada. Regla: una migración = un ALTER, y los UPDATE de backfill escritos para ser idempotentes.
- Agregar una columna a la constante COLS y olvidar el contador: los INSERT usan `Array(N).fill('?')` con N HARDCODEADO — producto-repo.ts:95 (19), cliente-repo.ts:73 (15), factura-repo.ts:201 (19) y :267 (14), cotizacion-repo.ts:113 (16). El desajuste no lo detecta TypeScript, explota en runtime en la app del cliente.
- Los SELECT de producto usan una lista explícita de columnas (producto-repo.ts:48-51), no SELECT *: una columna nueva en la tabla es INVISIBLE hasta agregarla ahí. Lo mismo con COLS de cliente (cliente-repo.ts:43-45), factura_linea (factura-repo.ts:87-88) y — trampa fina — la copia de COLS_FACTURA_LINEA que vive en devolucion-repo.ts:41-42. Tocar es_mayoreo obliga a cambiar las tres listas más la del seed (packages/core/src/db/seed.ts:119) a la vez.
- producto-repo.actualizar hace `input.precio_mayoreo ?? actual.precio_mayoreo` (producto-repo.ts:136): un precio NUNCA se puede borrar (null nunca gana). Y `activo: input.activo === false ? 0 : 1` (producto-repo.ts:140) reactiva cualquier producto en cada update. Replicar ese patrón para precio_2 hereda dos bugs.
- producto-repo.actualizar recalcula el precio con `precioManual: input.precio_venta ?? null` (producto-repo.ts:118-123): si el input no trae precio_venta, el precio manual guardado se PISA con el derivado de costo+%. La importación masiva pasa por ahí con precio_venta posiblemente null (ImportarProductos.tsx:141, 150). Cualquier resolución de tres niveles que se apoye en 'actualizar' hereda esto.
- La fusión de líneas compara floats por igualdad: `l.es_mayoreo === (esMayoreo?1:0) && l.precio_unitario === precio` (Ventas.tsx:504-506) y la variante en Ventas.tsx:884. Con tres niveles, dos niveles pueden tener el mismo precio numérico y se fusionarían líneas de nivel distinto, perdiendo el dato de nivel que el cliente pide guardar. El nivel tiene que entrar en la clave de fusión.
- alternarMayoreoLinea BORRA la línea y crea una nueva (Ventas.tsx:895-911): cambia el id y, como obtenerLineas ordena por created_at (factura-repo.ts:231), la línea salta al final del ticket. Con un ciclo de tres niveles el cajero va a reordenar el ticket cada vez que corrija un nivel. Considerar un UPDATE in-place en el repo en vez de borrar+crear.
- alternarMayoreoLinea NO vuelve a consultar la promoción (Ventas.tsx:881 usa `p.precio_mayoreo ? ... : p.precio_venta` crudo), mientras agregarProducto sí la aplica (Ventas.tsx:495). Ese es el bug de precedencia REAL que ya está en producción; la resolución de nivel tiene que ser una sola función llamada desde los dos caminos, o se repite.
- actualizarPrecioEnTicketsAbiertos también ignora la promoción al repreciar (factura-repo.ts:366): corregir un producto borra el descuento promocional de los tickets abiertos. Al extenderlo a tres niveles hay que decidir si se arregla también, porque si no el bug se vuelve más visible.
- useAtajosTeclado IGNORA Shift en teclas de función: solo añade 'Shift' al nombre si la tecla es una letra (packages/ui/src/hooks/useAtajosTeclado.ts:19-27). 'Shift+F8' se normaliza a 'F8'. Un plan de 'F8 avanza de nivel, Shift+F8 retrocede' no funciona; hay que usar otra tecla o un menú.
- F8 ya está sobrecargado con DOS significados según haya o no línea resaltada (Ventas.tsx:196) y el chip de la barra que delata el modo global es binario (Ventas.tsx:1236-1243). Tres niveles rompen el modelo de toggle: hay que rediseñar ese control, no parchearlo.
- El precio_venta INCLUYE ITBIS por convención de todo el dominio (dominio/precio.ts:8-13; dominio/factura.ts extrae el impuesto dividiendo entre 1+tasa). Cualquier precio nuevo (precio_2) tiene que seguir exactamente esa convención o los totales, el desglose fiscal y el NCF salen descuadrados.
- La misma UI corre sobre sql.js (PWA, packages/web/src/db/sqljs-driver.ts) y sobre tauri-plugin-sql. sql.js persiste a IndexedDB con un debounce de 150 ms (sqljs-driver.ts:64-72) y migrate() no fuerza persistirAhora: una migración seguida de un cierre inmediato de pestaña puede perderse y reaplicarse. En Tauri, db.select devuelve tipos de sqlx — un INTEGER 0|1 y un TEXT no se comportan igual; si el nivel se guarda como TEXT ('normal'|'precio_2'|'mayoreo') se evita la ambigüedad numérica entre drivers.
- El contexto de repos crea un objeto NUEVO en cada render (packages/ui/src/data/contexto.tsx:61) y Ventas mete `productos` en las dependencias de un useEffect (Ventas.tsx:480). Funciona por casualidad; no agregar nuevos useEffect que dependan de repos al implementar esto.
- promocionRepo.obtenerAplicable elige la promo MÁS ESPECÍFICA, no la más barata (promocion-repo.ts:119). Si la regla de negocio acordada termina siendo 'el cliente paga siempre el menor precio', esa consulta hay que reescribirla, no solo componerla con el nivel.
- Este repo SÍ tiene comentarios en el código en todas partes (ver cualquier archivo de core/ui), al contrario de la regla global de 'sin comentarios'. Seguir la convención local del repo o el diff queda inconsistente con todo lo demás. Igual con el idioma: todo en español, incluidos nombres de columnas y de tipos.

## Preguntas para el dueno del negocio

- ¿'El acceso a cada precio lo asigna el dueño a cada cliente' significa UN nivel por defecto por cliente, o una LISTA de niveles habilitados entre los que el cajero elige? El esquema cambia por completo (una columna TEXT vs. una tabla cliente_nivel_precio).
- ¿Qué precio aplica en un ticket SIN cliente asignado, que es la mayoría de las ventas de mostrador? ¿Siempre 'normal', o se permite subir de nivel manualmente?
- Precedencia promoción vs. nivel, en palabras del dueño: ¿la promoción se aplica ENCIMA del precio del nivel (se componen, que es lo que hace el código hoy en un camino), o la promoción solo aplica al precio normal, o se cobra el MENOR de los dos? Esta respuesta determina si promocion-repo.obtenerAplicable hay que reescribirla.
- ¿El mayoreo debe activarse AUTOMÁTICAMENTE a partir de una cantidad mínima por producto, o sigue siendo siempre una decisión manual del cajero? Hoy no existe ninguna noción de cantidad mínima en el modelo.
- Si un producto no tiene cargado el precio 2 (o el de mayoreo), ¿el sistema cae al precio normal en silencio, avisa, o bloquea la venta a ese nivel?
- ¿'Con permiso' para cambiar de nivel en la línea significa qué exactamente? No hay login ni usuarios funcionando: ¿alcanza con un PIN del dueño pedido en el momento, o esto depende de que primero exista el módulo de usuarios/sesión?
- ¿Cómo se llaman los tres niveles en la pantalla, en las palabras del negocio? 'Precio 2' no es un nombre que un cajero entienda; hay que fijar las etiquetas antes de dibujar el control.
- Para las bases ya instaladas: ¿los clientes existentes quedan todos en nivel normal? ¿El precio_mayoreo cargado se conserva tal cual como nivel mayoreo y precio_2 nace vacío?
- ¿Las ventas ya cobradas deben quedar etiquetadas retroactivamente (es_mayoreo=1 -> nivel 'mayoreo') para que los reportes de margen por nivel incluyan el histórico, o el histórico se reporta aparte?
- ¿El recibo impreso y la cotización deben mostrar el nivel de precio aplicado, o eso es información interna que no debe ver el cliente final?
- ¿Se quiere aprovechar esta migración para guardar el costo unitario en la línea de factura? Sin eso, el reporte de margen por nivel siempre será una estimación con el costo actual del producto (el propio reportes-repo.ts lo advierte).

## Tareas

### PRECIOS-01 — Migraciones 11-19: columnas de nivel de precio, backfill idempotente y sincronizacion de COLS/contadores

**Objetivo.** La base tiene precio_2, umbral de mayoreo, nivel y permisos en cliente, nivel en las tres tablas de linea y costo congelado en factura_linea; todos los repos leen y escriben las columnas nuevas sin que ningun INSERT se desalinee.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto - toca el esquema de cinco tablas y los cinco INSERT con contador de '?' hardcodeado; un desajuste no lo ve TypeScript y explota en runtime en la app instalada del cliente, y una migracion mal partida deja la app de escritorio tapiada en cada arranque. | nada |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto, sin `any`, TODO en espanol: nombres de archivos, tipos, columnas SQL y UI). OJO: la regla global dice 'sin comentarios', pero ESTE repo tiene comentarios en espanol en todos lados explicando el POR QUE de cada decision; sigue la convencion LOCAL o el diff queda inconsistente. Crea una rama `feature/precios-esquema-tres-niveles`, nunca commitees en master.

OBJETIVO: solo esquema y plomeria. No escribes ni una regla de negocio, no tocas ninguna pantalla.

PASO 1 - migraciones. Abre packages/core/src/db/migrations.ts. Es un array `migrations` con objetos {id, nombre, sql}. Los ids 1..10 estan usados; el siguiente libre es 11. Imita EXACTAMENTE la migracion 9 (migrations.ts:445-454, `producto_favorito`), que es el precedente literal de ALTER TABLE ADD COLUMN en este repo.

REGLA INNEGOCIABLE: UNA MIGRACION = UN SOLO STATEMENT SQL. No agrupes. Motivo: el driver de Tauri (packages/desktop/src/db/tauri-sql-driver.ts:17-22) parte el SQL de cada migracion por ';' y ejecuta uno por uno, y packages/core/src/db/migrator.ts:24-30 inserta en _migracion SOLO DESPUES de ejecutar todo. No hay transacciones en ningun lado del repo (grep de BEGIN/COMMIT/ROLLBACK en core|web|desktop da cero). Si el statement 5 de 9 falla, la mitad queda aplicada, la migracion NO queda registrada, el siguiente arranque la reaplica desde el principio y muere con 'duplicate column name' EN CADA ARRANQUE, para siempre, en la maquina del cliente. Ademas: JAMAS pongas un ';' dentro de un literal de texto ni dentro de un comentario `--`, por la misma razon.

Agrega los ids 11..19 exactamente como estan en el campo migracionSql de esta tarea. Ponle a cada uno un `nombre` descriptivo en espanol (p.ej. 'producto_precio_2', 'cliente_nivel_precio', 'factura_linea_nivel_precio', 'factura_linea_backfill_nivel', 'factura_linea_costo_unitario').

PASO 2 - tipos. En packages/core/src/repos/tipos.ts agrega a la interfaz `Producto`: `precio_2: number | null` y `cantidad_minima_mayoreo: number | null`. A `Cliente`: `nivel_precio: string` y `niveles_permitidos_json: string`. A `FacturaLinea`: `nivel_precio: string` y `costo_unitario: number | null`. A `CotizacionLinea` y `DevolucionLinea`: `nivel_precio: string`. Usa `string` y NO el tipo NivelPrecio: ese tipo lo crea PRECIOS-02 y estas dos tareas corren en paralelo; el estrechamiento de tipo lo hace PRECIOS-03. Deja `es_mayoreo` donde esta y agregale un comentario de deprecado (espejo de nivel_precio, no leer).

PASO 3 - LA TRAMPA QUE ROMPE EN RUNTIME Y QUE TYPESCRIPT NO DETECTA. Los SELECT de este repo usan listas EXPLICITAS de columnas, no SELECT *: una columna nueva es INVISIBLE hasta agregarla a la constante COLS. Y los INSERT usan `Array(N).fill('?')` con N HARDCODEADO. Si agregas a COLS y olvidas N, explota en runtime en la app del cliente. Cambia TODOS estos, uno por uno, verificando el conteo a mano:
  - packages/core/src/repos/producto-repo.ts:48-51 COLS (agrega precio_2, cantidad_minima_mayoreo) y linea 95 `Array(19)` -> `Array(21)`. Agrega los dos valores al array de parametros del INSERT en el orden EXACTO de COLS.
  - packages/core/src/repos/cliente-repo.ts:43-45 COLS (agrega nivel_precio, niveles_permitidos_json) y linea 73 `Array(15)` -> `Array(17)`.
  - packages/core/src/repos/factura-repo.ts:87-88 COLS_LINEA (agrega nivel_precio, costo_unitario) y linea 267 `Array(14)` -> `Array(16)`.
  - packages/core/src/repos/devolucion-repo.ts:41-42 - TRAMPA FINA: aqui vive una COPIA de COLS_FACTURA_LINEA. Actualizala igual. Y COLS_LINEA de devolucion_linea (devolucion-repo.ts:47-48, agrega nivel_precio) con su linea 188 `Array(14)` -> `Array(15)`.
  - packages/core/src/repos/cotizacion-repo.ts COLS_LINEA (agrega nivel_precio) y linea 143 `Array(13)` -> `Array(14)`.
  - packages/core/src/db/seed.ts:119 - el INSERT literal de factura_linea con 13 '?'. Agrega nivel_precio ('normal') y costo_unitario (null) y sube a 15.
En cada repo, el objeto que se construye antes del INSERT tambien necesita los campos nuevos con su valor por defecto (precio_2 null, cantidad_minima_mayoreo null, nivel_precio 'normal', niveles_permitidos_json con el JSON de solo normal, costo_unitario null). NO agregues logica: solo pasa el valor por defecto. Los parametros de entrada (ProductoInput, ClienteInput, AgregarLineaInput) los abren PRECIOS-03 y PRECIOS-04, no tu.

QUE NO TOCAR, EN ABSOLUTO: packages/core/src/dominio/* (es de PRECIOS-02). Cualquier archivo .tsx de packages/ui. packages/api/db/schema.sql (es de PRECIOS-07). packages/core/src/repos/reportes-repo.ts. La logica de `actualizarPrecioEnTicketsAbiertos` (factura-repo.ts:350-377) - la columna nueva viaja pero la regla la cambia PRECIOS-04. No borres `es_mayoreo`. No agregues indices salvo el que se pide.

Corre `pnpm -r test` y `pnpm -r build` antes de terminar. El repo tiene que quedar compilando y verde.
```

#### SQL de la migracion

```sql
-- packages/core/src/db/migrations.ts - agregar al array `migrations`.
-- UNA MIGRACION = UN STATEMENT. Sin ';' dentro de literales ni de comentarios.

{ id: 11, nombre: "producto_precio_2", sql: /* sql */ `
  -- Tercer nivel de precio (el dueno lo asigna por cliente). NULL = el producto
  -- no tiene precio 2 cargado y la resolucion cae a normal avisando.
  ALTER TABLE producto ADD COLUMN precio_2 REAL
` },

{ id: 12, nombre: "producto_cantidad_minima_mayoreo", sql: /* sql */ `
  -- Umbral opcional para que el mayoreo se aplique solo por cantidad. NULL =
  -- solo manual, que es el comportamiento de siempre: ninguna instalacion
  -- existente cambia de precio hasta que el dueno cargue un umbral a proposito.
  ALTER TABLE producto ADD COLUMN cantidad_minima_mayoreo REAL
` },

{ id: 13, nombre: "cliente_nivel_precio", sql: /* sql */ `
  -- Nivel que se aplica solo cuando este cliente esta en el ticket.
  ALTER TABLE cliente ADD COLUMN nivel_precio TEXT NOT NULL DEFAULT 'normal'
` },

{ id: 14, nombre: "cliente_niveles_permitidos", sql: /* sql */ `
  -- Permiso duro: lista de niveles a los que este cliente tiene acceso.
  -- JSON array del enum normal|precio_2|mayoreo. Se valida en cliente-repo.
  ALTER TABLE cliente ADD COLUMN niveles_permitidos_json TEXT NOT NULL DEFAULT '["normal"]'
` },

{ id: 15, nombre: "factura_linea_nivel_precio", sql: /* sql */ `
  -- Que nivel se uso en esta linea. Reemplaza en lectura a es_mayoreo, que
  -- queda como espejo deprecado porque SQLite no deja soltar columnas de forma
  -- confiable en las versiones de sql.js y sqlx que corren en produccion.
  ALTER TABLE factura_linea ADD COLUMN nivel_precio TEXT NOT NULL DEFAULT 'normal'
` },

{ id: 16, nombre: "factura_linea_backfill_nivel", sql: /* sql */ `
  -- Backfill idempotente: SOLO etiqueta, no toca ningun monto. Hay facturas
  -- cobradas con NCF ya reportado a DGII: cambiar un monto ahi es alterar un
  -- registro contable cerrado.
  UPDATE factura_linea SET nivel_precio = 'mayoreo' WHERE es_mayoreo = 1 AND nivel_precio = 'normal'
` },

{ id: 17, nombre: "cotizacion_linea_nivel_precio", sql: /* sql */ `
  -- Sin esto, una cotizacion a precio mayoreo se guarda como un precio suelto
  -- sin explicacion y al reimprimirla o convertirla no se puede reconstruir.
  ALTER TABLE cotizacion_linea ADD COLUMN nivel_precio TEXT NOT NULL DEFAULT 'normal'
` },

{ id: 18, nombre: "devolucion_linea_nivel_precio", sql: /* sql */ `
  -- La devolucion copia precio_unitario desde factura_linea y hoy pierde el nivel.
  ALTER TABLE devolucion_linea ADD COLUMN nivel_precio TEXT NOT NULL DEFAULT 'normal'
` },

{ id: 19, nombre: "factura_linea_costo_unitario", sql: /* sql */ `
  -- Costo congelado al momento de vender. Sin esto el margen por nivel se
  -- estima con el costo ACTUAL del producto (ver reportes-repo.resumenGanancia)
  -- y el reporte que pide el cliente seria estructuralmente falso. Es imposible
  -- de reconstruir despues, asi que se agrega ahora aunque se llene mas tarde.
  ALTER TABLE factura_linea ADD COLUMN costo_unitario REAL
` },
```

#### Archivos a tocar

- `packages/core/src/db/migrations.ts`
- `packages/core/src/db/seed.ts`
- `packages/core/src/repos/tipos.ts`
- `packages/core/src/repos/producto-repo.ts`
- `packages/core/src/repos/cliente-repo.ts`
- `packages/core/src/repos/factura-repo.ts`
- `packages/core/src/repos/cotizacion-repo.ts`
- `packages/core/src/repos/devolucion-repo.ts`
- `packages/core/test/migrations.test.ts`

#### Criterios de aceptacion

- [ ] `migrate()` sobre una base vacia crea producto.precio_2, producto.cantidad_minima_mayoreo, cliente.nivel_precio, cliente.niveles_permitidos_json, factura_linea.nivel_precio, factura_linea.costo_unitario, cotizacion_linea.nivel_precio y devolucion_linea.nivel_precio.
- [ ] Cada entrada nueva del array `migrations` contiene EXACTAMENTE un statement SQL; ningun ';' aparece dentro de un literal ni de un comentario.
- [ ] `migrate()` corrido dos veces seguidas devuelve [] la segunda vez (sigue siendo idempotente) y el backfill corrido dos veces no cambia ninguna fila la segunda.
- [ ] Ninguna factura con estado 'cobrada' cambia de subtotal, total_itbis ni total tras migrar: el backfill solo escribe nivel_precio, jamas un monto.
- [ ] Toda linea historica con es_mayoreo=1 queda con nivel_precio='mayoreo'; toda linea con es_mayoreo=0 queda en 'normal'.
- [ ] Las constantes COLS de producto-repo, cliente-repo, factura-repo (COLS_LINEA), cotizacion-repo, devolucion-repo (COLS_FACTURA_LINEA y COLS_LINEA) incluyen las columnas nuevas y el conteo de `Array(N).fill('?')` coincide con el numero de columnas en cada una de las cinco.
- [ ] `crear` de producto, cliente, linea de factura, cotizacion y devolucion siguen insertando sin error de values count mismatch contra una base recien migrada.
- [ ] `pnpm -r build` y `pnpm -r test` pasan; la columna es_mayoreo sigue existiendo.

#### Pruebas a escribir primero (TDD)

- migrations.test.ts: 'la migracion 11-19 agrega las columnas de nivel de precio' - migrate() y luego PRAGMA table_info sobre producto, cliente, factura_linea, cotizacion_linea y devolucion_linea; espera encontrar cada columna nueva con su tipo y default.
- migrations.test.ts: 'cada migracion nueva tiene un solo statement' - recorre el array `migrations` filtrando id>=11 y espera que sql.split(';').filter(s=>s.trim()).length === 1 para cada una (esta prueba protege el arranque de Tauri).
- migrations.test.ts: 'el backfill etiqueta las lineas historicas de mayoreo' - sobre una base migrada hasta el id 14, inserta a mano dos factura_linea (una con es_mayoreo=1, otra con 0), corre el resto de migraciones y espera nivel_precio 'mayoreo' y 'normal' respectivamente.
- migrations.test.ts: 'el backfill no toca ningun monto cobrado' - snapshot de subtotal/monto_itbis/total de una factura cobrada antes y despues de migrar; espera igualdad exacta.
- migrations.test.ts: 'el backfill es idempotente' - corre el UPDATE del backfill dos veces y espera que el conteo de filas con nivel_precio='mayoreo' sea el mismo.
- migrations.test.ts (ya existe): 'es idempotente: correr migrate dos veces no reaplica' debe seguir en verde sin cambios.
- repos.test.ts: 'los INSERT siguen alineados tras agregar columnas' - crea un producto, un cliente, una factura con una linea, una cotizacion con una linea y una devolucion, contra una base migrada; espera que ninguno lance y que los campos nuevos vuelvan con su valor por defecto ('normal', null).
- migrations.test.ts: 'el seed carga contra el esquema nuevo' - migrate() + seed() sin error y la linea de demo tiene nivel_precio='normal'.

---

### PRECIOS-02 — Dominio: tipo NivelPrecio y resolverPrecio() con la precedencia nivel/cantidad/promocion escrita y testeada

**Objetivo.** Existe una unica funcion pura, testeada, que dado producto + cliente + cantidad + promocion devuelve que nivel aplica, a que precio, y por que - y arregla de raiz la incoherencia de precios que hoy tiene Ventas.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo - es dominio puro sin SQL ni React y no cambia ningun comportamiento existente hasta que alguien la llame; el unico riesgo real es codificar mal la precedencia, y por eso los tests de los dos caminos y de la composicion con promocion son obligatorios antes de cerrarla. | nada |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto, sin `any`, TODO en espanol: nombres de tipos, funciones y textos). Este repo SI usa comentarios en espanol explicando el POR QUE de cada decision (mira packages/core/src/dominio/precio.ts): sigue esa convencion local aunque la regla global diga lo contrario. Rama `feature/precios-dominio-resolucion`, nunca master.

Esta tarea es DOMINIO PURO: cero SQL, cero React, cero acceso a base. No dependes de ninguna otra tarea.

CONTEXTO DEL BUG QUE VIENES A MATAR. Hoy la regla 'que precio aplica' vive en un ternario de la UI: packages/ui/src/pantallas/Ventas.tsx:548 `return esMayoreo && p.precio_mayoreo ? p.precio_mayoreo : p.precio_venta`. Y esta DUPLICADA MAL en Ventas.tsx:881 (dentro de alternarMayoreoLinea), donde NO se vuelve a consultar la promocion. Resultado: el mismo producto, en el mismo ticket, sale a un precio si el cajero lo agrego ya en mayoreo y a otro si lo alterno despues. Es un bug de dinero, en produccion, hoy. Tu funcion es el unico lugar donde esa regla puede vivir.

PASO 1 - crea packages/core/src/dominio/nivel-precio.ts. Imita el estilo de packages/core/src/dominio/ecf.ts (que exporta un tipo union, una constante ETIQUETA_TIPO_ECF y funciones puras) y de packages/core/src/dominio/promocion.ts. Define:
  - `export type NivelPrecio = 'normal' | 'precio_2' | 'mayoreo'`
  - `export const NIVELES_PRECIO: readonly NivelPrecio[] = ['normal','precio_2','mayoreo']`
  - `export const ETIQUETA_NIVEL_PRECIO: Record<NivelPrecio,string>` con 'Precio normal' | 'Precio 2' | 'Precio mayoreo'. IMPORTANTE: el cliente todavia no decidio como se llaman los tres niveles en palabras del negocio; por eso los nombres visibles viven SOLO aqui. Ningun otro archivo del repo puede escribir 'Precio 2' a mano.
  - `export function esNivelPrecio(v: unknown): v is NivelPrecio` - guardia de tipo.
  - `export function parsearNivelesPermitidos(json: string | null | undefined): NivelPrecio[]` - recibe el contenido de cliente.niveles_permitidos_json. Envuelto en try/catch (regla del proyecto: nada de catch vacio, loguea el contexto y devuelve un valor seguro). Tolera null, cadena vacia, JSON invalido y valores desconocidos dentro del array. SIEMPRE devuelve un array que contiene al menos 'normal': un dato corrupto nunca puede dejar a un cliente sin poder comprar. Filtra duplicados y valores fuera del enum.
  - `export function serializarNivelesPermitidos(niveles: NivelPrecio[]): string` - el inverso, canonico (orden fijo segun NIVELES_PRECIO, sin duplicados, siempre incluye 'normal').

PASO 2 - crea `resolverPrecio` en el MISMO archivo (o en dominio/precio.ts si te queda mas natural; dominio/precio.ts ya es el hogar del calculo de precio y ya esta exportado por dominio/index.ts:3-8 y por el barrel packages/core/src/index.ts:9). Firma exacta:

export interface PreciosProducto { precio_venta: number; precio_2: number | null; precio_mayoreo: number | null; cantidad_minima_mayoreo: number | null }
export type MotivoNivel = 'explicito' | 'cantidad' | 'cliente' | 'defecto' | 'sin_precio_en_nivel'
export interface ResolverPrecioInput { producto: PreciosProducto; cantidad: number; nivelSolicitado?: NivelPrecio | null; nivelCliente?: NivelPrecio | null; nivelesPermitidos?: NivelPrecio[] | null; promocion?: DescuentoInput | null }
export interface PrecioResuelto { nivelAplicado: NivelPrecio; nivelSolicitado: NivelPrecio; precioNivel: number; precioFinal: number; promocionAplicada: boolean; motivo: MotivoNivel }
export function resolverPrecio(input: ResolverPrecioInput): PrecioResuelto

NO recibas el tipo `Producto` completo ni el `Cliente` completo: una interfaz estructural chica mantiene la funcion pura, testeable sin base, y la desacopla de PRECIOS-01 (que corre en paralelo y esta cambiando tipos.ts).

PASO 3 - LA PRECEDENCIA. Implementala EXACTAMENTE asi y escribela en un comentario de bloque arriba de la funcion, porque es la regla de negocio que el cliente senalo como el riesgo principal:
  a) Nivel candidato, en este orden: `nivelSolicitado` (eleccion explicita del cajero) > automatico por cantidad (si producto.cantidad_minima_mayoreo != null y cantidad >= ese umbral, candidato 'mayoreo') > `nivelCliente` > 'normal'. Lo explicito SIEMPRE gana sobre lo automatico.
  b) Permiso: si `nivelesPermitidos` viene y el candidato no esta en la lista, cae al primer nivel permitido segun el orden de NIVELES_PRECIO. Si `nivelesPermitidos` es null/undefined (ticket sin cliente, venta de mostrador), se permite cualquier nivel - el cajero de mostrador decide.
  c) Precio del nivel: 'normal' -> precio_venta, 'precio_2' -> precio_2, 'mayoreo' -> precio_mayoreo. Si el precio de ese nivel es null o <= 0, cae a 'normal' y el motivo pasa a 'sin_precio_en_nivel'. NUNCA en silencio: el motivo tiene que llegar a la UI para que avise.
  d) Promocion: si viene, se aplica ENCIMA del precio del nivel con el `aplicarDescuento` que YA existe en packages/core/src/dominio/promocion.ts:13-16 (ya acepta cualquier base, no lee producto.precio_venta: no la toques). Se COMPONEN. Es lo que el codigo hace hoy en el camino bueno, asi que ningun precio existente cambia.
  e) Todo monto pasa por `redondear2` de packages/core/src/dominio/dinero.ts. precioFinal nunca negativo.

CONVENCION QUE NO PUEDES ROMPER: en todo este dominio el precio INCLUYE ITBIS (ver el comentario de packages/core/src/dominio/precio.ts:8-13; factura.ts extrae el impuesto dividiendo entre 1+tasa). precio_2 y precio_mayoreo siguen exactamente esa convencion. Si te desvias, los totales, el desglose fiscal y el NCF salen descuadrados.

PASO 4 - exporta todo lo nuevo desde packages/core/src/dominio/index.ts (imita como ya se exporta el bloque de promocion.js al final del archivo) y verifica que sale por el barrel packages/core/src/index.ts.

TDD: escribe packages/core/test/nivel-precio.test.ts PRIMERO, en rojo. Imita el estilo de packages/core/test/precio.test.ts (dominio puro, sin driver).

QUE NO TOCAR: ningun archivo de packages/core/src/repos/ (ni tipos.ts). Ningun .tsx. packages/core/src/db/*. No modifiques `aplicarDescuento` ni `calcularPrecioVenta` ni `calcularLinea`. No cambies promocion-repo.obtenerAplicable (si el cliente termina pidiendo 'el precio mas barato siempre' esa consulta habra que reescribirla, pero eso es otra tarea y otra decision).

Corre `pnpm -r test` y `pnpm -r build`.
```

#### Archivos a tocar

- `packages/core/src/dominio/nivel-precio.ts`
- `packages/core/src/dominio/index.ts`
- `packages/core/src/index.ts`
- `packages/core/test/nivel-precio.test.ts`

#### Criterios de aceptacion

- [ ] `NivelPrecio`, `NIVELES_PRECIO`, `ETIQUETA_NIVEL_PRECIO`, `esNivelPrecio`, `parsearNivelesPermitidos`, `serializarNivelesPermitidos` y `resolverPrecio` se importan sin error desde '@sfr/core'.
- [ ] La cadena visible de cada nivel aparece UNA sola vez en todo el repo, dentro de ETIQUETA_NIVEL_PRECIO.
- [ ] resolverPrecio es pura: no importa nada de repos/, ni de db/, ni de react.
- [ ] Con nivelSolicitado='mayoreo' y promocion vigente, precioFinal === aplicarDescuento(precio_mayoreo, promo) - la promocion se compone sobre el nivel, no lo reemplaza.
- [ ] Con un producto sin precio_2 cargado, pedir 'precio_2' devuelve nivelAplicado='normal', precioNivel=precio_venta y motivo='sin_precio_en_nivel' (nunca lanza, nunca cobra el precio de otro nivel en silencio).
- [ ] Un nivel fuera de nivelesPermitidos nunca sale como nivelAplicado.
- [ ] parsearNivelesPermitidos devuelve ['normal'] ante null, cadena vacia, JSON invalido y un array con valores inventados, sin lanzar.
- [ ] cantidad_minima_mayoreo=null nunca activa mayoreo automatico: el comportamiento por defecto es identico al de hoy.
- [ ] `pnpm -r test` y `pnpm -r build` en verde; ningun test existente cambia de resultado.

#### Pruebas a escribir primero (TDD)

- nivel-precio.test.ts: 'sin nivel solicitado ni cliente, aplica normal' - motivo 'defecto', precioNivel === precio_venta.
- nivel-precio.test.ts: 'el nivel explicito del cajero gana sobre el del cliente' - nivelCliente='mayoreo', nivelSolicitado='normal' -> nivelAplicado 'normal', motivo 'explicito'.
- nivel-precio.test.ts: 'el nivel del cliente aplica cuando no hay eleccion explicita' - motivo 'cliente'.
- nivel-precio.test.ts: 'el umbral de cantidad activa mayoreo automaticamente' - cantidad_minima_mayoreo=12, cantidad=12 -> 'mayoreo', motivo 'cantidad'; cantidad=11 -> 'normal'.
- nivel-precio.test.ts: 'el umbral nulo nunca activa mayoreo automatico' - cantidad=9999 con cantidad_minima_mayoreo=null sigue en 'normal'.
- nivel-precio.test.ts: 'lo explicito gana sobre el umbral de cantidad' - umbral alcanzado pero nivelSolicitado='normal' -> 'normal'.
- nivel-precio.test.ts: 'un nivel no permitido cae al permitido de menor orden' - nivelSolicitado='mayoreo' con nivelesPermitidos=['normal'] -> 'normal'.
- nivel-precio.test.ts: 'sin lista de permitidos (venta de mostrador sin cliente) se permite cualquier nivel'.
- nivel-precio.test.ts: 'producto sin precio_2 cae a normal y lo reporta' - motivo 'sin_precio_en_nivel', y la promo se aplica sobre el precio normal.
- nivel-precio.test.ts: 'precio del nivel en 0 o negativo se trata como no cargado'.
- nivel-precio.test.ts: 'la promocion porcentual se compone sobre el precio de mayoreo' - precio_mayoreo 100, promo 10% -> 90; y NO 10% sobre precio_venta.
- nivel-precio.test.ts: 'la promocion de monto fijo nunca deja el precio negativo' - precio_2 50, monto_fijo 80 -> 0.
- nivel-precio.test.ts: 'resolver dos veces el mismo caso da el mismo precio' - el mismo input por el camino 'agregar' y por el camino 'cambiar de nivel' produce PrecioResuelto identico (esta prueba es la que fija el bug de Ventas.tsx:881).
- nivel-precio.test.ts: 'todo monto viene redondeado a 2 decimales'.
- nivel-precio.test.ts: 'parsearNivelesPermitidos tolera basura y siempre incluye normal' - casos null, vacio, array vacio, texto no JSON, solo mayoreo, normal duplicado.
- nivel-precio.test.ts: 'serializar y parsear es ida y vuelta estable' - serializar(parsear(x)) es idempotente.

---

### PRECIOS-03 — producto-repo y cliente-repo: cargar los tres precios, el umbral, y asignar niveles permitidos al cliente con validacion

**Objetivo.** El dueno puede guardar precio_2 y el umbral de mayoreo en un producto, BORRAR un precio ya cargado, y asignar a cada cliente su nivel por defecto y sus niveles permitidos, todo validado en el repo.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio - arregla el patron `?? actual.x` que hoy impide borrar un precio, y ese cambio de semantica (undefined conserva, null borra) toca metodos que ya usan Productos, Ventas y la importacion masiva: si algun llamador manda null donde antes mandaba undefined, borraria un precio sin querer. | PRECIOS-01, PRECIOS-02 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto, sin `any`, TODO en espanol). El repo usa comentarios en espanol explicando el POR QUE: sigue esa convencion local. Rama `feature/precios-repos-catalogo`, nunca master.

Ya existe (hecho por otras tareas, no lo rehagas): las columnas producto.precio_2, producto.cantidad_minima_mayoreo, cliente.nivel_precio y cliente.niveles_permitidos_json, ya en las constantes COLS y en los INSERT. Y en el dominio: `NivelPrecio`, `NIVELES_PRECIO`, `esNivelPrecio`, `parsearNivelesPermitidos`, `serializarNivelesPermitidos`, exportados desde '@sfr/core'.

PASO 1 - packages/core/src/repos/producto-repo.ts.
  - Agrega a `ProductoInput`: `precio_2?: number | null` y `cantidad_minima_mayoreo?: number | null`.
  - En `validarProducto` (producto-repo.ts:27-46) agrega, con el mismo estilo de los errores existentes: precio_2 no puede ser negativo, precio_mayoreo no puede ser negativo, cantidad_minima_mayoreo no puede ser negativa ni cero (si viene, tiene que ser > 0). Los mensajes en espanol, orientados al dueno del negocio.
  - ARREGLA ESTE BUG, es parte de la tarea: producto-repo.ts:136 hace `input.precio_mayoreo ?? actual.precio_mayoreo`, asi que un precio ya cargado NO SE PUEDE BORRAR NUNCA - null jamas gana. Con tres niveles el defecto se triplica y el dueno no puede desactivar un nivel de un producto. Distingue 'el campo no vino en el input' (undefined -> conserva) de 'el campo vino explicitamente en null' (borra). Aplicalo a precio_mayoreo, precio_2 y cantidad_minima_mayoreo. Usa una funcion auxiliar local del estilo `function tomar<T>(entrada: T | null | undefined, actual: T | null): T | null { return entrada === undefined ? actual : entrada }` y comentala explicando por que existe.
  - NO cambies el comportamiento de `precio_venta`: sigue pasando por `calcularPrecioVenta` con `precioManual: input.precio_venta ?? null`. Hay un bug conocido ahi (si el input no trae precio_venta, el precio manual guardado se pisa con el derivado de costo+%, y la importacion masiva pasa por ese camino), pero arreglarlo cambia precios de catalogos ya cargados y necesita su propia tarea y su propia decision. Dejalo como esta y no construyas nada nuevo encima de el: precio_2 y precio_mayoreo se guardan tal cual, sin derivacion desde costo.
  - Deja `activo: input.activo === false ? 0 : 1` (producto-repo.ts:140) como esta: tambien es un bug conocido (reactiva cualquier producto en cada update) pero es de otra area; NO repliques ese patron en los campos nuevos.

PASO 2 - packages/core/src/repos/cliente-repo.ts.
  - Agrega a `ClienteInput`: `nivel_precio?: NivelPrecio` y `niveles_permitidos?: NivelPrecio[]` (en el input, el array tipado; la serializacion a JSON la hace el repo con `serializarNivelesPermitidos`, la UI nunca ve el JSON crudo).
  - En `validarCliente` (cliente-repo.ts:28-41) agrega, con el mismo estilo: el nivel tiene que ser uno conocido (usa `esNivelPrecio`), y - REGLA CLAVE - el `nivel_precio` por defecto TIENE que estar dentro de `niveles_permitidos`; si no, error de validacion con mensaje claro ('El nivel por defecto tiene que estar entre los niveles permitidos de este cliente'). Sin esta regla el dueno puede dejar un cliente con un default al que no tiene acceso y la resolucion lo va a degradar en silencio en cada venta.
  - Mismo arreglo del `?? actual.x`: cliente-repo.ts:90-108 tiene el mismo patron que impide volver a un valor vacio. Aplica el criterio undefined-vs-null a los campos nuevos.
  - Agrega un metodo `obtenerNivelesPermitidos(clienteId: string): Promise<NivelPrecio[]>` que lee el cliente y devuelve `parsearNivelesPermitidos(c.niveles_permitidos_json)`. Es el metodo que va a consumir el guardia de factura-repo (PRECIOS-04); tenerlo aqui evita que factura-repo parsee JSON a mano.
  - Registra la accion en bitacora cuando cambian los niveles permitidos de un cliente: usa `registrarAccion` de packages/core/src/repos/bitacora-repo.ts exactamente como ya lo llaman producto-repo.eliminar y los demas. Es un cambio de permiso: tiene que quedar rastro. `usuario_id` sigue llegando null (no hay sesion todavia), eso es esperado.

PATRON A IMITAR: la estructura entera de `crearProductoRepo` / `crearClienteRepo` - funcion fabrica `crearXxxRepo(db: SqlDriver)` que devuelve un objeto de metodos, validacion que junta ErrorValidacion[] y lanza `ValidacionError` (definido en producto-repo.ts:41-46 y reusado por cliente-repo). No inventes un canal de errores nuevo: ValidacionError ya se traduce solo en la UI.

TDD: escribe los tests primero, en rojo. Imita packages/core/test/repos.test.ts y packages/core/test/promocion.test.ts:7-11 para el arranque (driver node:sqlite en memoria + migrate() + crearXxxRepo).

QUE NO TOCAR: packages/core/src/repos/factura-repo.ts (es de PRECIOS-04). Ningun .tsx (la UI es de PRECIOS-05). packages/core/src/db/migrations.ts (el esquema ya esta). packages/core/src/dominio/* (ya esta). No toques la logica de credito del cliente (aplica_credito, limite_credito, saldo_credito). No toques `calcularPrecioVenta`.

Corre `pnpm -r test` y `pnpm -r build`.
```

#### Archivos a tocar

- `packages/core/src/repos/producto-repo.ts`
- `packages/core/src/repos/cliente-repo.ts`
- `packages/core/test/repos.test.ts`
- `packages/core/test/precios-catalogo.test.ts`

#### Criterios de aceptacion

- [ ] `productos.crear` con precio_2 y cantidad_minima_mayoreo persiste ambos valores y `obtener` los devuelve.
- [ ] `productos.actualizar(id, { precio_2: null })` DEJA precio_2 en null (el bug del `??` esta arreglado); `productos.actualizar(id, {})` conserva el precio_2 que ya tenia.
- [ ] `validarProducto` rechaza precio_2 negativo, precio_mayoreo negativo y cantidad_minima_mayoreo <= 0, devolviendo ErrorValidacion con el campo correcto.
- [ ] `clientes.crear` con nivel_precio 'mayoreo' y niveles_permitidos ['normal','mayoreo'] persiste y `obtenerNivelesPermitidos` devuelve esa lista.
- [ ] `clientes.crear` con nivel_precio 'mayoreo' y niveles_permitidos ['normal'] lanza ValidacionError con un mensaje legible para el dueno.
- [ ] Un cliente creado sin tocar nada de precios queda con nivel_precio='normal' y solo 'normal' permitido - ningun cliente existente cambia de comportamiento.
- [ ] Cambiar los niveles permitidos de un cliente deja un registro en bitacora_accion.
- [ ] La cadena visible de cada nivel NO aparece escrita a mano en estos dos archivos (viene de ETIQUETA_NIVEL_PRECIO).
- [ ] `pnpm -r test` y `pnpm -r build` en verde; ningun test existente cambia de resultado.

#### Pruebas a escribir primero (TDD)

- precios-catalogo.test.ts: 'crear producto guarda los tres precios y el umbral' - crear con precio_venta/precio_2/precio_mayoreo/cantidad_minima_mayoreo y leer de vuelta.
- precios-catalogo.test.ts: 'actualizar con precio_2 en null borra el precio' - crear con precio_2=80, actualizar con precio_2 null, esperar null (rojo hoy por el bug del `??`).
- precios-catalogo.test.ts: 'actualizar sin mencionar precio_2 conserva el valor' - actualizar solo la descripcion, esperar precio_2 intacto.
- precios-catalogo.test.ts: 'rechaza precio_2 negativo' - esperar ValidacionError con campo 'precio_2'.
- precios-catalogo.test.ts: 'rechaza cantidad minima de mayoreo en cero o negativa' - campo 'cantidad_minima_mayoreo'.
- precios-catalogo.test.ts: 'un producto sin precio_2 sigue funcionando igual que antes' - crear sin el campo, esperar null y ningun error.
- precios-catalogo.test.ts: 'crear cliente con niveles permitidos los persiste' - leer niveles_permitidos_json y pasarlo por parsearNivelesPermitidos.
- precios-catalogo.test.ts: 'rechaza un nivel por defecto fuera de los permitidos' - ValidacionError con mensaje en espanol.
- precios-catalogo.test.ts: 'rechaza un nivel inventado' - nivel_precio 'premium' forzado -> ValidacionError.
- precios-catalogo.test.ts: 'el cliente por defecto queda en normal con solo normal permitido' - crear con lo minimo (nombre) y verificar.
- precios-catalogo.test.ts: 'quitar un nivel permitido no deja un default huerfano' - cliente con normal+mayoreo y default mayoreo; actualizar permitidos a solo normal sin bajar el default -> ValidacionError; actualizando ambos a la vez -> pasa.
- precios-catalogo.test.ts: 'obtenerNivelesPermitidos tolera un JSON corrupto en base' - escribir basura con db.run directo y esperar solo 'normal' sin excepcion.
- precios-catalogo.test.ts: 'cambiar niveles permitidos deja rastro en bitacora' - contar filas de bitacora_accion antes y despues.

---

### PRECIOS-04 — factura-repo: guardia server-side del nivel, precio recalculado en el servidor, cambio de nivel in-place y repricing de los tres niveles

**Objetivo.** El precio de cada linea de un producto del catalogo lo decide el servidor con resolverPrecio, el nivel se persiste, un cliente no puede recibir un nivel que no tiene asignado aunque la UI lo pida, y cambiar de nivel ya no reordena el ticket ni borra la promocion.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto - cambia quien decide el precio de una venta (la UI deja de mandar y el servidor recalcula), toca el camino caliente de agregar lineas al ticket y la funcion que reprecia tickets abiertos; un error aqui cobra mal, y la frontera con las facturas cobradas y su NCF ya reportado no admite ni un desvio. | PRECIOS-01, PRECIOS-02, PRECIOS-03 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Es el caso de libro de 'y ademas la UI'. El brief esta partido en 'PARTE BACKEND (es la autoritativa, va primero)' y 'PARTE UI (conveniencia, nunca la autoridad)', y la parte de UI toca Ventas.tsx (el buscador de cliente con debounce, el badge de saldo) y ModalCobro.tsx despues de haber reescrito quien decide el precio de una venta en factura-repo. Son dos capas con dos criterios de verificacion distintos (vitest contra verificacion manual a tres anchos) en una tarea, y la de UI es justo la que se recorta cuando el agente se queda sin sesion.
>   **Arreglo.** Quedarse solo con la parte backend. El selector de nivel, el badge y el ModalCobro ya estan reclamados por PRECIOS-06 y por VENTAS-UNIFICADA: que vayan ahi y que PRECIOS-04 termine cuando el repo cobra el precio correcto con la UI fuera de la ecuacion.

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto, sin `any`, TODO en espanol). El repo usa comentarios en espanol explicando el POR QUE de cada decision: sigue esa convencion local. Rama `feature/precios-guardia-factura`, nunca master.

Ya existen (no los rehagas): las columnas factura_linea.nivel_precio y factura_linea.costo_unitario, ya en COLS_LINEA y en el INSERT con el contador corregido; en el dominio `resolverPrecio`, `NivelPrecio`, `esNivelPrecio` exportados desde '@sfr/core'; en cliente-repo el metodo `obtenerNivelesPermitidos(clienteId)`.

ESTA ES LA TAREA DEL GUARDIA. El requisito del cliente 'el acceso a cada precio lo asigna el dueno a cada cliente' no se cumple escondiendo un boton: hoy `agregarLinea` (packages/core/src/repos/factura-repo.ts:237-276) acepta CUALQUIER `precioUnitario` que le mande la UI, ya cocinado, sin verificar contra el producto ni contra el cliente. Si el permiso no vive aqui, no existe.

PASO 1 - `agregarLinea` deja de confiar en el precio de la UI.
  - En `AgregarLineaInput` (factura-repo.ts:46-56) reemplaza `esMayoreo?: boolean` por `nivel?: NivelPrecio`. Deja `precioUnitario` pero documenta que para productos del catalogo es IGNORADO (el servidor lo recalcula) y que solo manda para articulos sueltos (producto_id null, que no tienen nivel).
  - Cuando `input.producto_id != null`: lee el producto de la base (precio_venta, precio_2, precio_mayoreo, cantidad_minima_mayoreo, costo, tasa_impuesto, departamento_id), lee `cliente_id` de la factura, y si hay cliente pide sus niveles permitidos y su nivel por defecto. Resuelve la promocion vigente con la consulta de `promocionRepo.obtenerAplicable` (packages/core/src/repos/promocion-repo.ts:109-124); para no crear una dependencia circular entre repos, extrae esa consulta a una funcion suelta exportada del mismo archivo (patron ya usado: `registrarAccion` en bitacora-repo.ts y `prepararDevolucion` en devolucion-repo.ts son funciones sueltas que reciben `db`) y llamala desde factura-repo. NO cambies el criterio de la consulta (elige la MAS ESPECIFICA, no la mas barata): si el cliente termina pidiendo 'siempre el precio mas barato', eso es otra tarea y otra decision de negocio.
  - Llama `resolverPrecio` con todo eso y usa `precioFinal` como `precio_unitario`, `nivelAplicado` como `nivel_precio`, y guarda `costo_unitario` con el `producto.costo` del momento (congelado: es el unico momento en que ese dato existe).
  - Si `input.nivel` viene y NO esta en los niveles permitidos del cliente, lanza `ValidacionError` con un mensaje en espanol ('Este cliente no tiene acceso a ese precio'). No lo degrades en silencio en este caso: una peticion explicita a un nivel prohibido es un intento de saltarse el permiso y tiene que fallar fuerte. La degradacion silenciosa de resolverPrecio es para el camino implicito (sin cliente, o nivel por cantidad), no para este.
  - Escribe `es_mayoreo` como espejo derivado (1 solo si nivel_precio es 'mayoreo') para no romper nada que todavia lo lea, y marcalo en un comentario como deprecado.

PASO 2 - nuevo metodo `cambiarNivelLinea(lineaId: string, nivel: NivelPrecio): Promise<void>`.
  - UPDATE IN PLACE. No borres y recrees. Hoy la UI hace eso (Ventas.tsx:895-911: elimina la linea y crea una nueva) y como `obtenerLineas` ordena por created_at (factura-repo.ts:231), la linea SALTA AL FINAL DEL TICKET cada vez que el cajero corrige un nivel. Con tres niveles eso es reordenar el ticket constantemente delante del cliente.
  - Resuelve el precio nuevo con el MISMO resolverPrecio del paso 1 (promocion incluida). Este es el punto exacto del bug que vienes a matar: hoy alternarMayoreoLinea NO vuelve a consultar la promocion y agregarProducto si, asi que el mismo producto sale a dos precios distintos segun el camino. Una sola funcion, los dos caminos.
  - Aplica el mismo guardia de permiso del cliente. Recalcula monto_itbis y subtotal con `calcularLinea` y llama a `recalcularTotales(facturaId)` como hacen los demas metodos.

PASO 3 - `actualizarCantidadLinea` re-evalua el umbral. Si el producto tiene `cantidad_minima_mayoreo` y la cantidad nueva cruza el umbral, re-resuelve el precio. Para distinguir 'lo eligio el cajero' de 'lo puso el sistema' NO agregues otra columna: toma el camino conservador - re-evaluar el umbral SOLO hacia arriba (de normal a mayoreo cuando se alcanza la cantidad), nunca bajando de nivel a espaldas del cajero - y documenta la limitacion en un comentario. Nunca cambies el precio de una linea de forma que el cajero no pueda notar.

PASO 4 - `actualizarPrecioEnTicketsAbiertos` (factura-repo.ts:350-377) con tres niveles.
  - Extiende `SincronizarPrecioProductoInput` (factura-repo.ts:38-44) a los tres precios y al umbral.
  - Hoy la linea 366 hace `l.es_mayoreo ? input.precioMayoreo : input.precioVenta`: una linea en precio_2 caeria al ELSE y se repreciaria al precio normal - el dueno corrige un producto y le cambia el precio a un ticket abierto a un nivel que no toco. Mapea por `nivel_precio` usando resolverPrecio.
  - Hoy tambien IGNORA la promocion al repreciar, asi que corregir un producto BORRA el descuento promocional de los tickets abiertos. Al pasar por resolverPrecio esto se arregla solo; asegurate de que asi sea y cubrelo con un test.
  - Regla intacta: las facturas con estado 'cobrada' NUNCA se tocan. Son registros contables cerrados y algunas ya tienen un NCF reportado a DGII por ese monto exacto. El WHERE de estado='abierta' se queda.

PATRON A IMITAR: el resto de `crearFacturaRepo`, sobre todo `verificarDisponibilidad` (factura-repo.ts:~95) como ejemplo de guardia interno que consulta la base antes de dejar pasar una operacion, y `prepararDevolucion` en packages/core/src/repos/devolucion-repo.ts como ejemplo de funcion suelta que recibe `db`.

TDD: tests primero, en rojo. Imita packages/core/test/factura-repo.test.ts y el arranque de packages/core/test/promocion.test.ts:7-11 (driver node:sqlite en memoria + migrate() + crearXxxRepo).

QUE NO TOCAR: ningun .tsx (la UI es de PRECIOS-06; esta tarea deja la UI compilando porque `nivel` es opcional y el default es 'normal'). No toques `calcularLinea`, `calcularTotales` ni `procesarCobro` de packages/core/src/dominio/factura.ts. No toques la logica fiscal ni comprobante-fiscal-repo. No cambies el criterio de promocion-repo.obtenerAplicable (solo extrae la funcion). No borres es_mayoreo. No inventes ningun chequeo de usuario/PIN/sesion: no hay login en este producto todavia y el permiso que toca implementar aqui es el del CLIENTE, no el del cajero.

Corre `pnpm -r test` y `pnpm -r build`.
```

#### Archivos a tocar

- `packages/core/src/repos/factura-repo.ts`
- `packages/core/src/repos/promocion-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/test/factura-repo.test.ts`
- `packages/core/test/precios-factura.test.ts`

#### Criterios de aceptacion

- [ ] `agregarLinea` con producto_id ignora el precioUnitario que manda la UI y persiste el precio que devuelve resolverPrecio.
- [ ] `agregarLinea` con un nivel que el cliente de la factura no tiene permitido lanza ValidacionError y NO escribe ninguna linea.
- [ ] La linea persiste nivel_precio y costo_unitario; es_mayoreo queda como espejo coherente (1 solo si nivel_precio es 'mayoreo').
- [ ] `cambiarNivelLinea` hace UPDATE sin cambiar el id ni el created_at: la linea conserva su posicion en el ticket.
- [ ] Agregar un producto directamente en mayoreo y agregarlo en normal y luego cambiarlo a mayoreo producen EXACTAMENTE el mismo precio_unitario, con y sin promocion vigente (es el bug de Ventas.tsx:881, cerrado del lado de los datos).
- [ ] `actualizarPrecioEnTicketsAbiertos` reprecia una linea en precio_2 con el precio_2 nuevo, no con el normal.
- [ ] `actualizarPrecioEnTicketsAbiertos` conserva el descuento promocional en vez de pisarlo.
- [ ] Ninguna factura con estado 'cobrada' cambia de monto tras ninguna de estas operaciones.
- [ ] Los articulos sueltos (producto_id null) siguen aceptando el precioUnitario de la UI y quedan en nivel 'normal'.
- [ ] Un ticket sin cliente asignado (la mayoria de las ventas de mostrador) sigue funcionando y permite cualquier nivel.
- [ ] `pnpm -r test` y `pnpm -r build` en verde, incluida toda la suite existente de factura-repo, devolucion y fiscal.

#### Pruebas a escribir primero (TDD)

- precios-factura.test.ts: 'el servidor ignora el precio que manda la UI' - agregarLinea con precioUnitario 1 sobre un producto de 100 -> la linea queda en 100.
- precios-factura.test.ts: 'un cliente sin acceso a mayoreo no puede recibir mayoreo' - cliente con solo normal permitido, agregarLinea con nivel 'mayoreo' -> ValidacionError y cero lineas en la factura.
- precios-factura.test.ts: 'un cliente con mayoreo permitido recibe el precio de mayoreo'.
- precios-factura.test.ts: 'sin cliente en el ticket se permite cualquier nivel' - factura sin cliente_id, nivel 'precio_2' -> pasa.
- precios-factura.test.ts: 'la linea guarda el nivel usado y el costo congelado' - verificar nivel_precio y costo_unitario; luego cambiar producto.costo y verificar que costo_unitario NO cambia.
- precios-factura.test.ts: 'es_mayoreo queda como espejo de nivel_precio' - los tres niveles.
- precios-factura.test.ts: 'los dos caminos dan el mismo precio (sin promocion)' - camino A: agregar con nivel 'mayoreo'. Camino B: agregar con 'normal' y cambiarNivelLinea a 'mayoreo'. Mismo precio_unitario.
- precios-factura.test.ts: 'los dos caminos dan el mismo precio (CON promocion vigente)' - el mismo caso con una promocion activa sobre el producto. Este es el test que fija el bug de dinero que hay hoy en produccion.
- precios-factura.test.ts: 'cambiar de nivel no mueve la linea de lugar' - tres lineas, cambiar el nivel de la del medio, verificar que obtenerLineas devuelve el mismo orden y el mismo id.
- precios-factura.test.ts: 'cambiar de nivel recalcula itbis, subtotal y los totales de la factura'.
- precios-factura.test.ts: 'el umbral de cantidad sube el nivel al aumentar la cantidad' - producto con cantidad_minima_mayoreo 12, agregar 10, actualizarCantidadLinea a 12 -> la linea pasa a mayoreo si el cliente lo tiene permitido.
- precios-factura.test.ts: 'el umbral no aplica si el cliente no tiene mayoreo permitido' - misma cantidad, cliente con solo normal -> sigue en normal, sin lanzar.
- precios-factura.test.ts: 'repricing de ticket abierto mapea por nivel, no por booleano' - linea en precio_2, actualizarPrecioEnTicketsAbiertos con los tres precios nuevos -> la linea toma el precio_2 nuevo.
- precios-factura.test.ts: 'repricing de ticket abierto conserva la promocion' - linea con promo aplicada, repricing, la promo sigue reflejada.
- precios-factura.test.ts: 'repricing no toca facturas cobradas' - snapshot de los montos de una factura cobrada antes y despues.
- precios-factura.test.ts: 'un articulo suelto respeta el precioUnitario de la UI y queda en normal'.
- factura-repo.test.ts (existente): toda la suite sigue verde sin cambiar ningun valor esperado.

---

### PRECIOS-05 — UI del catalogo: precio 2 y umbral en FormularioProducto, niveles permitidos en la ficha de Cliente, importacion y exportacion CSV

**Objetivo.** El dueno puede cargar los tres precios y el umbral de un producto, importarlos y exportarlos por CSV, y asignar a cada cliente su nivel por defecto y los niveles a los que tiene acceso.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio - la trampa de diferenciasProducto hace que un campo nuevo se vea y no se guarde sin lanzar ningun error, y el orden de PISTAS en mapeo.ts puede desviar en silencio una columna de precio 2 hacia el precio de venta de todo un catalogo importado. | PRECIOS-03 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto, sin `any`, TODO en espanol incluidos los textos de la UI). El repo usa comentarios en espanol explicando el POR QUE: sigue esa convencion local. Estilos: NO hay CSS modules ni Tailwind, todo es estilo inline via packages/ui/src/estilos.ts. Iconos: lucide-react, NUNCA emojis como iconos. Mobile-first: el layout chico primero y se escala con min-width (hay un hook `useBreakpoint` en packages/ui/src/hooks/). Rama `feature/precios-ui-catalogo`, nunca master.

Ya existen (no los rehagas): ProductoInput acepta `precio_2` y `cantidad_minima_mayoreo`; ClienteInput acepta `nivel_precio` y `niveles_permitidos` (array tipado); desde '@sfr/core' se importan `NivelPrecio`, `NIVELES_PRECIO`, `ETIQUETA_NIVEL_PRECIO`, `parsearNivelesPermitidos`. Los repos ya validan todo del lado de los datos: tu trabajo es la superficie, no la regla.

PASO 0 - DISENO ANTES DE DIBUJAR. La regla del proyecto exige el documento de diseno antes de escribir UI. En la raiz del repo existe `design-guidelines.md` (no hay DESIGN.md). Agrega ahi una seccion 'Niveles de precio' ANTES de tocar ningun .tsx: como se ven los tres niveles (chip/pastilla con la etiqueta de ETIQUETA_NIVEL_PRECIO), que token de color toma cada uno reusando los que ya estan en el documento (no inventes colores nuevos), como se ve un nivel no disponible para el cliente (deshabilitado, no oculto: el dueno tiene que entender por que no puede), y el comportamiento a 375px. Area tactil minima 44px. Sin interacciones solo-hover.

PASO 1 - packages/ui/src/componentes/FormularioProducto.tsx.
  - Copia el bloque del campo 'Precio mayoreo' (FormularioProducto.tsx:172-187) para 'Precio 2' y para 'Cantidad minima para mayoreo'. Usa las etiquetas de ETIQUETA_NIVEL_PRECIO, no cadenas a mano.
  - TRAMPA QUE TE VA A MORDER: tienes que agregar las filas nuevas a `diferenciasProducto` (FormularioProducto.tsx:35-61, el diff previo a guardar). Si no lo haces, al tocar SOLO el precio 2 el modal de confirmacion dira 'nada cambio' y `Productos.guardar()` cerrara el formulario SIN GUARDAR, porque Productos.tsx:155-162 retorna cuando cambios.length===0. El campo se veria, el dato se perderia, y no habria ningun error.
  - Este formulario lo usan Productos.tsx Y el 'Modificar' de dentro de Ventas: arreglando aqui, se arregla en los dos.
  - Deja claro en la UI que un precio vacio significa 'este producto no tiene ese nivel' y que el sistema caera al precio normal avisando. Ese texto es la unica forma que tiene el dueno de entender la regla.

PASO 2 - importacion y exportacion CSV. Es el camino real por el que estos negocios cargan su catalogo.
  - packages/ui/src/importacion/mapeo.ts: agrega 'precio_2' a `CampoDestino`, su entrada en `ETIQUETA_CAMPO` (reusando ETIQUETA_NIVEL_PRECIO) y sus pistas en `PISTAS`, p.ej. precio2, pvp2, preciob, segundo, precioespecial. OJO con el orden: `precio_venta` tiene la pista generica 'precio' y el bucle de `adivinarMapeo` toma el PRIMER campo que matchea recorriendo `Object.entries(PISTAS)` en orden de declaracion, asi que 'precio_2' tiene que declararse ANTES de 'precio_venta' o una columna 'Precio 2' se va a auto-mapear a precio de venta. Cubrelo con un test.
  - packages/ui/src/componentes/ImportarProductos.tsx:137-146: agrega precio_2 al ProductoInput que se arma (y cantidad_minima_mayoreo si decides exponerla; si no, dejala fuera y documentalo).
  - packages/ui/src/pantallas/Productos.tsx:228-241 (exportacion CSV): agrega la columna 'Precio 2' en el MISMO orden en que quedo en mapeo.ts, para que el viaje de ida y vuelta exportar -> importar siga cerrando.

PASO 3 - packages/ui/src/pantallas/Clientes.tsx:192-235. Agrega el control de asignacion: un select para el nivel por defecto y tres casillas para los niveles permitidos. El patron de checkbox + select ya existe en ese mismo formulario (aplica_credito, documento_tipo): copialo, no inventes un control nuevo. Regla de UI que ya valida el repo y que debes reflejar: el nivel por defecto tiene que estar entre los permitidos - al destildar el nivel que esta puesto como default, bajalo a 'normal' automaticamente y avisalo. 'normal' siempre queda permitido y su casilla va deshabilitada. Si el repo lanza ValidacionError, muestralo con el mismo manejo de errores que ya usa esa pantalla.

QUE NO TOCAR: nada de packages/core (los repos y el dominio ya estan y ya validan). packages/ui/src/pantallas/Ventas.tsx (es de PRECIOS-06, y es el archivo mas delicado del repo). packages/ui/src/AppShell.tsx ni la constante MODULOS. packages/ui/src/data/contexto.tsx - TRAMPA: crea un objeto nuevo en cada render, asi que no agregues ningun useEffect que dependa de `repos`. No toques la logica de credito del cliente. No inventes nombres para los niveles: si no te gusta 'Precio 2', el cambio va en ETIQUETA_NIVEL_PRECIO de core, en una sola linea, y es una decision del cliente que todavia no esta tomada.

Verifica a 375px, 768px y 1440px. Corre `pnpm -r test` y `pnpm -r build`.
```

#### Archivos a tocar

- `design-guidelines.md`
- `packages/ui/src/componentes/FormularioProducto.tsx`
- `packages/ui/src/componentes/ImportarProductos.tsx`
- `packages/ui/src/importacion/mapeo.ts`
- `packages/ui/src/pantallas/Productos.tsx`
- `packages/ui/src/pantallas/Clientes.tsx`
- `packages/ui/test/mapeo.test.ts`

#### Criterios de aceptacion

- [ ] design-guidelines.md tiene la seccion 'Niveles de precio' y se escribio ANTES de tocar cualquier .tsx.
- [ ] Editar SOLO el precio 2 de un producto produce una fila en el modal de confirmacion de cambios y el valor se guarda (la trampa de diferenciasProducto esta cubierta).
- [ ] El mismo formulario funciona desde Productos y desde el 'Modificar' de Ventas.
- [ ] Una columna llamada 'Precio 2' / 'PVP2' / 'Precio especial' se auto-mapea a precio_2 y NO a precio_venta.
- [ ] Exportar el catalogo a CSV y volver a importarlo conserva los tres precios (round-trip cerrado).
- [ ] En la ficha del cliente se puede marcar los niveles permitidos y elegir el default; destildar el nivel que era default lo baja a 'normal' con aviso visible.
- [ ] La casilla de 'normal' esta siempre marcada y deshabilitada.
- [ ] Ninguna cadena visible de un nivel esta escrita a mano en ningun .tsx: todas salen de ETIQUETA_NIVEL_PRECIO.
- [ ] Sin emojis como iconos; los iconos nuevos son de lucide-react; toda area tactil llega a 44px.
- [ ] Se ve correcto a 375px, 768px y 1440px.
- [ ] `pnpm -r test` y `pnpm -r build` en verde.

#### Pruebas a escribir primero (TDD)

- mapeo.test.ts: 'adivinarMapeo asigna una columna Precio 2 a precio_2 y no a precio_venta' - encabezados Descripcion, Precio, Precio 2 -> Precio a precio_venta y Precio 2 a precio_2.
- mapeo.test.ts: 'reconoce las variantes abreviadas' - 'P. Venta 2', 'PVP2', 'Precio B', 'Precio especial'.
- mapeo.test.ts: 'una planilla vieja sin precio 2 sigue mapeando igual que antes' - el mapeo de un CSV con las columnas de hoy no cambia en ningun campo.
- mapeo.test.ts: 'mayoreo sigue mapeando a precio_mayoreo aunque exista precio_2'.
- Prueba de la funcion pura de exportacion CSV de Productos.tsx (extraela a un modulo testeable si todavia esta inline): 'las columnas exportadas coinciden en nombre y orden con las que reconoce adivinarMapeo' - este test es el que garantiza el round-trip.
- Prueba de `diferenciasProducto` (packages/ui/src/componentes/FormularioProducto.tsx, exportala si no lo esta): 'cambiar solo precio_2 devuelve una diferencia' (rojo hoy) y 'cambiar solo cantidad_minima_mayoreo devuelve una diferencia'.
- Prueba de `diferenciasProducto`: 'borrar el precio 2 (de un valor a vacio) cuenta como cambio' - que el null llegue al repo, que ya sabe borrarlo.
- Prueba del formulario de Clientes: 'destildar el nivel que era default lo baja a normal' y 'la casilla normal no se puede destildar'.

---

### PRECIOS-06 — UI de Ventas: selector de nivel por linea, chip de nivel del ticket, fusion por nivel y consulta de precio con los tres niveles

**Objetivo.** El cajero ve que nivel tiene cada linea, puede cambiarlo cuando el cliente lo permite, y la pantalla deja de decidir precios: solo los muestra.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto - Ventas.tsx es la pantalla critica del producto y el archivo mas enredado del repo (estado de React, undo/redo, atajos, fusion de lineas, foco del teclado); ademas es donde vive el bug de precios que ya esta en produccion, asi que un cambio a medias lo empeora en vez de cerrarlo. | PRECIOS-04, PRECIOS-05 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto, sin `any`, TODO en espanol incluidos los textos de la UI). El repo usa comentarios en espanol explicando el POR QUE: sigue esa convencion local. Estilos inline via packages/ui/src/estilos.ts (no hay CSS modules ni Tailwind). Iconos lucide-react, NUNCA emojis como iconos. Mobile-first. Rama `feature/precios-ui-ventas`, nunca master.

Este es el archivo mas delicado del repo: packages/ui/src/pantallas/Ventas.tsx. Lee la pantalla entera antes de tocar nada.

Ya existen (no los rehagas): en core, `resolverPrecio`, `NivelPrecio`, `NIVELES_PRECIO`, `ETIQUETA_NIVEL_PRECIO`; en factura-repo, `agregarLinea` con parametro `nivel` que RECALCULA el precio en el servidor y VALIDA el permiso del cliente, y `cambiarNivelLinea(lineaId, nivel)` que hace UPDATE in-place. La regla de negocio y el permiso ya viven del lado de los datos. Tu trabajo aqui es que la pantalla deje de decidir y pase a mostrar.

PASO 1 - borra la decision de precio de la UI.
  - `precioBase(p)` en Ventas.tsx:544-549 es `return esMayoreo && p.precio_mayoreo ? p.precio_mayoreo : p.precio_venta`. Esa es la regla de negocio viviendo en un ternario de React, y esta DUPLICADA MAL en Ventas.tsx:881. Reemplaza el cuerpo por una llamada a `resolverPrecio` de '@sfr/core', usada SOLO para previsualizar (mostrar el precio antes de confirmar y el cartel de promocion). El precio que de verdad se cobra lo pone el servidor.
  - En `agregarProducto` (Ventas.tsx:491-540), deja de mandar un precio cocinado: manda `nivel`. Puedes seguir llamando a `promocionRepo.obtenerAplicable` para el cartel de promocion aplicada, pero ese valor es informativo.
  - Borra `alternarMayoreoLinea` (Ventas.tsx:874-916) y reemplazala por una llamada a `repo.cambiarNivelLinea`. Con eso desaparecen dos bugs de golpe: la linea ya no se borra y se recrea (hoy cambia de id y SALTA AL FINAL del ticket porque obtenerLineas ordena por created_at), y la promocion ya no se pierde al cambiar de nivel.

PASO 2 - la fusion de lineas se llavea por NIVEL, no por precio.
  - Ventas.tsx:504-506 compara floats por igualdad: `l.es_mayoreo === (esMayoreo?1:0) && l.precio_unitario === precio`. Con tres niveles, dos niveles pueden tener el MISMO precio numerico y se fusionarian lineas de nivel distinto, perdiendo justo el dato que el cliente pidio guardar. Cambia la clave de fusion a producto_id igual Y nivel_precio igual. Nunca compares precios float por igualdad.

PASO 3 - el control. Tres estados no caben en un toggle.
  - Hoy hay un boton binario aria-pressed (Ventas.tsx:1428-1448), un chip global binario en la barra (Ventas.tsx:1236-1243) y F8 sobrecargado con DOS significados segun haya o no linea resaltada (Ventas.tsx:196).
  - TRAMPA CONFIRMADA: NO planifiques 'Shift+F8 retrocede'. packages/ui/src/hooks/useAtajosTeclado.ts:19-27 solo agrega 'Shift' al nombre de la combinacion si la tecla es una LETRA, asi que 'Shift+F8' se normaliza a 'F8' y colisiona con el atajo simple. NO modifiques ese hook: lo usan las nueve pantallas.
  - Diseno: F8 CICLA hacia adelante entre los niveles PERMITIDOS (si solo hay uno permitido, F8 no hace nada y lo dice). Ademas, un control visible con clic o toque (un menu chico o tres pastillas) para el cajero que no usa teclado, con area tactil de 44px. Cada linea del ticket muestra su nivel como una pastilla con la etiqueta de ETIQUETA_NIVEL_PRECIO. El chip global de la barra pasa de binario a mostrar el nivel del ticket (el del cliente asignado, o 'normal' si no hay cliente).
  - Antes de dibujar, agrega o actualiza la seccion 'Niveles de precio' de `design-guidelines.md` en la raiz con el comportamiento del control en Ventas a 375px (la regla del proyecto pide el documento de diseno antes de la UI).

PASO 4 - feedback honesto. resolverPrecio devuelve `motivo`. Cuando cae a 'sin_precio_en_nivel' (el producto no tiene ese precio cargado), la pantalla lo DICE - 'Este producto no tiene precio 2: se aplica el precio normal'. Cuando el servidor rechaza el nivel por permiso del cliente, muestra el ValidacionError con el mismo manejo que ya tiene la pantalla. Nunca dejes que el cajero crea que cobro un nivel que no cobro.

PASO 5 - mostrar los tres precios. La consulta de precio F9 (Ventas.tsx:1320) y los resultados de busqueda (Ventas.tsx:1894-1896) muestran hoy precio_venta y 'Mayoreo: ...'. Muestra los tres, marcando cual corresponde al cliente del ticket y cual no esta cargado.

PASO 6 - deshacer/rehacer. Las acciones de ticket (`AccionLinea`, `registrarAccionTicket`) hoy registran crear/eliminar/cantidad/mayoreo. Como el cambio de nivel pasa a ser UPDATE in-place y ya no es borrar+crear, la accion 'mayoreo' tiene que convertirse en una accion de nivel con el nivel anterior y el nuevo. Verifica que Ctrl+Z y Ctrl+Y siguen funcionando en los tres niveles.

PERMISO DE USUARIO - LEE ESTO: el cliente pidio 'cambiar de nivel en la linea, CON PERMISO'. El permiso que SI existe y es real es el del cliente de la factura, verificado en factura-repo. NO inventes un PIN del dueno, ni un modal de autorizacion, ni un usuario activo: no hay login, ni sesion, ni usuario en este producto (usuario_id siempre llega null). Un PIN comparado del lado del cliente contra un hash que la propia app tiene en mano no es un permiso, es un cartel, y se llevaria por delante el diseno del modulo de usuarios cuando llegue. Esa puerta se engancha despues, en el area RBAC, en el mismo punto unico de factura-repo.

QUE NO TOCAR: nada de packages/core. packages/ui/src/hooks/useAtajosTeclado.ts (lo usan las nueve pantallas). packages/ui/src/data/contexto.tsx - TRAMPA: crea un objeto nuevo en cada render y Ventas ya mete `productos` en las dependencias de un useEffect (Ventas.tsx:480); funciona de casualidad, asi que NO agregues ningun useEffect nuevo que dependa de `repos`. El flujo de cobro (F12), la impresion, la cotizacion (F5) y el ticket suelto (F7). Los atajos que ya existen, salvo el significado de F8.

Verifica a 375px, 768px y 1440px. Corre `pnpm -r test` y `pnpm -r build`.
```

#### Archivos a tocar

- `packages/ui/src/pantallas/Ventas.tsx`
- `packages/ui/src/estilos.ts`
- `design-guidelines.md`
- `packages/ui/test/ventas-nivel.test.ts`

#### Criterios de aceptacion

- [ ] No queda ninguna expresion en packages/ui que elija un precio entre precio_venta / precio_2 / precio_mayoreo: el unico camino es resolverPrecio para previsualizar y el servidor para cobrar.
- [ ] `alternarMayoreoLinea` ya no existe; cambiar de nivel llama a repo.cambiarNivelLinea.
- [ ] Cambiar el nivel de una linea del medio del ticket NO la mueve de lugar.
- [ ] Agregar un producto directamente en un nivel y agregarlo en normal y luego cambiarlo al mismo nivel muestran el MISMO precio en pantalla, con promocion vigente.
- [ ] La fusion de lineas se decide por producto_id + nivel_precio; no queda ninguna comparacion de floats por igualdad.
- [ ] F8 cicla entre los niveles permitidos; no se uso Shift+F-key en ningun atajo nuevo; useAtajosTeclado.ts no se modifico.
- [ ] Cada linea del ticket muestra su nivel con la etiqueta de ETIQUETA_NIVEL_PRECIO; el chip de la barra muestra el nivel del ticket y ya no es binario.
- [ ] Cuando el producto no tiene cargado el nivel pedido, la pantalla lo dice explicitamente en vez de cobrar otro precio en silencio.
- [ ] Un ValidacionError del servidor por nivel no permitido se muestra al cajero con el mensaje del repo.
- [ ] La consulta F9 y los resultados de busqueda muestran los tres precios e indican cual corresponde al cliente del ticket.
- [ ] Ctrl+Z y Ctrl+Y deshacen y rehacen un cambio de nivel entre cualesquiera de los tres niveles.
- [ ] No se agrego ningun useEffect que dependa de `repos`.
- [ ] Sin emojis como iconos; areas tactiles de 44px; correcto a 375px, 768px y 1440px.
- [ ] `pnpm -r test` y `pnpm -r build` en verde.

#### Pruebas a escribir primero (TDD)

- ventas-nivel.test.ts: 'la clave de fusion incluye el nivel' - dos lineas del mismo producto con el MISMO precio numerico pero distinto nivel NO se fusionan (extrae la funcion de fusion a un helper puro y testeala).
- ventas-nivel.test.ts: 'dos lineas del mismo producto y el mismo nivel si se fusionan'.
- ventas-nivel.test.ts: 'la fusion no compara precios float por igualdad' - dos lineas del mismo producto y nivel con precios que difieren por redondeo siguen fusionando.
- ventas-nivel.test.ts: 'el ciclo de F8 recorre solo los niveles permitidos' - helper puro siguienteNivel(actual, permitidos): con normal+mayoreo va normal->mayoreo->normal, saltando precio_2.
- ventas-nivel.test.ts: 'con un solo nivel permitido el ciclo devuelve el mismo nivel' - y la UI no dispara ninguna escritura.
- ventas-nivel.test.ts: 'el mapeo de motivo a mensaje cubre sin_precio_en_nivel' - helper puro que traduce MotivoNivel a un texto para el cajero; verificar que el mensaje nombra el nivel con ETIQUETA_NIVEL_PRECIO.
- ventas-nivel.test.ts: 'deshacer un cambio de nivel restaura el nivel anterior' - sobre el reductor/helper de AccionLinea, sin montar la pantalla: aplicar y revertir para cada par de niveles.
- ventas-nivel.test.ts: 'ninguna cadena de nivel esta escrita a mano' - test de guardia que busca en el fuente de Ventas.tsx los textos 'Mayoreo' y 'Precio 2' fuera del import de ETIQUETA_NIVEL_PRECIO.
- Prueba manual documentada en el reporte de la tarea: agregar en normal, cambiar a mayoreo con promocion vigente, comprobar que el precio coincide con agregar directo en mayoreo y que la linea no cambio de posicion.

---

### PRECIOS-07 — Propagacion: nivel en cotizaciones y devoluciones, reporte de margen por nivel y espejo del esquema en Postgres

**Objetivo.** Una cotizacion y una devolucion conservan el nivel con que se hizo el precio, el dueno puede ver su margen separado por nivel, y el esquema espejo de Postgres no arranca la Fase 2 desincronizado.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio - el reporte de margen puede presentar como exacto un numero estimado con el costo actual del producto si se omite el COALESCE y el contador de lineas estimadas, y una devolucion que recalculara precio en vez de copiarlo alteraria montos de ventas contablemente cerradas. | PRECIOS-01, PRECIOS-04 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (TypeScript estricto, sin `any`, TODO en espanol: nombres de tipos, columnas SQL y textos). El repo usa comentarios en espanol explicando el POR QUE: sigue esa convencion local. Rama `feature/precios-propagacion-reportes`, nunca master.

Ya existen (no los rehagas): cotizacion_linea.nivel_precio, devolucion_linea.nivel_precio, factura_linea.nivel_precio y factura_linea.costo_unitario, todas ya en las constantes COLS y con los contadores de '?' corregidos; en el dominio `NivelPrecio`, `NIVELES_PRECIO`, `ETIQUETA_NIVEL_PRECIO`, `resolverPrecio`; en factura-repo el guardia server-side del nivel.

PASO 1 - packages/core/src/repos/cotizacion-repo.ts. Hoy una cotizacion a precio mayoreo se guarda como un precio suelto sin explicacion: al reimprimirla o convertirla en factura nadie puede reconstruir por que ese precio. Agrega `nivel?: NivelPrecio` al input de linea, resuelve el precio con `resolverPrecio` igual que hace factura-repo (mismo guardia contra los niveles permitidos del cliente de la cotizacion: una cotizacion es una oferta de precio, el permiso aplica igual), persiste `nivel_precio`. Al CONVERTIR una cotizacion en factura, el nivel de cada linea tiene que viajar: busca el metodo de conversion en ese archivo y pasale el nivel a `agregarLinea`.

PASO 2 - packages/core/src/repos/devolucion-repo.ts. `prepararDevolucion` ya copia `precio_unitario` desde factura_linea; agrega `nivel_precio` a `LineaPreparada` y al INSERT de devolucion_linea, copiandolo de la linea original. La devolucion NO resuelve precio: devuelve exactamente lo que se cobro. NO llames a resolverPrecio aqui - si el dueno cambio el precio del producto despues de la venta, la devolucion tiene que devolver lo cobrado, no lo que costaria hoy. Escribe esa razon en un comentario. Y no toques la validacion de cantidad disponible ni la de factura cobrada.

PASO 3 - packages/core/src/repos/reportes-repo.ts. Agrega `margenPorNivel(desde, hasta)` imitando la forma de `resumenGanancia` (reportes-repo.ts:76-109) y de las demas consultas del archivo: devuelve, por cada nivel, ingresos, costo y margen, mas el conteo de lineas. CLAVE: usa `COALESCE(fl.costo_unitario, p.costo)` para el costo, no `p.costo` a secas. Las lineas nuevas traen el costo congelado al vender; las historicas no lo tienen y caen al costo actual del producto. Devuelve tambien un indicador por nivel de cuantas lineas usaron el costo estimado, para que el reporte no presente como exacto algo que no lo es. Agrupa por `fl.nivel_precio` y respeta los filtros que ya usan todas las consultas del archivo: estado 'cobrada', deleted_at nulo en factura y linea, y el rango de fechas con `date()`. Las lineas de articulos sueltos (producto_id null) no tienen costo: cuentalas aparte como ya hace `ingresosSinCosto`, no las metas dentro de un nivel con costo cero.

PASO 4 - packages/api/db/schema.sql. Es la traduccion a Postgres del esquema y hoy no corre nada de eso, pero si se deja atras la Fase 2 arranca con divergencia silenciosa. Refleja las columnas de las migraciones 11..19 (schema.sql:74 es donde esta precio_mayoreo, schema.sql:137 donde esta es_mayoreo). Usa los tipos de Postgres que ya usa ese archivo, no los de SQLite. Deja `es_mayoreo` con un comentario de deprecado, igual que en SQLite. Revisa tambien packages/api/sync-rules.yaml por si nombra columnas de estas tablas. NO actives nada de packages/api, no conectes Supabase, no toques auth.ts ni el endpoint /fiscal/transmitir que devuelve 501: ese paquete es un scaffold inactivo y sigue asi.

PASO 5 - si la pantalla de Reportes (packages/ui/src/pantallas/Reportes.tsx, tabular) ya expone los demas resumenes, agrega el margen por nivel con la MISMA forma de tabla que los que ya estan. No introduzcas graficas: la pantalla es tabular a proposito y meter una libreria de charts es otra decision.

TDD: tests primero, en rojo. Imita packages/core/test/reportes-repo.test.ts y packages/core/test/devolucion.test.ts.

QUE NO TOCAR: packages/core/src/db/migrations.ts (el esquema ya esta; si te falta una columna, es senal de que PRECIOS-01 no termino, no de que tengas que agregar una migracion 20). packages/core/src/dominio/*. packages/ui/src/pantallas/Ventas.tsx. La logica fiscal, comprobante-fiscal-repo ni secuencia-ncf-repo. No cambies ninguna consulta existente de reportes-repo: solo agregas una.

Corre `pnpm -r test` y `pnpm -r build`.
```

#### Archivos a tocar

- `packages/core/src/repos/cotizacion-repo.ts`
- `packages/core/src/repos/devolucion-repo.ts`
- `packages/core/src/repos/reportes-repo.ts`
- `packages/api/db/schema.sql`
- `packages/ui/src/pantallas/Reportes.tsx`
- `packages/core/test/precios-reportes.test.ts`
- `packages/core/test/devolucion.test.ts`

#### Criterios de aceptacion

- [ ] Una cotizacion creada con nivel 'mayoreo' persiste nivel_precio='mayoreo' en cada linea y su precio sale de resolverPrecio, no del input de la UI.
- [ ] Convertir una cotizacion en factura conserva el nivel de cada linea.
- [ ] Una cotizacion a un cliente sin ese nivel permitido es rechazada con ValidacionError, igual que una factura.
- [ ] Una devolucion copia nivel_precio y precio_unitario de la linea original y NO los recalcula, aunque el precio del producto haya cambiado despues.
- [ ] `margenPorNivel` devuelve una fila por nivel con ingresos, costo, margen y conteo de lineas, y usa COALESCE(fl.costo_unitario, p.costo).
- [ ] `margenPorNivel` informa cuantas lineas de cada nivel usaron costo estimado en vez de costo congelado.
- [ ] Las lineas de articulos sueltos no se cuentan dentro de ningun nivel con costo cero.
- [ ] Ninguna consulta existente de reportes-repo cambio de resultado.
- [ ] packages/api/db/schema.sql refleja las nueve columnas nuevas con tipos de Postgres y es_mayoreo queda marcada como deprecada; nada de packages/api se activo.
- [ ] `pnpm -r test` y `pnpm -r build` en verde.

#### Pruebas a escribir primero (TDD)

- precios-reportes.test.ts: 'la cotizacion guarda el nivel de cada linea' - crear con nivel 'precio_2' y leer de vuelta.
- precios-reportes.test.ts: 'la cotizacion respeta los niveles permitidos del cliente' - cliente con solo normal, cotizar en 'mayoreo' -> ValidacionError.
- precios-reportes.test.ts: 'convertir una cotizacion en factura conserva el nivel'.
- devolucion.test.ts: 'la devolucion copia el nivel de la linea original' - factura en 'mayoreo', devolver, verificar devolucion_linea.nivel_precio='mayoreo'.
- devolucion.test.ts: 'la devolucion NO recalcula el precio aunque el producto haya cambiado' - vender a 100, subir precio_venta a 150, devolver, esperar 100.
- devolucion.test.ts (existente): toda la suite sigue verde sin cambiar valores esperados.
- precios-reportes.test.ts: 'margenPorNivel separa los tres niveles' - armar ventas cobradas en normal, precio_2 y mayoreo y verificar ingresos y margen por fila.
- precios-reportes.test.ts: 'margenPorNivel usa el costo congelado cuando existe' - vender con costo 40, cambiar producto.costo a 90, esperar que el margen use 40.
- precios-reportes.test.ts: 'margenPorNivel cae al costo actual en lineas historicas sin costo congelado' - insertar a mano una linea con costo_unitario NULL y verificar que usa p.costo y que el contador de lineas estimadas es 1.
- precios-reportes.test.ts: 'los articulos sueltos no contaminan ningun nivel' - una venta con producto_id null no aparece con costo 0 dentro de 'normal'.
- precios-reportes.test.ts: 'solo cuenta facturas cobradas y dentro del rango de fechas' - una factura abierta y una fuera de rango quedan fuera.
- precios-reportes.test.ts: 'las demas consultas de reportes no cambiaron' - verificar resumenGanancia, resumenItbis y ventasPorMetodoPago contra los mismos datos.

---
