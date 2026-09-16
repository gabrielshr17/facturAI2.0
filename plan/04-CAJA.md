# Caja registradora: turno, arqueo y gaveta

> Punto 8 del pedido. 8 tareas: CAJA-01 a CAJA-08.
> Antes de despachar cualquier tarea de este archivo, lee [00-CONVENCIONES.md](./00-CONVENCIONES.md).

> [!IMPORTANT]
> **Los briefs de abajo dicen "migracion 11". Ignora ese numero.** Los escribieron ocho
> agentes en paralelo y los ocho reclamaron el id 11. La banda de ids de esta area es
> **`40-49`**; el reparto completo esta en
> [00-CONVENCIONES.md, seccion 2](./00-CONVENCIONES.md#2-reparto-de-ids-de-migracion-bandas).

> [!NOTE]
> **Decision 4 tomada: se mantiene la convencion real del repositorio.** Cabecera por archivo
> explicando el POR QUE de la decision no obvia, y cero comentarios inline decorativos. Donde
> algun brief de abajo diga "sin comentarios en el codigo", **esta superado por esta decision**.

## Estado actual

Hoy NO existe ninguna noción de sesión/turno de caja. Lo único que hay es: (1) la tabla `corte_caja` (migración id 3, packages/core/src/db/migrations.ts:231-253) que es un REPORTE DE RANGO DE FECHAS — `fecha_apertura`/`fecha_cierre` son dos fechas `yyyy-mm-dd` del período consultado, no timestamps de apertura/cierre reales; la columna `estado` tiene el comentario `abierto|cerrado` y el tipo `EstadoCorteCaja` existe en tipos.ts, pero `registrarCorte()` escribe SIEMPRE `'cerrado'` (corte-caja-repo.ts:123) y no hay ningún camino que cree un corte `'abierto'`; (2) `corte-caja-repo.ts` con exactamente 3 métodos (`calcularResumen`, `registrarCorte`, `listar`) — no hay `abrir`, ni `obtenerAbierta`, ni `cerrar`, ni `obtenerPorId`; (3) `dominio/caja.ts` con una sola función pura de 5 líneas: `calcularCorteCaja` = esperado(fondo+ventas efectivo) y diferencia(contado-esperado); (4) la pantalla `CorteCaja.tsx`, que es un formulario de rango con dos inputs (fondo inicial y efectivo contado) tecleados a mano en cada consulta, sin persistir el fondo, sin seleccionar caja ni usuario, sin imprimir nada, y con historial en tabla de 5 columnas. No existe `caja-repo.ts` ni `usuario-repo.ts` (confirmado en `ls packages/core/src/repos/`). La UI llama `repo.registrarCorte({desde,hasta,montoInicial,efectivoContado})` SIN `cajaId` ni `usuarioId` (CorteCaja.tsx:61-66), así que ambas columnas quedan null en toda instalación real. De la gaveta sí hay hardware funcionando: `escpos.ts:110-112` y `generarComandoAbrirGaveta()` (escpos.ts:242-244), `abrirGavetaTermica()` (termica.ts:76-83), disparada automáticamente en el cobro cuando hay algún pago en efectivo (Ventas.tsx:997) y a petición desde un botón en Configuración (SeccionImpresoraTermica.tsx:94-96) — ninguna de las dos comprueba permisos ni escribe en `bitacora_accion`. No existe absolutamente nada de: movimientos de efectivo, arqueo por denominación, corte X vs Z, reimpresión del comprobante de corte, bloqueo de venta con caja cerrada, ni autorización de la diferencia. Un grep por `arqueo|denominac|billete|turno|propina|vale|retiro|sobrante` no devuelve ni una coincidencia en todo `packages/`.

### Lo que ya existe y NO hay que reescribir

| Pieza | Evidencia | Se reutiliza como |
| --- | --- | --- |
| Tabla `corte_caja` con TODAS las columnas de dinero que hace falta para el corte Z: monto_inicial, total_ventas, total_itbis, total_efectivo, total_tarjeta, total_transferencia, total_credito, efectivo_esperado, efectivo_contado, diferencia, estado ('abierto\|cerrado'), caja_id y usuario_id como FK nullable | `packages/core/src/db/migrations.ts:231-253` | Base del corte Z. NO recrearla: se le añaden columnas por ALTER TABLE en una migración nueva (id 11). El tipo TS ya existe con `EstadoCorteCaja = 'abierto'\|'cerrado'` en packages/core/src/repos/tipos.ts:196-215. |
| `calcularResumen(desde, hasta)` — agrega facturas cobradas y desglosa pagos por método con un JOIN pago/factura | `packages/core/src/repos/corte-caja-repo.ts:49-86` | El cálculo del Z y del X es EXACTAMENTE este, cambiando el filtro de fechas por un filtro de sesión (factura.sesion_caja_id o rango de timestamps + caja_id). Se puede parametrizar en vez de duplicar. |
| `calcularCorteCaja()` puro y ya testeado (4 tests) — esperado = fondo + efectivo; diferencia = contado - esperado | `packages/core/src/dominio/caja.ts:19-23 (tests en packages/core/test/caja.test.ts)` | Se mantiene, pero el `totalEfectivo` que recibe tiene que pasar a ser neto: ventas efectivo + entradas - salidas - devoluciones en efectivo. Extender el input, no reescribir la función. |
| Pulso de gaveta ESC/POS completo y funcionando (ESC p 00 19 FA) | `packages/ui/src/impresion/escpos.ts:110-112 y 242-244` | Tal cual. Ya existe el comando aislado `generarComandoAbrirGaveta()`. |
| `abrirGavetaTermica()` — falla en silencio si no hay impresora seleccionada, nunca bloquea el cobro | `packages/ui/src/impresion/termica.ts:76-83` | Punto único donde envolver el permiso + la bitácora de apertura a petición. Ojo: el `return` mudo de la línea 77 hoy oculta el caso 'no hay hardware' — para la apertura a petición hay que distinguirlo del fallo real. |
| Apertura automática de gaveta al cobrar cuando hay pago en efectivo | `packages/ui/src/pantallas/Ventas.tsx:997` | El enganche 'gaveta desde el cobro' YA está hecho y satisface esa parte del pedido del cliente. Solo falta el registro en bitácora. |
| Botón 'Abrir gaveta' a petición, ya en la UI de Configuración | `packages/ui/src/componentes/SeccionImpresoraTermica.tsx:65-72 y 94-96` | Ya existe la acción a petición; falta moverla/duplicarla a Ventas (que es donde el cajero la necesita), pedir permiso y registrar en bitácora. |
| `registrarAccion(db, {...})` compartida, append-only, ya llamada con accion 'cerrar_caja' | `packages/core/src/repos/bitacora-repo.ts:35-55; llamada en packages/core/src/repos/corte-caja-repo.ts:138-141` | Mismo patrón para 'abrir_caja', 'abrir_gaveta', 'movimiento_caja', 'autorizar_diferencia'. Acepta `usuarioId` — hoy nadie se lo pasa. |
| Filas semilla `caja-1` ('Caja Principal') y `usuario-admin` ('Administrador') que YA existen en toda instalación real | `packages/core/src/db/seed.ts:37-47` | Default sensato para la migración de datos viejos: rellenar caja_id/usuario_id con esos ids en vez de dejar null, sin pedirle nada al usuario. |
| Constructor ESC/POS con columnas justificadas, negrita, tamaños y corte de papel + cadena de impresión de 3 niveles (térmica → GDI → window.print) | `packages/ui/src/impresion/escpos.ts:41-127; packages/ui/src/impresion/recibo.ts:11-25` | El comprobante de corte X/Z se imprime con `ConstructorEscPos` igual que `generarEscPos`, y la reimpresión sigue el patrón de `reimprimirUltimo()` en Ventas.tsx:1043-1060. |
| `Alertas` (confirmar/avisar/elegir) como diálogos modales accesibles ya provistos por el AppShell | `packages/ui/src/contexto/Alertas.tsx:42-47` | Para el diálogo 'caja cerrada, ¿abrir turno?' y el 'elegir' entre corte X y corte Z, sin montar modales nuevos. |
| `filtrarNumero()` + `money()` + inputs `inputMode="decimal"` como convención para montos | `packages/ui/src/utilidades/numero.ts; uso en packages/ui/src/pantallas/CorteCaja.tsx:90,94` | La rejilla de denominaciones son ~10 inputs de cantidad: usar el mismo filtro y formato. |
| `redondear2` / `sumar` para todo lo monetario | `packages/core/src/dominio/dinero.ts:11-41` | El total del arqueo (Σ denominación × cantidad) debe pasar por `sumar`, no por un reduce crudo. |

### Lo que falta

| Capa | Hueco | Por que importa |
| --- | --- | --- |
| esquema | No existe la entidad sesión/turno de caja. `corte_caja` guarda fechas de rango (`fecha_apertura`/`fecha_cierre` son `date()` inclusive, no timestamps) y nace siempre 'cerrado' | Sin una fila con estado 'abierta', caja_id, usuario_id, fondo inicial y timestamp de apertura, no hay nada contra qué validar 'no vender con caja cerrada', ni a qué colgar los movimientos de efectivo, ni qué reimprimir. Es la pieza raíz: todo lo demás depende de ella. |
| esquema | No hay tabla de movimientos de efectivo (entrada, sacada/retiro, pago a proveedor desde caja, propina, vale) | El cliente lo pidió explícitamente y además sin ella el `efectivo_esperado` es matemáticamente falso: hoy es fondo + ventas efectivo y nada más (corte-caja-repo.ts:100-104), así que cualquier retiro del turno aparece como faltante del cajero. |
| esquema | No hay tabla ni tipos para el arqueo por denominación | Hoy `efectivo_contado` es un único número tecleado a mano (CorteCaja.tsx:94). El cliente pide desglose de billetes y monedas dominicanos (2000/1000/500/200/100/50 y 25/10/5/1) para que el conteo sea auditable y el total no se pueda 'cuadrar' escribiendo el número que da cero. |
| repo | No existe `caja-repo.ts` ni `usuario-repo.ts`; `caja_id` y `usuario_id` siempre llegan null | 'Apertura de turno por caja y usuario' y 'quién autoriza la diferencia' son literalmente incontestables sin esto. La UI ni siquiera tiene de dónde sacar la lista de cajas. |
| ui | No hay sesión de usuario en la UI (no hay login, ni contexto de usuario, ni comprobación de permisos en ningún punto) | Sin usuario activo, el 'quien autoriza el sobrante/faltante' y el 'abrir gaveta con permiso' no se pueden implementar de verdad: se quedan en un campo de texto sin respaldo. Esto es un bloqueante compartido con el área de usuarios/permisos — decidir si esta área espera a esa o define un `ProveedorSesion` mínimo. |
| dominio | No hay validación que impida cobrar con la caja cerrada | `factura-repo.cobrar()` (factura-repo.ts:395-441) solo valida estado del ticket, líneas y pagos. La regla tiene que vivir ahí (regla de negocio en el repo, no en la pantalla), y además hay que interceptar `Ventas.tsx:283-286`, que abre un ticket AUTOMÁTICAMENTE al montar la pantalla si no hay ninguno — hoy la app crea tickets sola aunque no haya turno. |
| repo | No existe corte X (parcial, sin cerrar) — `registrarCorte()` es la única escritura y siempre cierra | El cajero necesita ver el acumulado a media jornada sin cortar el turno. Con la forma actual, cada consulta X dejaría una fila 'cerrada' basura en el historial. |
| ui | No hay impresión ni reimpresión del comprobante de corte | `CorteCaja.tsx` no importa nada de `impresion/`. El corte solo existe en pantalla; el dueño no se lleva papel y no se puede reimprimir un corte viejo (a diferencia de las facturas, que sí tienen `reimprimirUltimo` en Ventas.tsx:1043). |
| esquema | No hay autorización de la diferencia: no existe columna para quién autoriza, ni motivo, ni umbral | La diferencia se calcula y se guarda, pero nadie la firma. El cliente pidió explícitamente 'quién la autoriza'. |
| esquema | Las devoluciones no tocan la caja: `devolucion` no tiene método de pago ni monto devuelto en efectivo | migrations.ts:383-396 — una devolución en efectivo saca dinero del cajón y el corte nunca lo ve, así que se reporta como faltante del cajero. Es un descuadre garantizado en producción. |
| repo | `calcularResumen` compara `date(fecha_hora)` (ISO UTC, ids.ts:11) contra fechas locales generadas por `hoyIso()` (CorteCaja.tsx:9-15) | En RD (UTC-4) toda venta después de las 20:00 locales cae en el día SIGUIENTE según SQLite. Para un reporte mensual pasa desapercibido; para un turno nocturno el corte queda mal por construcción. Hay que arreglarlo al pasar a sesiones con timestamps. |
| repo | El corte no está enganchado con el reporte del dueño | `reportes-repo.ts` no tiene ninguna consulta sobre `corte_caja`, y `Reportes.tsx` (líneas 47-51) solo llama a las 5 funciones de ventas. El dueño no ve turnos, ni diferencias acumuladas, ni descuadres por cajero. |
| build | `backup-repo.ts` tiene la lista de tablas hardcodeada; `sync-rules.yaml` y `packages/api/db/schema.sql` también | Cualquier tabla nueva (sesion_caja, movimiento_caja, arqueo_denominacion) queda FUERA del respaldo y de la futura sincronización si no se agrega a los tres sitios. backup-repo.ts:9-19, sync-rules.yaml:14-37, schema.sql:207-229. |
| ui | La pantalla `CorteCaja.tsx` no es mobile-first: `gridTemplateColumns: "1fr 1fr"` fijo | CorteCaja.tsx:104 — dos columnas a cualquier ancho, viola la regla del repo y la guía de diseño. Si se va a reconstruir la pantalla (arqueo + movimientos + X/Z), es el momento de arreglarlo con `useBreakpoint`, como el resto. |
| ui | No hay selección de caja en ningún lado, ni en Configuración ni en Ventas | `factura.caja_id` acepta el dato (factura-repo.ts:183) pero `abrirTicket()` se llama sin argumentos en los dos únicos sitios (Ventas.tsx:285 y :440). Hasta que la venta se ate a una caja, un corte 'por caja' agrupa sobre una columna vacía. |

## Enfoque recomendado

Introducir una entidad NUEVA `sesion_caja` (el turno) como raiz, y dejar `corte_caja` como el REGISTRO DEL CORTE que apunta a la sesion, marcando las filas viejas con `tipo` DEFAULT 'reporte_rango'. Motivo: las filas de `corte_caja` ya instaladas guardan fechas de rango 'yyyy-mm-dd' en fecha_apertura/fecha_cierre; reutilizar esas columnas como timestamps de turno mezclaria dos semanticas en el mismo historial. Con `tipo` ('reporte_rango' | 'x' | 'z') el mismo historial sirve para las tres cosas y `registrarCorte()` actual sigue funcionando sin tocarlo (y su test de :87-101 sigue verde).

Cuatro decisiones de diseno que ordenan todo lo demas:

1) Arqueo como JSON en una sola columna (`corte_caja.arqueo_json`), NO como tabla hija. `SqlDriver` (packages/core/src/db/driver.ts) no expone transacciones y `run()` devuelve void: un cierre que escriba 10 filas de denominacion + el corte + el cambio de estado de la sesion no es atomico y puede quedar a medias. Con JSON el cierre son exactamente 2 escrituras: INSERT del corte (con el arqueo dentro) y, AL FINAL, un unico `UPDATE sesion_caja SET estado='cerrada' ... WHERE id=? AND estado='abierta'`. Como `run()` no reporta filas afectadas, hay que re-SELECT para confirmar el cierre.

2) Un turno abierto por caja, garantizado por la BASE, no por la UI: `CREATE UNIQUE INDEX ux_sesion_caja_abierta ON sesion_caja (caja_id) WHERE estado='abierta' AND deleted_at IS NULL`. Es la unica defensa real contra dos pestanas abriendo turno a la vez.

3) Los movimientos de efectivo (`movimiento_caja`) no son un extra: sin ellos `efectivo_esperado` es matematicamente falso (hoy = fondo + ventas efectivo), y todo retiro del turno se reporta como faltante del cajero. Formula correcta: fondo + ventas efectivo + entradas - salidas - devoluciones en efectivo. Por eso el dominio (CAJA-02) se extiende ANTES de escribir cualquier repo.

4) El bloqueo de venta vive en `factura-repo.abrirTicket()/cobrar()`, no en la pantalla, y se gobierna con un flag `negocio.exige_caja_abierta`. La migracion lo anade con DEFAULT 1 y acto seguido corre `UPDATE negocio SET exige_caja_abierta = 0`: las instalaciones vivas (migrate() corre en cada arranque) NO se quedan sin poder vender al actualizar, y las instalaciones nuevas (seed inserta el negocio despues de migrar) nacen con el turno obligatorio. El dueno lo enciende desde Configuracion cuando ya entendio el flujo.

Sobre el usuario: `sesion_caja.usuario_apertura_id` es nullable en el esquema (SQLite exige DEFAULT NULL al anadir una columna con REFERENCES) pero OBLIGATORIO en el repo (ValidacionError si falta). Asi la regla "quien abrio / quien cerro / quien autorizo la diferencia" queda del lado de los datos desde el dia uno, sin esperar a RBAC. Solo la tarea de UI depende de RBAC para saber quien es el usuario activo; si RBAC no ha aterrizado, cae a un selector de usuarios activos (marcado como puente temporal).

Sobre los atajos: NO se agrega un modulo nuevo al AppShell. Se RENOMBRA "Corte de caja" a "Caja" en el mismo indice del array MODULOS, con lo que Alt+6 sigue significando lo mismo para el cajero, y dentro de la pantalla conviven las pestanas Turno / Historial / Reporte por rango.

Orden de ejecucion: CAJA-01 (esquema, un solo dueno de la migracion 11) -> CAJA-02 (dominio puro) -> CAJA-03 (repos de caja/sesion/movimientos) -> CAJA-04 (corte X/Z y cierre) -> CAJA-05 (guardias en venta, devolucion y gaveta) -> CAJA-06 (pantalla) -> CAJA-07 (comprobante impreso, gaveta a peticion, turnos en el reporte del dueno). CAJA-05 y CAJA-06 conviene liberarlas juntas: la primera bloquea la venta, la segunda es la que deja abrir el turno.

Decisiones que siguen pendientes del cliente y que las tareas asumen con un DEFAULT configurable (no bloquean): arqueo ciego (se implementa como `negocio.arqueo_ciego` DEFAULT 1, practica estandar), umbral de autorizacion de diferencia (`negocio.umbral_diferencia_caja` DEFAULT 0 = cualquier descuadre exige motivo y autorizador), denominaciones RD$ 2000/1000/500/200/100/50 en billetes y 25/10/5/1 en monedas sin centavos y solo pesos, y cortes X registrados (dejan rastro de cuantos se pidieron) pero sin cerrar el turno.

## Trampas especificas de esta area

- NO HAY TRANSACCIONES. La interfaz `SqlDriver` (packages/core/src/db/driver.ts:11-22) solo expone exec/run/all/get — ningún repo abre BEGIN/COMMIT y no hay helper `enTransaccion`. Cerrar un turno escribe corte + N filas de denominación + actualizar la sesión: si falla a mitad queda un turno medio cerrado. Diseñar las escrituras para que el orden las haga recuperables (hijos primero, cambio de estado del padre AL FINAL y en un solo UPDATE con guarda `WHERE estado='abierta'`), o guardar el arqueo como JSON en una sola columna de la fila del corte y evitar la tabla hija. Añadir BEGIN/COMMIT al driver es posible pero cambia los 3 drivers y sql.js no lo soporta igual.
- El driver de Tauri parte el SQL por `;` a lo bruto: `sql.split(";")` en packages/desktop/src/db/tauri-sql-driver.ts:17-22. La migración nueva NO puede contener triggers (BEGIN...END; se rompe), ni literales de texto con punto y coma, ni comentarios con `;`. Los tests corren con node:sqlite, que sí acepta lotes — una migración con trigger pasaría los tests en verde y reventaría SOLO en escritorio.
- `PRAGMA foreign_keys = ON` está en el driver de node (drivers/node-sqlite.ts:24) y en el de sql.js (sqljs-driver.ts:62) pero NO en el de Tauri. Las FK se validan en tests y en la PWA, y NO en escritorio. Una FK mal puesta (p.ej. movimiento_caja.sesion_id) puede pasar silenciosa en producción y romper los tests, o al revés.
- La misma UI corre en sql.js y en Tauri, pero la gaveta SOLO existe en Tauri: `hayImpresoraTermicaDisponible()` (termica.ts:21-23) es false en la PWA porque nadie llama `configurarAdaptadorImpresora` ahí. Todo botón de gaveta debe degradar (el patrón ya existe: SeccionImpresoraTermica.tsx:44 devuelve null en la PWA). Y `abrirGavetaTermica` ya se traga los errores (termica.ts:80-82), así que para la apertura a petición hay que devolver un resultado, no confiar en que no lanzó.
- HAY BASES DE DATOS REALES INSTALADAS. `migrate()` (db/migrator.ts) corre en cada arranque (web/src/main.tsx:29, desktop/src/main.tsx:29) y aplica pendientes por id; las ids 1..10 ya están consumidas, la nueva es la 11 y solo puede ser aditiva (CREATE TABLE / ALTER TABLE ADD COLUMN con DEFAULT). SQLite no soporta DROP/ALTER COLUMN de forma sencilla. Y `seed()` (db/seed.ts:10-11) sale inmediatamente si ya hay un negocio, así que NO sirve para sembrar datos en instalaciones existentes: si el turno necesita una caja, hay que insertarla en el SQL de la migración con INSERT OR IGNORE, no en el seed.
- Los `corte_caja` YA EXISTENTES en esas bases tienen fecha_apertura/fecha_cierre en formato 'yyyy-mm-dd' (fechas de rango) y estado 'cerrado'. Si se reutilizan esas mismas columnas para timestamps de turno, las filas viejas quedan ambiguas y el historial mezcla dos semánticas distintas. Lo limpio es una tabla `sesion_caja` nueva y dejar `corte_caja` como el registro del corte (X/Z) que apunta a la sesión — o añadir una columna `tipo` con DEFAULT que marque las viejas como 'reporte_rango'.
- `registrarCorte()` no tiene unicidad ni idempotencia: se puede registrar dos veces el mismo período y el test corte-caja-repo.test.ts:87-101 lo asume como comportamiento correcto. Si el corte Z pasa a ser único por sesión, ese test hay que reescribirlo, no solo agregar otro.
- El debounce de persistencia de sql.js es de 150 ms y serializa la base ENTERA en cada guardado (sqljs-driver.ts:64-80). Un arqueo que escriba ~10 filas de denominación una por una está bien (se agrupan), pero no conviene bucles largos de `run()`. El `pagehide`/`visibilitychange` es lo único que salva la última escritura en móvil (líneas 86-91).
- AppShell tiene los 9 módulos hardcodeados en `MODULOS` (AppShell.tsx:28-31) y los atajos Alt+1..Alt+9 se derivan de ese array por índice (AppShell.tsx:64-66). Agregar un módulo (p.ej. separar 'Caja' de 'Corte de caja') REMAPEA los atajos que el cajero ya tiene memorizados, y hay que tocar también el tipo `Modulo` y el mapa `ICONO`.
- `Ventas.tsx:283-286`: si no hay tickets abiertos, la pantalla abre uno SOLA al montar. Bloquear la venta con caja cerrada requiere interceptar ahí, no solo deshabilitar el botón Cobrar — si no, el sistema crea facturas en estado 'abierta' sin turno.
- La bitácora es append-only por diseño (bitacora-repo.ts:5-9, sin update/delete) y `registrarAccion` ya acepta `usuarioId` pero todas las llamadas lo omiten. Al agregar el usuario de sesión, pasarlo en TODAS las llamadas nuevas desde el principio: no hay forma de rellenarlo después.
- Convenciones no negociables del repo que un agente sin contexto rompería: los repos son factories `crearXxxRepo(db: SqlDriver)` que devuelven un objeto literal (no clases); el error de validación es `ValidacionError` importado desde `producto-repo.js` (no desde validacion.ts); las columnas se listan en una const `COLS` y los INSERT usan `Array(n).fill("?")` — si n no coincide con COLS el fallo es silencioso en runtime; todo repo nuevo se exporta en repos/index.ts Y se inyecta en el objeto `Repos` de packages/ui/src/data/contexto.tsx:27-81; y todo es en español, incluidos los nombres de columnas SQL.
- Existe `design-guidelines.md` en la raíz (23 KB, es el DESIGN.md del proyecto bajo otro nombre) — con tokens, tramos responsive, convención de atajos y un checklist para pantallas nuevas en su §12. No existe ningún archivo llamado DESIGN.md. Hay que leer design-guidelines.md antes de tocar la pantalla de caja, no inventar tokens.

## Preguntas para el dueno del negocio

- ¿Una sola caja física o varias? El esquema ya soporta varias (`caja` + `caja_id`), pero la UI hoy no elige ninguna. Si es una sola, ¿se fija en Configuración y se usa implícita, o se elige al abrir turno?
- ¿Puede haber más de un turno abierto a la vez en la misma caja (relevo de cajero sin cerrar), o la regla es un turno abierto por caja como máximo? Esto define si la validación de 'no vender con caja cerrada' es por caja o por usuario.
- ¿Qué usuario opera la caja si todavía no hay login? ¿Se acepta un selector de cajero sin PIN como paso intermedio, o la caja espera a que exista autenticación real?
- Denominaciones dominicanas exactas a listar en el arqueo: ¿billetes 2000/1000/500/200/100/50 y monedas 25/10/5/1? ¿Se cuentan centavos? ¿Se aceptan dólares o solo RD$?
- ¿Arqueo ciego? Es decir, ¿el cajero ve el efectivo esperado ANTES de contar (como hoy, CorteCaja.tsx:140), o se le oculta hasta que teclee el conteo? El ciego es la práctica estándar contra el cuadre a mano.
- ¿Quién puede autorizar un descuadre y a partir de qué monto se exige autorización? ¿Basta con registrar el nombre, o hace falta PIN de un admin?
- ¿Se permite cerrar el turno con diferencia sin autorización (registrándola), o se bloquea el cierre hasta que alguien la autorice?
- Tipos de movimiento de efectivo a soportar: el cliente nombró entrada, sacada, pago a proveedor, propina y vale. ¿Alguno exige comprobante, referencia o autorización? ¿El pago a proveedor desde caja debe enlazarse con una `compra` existente?
- Una devolución pagada en efectivo hoy no descuenta de la caja. ¿Debe descontar (y por tanto registrarse como movimiento de salida), o el negocio devuelve por otra vía?
- ¿Se conserva el corte por rango de fechas actual como 'reporte del dueño' además del corte Z por turno, o el reporte por rango se muda a la pantalla Reportes y 'Corte de caja' pasa a ser solo turnos?
- El corte X, ¿se imprime y se registra (dejando rastro de cuántas veces se pidió), o es solo consulta en pantalla?
- ¿Abrir la gaveta a petición requiere permiso de admin siempre, o el cajero puede hacerlo libremente quedando registrado en bitácora?
- ¿Qué se hace con los cortes ya registrados en las instalaciones reales: se conservan como historial de reportes de rango (recomendado, marcados como tipo 'reporte'), o se descartan?

## Tareas

### CAJA-01 — Migracion 11: esquema del turno de caja, movimientos y arqueo

**Objetivo.** La base de datos tiene sesion_caja, movimiento_caja, las columnas nuevas de corte_caja/factura/devolucion/negocio y los tipos TS correspondientes, aplicando limpio sobre instalaciones ya existentes y sin cambiar ningun comportamiento.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | alto — toca el esquema de instalaciones reales en produccion y una sola columna mal declarada (NOT NULL sin DEFAULT, o REFERENCES con DEFAULT no nulo) rompe el arranque de la app para todos | nada |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** El INSERT OR IGNORE INTO caja usa datetime('now'), que produce 'YYYY-MM-DD HH:MM:SS', mientras todo el resto del repo escribe created_at con ids.ts now() = toISOString() ('YYYY-MM-DDTHH:MM:SS.sssZ'). Cualquier ORDER BY created_at o comparacion de rango mezcla los dos formatos y ordena mal. Ademas duplica la siembra de 'caja-1' que ya hace seed.ts:43-47 y que MULTICAJA-01 tambien toca.
>   **Arreglo.** Usar el literal ISO completo en el SQL de la migracion (strftime('%Y-%m-%dT%H:%M:%fZ','now')) y dejar la siembra de 'caja-1' en una sola migracion — la de MULTICAJA (banda 30), que corre antes.

#### Brief para el agente

```text
Trabajas en el monorepo pnpm facturAI, en C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. TODO en espanol (nombres de tablas, columnas, tipos TS). TypeScript estricto, sin `any`, SIN COMENTARIOS en el codigo que escribas (regla del proyecto; ignora que las migraciones viejas si los tengan). TDD con vitest: escribe primero los tests, veelos fallar, luego la migracion.

TAREA: agregar la migracion id 11 en packages/core/src/db/migrations.ts (array `migrations`; las ids 1..10 ya estan usadas, la ultima es 'cotizaciones'). Imita exactamente la forma de la migracion 10: objeto `{ id, nombre, sql }` con el SQL en un template literal marcado `/* sql */`. El SQL exacto a aplicar te lo doy en el campo migracionSql de esta tarea: copialo tal cual, es aditivo a proposito.

TRAMPAS QUE TE VAN A MORDER SI NO LAS RESPETAS:
- El driver de escritorio parte el SQL por `;` a lo bruto (packages/desktop/src/db/tauri-sql-driver.ts:17-22). Prohibido: triggers (BEGIN...END), literales de texto con punto y coma, y comentarios que contengan `;`. Los tests corren con node:sqlite, que si acepta lotes, asi que un trigger pasaria los tests en verde y reventaria SOLO en escritorio.
- HAY BASES DE DATOS REALES INSTALADAS. migrate() (packages/core/src/db/migrator.ts) corre en cada arranque. La migracion solo puede ser CREATE TABLE / CREATE INDEX / ALTER TABLE ADD COLUMN / UPDATE / INSERT OR IGNORE. Nada de DROP ni de ALTER COLUMN.
- SQLite exige que una columna anadida con clausula REFERENCES tenga DEFAULT NULL, y que una columna NOT NULL anadida tenga un DEFAULT no nulo. El SQL que te doy ya cumple ambas cosas: no lo 'mejores'.
- seed() (packages/core/src/db/seed.ts:10-11) sale de inmediato si ya hay un negocio, asi que NO sirve para sembrar nada en instalaciones existentes. Por eso la caja por defecto va con INSERT OR IGNORE dentro de la propia migracion.

ADEMAS, en el mismo commit:
1) packages/core/src/repos/tipos.ts: anade `EstadoSesionCaja = 'abierta' | 'cerrada'`, `interface SesionCaja extends Auditoria`, `TipoMovimientoCaja = 'entrada' | 'salida' | 'pago_proveedor' | 'propina' | 'vale' | 'devolucion'`, `OrigenMovimientoCaja = 'manual' | 'devolucion' | 'compra'`, `interface MovimientoCaja extends Auditoria`, `TipoCorte = 'reporte_rango' | 'x' | 'z'`, y extiende la interface `CorteCaja` existente (:196-215) con las columnas nuevas: sesion_id, tipo, total_entradas, total_salidas, total_devoluciones_efectivo, arqueo_json, diferencia_motivo, autorizado_por_id, secuencia. Los nombres de las propiedades TS son identicos a los de las columnas SQL (snake_case), como en todo el archivo.
2) packages/core/src/repos/backup-repo.ts: agrega 'sesion_caja' y 'movimiento_caja' a la const TABLAS (:9-19). Si no lo haces, quedan fuera del respaldo.
3) packages/api/db/schema.sql: agrega el espejo Postgres de ambas tablas y las columnas nuevas (el bloque de corte_caja esta en :207-229). TEXT->text, REAL->numeric(12,2), INTEGER bool->boolean, igual que el resto del archivo.
4) packages/api/sync-rules.yaml: agrega las dos tablas a los buckets (:14-37) siguiendo el patron de las tablas hermanas.

NO TOQUES: ningun repo de packages/core/src/repos/ salvo backup-repo.ts y tipos.ts; nada de packages/ui; nada de packages/web ni packages/desktop; nada de dominio/. No cambies COLS ni ningun INSERT existente (eso es de CAJA-04). No escribas UI. No renombres nada existente.

Al terminar: `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde, y los 18 archivos de test existentes intactos salvo migrations.test.ts.
```

#### SQL de la migracion

```sql
CREATE TABLE sesion_caja (
  id                  TEXT PRIMARY KEY,
  caja_id             TEXT NOT NULL REFERENCES caja(id),
  usuario_apertura_id TEXT REFERENCES usuario(id),
  usuario_cierre_id   TEXT REFERENCES usuario(id),
  fecha_apertura      TEXT NOT NULL,
  fecha_cierre        TEXT,
  fondo_inicial       REAL NOT NULL DEFAULT 0,
  estado              TEXT NOT NULL DEFAULT 'abierta',
  notas_apertura      TEXT,
  notas_cierre        TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT
);

CREATE UNIQUE INDEX ux_sesion_caja_abierta ON sesion_caja (caja_id) WHERE estado='abierta' AND deleted_at IS NULL;
CREATE INDEX ix_sesion_caja_apertura ON sesion_caja (fecha_apertura);
CREATE INDEX ix_sesion_caja_estado ON sesion_caja (estado);

CREATE TABLE movimiento_caja (
  id                TEXT PRIMARY KEY,
  sesion_id         TEXT NOT NULL REFERENCES sesion_caja(id),
  tipo              TEXT NOT NULL,
  monto             REAL NOT NULL DEFAULT 0,
  motivo            TEXT,
  referencia        TEXT,
  origen_tipo       TEXT NOT NULL DEFAULT 'manual',
  origen_id         TEXT,
  usuario_id        TEXT REFERENCES usuario(id),
  autorizado_por_id TEXT REFERENCES usuario(id),
  fecha_hora        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);

CREATE INDEX ix_movimiento_caja_sesion ON movimiento_caja (sesion_id);
CREATE INDEX ix_movimiento_caja_tipo ON movimiento_caja (tipo);

ALTER TABLE corte_caja ADD COLUMN sesion_id TEXT REFERENCES sesion_caja(id);
ALTER TABLE corte_caja ADD COLUMN tipo TEXT NOT NULL DEFAULT 'reporte_rango';
ALTER TABLE corte_caja ADD COLUMN total_entradas REAL NOT NULL DEFAULT 0;
ALTER TABLE corte_caja ADD COLUMN total_salidas REAL NOT NULL DEFAULT 0;
ALTER TABLE corte_caja ADD COLUMN total_devoluciones_efectivo REAL NOT NULL DEFAULT 0;
ALTER TABLE corte_caja ADD COLUMN arqueo_json TEXT;
ALTER TABLE corte_caja ADD COLUMN diferencia_motivo TEXT;
ALTER TABLE corte_caja ADD COLUMN autorizado_por_id TEXT REFERENCES usuario(id);
ALTER TABLE corte_caja ADD COLUMN secuencia INTEGER NOT NULL DEFAULT 0;

CREATE INDEX ix_corte_caja_sesion ON corte_caja (sesion_id);
CREATE INDEX ix_corte_caja_tipo ON corte_caja (tipo);

ALTER TABLE factura ADD COLUMN sesion_caja_id TEXT REFERENCES sesion_caja(id);
CREATE INDEX ix_factura_sesion_caja ON factura (sesion_caja_id);

ALTER TABLE devolucion ADD COLUMN metodo_devolucion TEXT NOT NULL DEFAULT 'efectivo';

ALTER TABLE negocio ADD COLUMN exige_caja_abierta INTEGER NOT NULL DEFAULT 1;
ALTER TABLE negocio ADD COLUMN arqueo_ciego INTEGER NOT NULL DEFAULT 1;
ALTER TABLE negocio ADD COLUMN umbral_diferencia_caja REAL NOT NULL DEFAULT 0;

UPDATE negocio SET exige_caja_abierta = 0;

INSERT OR IGNORE INTO caja (id, nombre, ubicacion, activa, created_at, updated_at)
  VALUES ('caja-1', 'Caja Principal', 'Mostrador', 1, datetime('now'), datetime('now'));
```

#### Archivos a tocar

- `packages/core/src/db/migrations.ts`
- `packages/core/src/repos/tipos.ts`
- `packages/core/src/repos/backup-repo.ts`
- `packages/core/test/migrations.test.ts`
- `packages/api/db/schema.sql`
- `packages/api/sync-rules.yaml`

#### Criterios de aceptacion

- [ ] migrate() sobre una base vacia crea sesion_caja y movimiento_caja y deja corte_caja con las 9 columnas nuevas.
- [ ] migrate() sobre una base que ya tiene las migraciones 1..10 aplicadas (y filas de corte_caja viejas) aplica solo la 11 y no lanza.
- [ ] Toda fila de corte_caja preexistente queda con tipo='reporte_rango' sin necesidad de un UPDATE explicito.
- [ ] El indice unico parcial impide fisicamente dos sesiones 'abierta' para la misma caja_id.
- [ ] Instalacion existente (ya hay negocio): negocio.exige_caja_abierta queda en 0. Instalacion nueva (migrate + seed): queda en 1.
- [ ] Existe la fila caja 'caja-1' despues de migrar, tanto en base nueva como en base vieja que la hubiera perdido.
- [ ] El SQL de la migracion no contiene triggers, ni comentarios, ni literales con punto y coma (verificable partiendo el string por ';' y ejecutando cada trozo suelto).
- [ ] backup-repo exporta las dos tablas nuevas.
- [ ] pnpm --filter @sfr/core test en verde sin modificar ningun test previo salvo migrations.test.ts.

#### Pruebas a escribir primero (TDD)

- migrations.test.ts: 'la migracion 11 crea sesion_caja y movimiento_caja' — migrate() sobre node:sqlite en memoria y assert de ambos nombres en sqlite_master.
- migrations.test.ts: 'corte_caja gana las columnas del turno' — PRAGMA table_info(corte_caja) contiene sesion_id, tipo, total_entradas, total_salidas, total_devoluciones_efectivo, arqueo_json, diferencia_motivo, autorizado_por_id, secuencia.
- migrations.test.ts: 'los cortes viejos quedan marcados como reporte_rango' — aplicar migraciones 1..10, insertar una fila de corte_caja a mano, aplicar la 11, y esperar tipo='reporte_rango'.
- migrations.test.ts: 'no se pueden abrir dos turnos en la misma caja' — insertar dos sesion_caja con misma caja_id y estado 'abierta' y esperar que el segundo INSERT rechace.
- migrations.test.ts: 'se puede reabrir turno en una caja cuyo turno anterior ya cerro' — misma caja_id con la primera en 'cerrada' inserta sin error.
- migrations.test.ts: 'instalacion existente no queda bloqueada' — aplicar 1..10, insertar un negocio, aplicar la 11, esperar exige_caja_abierta=0.
- migrations.test.ts: 'instalacion nueva exige turno' — migrate() completo + seed(), esperar exige_caja_abierta=1.
- migrations.test.ts: 'el SQL de la 11 es seguro para el driver de escritorio' — tomar migrations.find(m=>m.id===11).sql, partirlo por ';' y ejecutar cada trozo no vacio uno por uno contra una base recien migrada a 10, sin error.
- migrations.test.ts: 'la migracion es idempotente' — segunda llamada a migrate() devuelve 0 aplicadas.
- migrations.test.ts: 'factura y devolucion ganan sus columnas' — PRAGMA table_info de ambas.

---

### CAJA-02 — Dominio puro: efectivo esperado neto, arqueo por denominacion y evaluacion de la diferencia

**Objetivo.** packages/core/src/dominio/caja.ts calcula el efectivo esperado incluyendo movimientos y devoluciones, totaliza un arqueo por denominaciones dominicanas y dice si la diferencia exige autorizacion, todo con funciones puras testeadas.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| S | bajo — funciones puras, sin I/O, con los consumidores existentes protegidos por campos opcionales | CAJA-01 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Redefine efectivoEsperado = montoInicial + totalEfectivo + entradas - salidas - devolucionesEfectivo y no menciona el cambio entregado, que es exactamente el termino que falta hoy. Sus 17 pruebas construyen los montos a mano, asi que ninguna lo detecta. El error se propaga intacto a CAJA-03.efectivoDisponible y a CAJA-04.calcularResumenSesion, y sale impreso en el corte Z de CAJA-07.
>   **Arreglo.** Anadir totalCambio como parametro de CorteCajaInput (opcional con default 0, para no romper los 4 tests existentes) y restarlo. Anadir el caso 'venta de 430 pagada con 500 deja esperado en fondo+430' como prueba obligatoria en CAJA-02 y su equivalente end-to-end en CAJA-04.

#### Brief para el agente

```text
Trabajas en el monorepo pnpm facturAI, en C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. TODO en espanol. TypeScript estricto sin `any`. SIN COMENTARIOS en el codigo. TDD con vitest estricto: primero los tests en packages/core/test/caja.test.ts (ya existe con 4 tests de calcularCorteCaja), veelos fallar, luego implementa.

ARCHIVO UNICO DE IMPLEMENTACION: packages/core/src/dominio/caja.ts (hoy tiene 23 lineas: CorteCajaInput, CorteCajaResultado y calcularCorteCaja). Es dominio PURO: no importa SqlDriver, no toca la base, no hace I/O. Imita el estilo de packages/core/src/dominio/dinero.ts y usa SIEMPRE sus helpers `redondear2` y `sumar` para cualquier aritmetica monetaria (nada de reduce crudo con + : el proyecto ya tuvo problemas de centavos).

QUE ANADIR:
1) `export type TipoDenominacion = 'billete' | 'moneda'` y `export interface Denominacion { valor: number; tipo: TipoDenominacion }`.
2) `export const DENOMINACIONES_RD: readonly Denominacion[]` con billetes 2000, 1000, 500, 200, 100, 50 y monedas 25, 10, 5, 1, en ese orden descendente. Sin centavos, solo pesos dominicanos.
3) `export interface ConteoDenominacion { valor: number; cantidad: number }` y `export function calcularTotalArqueo(conteo: ConteoDenominacion[]): number` = suma de valor*cantidad con `sumar`/`redondear2`.
4) `export function validarArqueo(conteo: ConteoDenominacion[]): ErrorValidacion[]` (ErrorValidacion se importa de ./validacion.js): rechaza cantidades negativas, cantidades no enteras, valores que no esten en DENOMINACIONES_RD y valores repetidos. Devuelve el arreglo de errores, NO lanza: lanzar es tarea del repo.
5) EXTIENDE `CorteCajaInput` con tres campos OPCIONALES que por omision valen 0: `totalEntradas?`, `totalSalidas?`, `totalDevolucionesEfectivo?`. La formula pasa a ser efectivoEsperado = redondear2(montoInicial + totalEfectivo + entradas - salidas - devolucionesEfectivo) y diferencia = redondear2(efectivoContado - efectivoEsperado). Son opcionales A PROPOSITO: los 4 tests existentes de caja.test.ts tienen que seguir pasando sin tocarlos.
6) `export type ClaseDiferencia = 'cuadrado' | 'sobrante' | 'faltante'` y `export function evaluarDiferencia(input: { diferencia: number; umbral: number }): { clase: ClaseDiferencia; requiereAutorizacion: boolean }`. clase se decide por el signo de la diferencia (0 = cuadrado). requiereAutorizacion = Math.abs(diferencia) > umbral. Con umbral 0, cualquier descuadre distinto de cero exige autorizacion; con umbral 0 y diferencia 0, no.

Exporta todo lo nuevo desde packages/core/src/index.ts si ese barrel reexporta dominio/caja.js (comprueba como esta hecho y sigue el patron existente, no inventes uno).

NO TOQUES: ningun repo, ninguna migracion, nada de packages/ui, packages/web, packages/desktop o packages/api. No cambies la firma ni el nombre de `calcularCorteCaja` (lo consume hoy packages/ui/src/pantallas/CorteCaja.tsx:50 y packages/core/src/repos/corte-caja-repo.ts:100). No escribas consultas SQL.

Al terminar: `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde.
```

#### Archivos a tocar

- `packages/core/src/dominio/caja.ts`
- `packages/core/test/caja.test.ts`
- `packages/core/src/index.ts`

#### Criterios de aceptacion

- [ ] Los 4 tests previos de calcularCorteCaja pasan sin modificarlos (los campos nuevos son opcionales y valen 0).
- [ ] calcularTotalArqueo devuelve montos redondeados a 2 decimales usando los helpers de dinero.ts.
- [ ] validarArqueo devuelve errores y nunca lanza.
- [ ] DENOMINACIONES_RD tiene exactamente 6 billetes y 4 monedas, ordenados de mayor a menor.
- [ ] evaluarDiferencia distingue cuadrado/sobrante/faltante y respeta el umbral inclusivo (|dif| > umbral).
- [ ] caja.ts no importa nada de db/ ni de repos/.
- [ ] pnpm --filter @sfr/core test y pnpm typecheck en verde.

#### Pruebas a escribir primero (TDD)

- caja.test.ts: 'el efectivo esperado resta las salidas del turno' — fondo 1000, ventas efectivo 5000, salidas 800 -> esperado 5200.
- caja.test.ts: 'el efectivo esperado suma las entradas del turno' — fondo 1000, ventas 0, entradas 500 -> esperado 1500.
- caja.test.ts: 'una devolucion en efectivo baja el esperado' — fondo 0, ventas 1000, devoluciones 250 -> esperado 750.
- caja.test.ts: 'sin movimientos el resultado es identico al calculo viejo' — mismos numeros que los 4 tests previos.
- caja.test.ts: 'calcularTotalArqueo suma billetes y monedas' — 2x2000 + 3x500 + 4x25 = 5600.
- caja.test.ts: 'calcularTotalArqueo con conteo vacio devuelve 0'.
- caja.test.ts: 'calcularTotalArqueo no arrastra error de coma flotante' — conteos que sumen .10 + .20 tipicos, assert con toBe sobre el redondeado.
- caja.test.ts: 'validarArqueo rechaza cantidad negativa'.
- caja.test.ts: 'validarArqueo rechaza cantidad fraccionaria' (2.5 billetes).
- caja.test.ts: 'validarArqueo rechaza una denominacion inexistente' (valor 20).
- caja.test.ts: 'validarArqueo rechaza denominaciones repetidas'.
- caja.test.ts: 'validarArqueo acepta un conteo valido y devuelve arreglo vacio'.
- caja.test.ts: 'evaluarDiferencia marca faltante cuando la diferencia es negativa'.
- caja.test.ts: 'evaluarDiferencia marca sobrante cuando es positiva'.
- caja.test.ts: 'evaluarDiferencia con diferencia 0 y umbral 0 no exige autorizacion'.
- caja.test.ts: 'evaluarDiferencia con diferencia -0.01 y umbral 0 exige autorizacion'.
- caja.test.ts: 'evaluarDiferencia con |dif| igual al umbral NO exige autorizacion'.

---

### CAJA-03 — Repos de caja, sesion de turno y movimientos de efectivo

**Objetivo.** Existen caja-repo.ts y sesion-caja-repo.ts: se puede listar cajas, abrir un turno (con guardia de un turno abierto por caja), consultarlo, y registrar entradas/salidas/pagos a proveedor/propinas/vales con validacion de negocio y bitacora.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | medio — dos repos nuevos sin dependientes todavia, pero la traduccion del error del indice unico a ValidacionError es facil de pasar por alto | CAJA-01, CAJA-02 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm facturAI, en C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. TODO en espanol, incluidos nombres de columnas. TypeScript estricto sin `any`. SIN COMENTARIOS en el codigo. TDD con vitest: primero los tests, veelos fallar, luego implementa.

CONTEXTO YA HECHO (no lo rehagas): la migracion 11 ya creo las tablas `sesion_caja` y `movimiento_caja` y los tipos TS SesionCaja / MovimientoCaja / TipoMovimientoCaja / OrigenMovimientoCaja ya estan en packages/core/src/repos/tipos.ts. El dominio packages/core/src/dominio/caja.ts ya tiene la formula de efectivo esperado con entradas/salidas.

PATRON OBLIGATORIO A IMITAR: packages/core/src/repos/compra-repo.ts y packages/core/src/repos/corte-caja-repo.ts. Concretamente: los repos son FACTORIES `export function crearXxxRepo(db: SqlDriver) { return { ... } }` que devuelven un objeto literal (NO clases); el error de validacion es `ValidacionError` importado desde './producto-repo.js' (NO de dominio/validacion.ts, que solo exporta el tipo ErrorValidacion); las columnas van en una const `COLS` y los INSERT usan `Array(n).fill("?").join(",")` — si n no coincide con la cantidad de columnas de COLS el fallo es SILENCIOSO en runtime, cuentalas dos veces; los ids se generan con `newId()` y los timestamps con `now()` de ../ids.js; la bitacora se escribe con `registrarAccion(db, {...})` de ./bitacora-repo.js.

CREA packages/core/src/repos/caja-repo.ts con: `listar()`, `listarActivas()` (ordenadas por nombre), `obtener(id)`, `crear({nombre, ubicacion})`, `editar(id, {nombre, ubicacion})`, `cambiarActiva(id, activa)`. Validaciones en el repo: nombre obligatorio y no duplicado (comparacion case-insensitive contra cajas no borradas); no se puede desactivar una caja con un turno abierto.

CREA packages/core/src/repos/sesion-caja-repo.ts con:
- `abrir({ cajaId, usuarioId, fondoInicial, notas? }): Promise<SesionCaja>`. Valida, en este orden, lanzando ValidacionError con el campo correcto: cajaId obligatorio y la caja debe existir y estar activa; usuarioId OBLIGATORIO y el usuario debe existir y estar activo (la columna es nullable en SQL solo por una limitacion de SQLite; aqui es obligatoria); fondoInicial numero finito >= 0; no puede haber ya un turno 'abierta' para esa caja (haz el SELECT de guardia Y deja que el indice unico parcial ux_sesion_caja_abierta sea la red de seguridad: si el INSERT falla por el indice, traducelo a ValidacionError, no dejes escapar el error crudo de SQLite). Al final `registrarAccion(db, { accion: 'abrir_caja', entidad: 'sesion_caja', entidadId, usuarioId, resumen })` — PASA SIEMPRE usuarioId, la bitacora es append-only y no hay forma de rellenarlo despues.
- `obtenerAbierta(cajaId)`, `obtenerPorId(id)`, `listar(filtro?: { cajaId?; usuarioId?; desde?; hasta? })` ordenado por fecha_apertura DESC, `hayAlgunaAbierta()`.
- `registrarMovimiento({ sesionId, tipo, monto, motivo?, referencia?, usuarioId, autorizadoPorId?, origenTipo?, origenId? }): Promise<MovimientoCaja>`. Validaciones: la sesion debe existir y estar 'abierta' (si esta cerrada, ValidacionError 'El turno de caja ya esta cerrado.'); tipo debe pertenecer a TipoMovimientoCaja; monto > 0 (el signo lo da el tipo, NUNCA se guardan montos negativos); motivo obligatorio para todo tipo que saque dinero (salida, pago_proveedor, vale); usuarioId obligatorio; una salida no puede dejar el efectivo disponible en negativo. Bitacora accion 'movimiento_caja' con usuarioId.
- `totalesMovimientos(sesionId): Promise<{ entradas: number; salidas: number; devolucionesEfectivo: number }>`: una sola consulta GROUP BY tipo. 'entrada' y 'propina' suman entradas; 'salida', 'pago_proveedor' y 'vale' suman salidas; 'devolucion' va aparte.
- `listarMovimientos(sesionId)` ordenado por fecha_hora.
- `efectivoDisponible(sesionId)`: fondo_inicial + ventas en efectivo de la sesion + entradas - salidas - devoluciones. Las ventas en efectivo se obtienen con `SELECT SUM(p.monto) FROM pago p JOIN factura f ON f.id = p.factura_id WHERE f.sesion_caja_id = ? AND f.estado='cobrada' AND f.deleted_at IS NULL AND p.deleted_at IS NULL AND p.metodo='efectivo'`. Hoy devolvera 0 porque nadie llena factura.sesion_caja_id todavia (eso es CAJA-05): es correcto y los tests deben poder llenar la columna a mano para probar el caso con ventas.

REGISTRA los dos repos en packages/core/src/repos/index.ts (barrel, sigue el formato exacto de los bloques `export { crearXxxRepo, type XxxRepo } from './xxx-repo.js'`) Y en packages/ui/src/data/contexto.tsx: agrega `caja` y `sesionCaja` a la interface `Repos` y a la construccion dentro de ProveedorDatos (:27-81). Esa es la unica linea de UI que tocas.

NO TOQUES: factura-repo.ts, corte-caja-repo.ts, devolucion-repo.ts, reportes-repo.ts, migrations.ts, dominio/caja.ts, ninguna pantalla de packages/ui/src/pantallas/, ni AppShell.tsx. No implementes el cierre del turno ni el corte X/Z (es CAJA-04). No agregues transacciones al SqlDriver.

Al terminar: `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde.
```

#### Archivos a tocar

- `packages/core/src/repos/caja-repo.ts`
- `packages/core/src/repos/sesion-caja-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/test/caja-repo.test.ts`
- `packages/core/test/sesion-caja-repo.test.ts`
- `packages/ui/src/data/contexto.tsx`

#### Criterios de aceptacion

- [ ] abrir() rechaza el segundo turno de la misma caja con ValidacionError legible, no con un error crudo de SQLite.
- [ ] abrir() en dos cajas distintas a la vez funciona.
- [ ] abrir() exige usuarioId aunque la columna SQL sea nullable.
- [ ] registrarMovimiento() rechaza montos <= 0 y tipos desconocidos, y no guarda montos negativos nunca.
- [ ] registrarMovimiento() rechaza cualquier movimiento contra un turno cerrado.
- [ ] Una salida mayor al efectivo disponible se rechaza con ValidacionError.
- [ ] totalesMovimientos clasifica propina como entrada y vale como salida.
- [ ] Todas las escrituras dejan fila en bitacora_accion CON usuario_id no nulo.
- [ ] Los dos repos aparecen en repos/index.ts y en el objeto Repos de packages/ui/src/data/contexto.tsx.
- [ ] pnpm --filter @sfr/core test y pnpm typecheck en verde, sin modificar tests preexistentes.

#### Pruebas a escribir primero (TDD)

- sesion-caja-repo.test.ts: 'abre un turno con fondo inicial y queda en estado abierta'.
- sesion-caja-repo.test.ts: 'rechaza abrir un segundo turno en la misma caja' — ValidacionError con campo 'cajaId'.
- sesion-caja-repo.test.ts: 'permite abrir turno en otra caja mientras la primera sigue abierta'.
- sesion-caja-repo.test.ts: 'permite reabrir la misma caja despues de cerrar el turno anterior' — marcando estado 'cerrada' a mano en la fila.
- sesion-caja-repo.test.ts: 'rechaza abrir sin usuarioId'.
- sesion-caja-repo.test.ts: 'rechaza abrir en una caja inactiva'.
- sesion-caja-repo.test.ts: 'rechaza fondo inicial negativo'.
- sesion-caja-repo.test.ts: 'obtenerAbierta devuelve undefined cuando no hay turno'.
- sesion-caja-repo.test.ts: 'registrarMovimiento guarda una entrada y la suma en totalesMovimientos'.
- sesion-caja-repo.test.ts: 'registrarMovimiento rechaza monto 0 y monto negativo'.
- sesion-caja-repo.test.ts: 'registrarMovimiento exige motivo en salida, pago_proveedor y vale'.
- sesion-caja-repo.test.ts: 'registrarMovimiento rechaza un tipo desconocido'.
- sesion-caja-repo.test.ts: 'registrarMovimiento rechaza contra un turno cerrado'.
- sesion-caja-repo.test.ts: 'una salida mayor al efectivo disponible se rechaza' — fondo 1000, salida 1500.
- sesion-caja-repo.test.ts: 'efectivoDisponible cuenta las ventas en efectivo del turno' — insertar factura cobrada con sesion_caja_id y pago efectivo a mano, esperar fondo+venta.
- sesion-caja-repo.test.ts: 'efectivoDisponible ignora pagos con tarjeta'.
- sesion-caja-repo.test.ts: 'propina cuenta como entrada y vale como salida en totalesMovimientos'.
- sesion-caja-repo.test.ts: 'abrir y registrarMovimiento escriben en bitacora_accion con usuario_id'.
- caja-repo.test.ts: 'listarActivas excluye las inactivas y las borradas'.
- caja-repo.test.ts: 'crear rechaza nombre vacio'.
- caja-repo.test.ts: 'crear rechaza nombre duplicado ignorando mayusculas'.
- caja-repo.test.ts: 'no permite desactivar una caja con turno abierto'.

---

### CAJA-04 — Corte X, corte Z y cierre de turno con arqueo y autorizacion de la diferencia

**Objetivo.** Se puede sacar un corte X parcial sin cerrar el turno y cerrar el turno con un corte Z que guarda el arqueo por denominacion, la diferencia, su motivo y quien la autorizo, dejando la sesion cerrada de forma recuperable.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto — modifica un repo en produccion con tests que asumen el comportamiento viejo, y el cierre en dos escrituras sin transaccion tiene que quedar recuperable por orden | CAJA-01, CAJA-02, CAJA-03 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm facturAI, en C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. TODO en espanol. TypeScript estricto sin `any`. SIN COMENTARIOS en el codigo. TDD con vitest: primero los tests, veelos fallar, luego implementa.

CONTEXTO YA HECHO: migracion 11 aplicada (corte_caja tiene sesion_id, tipo, total_entradas, total_salidas, total_devoluciones_efectivo, arqueo_json, diferencia_motivo, autorizado_por_id, secuencia); dominio/caja.ts ya expone DENOMINACIONES_RD, calcularTotalArqueo, validarArqueo, evaluarDiferencia y un calcularCorteCaja que acepta entradas/salidas/devoluciones; sesion-caja-repo.ts ya existe con abrir/obtenerPorId/totalesMovimientos/efectivoDisponible.

EDITAS packages/core/src/repos/corte-caja-repo.ts (hoy 154 lineas con calcularResumen, registrarCorte y listar). Reglas duras:
- NO cambies el comportamiento de `registrarCorte()` ni de `calcularResumen(desde, hasta)`: los usa la pantalla actual y el test packages/core/test/corte-caja-repo.test.ts:87-101 asume explicitamente que se pueden registrar dos cortes del mismo periodo. Ese test debe seguir verde SIN tocarlo. registrarCorte pasa a escribir tipo='reporte_rango' de forma explicita.
- CUIDADO con la const COLS (:31-34) y con `Array(19).fill("?")` (:130): al agregar las 9 columnas nuevas a COLS hay que subir ese 19 a la cuenta exacta de columnas. Si no coinciden, el INSERT falla en runtime sin que el compilador diga nada. Cuentalas dos veces y agrega un test de ida y vuelta que lea la fila insertada.

AGREGA al repo:
- `calcularResumenSesion(sesionId)`: mismo JOIN pago/factura que calcularResumen pero filtrando `f.sesion_caja_id = ?` en vez de por `date(f.fecha_hora)`. Esto arregla de paso el bug de zona horaria: hoy calcularResumen compara date(fecha_hora) en UTC contra fechas locales, asi que en RD (UTC-4) toda venta despues de las 20:00 cae en el dia siguiente. El corte por sesion no usa fechas, usa el id del turno.
- `generarCorteX({ sesionId, usuarioId })`: exige sesion 'abierta'. Calcula resumen + totalesMovimientos y el efectivo esperado con calcularCorteCaja (efectivoContado = 0, diferencia = 0). Inserta una fila corte_caja con tipo='x', estado='abierto', secuencia = (cantidad de cortes X previos de esa sesion) + 1, sesion_id, caja_id y usuario_id de la sesion. NO toca sesion_caja. Bitacora accion 'corte_x' con usuarioId.
- `cerrarSesion({ sesionId, usuarioId, arqueo, motivoDiferencia?, autorizadoPorId?, notasCierre? })`: exige sesion 'abierta'; exige que no exista ya un corte tipo='z' para esa sesion (ValidacionError 'Este turno ya fue cerrado.'); valida el arqueo con validarArqueo del dominio; efectivoContado = calcularTotalArqueo(arqueo); lee negocio.umbral_diferencia_caja y llama evaluarDiferencia: si requiereAutorizacion y falta autorizadoPorId o motivoDiferencia, lanza ValidacionError (esta es la regla 'quien autoriza el descuadre' y vive AQUI, no en la pantalla).
  ORDEN DE ESCRITURA OBLIGATORIO, porque el SqlDriver NO tiene transacciones (packages/core/src/db/driver.ts: solo exec/run/all/get, y run() devuelve void): PRIMERO el INSERT del corte tipo='z' con arqueo_json = JSON.stringify(arqueo) y todos los totales; DESPUES, como ULTIMA escritura, un unico `UPDATE sesion_caja SET estado='cerrada', fecha_cierre=?, usuario_cierre_id=?, notas_cierre=?, updated_at=? WHERE id=? AND estado='abierta'`. Como run() no reporta filas afectadas, vuelve a leer la sesion y si no quedo 'cerrada' lanza. Si el proceso muere entre las dos escrituras, el turno sigue abierto y se puede reintentar: eso es aceptable, un turno a medio cerrar no lo es.
  Bitacora: 'cerrar_caja' con usuarioId siempre, y ademas 'autorizar_diferencia' con el autorizadoPorId cuando hubo autorizacion.
- `obtenerCorte(id)`, `listarCortesDeSesion(sesionId)`, `listarCortesZ(filtro?: { cajaId?; desde?; hasta? })` — estos dos ultimos son lo que consume la reimpresion.

EDITAS TAMBIEN packages/core/src/repos/reportes-repo.ts (imita el estilo de sus 5 consultas existentes, que devuelven interfaces planas): agrega `turnosPorPeriodo(desde, hasta)` (una fila por sesion cerrada: sesionId, caja, cajero, apertura, cierre, ventas, efectivo esperado, contado, diferencia) y `diferenciasPorCajero(desde, hasta)` (agrupado por usuario: turnos, suma de sobrantes, suma de faltantes, diferencia neta). Exporta los tipos nuevos en repos/index.ts.

NO TOQUES: factura-repo.ts, devolucion-repo.ts, migrations.ts, sesion-caja-repo.ts (solo lo consumes), dominio/caja.ts, ninguna pantalla ni componente de packages/ui. No implementes impresion (es CAJA-07). No agregues transacciones al driver.

Al terminar: `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde, con los 6 tests previos de corte-caja-repo.test.ts intactos.
```

#### Archivos a tocar

- `packages/core/src/repos/corte-caja-repo.ts`
- `packages/core/src/repos/reportes-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/test/corte-caja-repo.test.ts`
- `packages/core/test/reportes-repo.test.ts`

#### Criterios de aceptacion

- [ ] Los 6 tests previos de corte-caja-repo.test.ts pasan sin modificarse, incluido el que registra dos cortes del mismo periodo.
- [ ] registrarCorte sigue guardando y ahora marca tipo='reporte_rango'; el INSERT lee de vuelta con todas las columnas correctas (prueba de conteo de placeholders).
- [ ] generarCorteX no cambia el estado de la sesion y numera secuencia 1, 2, 3...
- [ ] cerrarSesion es idempotente-por-rechazo: el segundo intento sobre el mismo turno lanza ValidacionError y no escribe nada.
- [ ] El corte Z guarda el arqueo completo en arqueo_json y su total coincide con efectivo_contado.
- [ ] Con umbral 0 y diferencia distinta de cero, cerrarSesion sin autorizadoPorId/motivo lanza ValidacionError.
- [ ] Con autorizadoPorId y motivo, cierra y deja las dos filas de bitacora (cerrar_caja y autorizar_diferencia) con usuario_id no nulo.
- [ ] El efectivo esperado del Z incluye entradas, salidas y devoluciones del turno, no solo fondo + ventas.
- [ ] El calculo por sesion no depende de date(fecha_hora), asi que una venta a las 22:00 hora local cae en el turno correcto.
- [ ] turnosPorPeriodo y diferenciasPorCajero devuelven filas con el nombre de la caja y del cajero resueltos por JOIN.

#### Pruebas a escribir primero (TDD)

- corte-caja-repo.test.ts: 'calcularResumenSesion solo cuenta facturas de esa sesion' — dos sesiones con ventas distintas.
- corte-caja-repo.test.ts: 'calcularResumenSesion no se corre de dia con una venta nocturna' — factura con fecha_hora UTC que cae al dia siguiente en RD, igual entra al turno.
- corte-caja-repo.test.ts: 'generarCorteX deja la sesion abierta'.
- corte-caja-repo.test.ts: 'dos cortes X consecutivos numeran secuencia 1 y 2'.
- corte-caja-repo.test.ts: 'generarCorteX rechaza una sesion cerrada'.
- corte-caja-repo.test.ts: 'cerrarSesion guarda el arqueo en arqueo_json y el total coincide con efectivo_contado'.
- corte-caja-repo.test.ts: 'cerrarSesion pone la sesion en cerrada con fecha_cierre y usuario_cierre_id'.
- corte-caja-repo.test.ts: 'cerrarSesion dos veces lanza ValidacionError y no crea un segundo corte Z'.
- corte-caja-repo.test.ts: 'cerrarSesion con arqueo invalido (cantidad negativa) lanza antes de escribir nada'.
- corte-caja-repo.test.ts: 'cerrarSesion con diferencia y sin autorizador lanza ValidacionError' (umbral 0).
- corte-caja-repo.test.ts: 'cerrarSesion con diferencia, motivo y autorizador cierra y registra autorizar_diferencia en bitacora'.
- corte-caja-repo.test.ts: 'cerrarSesion con diferencia dentro del umbral no exige autorizacion' (umbral 100, diferencia -50).
- corte-caja-repo.test.ts: 'el efectivo esperado del Z descuenta una salida de caja' — fondo 1000, venta efectivo 2000, salida 500 -> esperado 2500.
- corte-caja-repo.test.ts: 'registrarCorte sigue funcionando y marca tipo reporte_rango' (ida y vuelta leyendo la fila insertada, para detectar desajuste entre COLS y los placeholders).
- corte-caja-repo.test.ts: 'listarCortesZ filtra por caja y rango'.
- reportes-repo.test.ts: 'turnosPorPeriodo devuelve un renglon por turno cerrado con nombre de caja y cajero'.
- reportes-repo.test.ts: 'turnosPorPeriodo excluye turnos abiertos'.
- reportes-repo.test.ts: 'diferenciasPorCajero suma sobrantes y faltantes por usuario'.

---

### CAJA-05 — Guardias de negocio: no se vende con la caja cerrada, la devolucion en efectivo sale de caja y la gaveta deja rastro

**Objetivo.** factura-repo impide abrir ticket y cobrar sin turno abierto y ata cada factura a su sesion, la devolucion en efectivo genera un movimiento de salida, y abrir la gaveta a peticion queda registrado en bitacora desde el core.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | alto — toca el camino critico de la venta y de la devolucion; un guardia mal puesto deja al colmado sin poder facturar | CAJA-01, CAJA-03 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm facturAI, en C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. TODO en espanol. TypeScript estricto sin `any`. SIN COMENTARIOS en el codigo. TDD con vitest: primero los tests, veelos fallar, luego implementa. Esta tarea es la que hace que la regla del cliente ('no se puede vender con la caja cerrada') exista de verdad: la validacion va en el REPO, nunca en la pantalla.

CONTEXTO YA HECHO: factura tiene la columna sesion_caja_id; devolucion tiene metodo_devolucion (DEFAULT 'efectivo'); negocio tiene exige_caja_abierta (0 en instalaciones viejas, 1 en nuevas); sesion-caja-repo.ts ya expone obtenerAbierta/obtenerPorId/registrarMovimiento.

1) packages/core/src/repos/factura-repo.ts
- `abrirTicket(input)` (:171-208): resuelve la sesion asi — si input trae sesionCajaId, esa; si no, la unica sesion abierta que haya; si hay mas de una abierta y no se indico cual, ValidacionError campo 'sesionCajaId'. Si `negocio.exige_caja_abierta = 1` y no hay ninguna sesion abierta, lanza ValidacionError campo 'caja' con mensaje 'No hay un turno de caja abierto.'. Si el flag esta en 0, sigue funcionando exactamente como hoy (sesion_caja_id null), para no romper las instalaciones existentes. Cuando si hay sesion, rellena sesion_caja_id, caja_id (de la sesion) y usuario_id.
  ATENCION: COLS_FACTURA y `Array(19).fill("?")` (:200) tienen que crecer a la vez al agregar sesion_caja_id. Si el numero no coincide con las columnas, el INSERT falla en runtime sin aviso del compilador.
- `cobrar(facturaId, input)` (:395-441): despues de validar estado y lineas y ANTES de escribir los pagos, si la factura tiene sesion_caja_id, verifica que esa sesion siga 'abierta'; si no, ValidacionError 'El turno de caja esta cerrado.'. Si la factura no tiene sesion (ticket viejo) y el flag exige_caja_abierta esta en 1, exige que haya una sesion abierta y atala.
- Deja intacto todo lo demas de cobrar (pagos, cambio, descuento de existencia, bitacora 'cobrar').

2) packages/core/src/repos/devolucion-repo.ts: acepta `metodoDevolucion` en el input (por defecto 'efectivo') y lo guarda. Cuando sea 'efectivo' y haya una sesion abierta, registra un movimiento con tipo 'devolucion', origenTipo 'devolucion', origenId = id de la devolucion y monto = total devuelto, llamando al sesion-caja-repo (crealo con `crearSesionCajaRepo(db)` dentro de la funcion, que es como este repo ya compone con otros). Si exige_caja_abierta=1 y no hay turno abierto, rechaza la devolucion en efectivo con ValidacionError. La validacion de que una salida no deje el efectivo en negativo ya vive en registrarMovimiento: no la dupliques, pero decide y documenta en el test que una devolucion SI puede dejar la caja corta (debe permitirse) o no — implementa que la devolucion es la excepcion permitida y pasa la bandera correspondiente.

3) packages/core/src/repos/sesion-caja-repo.ts: agrega `registrarAperturaGaveta({ sesionId?, usuarioId, motivo })`. Si exige_caja_abierta=1, exige sesion abierta (ValidacionError si no). Escribe bitacora accion 'abrir_gaveta' con usuarioId y el motivo en el resumen. Devuelve void. Es el guardia del lado de los datos para el boton de gaveta que construye CAJA-07: sin esto, ese boton seria solo UI.

NO TOQUES: migrations.ts, dominio/caja.ts, corte-caja-repo.ts, reportes-repo.ts, ninguna pantalla ni componente de packages/ui (la UI reacciona a estos errores en CAJA-06), packages/web, packages/desktop. No cambies el mensaje ni el tipo de los errores existentes de cobrar (hay tests que los afirman). No agregues transacciones al driver.

Al terminar: `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde. OJO: factura-repo.test.ts, inventario-factura-repo.test.ts y devolucion.test.ts existentes corren sobre bases recien migradas donde exige_caja_abierta valdra 1 salvo que el seed diga otra cosa — si alguno se rompe, la solucion correcta es que el test abra un turno primero (es el flujo real), no bajar el flag para silenciarlo; baja el flag solo en los tests que a proposito prueban el modo sin turno.
```

#### Archivos a tocar

- `packages/core/src/repos/factura-repo.ts`
- `packages/core/src/repos/devolucion-repo.ts`
- `packages/core/src/repos/sesion-caja-repo.ts`
- `packages/core/test/factura-repo.test.ts`
- `packages/core/test/devolucion.test.ts`
- `packages/core/test/sesion-caja-repo.test.ts`

#### Criterios de aceptacion

- [ ] Con exige_caja_abierta=1 y sin turno, abrirTicket lanza ValidacionError y NO inserta ninguna factura.
- [ ] Con exige_caja_abierta=1 y turno abierto, la factura queda con sesion_caja_id y caja_id llenos (no null).
- [ ] Con exige_caja_abierta=0 todo se comporta como antes de esta tarea (compatibilidad con instalaciones vivas).
- [ ] cobrar rechaza un ticket cuya sesion se cerro mientras el ticket estaba abierto, y no escribe pagos ni descuenta existencia.
- [ ] Una devolucion en efectivo crea exactamente un movimiento_caja tipo 'devolucion' con origen_id = id de la devolucion.
- [ ] Una devolucion que no es en efectivo no toca la caja.
- [ ] registrarAperturaGaveta escribe bitacora 'abrir_gaveta' con usuario_id y rechaza sin turno cuando el flag esta en 1.
- [ ] Ningun test previo se 'arregla' bajando el flag salvo los que prueban a proposito el modo sin turno.
- [ ] pnpm --filter @sfr/core test y pnpm typecheck en verde.

#### Pruebas a escribir primero (TDD)

- factura-repo.test.ts: 'sin turno abierto y con el flag activo, abrirTicket lanza y no crea factura' (assert de COUNT(*)=0).
- factura-repo.test.ts: 'con turno abierto, la factura guarda sesion_caja_id y caja_id'.
- factura-repo.test.ts: 'con el flag apagado, abrirTicket sigue funcionando sin sesion'.
- factura-repo.test.ts: 'con dos turnos abiertos en cajas distintas y sin indicar cual, abrirTicket exige sesionCajaId'.
- factura-repo.test.ts: 'cobrar falla si el turno se cerro despues de abrir el ticket' y no quedan filas en pago.
- factura-repo.test.ts: 'cobrar con turno abierto sigue registrando pagos, cambio y bitacora como antes'.
- factura-repo.test.ts: 'ida y vuelta del INSERT de factura con la columna nueva' (detecta desajuste COLS/placeholders).
- devolucion.test.ts: 'una devolucion en efectivo genera movimiento_caja tipo devolucion por el monto devuelto'.
- devolucion.test.ts: 'una devolucion por otro metodo no genera movimiento de caja'.
- devolucion.test.ts: 'con flag activo y sin turno, la devolucion en efectivo se rechaza'.
- devolucion.test.ts: 'el efectivo esperado del turno baja tras una devolucion en efectivo' (integrado con totalesMovimientos).
- sesion-caja-repo.test.ts: 'registrarAperturaGaveta deja fila en bitacora con accion abrir_gaveta y usuario_id'.
- sesion-caja-repo.test.ts: 'registrarAperturaGaveta sin turno abierto y flag activo lanza ValidacionError'.

---

### CAJA-06 — Pantalla Caja: apertura de turno, movimientos, arqueo por denominacion y cierre

**Objetivo.** El cajero abre y cierra su turno, registra entradas y salidas de efectivo, cuenta billetes y monedas en una rejilla y ve el corte X, todo desde una pantalla mobile-first que reemplaza a la actual 'Corte de caja' sin remapear los atajos.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | medio — sustituye una pantalla existente y toca el array de modulos del AppShell, del que dependen los atajos globales | CAJA-03, CAJA-04, RBAC-01 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Pantalla nueva con tres pestanas, MAS mudanza del contenido completo de la pantalla vieja CorteCaja.tsx sin cambiarle el comportamiento, MAS el modal de arqueo con rejilla de 10 denominaciones y logica de arqueo ciego, MAS el renombrado del modulo en AppShell, MAS el borrado de la pantalla anterior previa confirmacion. La mudanza sin regresion de la pestana 'Reporte por rango' es por si sola una tarea con su propia verificacion (tiene exportacion CSV atada a Ctrl+E y la usa el dueno para cerrar el mes).
>   **Arreglo.** (A) crear Caja.tsx con la pestana Turno (apertura, movimientos, corte X) y el renombrado en el registro de modulos; (B) mudar el reporte por rango verificando cifra a cifra contra la pantalla vieja, y recien entonces borrar CorteCaja.tsx; (C) arqueo y cierre con autorizacion de diferencia.

#### Brief para el agente

```text
Trabajas en el monorepo pnpm facturAI, en C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. TODO en espanol. TypeScript estricto sin `any`. SIN COMENTARIOS en el codigo. Esta es una tarea de UI: NO metas reglas de negocio aqui — todas las validaciones ya viven en core (sesion-caja-repo, corte-caja-repo) y esta pantalla solo muestra sus ValidacionError. Si te falta una regla, se agrega en core con su test, no en el componente.

ANTES DE ESCRIBIR UNA LINEA: lee C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale/design-guidelines.md (es el DESIGN.md del proyecto bajo otro nombre; no existe ningun archivo DESIGN.md). Obligatorio: §2 Color, §4 Forma y espacio, §5 Componentes y Dialogos, §6 Layout y responsive, §7 Teclado, §12 Checklist para una pantalla nueva. No inventes tokens ni colores: todo sale de packages/ui/src/estilos.ts (`s`, `c`, `money`).

QUE CONSTRUIR: packages/ui/src/pantallas/Caja.tsx, que sustituye a packages/ui/src/pantallas/CorteCaja.tsx. En packages/ui/src/AppShell.tsx RENOMBRA la entrada 'Corte de caja' por 'Caja' EN EL MISMO INDICE del array MODULOS (:28-31) y actualiza el tipo `Modulo` y el mapa ICONO. NO agregues un modulo nuevo: los atajos Alt+1..Alt+9 se derivan del indice del array (AppShell.tsx:64-66) y agregar uno remapearia los atajos que el cajero ya tiene memorizados.

ESTRUCTURA de la pantalla, en tres pestanas: (a) Turno, (b) Historial de cortes, (c) Reporte por rango. La (c) es el contenido actual de CorteCaja.tsx movido tal cual (calcularResumen + registrarCorte), sin cambiarle el comportamiento: es el reporte del dueno de toda la vida y hay instalaciones que lo usan.

Pestana Turno, dos estados:
- SIN turno abierto: tarjeta con selector de caja (repos.caja.listarActivas()), selector de usuario, campo Fondo inicial (usa `filtrarNumero` de ../utilidades/numero.js e inputMode='decimal', como hace CorteCaja.tsx:90) y boton 'Abrir turno' -> repos.sesionCaja.abrir(). Todo lo demas de la pestana queda deshabilitado con un aviso claro, no oculto.
- CON turno abierto: cabecera con caja, cajero, hora de apertura y fondo; resumen en vivo (ventas, desglose por metodo, entradas, salidas, efectivo esperado); lista de movimientos; boton 'Movimiento de efectivo' que abre un dialogo con tipo (entrada, sacada, pago a proveedor, propina, vale), monto, motivo y referencia; boton 'Corte X' que llama generarCorteX y muestra el resultado sin cerrar; boton 'Cerrar turno' que abre el arqueo.

ARQUEO: dialogo con una fila por denominacion de `DENOMINACIONES_RD` (importado de @sfr/core, 6 billetes y 4 monedas), cada una con un input de cantidad (entero, mismo filtro de numeros) y su subtotal, mas el total contado. Si `negocio.arqueo_ciego` esta en 1, NO muestres el efectivo esperado ni la diferencia hasta que el usuario confirme el conteo; despues muestra esperado, contado y diferencia, y si la diferencia exige autorizacion pide motivo y autorizador antes de dejar confirmar. El error que devuelva cerrarSesion se muestra tal cual: el guardia real esta en core.

PATRONES A IMITAR: los dialogos se hacen con el contexto `Alertas` (packages/ui/src/contexto/Alertas.tsx:42-47, confirmar/avisar/elegir) — no montes un modal nuevo. El responsive sale de `useBreakpoint` (packages/ui/src/hooks/useBreakpoint.js); PROHIBIDO un `gridTemplateColumns: '1fr 1fr'` fijo como el de CorteCaja.tsx:104. Mobile-first: una columna a 375px, dos a partir del tramo que marque design-guidelines §6. Objetivos tactiles >= 44px. Iconos de lucide-react, jamas emojis. Atajos: sigue §7 y no pises los globales.

NO TOQUES: nada de packages/core (si necesitas una consulta nueva, es senal de que falta una tarea, reportalo en vez de meter SQL en la pantalla), packages/ui/src/impresion/ (la impresion del corte es CAJA-07), packages/ui/src/pantallas/Ventas.tsx, packages/ui/src/pantallas/Reportes.tsx, packages/ui/src/componentes/SeccionImpresoraTermica.tsx. Borra CorteCaja.tsx solo despues de que Caja.tsx cubra sus tres funciones, y confirma antes de borrar (regla de hooks del proyecto).

Al terminar: `pnpm typecheck` en verde y `pnpm --filter @sfr/core test` sin cambios. Verifica a mano a 375px, 768px y 1440px.
```

#### Archivos a tocar

- `packages/ui/src/pantallas/Caja.tsx`
- `packages/ui/src/pantallas/CorteCaja.tsx`
- `packages/ui/src/AppShell.tsx`
- `packages/ui/src/index.ts`
- `design-guidelines.md`

#### Criterios de aceptacion

- [ ] 'Caja' ocupa el mismo indice que ocupaba 'Corte de caja': Alt+6 sigue llevando al mismo sitio y ningun otro atajo cambia.
- [ ] Con la caja cerrada, la pantalla ofrece abrir turno y explica por que no se puede vender; no hay ningun boton que finja funcionar.
- [ ] Abrir turno con datos invalidos muestra el mensaje del ValidacionError de core, no un texto inventado en la pantalla.
- [ ] La rejilla de arqueo lista las 10 denominaciones y su total coincide con lo que calcula el core.
- [ ] Con arqueo_ciego=1 el esperado y la diferencia no son visibles antes de confirmar el conteo.
- [ ] Una diferencia que exige autorizacion no deja cerrar sin motivo y autorizador (y el intento igual seria rechazado por core).
- [ ] La pestana 'Reporte por rango' se comporta exactamente como la pantalla vieja.
- [ ] Cero logica de negocio nueva en el componente: ninguna condicion que decida si algo es valido sin preguntarle a un repo.
- [ ] Sin scroll horizontal a 375px y objetivos tactiles >= 44px a 375 / 768 / 1440.
- [ ] pnpm typecheck en verde; los tests de core sin tocar.

#### Pruebas a escribir primero (TDD)

- Manual 375px: con turno cerrado, abrir turno eligiendo caja y cajero con fondo 2000 y verificar que la cabecera muestra caja, cajero, hora y fondo.
- Manual 375px: intentar abrir un segundo turno en la misma caja desde otra ventana y ver el mensaje de core, no un crash.
- Manual: registrar una sacada de 500 con motivo y verificar que baja el efectivo esperado en el resumen en vivo.
- Manual: registrar una sacada mayor al efectivo disponible y ver el rechazo del repo.
- Manual: pedir Corte X dos veces y verificar que el turno sigue abierto y la secuencia avanza.
- Manual: cerrar turno con arqueo exacto (diferencia 0) y verificar que la pestana Historial muestra el corte Z.
- Manual: cerrar turno con faltante y verificar que exige motivo y autorizador antes de permitir confirmar.
- Manual: con arqueo_ciego activo, comprobar que el esperado no aparece hasta confirmar el conteo.
- Manual 768px y 1440px: sin scroll horizontal, sin la rejilla 1fr 1fr fija, dialogos accesibles por teclado (Tab/Esc).
- Manual: la pestana Reporte por rango produce los mismos numeros que la pantalla anterior para el mismo rango.
- Si aparece cualquier funcion con logica (por ejemplo, decidir si una diferencia exige autorizacion), moverla a packages/core/src/dominio/caja.ts y cubrirla con vitest alli — packages/ui no tiene runner de tests.

---

### CAJA-07 — Comprobante impreso del corte X/Z con reimpresion, gaveta a peticion con rastro y turnos en el reporte del dueno

**Objetivo.** Todo corte X o Z se imprime en la termica y se puede reimprimir desde el historial, el cajero puede abrir la gaveta a peticion quedando en bitacora, y el dueno ve turnos y descuadres por cajero en Reportes.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio — cambia una firma usada en el camino del cobro y toca dos pantallas vivas; el riesgo real es que un fallo de impresion bloquee la venta | CAJA-04, CAJA-05, CAJA-06 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Cuatro cosas distintas bajo un titulo: funcion pura de armado del comprobante en core con sus tests, render ESC/POS en ui, reimpresion en la pantalla Caja, CAMBIO DE FIRMA de abrirGavetaTermica con actualizacion de sus dos llamadores (uno de ellos en el camino del cobro de Ventas.tsx) mas un boton nuevo de gaveta, y ademas una seccion nueva de turnos en la pantalla Reportes. Tocar una firma del camino del cobro dentro de una tarea de impresion es como se rompe una venta sin que nadie lo relacione.
>   **Arreglo.** (A) comprobante en core + render ESC/POS + reimpresion; (B) firma de abrirGavetaTermica, sus dos llamadores y el boton con rastro en bitacora, con la prueba explicita de que cobrar sigue funcionando con la impresora apagada; (C) seccion de turnos en Reportes.

#### Brief para el agente

```text
Trabajas en el monorepo pnpm facturAI, en C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. TODO en espanol. TypeScript estricto sin `any`. SIN COMENTARIOS en el codigo. TDD: la parte testeable de esta tarea va en core con vitest (packages/ui NO tiene runner de tests, solo typecheck).

1) ARMADO DEL COMPROBANTE (core, con tests). Crea packages/core/src/dominio/comprobante-corte.ts con `construirComprobanteCorte(datos): LineaComprobante[]`, funcion PURA que recibe los datos del corte (negocio, caja, cajero, tipo X o Z, secuencia, apertura/cierre, ventas, desglose por metodo, entradas, salidas, devoluciones, esperado, contado, diferencia, arqueo, autorizador) y devuelve las lineas del papel como datos: `{ texto: string; enfasis?: 'normal' | 'negrita' | 'titulo'; alineacion?: 'izquierda' | 'centro'; columnas?: [string, string] }`. Aqui va toda la logica que merece test: el encabezado X vs Z, el desglose del arqueo solo cuando existe, la linea de autorizacion solo cuando hubo diferencia autorizada, el formato de montos con `redondear2` y el ancho segun negocio.ancho_impresora_default (58 u 80 columnas).

2) RENDER ESC/POS (ui). Crea packages/ui/src/impresion/corte.ts que traduce esas lineas a bytes con `ConstructorEscPos` (packages/ui/src/impresion/escpos.ts:41-127) exactamente como hace `generarEscPos`, y expone `imprimirCorte(datos)` siguiendo la cadena de 3 niveles de packages/ui/src/impresion/recibo.ts:11-25 (termica ESC/POS -> texto GDI -> window.print). No dupliques el constructor ni la cadena: reutilizalos.

3) REIMPRESION (ui). En la pestana Historial de packages/ui/src/pantallas/Caja.tsx, cada corte lleva un boton 'Reimprimir' que carga el corte con repos.corteCaja.obtenerCorte(id), deserializa arqueo_json y llama imprimirCorte. Imita el patron de `reimprimirUltimo()` en packages/ui/src/pantallas/Ventas.tsx:1043-1060.

4) GAVETA A PETICION. Cambia la firma de `abrirGavetaTermica()` en packages/ui/src/impresion/termica.ts:76-83 para que devuelva `{ ok: boolean; motivo?: 'sin-hardware' | 'sin-impresora' | 'error' }` en vez de tragarse todo en silencio (hoy el `return` mudo de la linea 77 confunde 'no hay hardware' con 'fallo de verdad'). Actualiza sus DOS llamadores: packages/ui/src/pantallas/Ventas.tsx:997 (apertura automatica al cobrar: sigue siendo silenciosa, NO bloquea el cobro y NO escribe bitacora propia, porque la accion 'cobrar' ya explica esa apertura) y packages/ui/src/componentes/SeccionImpresoraTermica.tsx:94-96. Agrega en Ventas.tsx un boton 'Abrir gaveta' visible solo cuando `hayImpresoraTermicaDisponible()` (en la PWA no existe hardware: degrada devolviendo null, como ya hace SeccionImpresoraTermica.tsx:44). Ese boton DEBE llamar primero a repos.sesionCaja.registrarAperturaGaveta({ usuarioId, motivo }) — que es el guardia del lado de los datos, exige turno abierto y escribe bitacora 'abrir_gaveta' — y solo si eso no lanza, pulsar la gaveta. El mismo guardia aplica al boton de Configuracion.

5) TURNOS EN EL REPORTE DEL DUENO. En packages/ui/src/pantallas/Reportes.tsx (que hoy solo llama a las 5 consultas de ventas, :47-51) agrega una seccion 'Turnos de caja' que consuma repos.reportes.turnosPorPeriodo y diferenciasPorCajero: una tabla de turnos (caja, cajero, apertura, cierre, ventas, esperado, contado, diferencia) y otra de descuadres por cajero. Sigue el estilo tabular existente de la pantalla y los tokens de design-guidelines.md; sin graficas nuevas.

NO TOQUES: packages/core/src/repos/* (ya tienen todo lo que necesitas: obtenerCorte, listarCortesZ, turnosPorPeriodo, diferenciasPorCajero, registrarAperturaGaveta), migrations.ts, la logica de cobro de Ventas.tsx mas alla de la linea de la gaveta y el boton nuevo, y la estructura de pestanas de Caja.tsx (solo agregas el boton de reimpresion).

Al terminar: `pnpm --filter @sfr/core test` y `pnpm typecheck` en verde. Prueba a mano en escritorio (Tauri) con impresora termica y en la PWA, donde los botones de gaveta no deben aparecer.
```

#### Archivos a tocar

- `packages/core/src/dominio/comprobante-corte.ts`
- `packages/core/test/comprobante-corte.test.ts`
- `packages/core/src/index.ts`
- `packages/ui/src/impresion/corte.ts`
- `packages/ui/src/impresion/termica.ts`
- `packages/ui/src/pantallas/Ventas.tsx`
- `packages/ui/src/pantallas/Caja.tsx`
- `packages/ui/src/pantallas/Reportes.tsx`
- `packages/ui/src/componentes/SeccionImpresoraTermica.tsx`

#### Criterios de aceptacion

- [ ] El comprobante distingue visiblemente CORTE X (parcial, no cierra) de CORTE Z (cierre de turno) e incluye caja, cajero, apertura y cierre.
- [ ] El Z imprime el desglose del arqueo por denominacion y, si hubo diferencia autorizada, quien la autorizo y el motivo.
- [ ] construirComprobanteCorte es pura, esta en core y tiene tests; packages/ui solo traduce a bytes.
- [ ] Reimprimir un corte viejo del historial produce el mismo papel que la impresion original.
- [ ] abrirGavetaTermica devuelve un resultado tipado y sus dos llamadores lo manejan; el cobro sigue sin bloquearse si no hay gaveta.
- [ ] El boton 'Abrir gaveta' no aparece en la PWA y, en escritorio, no pulsa nada si registrarAperturaGaveta lanza.
- [ ] Cada apertura a peticion deja una fila en bitacora_accion con accion 'abrir_gaveta' y usuario_id no nulo; la apertura automatica del cobro no duplica filas.
- [ ] Reportes muestra turnos y descuadres por cajero, con el mismo estilo tabular de la pantalla.
- [ ] pnpm --filter @sfr/core test y pnpm typecheck en verde.

#### Pruebas a escribir primero (TDD)

- comprobante-corte.test.ts: 'el encabezado dice CORTE X y su secuencia cuando el tipo es x'.
- comprobante-corte.test.ts: 'el encabezado dice CORTE Z y muestra la hora de cierre cuando el tipo es z'.
- comprobante-corte.test.ts: 'el corte X no imprime seccion de arqueo ni diferencia'.
- comprobante-corte.test.ts: 'el corte Z imprime una linea por denominacion contada y omite las de cantidad 0'.
- comprobante-corte.test.ts: 'el desglose por metodo de pago sale completo aunque algun metodo sea 0'.
- comprobante-corte.test.ts: 'imprime entradas, salidas y devoluciones en efectivo del turno'.
- comprobante-corte.test.ts: 'la linea de autorizacion solo aparece cuando hubo diferencia autorizada'.
- comprobante-corte.test.ts: 'un faltante se rotula FALTANTE y un sobrante SOBRANTE'.
- comprobante-corte.test.ts: 'ninguna linea excede el ancho de 58 columnas cuando el negocio usa 58'.
- comprobante-corte.test.ts: 'los montos salen con 2 decimales y separador consistente'.
- Manual escritorio: sacar un corte X con la termica conectada y comprobar que sale papel y el turno sigue abierto.
- Manual escritorio: cerrar turno con arqueo y comparar el papel del Z contra la reimpresion desde el historial.
- Manual escritorio: pulsar 'Abrir gaveta' con turno abierto (abre y queda en bitacora) y con turno cerrado (rechaza con mensaje, no abre).
- Manual PWA: los botones de gaveta no se renderizan y nada lanza en consola.
- Manual: cobrar en efectivo sigue abriendo la gaveta y sigue cobrando si la impresora esta apagada.
- Manual: la seccion Turnos de Reportes muestra el turno recien cerrado con su diferencia.

---

### CAJA-08 — Verificacion y declaracion de compatibilidad de hardware

**Objetivo.** Responder por escrito, con pruebas hechas contra equipos reales, la pregunta del punto 8: que hardware de caja registradora maneja la app, que no, y que hace cuando el equipo falla.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo en codigo, alto en supuestos — es la tarea que evita que el cliente compre hardware que no funciona | CAJA-07 |

> [!WARNING]
> **Esta tarea la anadieron los revisores.** Tu punto 8 dice *"confirmar"*, que es una pregunta, no
> una funcionalidad — y ninguna tarea producia la confirmacion. El area de Caja entrega gestion
> administrativa del efectivo (turno, arqueo, corte X/Z), que no es lo mismo que manejar el
> hardware. Hay tres limitaciones duras ya visibles en el codigo que tienes derecho a conocer
> **antes** de comprar equipos.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale.

ESTA TAREA ES, EN SU MAYOR PARTE, VERIFICACION CON HARDWARE REAL Y UN DOCUMENTO. No es una tarea
de codigo. SI NO TIENES EL HARDWARE DELANTE, NO LA MARQUES COMO HECHA: dila como bloqueada y di
que falta. Un "deberia funcionar" aqui es exactamente lo que el cliente pidio evitar.

QUE PROBAR, anotando el modelo exacto de cada equipo:

1. Impresora termica ESC/POS, en 80 mm Y en 58 mm (el ancho sale de
   negocio.ancho_impresora_default, migrations.ts:39). Imprime: un recibo de venta, un corte X y
   un corte Z. Verifica que las columnas justificadas del ConstructorEscPos (escpos.ts:41-127) no
   se desbordan en 58 mm, que es el ancho donde se rompen las tablas.

2. Gaveta conectada por RJ11 a la impresora:
   - apertura automatica al cobrar con algun pago en efectivo (Ventas.tsx:997)
   - apertura a peticion desde el boton de Configuracion (SeccionImpresoraTermica.tsx:94-96)
   - y, tras CAJA-07, la apertura a peticion desde Ventas con su registro en bitacora

3. LECTOR DE CODIGO DE BARRAS en modo teclado. Esta es la prueba que mas probablemente encuentre
   un problema y la que nadie habia planteado. La app escucha atajos globales: Alt+1..Alt+9 para
   los modulos (AppShell.tsx:64-66) y teclas de funcion en Ventas. Un lector que emita un prefijo,
   un sufijo Enter o un Tab puede disparar un atajo o mover el foco a media venta. Prueba
   explicitamente:
   - escanear con el foco DENTRO del buscador de productos (caso normal)
   - escanear con el foco FUERA del buscador, por ejemplo tras cobrar (caso que rompe)
   - escanear un codigo que contenga digitos al principio, por si el lector emite modificadores
   Si algo se rompe, documenta el sintoma exacto antes de arreglarlo.

4. Solo si el cliente los usa: bascula y visor de cliente. Hoy NO hay ni una mencion de ninguno de
   los dos en todo el repositorio (comprobado por grep). Si hacen falta, es otro proyecto con otro
   presupuesto, y hay que decirlo ahora, no al final.

LIMITES QUE EL DOCUMENTO TIENE QUE DECLARAR, ya verificados en el codigo — no los descubras otra
vez, confirmalos y escribelos:
  - La gaveta se abre con el pulso ESC p al conector RJ11 DE LA IMPRESORA (escpos.ts:110-112 y
    242-244). Una gaveta USB independiente NO esta soportada, y SIN impresora termica NO HAY
    GAVETA. Si el cliente compra una gaveta suelta USB, no va a funcionar.
  - El adaptador termico solo existe en escritorio: en la PWA hayImpresoraTermicaDisponible()
    (termica.ts:21-23) es false porque nadie llama configurarAdaptadorImpresora ahi. En navegador
    NO hay impresion termica ni gaveta en absoluto; se cae al recibo imprimible del navegador.
    Si el cliente piensa usar una tableta como caja, esto lo cambia todo.
  - abrirGavetaTermica() se traga los errores (termica.ts:80-82) y EL COBRO NO SE BLOQUEA si el
    hardware falla. Eso es correcto y deliberado: el negocio sigue vendiendo con la impresora
    caida. Dejalo por escrito, porque es una decision de diseno que el dueno debe conocer.

ENTREGABLE: HARDWARE.md en la raiz del repositorio, con:
  - tabla de modelos probados, con fecha de la prueba y quien la hizo
  - como se conecta cada uno
  - que NO esta soportado, con las tres limitaciones de arriba en lenguaje llano
  - que hace la app cuando cada equipo falla
Este documento se le entrega al cliente como respuesta al punto 8.

UNICO CAMBIO DE CODIGO ADMISIBLE: si el lector de codigo de barras rompe un atajo, arreglarlo en
useAtajosTeclado. NO lo arregles preventivamente ni refactorices el manejo de teclado "por si
acaso": primero reproduce el fallo con el lector real, documentalo, y despues arreglalo.

NO TOQUES: ningun repo de core, ninguna migracion, ninguna pantalla que no sea la del sintoma.
```

#### Archivos a tocar

- `HARDWARE.md` (nuevo, en la raiz)
- `packages/ui/src/hooks/useAtajosTeclado.ts` (**solo** si el lector reproduce un fallo real)

#### Criterios de aceptacion

- [ ] `HARDWARE.md` existe y nombra modelos concretos con fecha de prueba, no categorias genericas
- [ ] Declara por escrito las tres limitaciones: gaveta solo por RJ11 de la impresora, nada de hardware desde la PWA, y el cobro no se bloquea si el hardware falla
- [ ] El recibo y los cortes X y Z se imprimieron de verdad en 58 mm **y** en 80 mm, sin desbordes
- [ ] El lector de codigo de barras se probo con el foco dentro y fuera del buscador, y el resultado esta anotado
- [ ] Si algun equipo no se pudo probar, el documento lo dice como **no verificado**, no lo omite
- [ ] Ningun cambio de codigo salvo un fallo reproducido y documentado

#### Pruebas a escribir primero (TDD)

- No aplica en el sentido habitual: el entregable es verificacion manual firmada y un documento
- Si el lector rompe un atajo: un test de `useAtajosTeclado` que reproduzca la secuencia de teclas del lector (prefijo, digitos, sufijo) y afirme que **no** se dispara ningun atajo de modulo
- Si se toca `ConstructorEscPos` por un desborde en 58 mm: un test de la funcion pura de columnas que afirme que ninguna linea supera el ancho

---

