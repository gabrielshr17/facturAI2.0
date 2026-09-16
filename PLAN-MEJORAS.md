# facturAI — plan de modificaciones y nuevas funciones

Plan de trabajo para las ocho peticiones del cliente, dividido en tareas que se pueden
despachar a agentes distintos. Salio de una auditoria del codigo real: ocho agentes leyeron
el repositorio por area, ocho lo descompusieron en tareas, uno lo ordeno y dos lo atacaron
buscando huecos. Lo que sigue ya incorpora esas correcciones.

## Como usar este plan

1. Lee las **decisiones ya tomadas** de la seccion 3 — las ocho bloqueantes estan respondidas y
   cada una trae su consecuencia sobre las tareas.
2. Todo agente lee **[plan/00-CONVENCIONES.md](./plan/00-CONVENCIONES.md)** antes de tocar nada.
   Para ejecutar, sigue **[plan/COMO-EJECUTAR.md](./plan/COMO-EJECUTAR.md)**, que trae el prompt de
   arranque listo para pegar en una sesion nueva.
3. Despacha por **olas** (seccion 5). Dentro de una ola las tareas corren en paralelo; entre
   olas hay que esperar al criterio de salida.
4. Cada tarea tiene un brief copiable y pegable en el archivo de su area.

| Area | Punto del pedido | Tareas | Archivo |
| --- | --- | --- | --- |
| Plataforma transversal | base de los 8 | 8 | [`plan/01-PLATAFORMA.md`](./plan/01-PLATAFORMA.md) |
| Usuarios, roles y permisos | 3 | 10 | [`plan/02-RBAC.md`](./plan/02-RBAC.md) |
| Tres niveles de precio | 5 | 7 | [`plan/03-PRECIOS.md`](./plan/03-PRECIOS.md) |
| Caja registradora | 8 | 8 | [`plan/04-CAJA.md`](./plan/04-CAJA.md) |
| Compras ampliado | 4 | 8 | [`plan/05-COMPRAS.md`](./plan/05-COMPRAS.md) |
| CRM sobre Clientes | 1 | 7 | [`plan/06-CRM.md`](./plan/06-CRM.md) |
| Backoffice y panel | 2 y 6 | 8 | [`plan/07-BACKOFFICE.md`](./plan/07-BACKOFFICE.md) |
| Multiples cajas | 7 | 7 | [`plan/08-MULTICAJA.md`](./plan/08-MULTICAJA.md) |

## 1. Que hay hoy, verificado en el codigo

Antes de planificar nada conviene saber que lo que parece existir, no existe. Todo lo que
sigue esta comprobado con ruta y linea.

**No existe nada de identidad.** La tabla `usuario` esta ahi desde la primera migracion, con
`rol`, `pin_hash` y `permisos_json`, pero **no hay `usuario-repo.ts`, ni login, ni sesion, ni
una sola comprobacion de permisos en todo el repositorio**. La columna `usuario_id` se acepta
como parametro opcional en cuatro repos y **siempre llega `null`**, porque la interfaz nunca la
pasa. Hoy la bitacora de auditoria no puede responder quien hizo cada cosa.

**La tabla `caja` existe y esta muerta.** No hay `caja-repo.ts`, la interfaz nunca elige una
caja y `factura.caja_id` siempre es `null`. El punto 7 arranca de cero tambien del lado del
cliente, no solo en la sincronizacion.

**`corte_caja` no es una sesion de caja: es un reporte de rango de fechas.** `fecha_apertura`
y `fecha_cierre` son dos fechas `yyyy-mm-dd` del periodo consultado, y el estado nace
`'cerrado'`. No hay apertura de turno, ni entradas y salidas de efectivo, ni arqueo por
denominacion. La respuesta honesta al punto 8, tal como esta la app hoy, es **no**.

**Las cuentas por cobrar son un dato muerto.** `saldo_credito` se escribe como `0` al crear el
cliente y **no se actualiza en ningun otro sitio del codigo**. Una venta con metodo `credito`
deja una fila en `pago`, marca la factura como cobrada y no deja rastro de quien debe.
`limite_credito` no se valida nunca.

**El dia del negocio esta mal calculado.** `factura.fecha_hora` se guarda en UTC
(`new Date().toISOString()`) y todas las consultas comparan con `date(fecha_hora)`, que SQLite
interpreta como UTC — pero la interfaz calcula "hoy" en fecha local. En Republica Dominicana
(UTC−4) **toda venta despues de las 8:00 pm cae en el dia UTC siguiente**. El panel del dueno
mostraria "vendido hoy" sin las ventas de la noche. Este bug ya esta en produccion en la
pantalla de Reportes; el punto 6 lo haria visible.

**No hay umbral de existencia minima** en ninguna tabla, y `producto.existencia` es `NULL` por
defecto porque el inventario viene apagado de fabrica. Una tarjeta de "mercancia con existencia
baja" mostraria "0 productos" y seria mentira.

**La suite recursiva esta roja antes de empezar.** `pnpm -r test` falla hoy, con el
repositorio limpio: `packages/api` declara un script `test` y no tiene ni un archivo de prueba, asi
que vitest sale con codigo 1 y tumba la corrida entera. `@sfr/core` si esta verde (18 archivos, 144
pruebas). Importa porque *"suite en verde"* es criterio de aceptacion de las 63 tareas: sin
arreglarlo, ninguna se puede dar por terminada. Es una linea, y la arregla PLATAFORMA-01.

### Lo que si esta hecho y no hay que rehacer

- Compras **ya tiene** campo de proveedor con busqueda y alta al vuelo, y hasta un analizador
  de comprobantes con IA. El punto 4 es completar, no construir.
- El producto **ya tiene** `precio_mayoreo`. El punto 5 es anadir el precio 2 y la asignacion
  por cliente, no rehacer el sistema de precios.
- La impresora termica **ya emite el pulso de apertura de gaveta** (`escpos.ts:111`).
- Registrar compras, ajustar inventario y configurar el negocio **ya funcionan**. El backoffice
  es una pantalla de inicio y unos agregados nuevos, no reconstruir la gestion.

## 2. Veredicto honesto sobre el alcance

Dos revisores independientes atacaron el borrador. La columna "Se entrega" ya refleja las
decisiones tomadas en la seccion 3 y las cinco tareas anadidas en la seccion 4.

| Punto | Se entrega | Matiz |
| --- | --- | --- |
| 1. CRM | Si | Incluye cuentas por cobrar reales, que hoy no existen |
| 2. Backoffice | Si | |
| 3. Cuatro roles | Si | `RBAC-08` da soporte; `RBAC-09` actualiza la app y `RBAC-10` la configura en remoto — las dos mitades de "modificar la app" |
| 4. Compras | Si | "Cantidad recibida" solo mueve existencia con el inventario encendido: lo resuelve `COMPRAS-08` |
| 5. Tres precios | Si | |
| 6. Panel del dueno | Si | "Cualquier otra recomendacion" la entrega `BACKOFFICE-08`; "existencia baja" depende de `COMPRAS-08` |
| 7. Varias cajas a la vez | Si | **Decidido: se mantiene en alcance** (decision 8). MULTICAJA-01..06 hacen que compartir sea seguro; `MULTICAJA-07` es lo que de verdad las conecta, y es la parte mas cara y mas riesgosa de la tanda |
| 8. Manejo de caja registradora | Si | Gestion del efectivo (turno, arqueo, corte X/Z) mas `CAJA-08`, que **confirma** el hardware y declara por escrito lo que no esta soportado |

Con las siete tareas anadidas y las nueve decisiones tomadas, **los ocho puntos se entregan**.
Queda una sola cosa que no depende de escribir codigo: que tu contable confirme por escrito que
acepta numeros de NCF salteados (decision 1).

> **Limite que hay que decir por escrito.** El login con PIN es **control de disciplina y
> auditoria, no una barrera de seguridad**. La base vive en IndexedDB del navegador (legible
> desde las herramientas de desarrollo) o en un archivo SQLite local sin cifrar, y el backend
> que existe deja pasar todo sin validar. Sirve para saber quien hizo que y para evitar errores
> y tentaciones del personal; no frena a alguien con acceso al equipo.

## 3. Decisiones tomadas

Las nueve estan respondidas. Cada una lleva la consecuencia concreta sobre las tareas, para que
ningun agente tenga que volver a preguntarlo.

### 1. NCF con varias cajas — **rangos disjuntos por caja**

Cada caja recibe su propia porcion de la secuencia autorizada, y el repo valida que sea imposible
crear dos rangos que se solapen. Cada caja sigue facturando aunque se caiga la red, que es lo que
el codigo ya asume: `cobrarConFiscal` aborta el cobro entero si no hay conexion, y el NCF ya se
consumio unas lineas antes.

> **Pendiente de terceros.** El contable tiene que confirmar **por escrito** que acepta numeros
> salteados dentro de la secuencia autorizada. Si dice que no, hay que pedir a la DGII una
> secuencia por caja **antes** de instalar la segunda. Esto no bloquea el desarrollo, pero si la
> instalacion.

**Consecuencia:** MULTICAJA-04 se implementa con rangos disjuntos validados y consumo atomico en un
solo statement. Hoy es leer-luego-escribir, asi que dos cajas emiten el **mismo NCF con certeza
matematica**, no por carrera.

### 2. Numero de factura — **prefijo solo cuando hay caja asignada**

Una instalacion que nunca elija caja sigue imprimiendo exactamente como hoy. Al asignar cajas, la
numeracion pasa a ser por caja (`C1-000123`) para que sobreviva a un corte de red.

Esto es el **numero interno**, no el NCF: el NCF no lleva prefijo y no cambia.

**Consecuencia:** MULTICAJA-01 y MULTICAJA-03. Y el backfill que senalo el revisor: al asignar caja
por primera vez hay que rellenar `factura.caja_id` de las facturas historicas (que hoy lo tienen en
NULL) y arrancar la numeracion en el maximo global + 1 — si no, la caja empieza en 1 y el negocio
acaba con dos tickets numero 1.

### 3. `limite_credito = 0` — **significa sin limite**

Quien habilita o bloquea el fiado es la casilla `aplica_credito`, que si esta cargada. El formulario
expone el limite desde el primer dia para poder ponerlo a proposito.

**Por que importa:** la columna existe pero la pantalla nunca la expuso, asi que vale 0 en **toda**
instalacion real. Interpretar 0 como bloqueo habria roto la venta a credito de todos los clientes a
la vez el dia del despliegue, sin que nadie hubiera cambiado nada.

**Consecuencia:** CRM-02, `creditoDisponible()`.

### 4. Comentarios en el codigo — **gana la convencion real del repositorio**

Cabecera por archivo que explica el *por que* de la decision no obvia; cero comentarios inline
decorativos. Este codigo tiene trampas invisibles sin explicacion, y un archivo nuevo sin cabecera
deja al siguiente agente sin lo que costo horas encontrar.

**Consecuencia:** la regla esta escrita en
[`plan/00-CONVENCIONES.md`](./plan/00-CONVENCIONES.md#la-contradiccion-de-los-comentarios) y en los
61 briefs. Donde un brief todavia diga "sin comentarios en el codigo", queda superado. Contradice
`CLAUDE.md` §0 a proposito y con motivo.

### 5. Ventas fiadas historicas — **se convierten en deuda**

La migracion genera un cargo por cada venta a credito ya cobrada, con id determinista para poder
reintentar sin duplicar. Las ventas a credito **sin cliente asignado quedan fuera**: no se pueden
atribuir a nadie.

> **Avisar al dueno ANTES de actualizar** que va a ver saldos historicos, algunos posiblemente ya
> pagados en efectivo sin registrar. El movimiento de tipo `ajuste` existe para corregirlos uno por
> uno.

**Consecuencia:** CRM-01 (backfill) y CRM-03.

### 6. Turno de caja obligatorio — **apagado en instalaciones existentes, encendido en nuevas**

Sin esta asimetria, la actualizacion deja sin vender el lunes por la manana a un negocio que hoy
funciona. El dueno lo enciende desde Configuracion cuando ya entendio el flujo.

**Consecuencia:** la asimetria vive en la migracion (`exige_caja_abierta INTEGER NOT NULL DEFAULT 0`)
y en el seed de una instalacion nueva, **no** en el repo. NEGOCIO-FLAGS solo permite cambiarlo.

### 7. Arqueo ciego — **encendido, con umbral en 0 el primer mes**

El cajero cuenta sin ver el esperado. Si lo ve, cuenta hasta que cuadre y el arqueo deja de ser
evidencia de nada. Umbral 0 significa que cualquier descuadre pide motivo y quien lo autoriza, para
tener datos reales; despues se sube a lo que la operacion tolere.

**Consecuencia:** valores por defecto `arqueo_ciego = 1` y `umbral_diferencia_caja = 0` en la banda
de migracion de Caja. Ambos configurables, asi que la decision es reversible sin tocar codigo.

### 8. Punto 7, varias cajas a la vez — **se mantiene en alcance**

MULTICAJA-07 **deja de estar diferida**. Se parte en tres tareas: ApiClient centralizado (mas migrar
`chatbotCliente` a el, que hoy es el unico `fetch` del repo y tiene su propio manejo de errores),
`crearSqlDriverRemoto` con rutas `/datos` en `@sfr/api` y token por caja, y seleccion de driver en
el arranque de los dos shells.

> **Riesgo asumido, dicho por escrito.** Un driver HTTP ingenuo vuelve la venta inusable:
> `agregarLinea` dispara dos consultas por linea y `recalcularTotales` relee todas las lineas
> despues de cada cambio — varios viajes de red por cada pitido del lector de codigo de barras. El
> driver remoto necesita **cache local de catalogo o endpoints por caso de uso**, no proxyear SQL
> crudo. Esto es diseno, no cableado, y es la parte mas cara de la tanda.
>
> Ademas: dos pestanas de la PWA son dos bases divergentes (sql.js vuelca la copia entera con
> *debounce*), asi que **una PWA nunca puede ser la caja servidor** y hace falta un candado de
> instancia unica.

### 9. "Modificar la app" — **actualizar la version y configurar en remoto**

Las dos mitades de lo que pediste para el superadmin, ahora con contenido tecnico:

- **Actualizar la app** (`RBAC-09`). Arranca por donde nadie miraba: **los seis `package.json` y
  `tauri.conf.json` estan en `0.0.0`** — no hay versionado, asi que un actualizador no tiene nada
  que comparar. Despues, `tauri-plugin-updater` en escritorio (hoy no esta ni en `Cargo.toml` ni en
  las capabilities) con manifiesto firmado en GitHub Releases. Y en la PWA, **quitar el silencio**:
  hoy `registerType: "autoUpdate"` activa una version nueva al recargar sin avisar a nadie, lo que
  puede cambiar la app a mitad de una venta.
- **Configuracion remota** (`RBAC-10`). Viaja por la infraestructura de `MULTICAJA-07`, no por un
  canal propio.

> **La regla que protege la caja:** nunca actualizar con un turno abierto o un ticket en progreso.
> Se aplaza y se avisa. Una actualizacion que reinicia la app con un ticket a medio armar le cuesta
> una venta al negocio.

> **Y el limite de la configuracion remota, que es lo serio de esta decision.** Es un canal para
> cambiar el comportamiento de la instalacion de tu cliente desde fuera, sobre una app cuyo backend
> hoy **deja pasar todo como `dev-local`**, cuya base esta **sin cifrar** y cuyo WebView corre con
> **`csp: null`**. Por eso `RBAC-10` es: solo tira (nunca empuja), **lista blanca de claves de
> configuracion y jamas codigo, SQL ni rutas**, la misma validacion de negocio que si lo tecleara el
> dueno, todo auditado, y **el dueno puede ver que esta bajo configuracion remota y desconectarse**.
> No se construye hasta que la autenticacion real de `@sfr/api` exista. Es su negocio, no el tuyo.

**Consecuencia:** dos tareas nuevas, `RBAC-09` y `RBAC-10`. La segunda depende de `MULTICAJA-07`,
que ya esta en alcance por la decision 8.

### Lo que doy por supuesto salvo que digas lo contrario

Estas no bloquean ninguna ola. Voy con mi recomendacion; corrigeme cuando quieras.

| Tema | Supuesto |
| --- | --- |
| Venta a credito | Sigue quedando como `cobrada`. Ponerla `pendiente` reescribiria cortes de caja y reportes de periodos **ya cerrados e impresos**, algunos con NCF ya reportado. Lo que cambia es que ademas genera un cargo en el libro. |
| Costo que sube en una compra | **Nunca** ajusta el precio solo. Avisa, sugiere un precio que reconstruye el margen real (calculado desde el precio actual, no desde `pct_ganancia`, que suele valer 0 y desplomaria el precio) y lo aprueba una persona con permiso. Siempre visible la opcion "dejar el precio como esta". |
| Nombres de los tres niveles | "Precio normal", "Precio especial" y "Precio mayoreo". Viven en **una sola constante**: cambiarlos manana es una linea, no una migracion. |
| Bloqueo por inactividad | Bloquea la **pantalla** y pide el PIN del mismo usuario. No cierra sesion ni pierde el ticket a medio armar. El ticket abierto queda a nombre de quien lo abrio y el nuevo puede cobrarlo; la bitacora registra a los dos. |
| Seguridad | El PIN es control de disciplina y auditoria, **no** una barrera de seguridad. Se entrega por escrito con esas palabras. |


## 4. Tareas anadidas por los revisores

El borrador tenia 56 tareas y dejaba fuera cosas que pediste explicitamente. Cinco las encontraron
los revisores; las dos de `RBAC-09` y `RBAC-10` salieron de tu definicion de "modificar la app".

Las siete tienen brief completo en el archivo de su area, igual que las demas.

| Id | Tarea | Punto | Por que faltaba |
| --- | --- | --- | --- |
| [`RBAC-08`](./plan/02-RBAC.md) | Pantalla Soporte (solo superadmin) | Punto 3 | Version del esquema, migraciones aplicadas leidas de `_migracion`, conteo de filas por tabla, exportar y restaurar respaldo, **resetear el PIN de un dueno bloqueado**, bitacora sin filtro y modo mantenimiento. Sin esto, superadmin == dueno y el rol que pediste para ti no hace nada. |
| [`RBAC-09`](./plan/02-RBAC.md) | Versionado real y actualizacion de la app | Punto 3 | Tu definicion de "modificar la app". Los seis `package.json` estan en `0.0.0`: no hay versionado que comparar, y el actualizador de escritorio no existe. |
| [`RBAC-10`](./plan/02-RBAC.md) | Configuracion remota (solo superadmin) | Punto 3 | La otra mitad de "modificar la app". Va sobre la infraestructura de `MULTICAJA-07`, con lista blanca y sin transportar codigo. |
| [`BACKOFFICE-08`](./plan/07-BACKOFFICE.md) | `recomendaciones()` — el "y cualquier otra recomendacion" | Punto 6 | Seis fuentes de datos ya las producen otras tareas y nadie las juntaba: productos sin rotacion, cuentas por cobrar vencidas, cotizaciones por vencer, recordatorios, existencia baja y cajeros que descuadran. Compone una lista **ordenada por pesos implicados**: "RD$ 45,200 inmovilizados en 12 productos sin rotacion", "4 clientes deben RD$ 18,300 con mas de 60 dias". |
| [`COMPRAS-08`](./plan/05-COMPRAS.md) | Puesta en marcha del inventario | Puntos 4 y 6 | El inventario viene **apagado de fabrica** y ninguna tarea lo encendia. Sin esto, "cantidad recibida" se guarda y no mueve nada, y "existencia baja" muestra un cartel explicativo en vez de un dato. Asistente en Configuracion: carga de existencias iniciales y minimos por CSV, movimiento de `conteo_inicial` auditable, y el interruptor. |
| [`CAJA-08`](./plan/04-CAJA.md) | Verificacion y declaracion de hardware | Punto 8 | Pediste **confirmar**, que es una pregunta, no una funcionalidad. Probar contra impresora termica de 58 y 80 mm, gaveta por RJ11 y lector de codigo de barras en modo teclado (verificando que no rompe los atajos Alt+N). Entregable: un `HARDWARE.md` que diga que **no** esta soportado — gaveta USB independiente, y cualquier hardware desde la PWA. |
| [`NEGOCIO-FLAGS`](./plan/01-PLATAFORMA.md) | Ampliar `negocio-repo.guardar()` | Puntos 4, 6 y 8 | Los seis interruptores nuevos (`exige_caja_abierta`, `arqueo_ciego`, `umbral_diferencia_caja`, `politica_costo`, `umbral_aviso_costo_pct`, `desfase_horario_min`) **no se podian escribir desde la aplicacion**: `negocio-repo` tiene un `guardar()` con lista de columnas a mano que ninguna tarea ampliaba. Quedaban clavados en su valor por defecto para siempre. |

### Errores que los revisores encontraron en el borrador

Estos ya estan anotados como *correcciones obligatorias* dentro de la tarea que les toca, en
el archivo de su area. Los tres mas graves:

- **El efectivo esperado no restaba el cambio entregado.** `corte-caja-repo` suma `SUM(p.monto)`
  de los pagos en efectivo, pero `ModalCobro` envia como monto **lo que el cliente entrego**, no
  lo que quedo en la gaveta. Una venta de RD$ 430 pagada con RD$ 500 dejaba un esperado de
  fondo+500 en vez de fondo+430. **Habria dado un faltante falso en cada cierre de turno, desde
  el primer dia.** Ningun test lo detectaba porque todos cobraban con monto exacto.
- **La atomicidad de migraciones era inalcanzable en escritorio.** El plan mandaba implementar
  `BEGIN`/`COMMIT` en el driver de Tauri, pero ese driver corre contra un *pool* de sqlx donde
  cada llamada toma una conexion distinta: el `BEGIN` no envuelve nada. El riesgo numero uno
  del plan ("la app del cliente queda tapiada") seguia abierto justo donde se declaro. Se
  sustituye por registrar en `_migracion` **antes** de ejecutar con estado `aplicando`/`ok`, y
  exigir por test que cada statement sea idempotente por separado.
- **Dos pestanas de la PWA son dos bases divergentes.** sql.js carga la base a memoria y vuelca
  la copia entera con *debounce*: la segunda pestana pisa entera la escritura de la primera. Los
  tres candados `UNIQUE` en los que el plan apoyaba su defensa de concurrencia viven cada uno
  dentro de su copia y no se ven entre si. Hace falta un candado de instancia unica.

## 5. Orden de ejecucion

Nueve olas. Dentro de una ola las tareas corren en paralelo con agentes distintos; entre olas
se espera al criterio de salida.

### Ola 1 — Cimientos del repositorio

**Objetivo.** Que dos agentes puedan anadir una migracion, un tipo o un reporte sin tocar el mismo archivo, que exista guia de diseno y runner de pruebas para la UI, y que el vocabulario de roles y permisos quede congelado antes de que nadie lo use.

- PLATAFORMA-01 AMPLIADA: arreglar primero `pnpm -r test`, que HOY sale rojo porque `packages/api` declara script `test` sin tener ningun archivo de prueba (`vitest run --passWithNoTests`) — sin eso ninguna tarea puede cumplir su criterio de aceptacion; dividir migrations.ts en migraciones/ (un archivo por banda), tipos.ts en tipos/ y reportes-repo.ts en reportes/; documentar bandas en MIGRACIONES.md; test de integridad (ids unicos, dentro de banda, ordenados, sin ';' en literales ni comentarios); crear packages/core/test/_ayuda.ts y migrar los 18 tests a el
- PLATAFORMA-06: derivar DESIGN.md de design-guidelines.md corrigiendo el drift de useAtajosTeclado; instalar vitest+jsdom en @sfr/ui con el bloque css.postcss vacio; crear test/_render.tsx
- RBAC-02 AMPLIADA: dominio/permisos.ts (catalogo unico, cuatro roles cajero|supervisor|dueno|superadmin, puedeVerBackoffice incluida) + dominio/pin.ts (PBKDF2) + contrato de sesion exportado (SesionRepo, PortadorSesion, PermisoError) SIN implementacion todavia; declarar RolUsuario aqui y que tipos.ts lo reexporte, para no depender de RBAC-01

**Criterio de salida.** pnpm -r test verde incluyendo @sfr/ui por primera vez; migrations.ts es un concatenador y el test de integridad caza un id duplicado introducido a proposito; @sfr/core exporta permisos y pin; DESIGN.md existe y no contradice el codigo. PLATAFORMA-04 y PLATAFORMA-05 quedan CANCELADAS (su contenido vive en RBAC-02 y en el andamiaje crearRepos).

### Ola 2 — Seams de plataforma

**Objetivo.** Que una migracion que falle no deje la base a medias, que ningun area vuelva a tocar COLS ni los contadores Array(N), y que anadir un modulo o un repo sea editar un solo array.

- PLATAFORMA-02: SqlDriver.enTransaccion opcional, partirStatements en core, migrador atomico con deteccion de id duplicado antes de ejecutar, paridad de los tres drivers (PRAGMA foreign_keys en Tauri, fin del split ingenuo por ';')
- CENSO-COLUMNAS (banda 11-19): todas las columnas nuevas sin REFERENCES a tablas nuevas, sobre producto, cliente, negocio, factura, factura_linea, cotizacion_linea, devolucion_linea, devolucion, compra y compra_linea; actualizar COLS, el contador Array(N) y tipos/ UNA sola vez; test de ida y vuelta por cada INSERT tocado
- PLATAFORMA-07: navegacion/modulos.ts con atajo fijo por modulo y soporte de atajo null; AppShell derivado de ese registro; sesion/contexto.tsx (ProveedorSesion + useSesion) contra el contrato de RBAC-02; crearRepos(db) + repos/registro.ts; ProveedorDatos envuelto en useMemo

**Criterio de salida.** Una migracion de dos statements cuyo segundo es invalido no deja nada creado y el reintento aplica limpio; crear producto, cliente, factura, linea, cotizacion y devolucion sigue funcionando con los contadores nuevos; agregar un modulo requiere editar solo modulos.ts; Reportes, CorteCaja y Compras no entran en bucle de consultas al re-renderizar el proveedor.

### Ola 3 — Identidad: usuarios, cajas y camino de vuelta

**Objetivo.** Que exista un usuario real con PIN, una caja identificable por instalacion, y un respaldo restaurable antes de que ocho areas empiecen a migrar bases de clientes.

- PLATAFORMA-03: respaldo por descubrimiento sobre sqlite_master (se elimina la lista TABLAS), importarTodo transaccional con validacion de esquema, pin_hash forzado a null y usuario_seguridad excluida; corregir schema.sql y sync-rules.yaml, que perdieron las migraciones 7, 8 y 10
- RBAC-01 + RBAC-03 (banda 20): usuario_seguridad, normalizacion de rol a 'dueno', seed con rol dueno, y usuario-repo (CRUD, autenticar con resultado discriminado, cambiarPin, regla del ultimo dueno); blindar sync-rules.yaml para que deje de hacer SELECT * sobre usuario
- MULTICAJA-01 + MULTICAJA-02 (banda 30): instalacion, caja.prefijo, NCF por caja; caja-repo e instalacion-repo UNICOS (CAJA-03 los consumira, no los recreara)
- BACKOFFICE-01 RESTO (banda 80): dominio/periodo.ts (funciones puras, hora actual inyectable, sin librerias de fecha) e indices de factura

**Criterio de salida.** Se puede crear un usuario con PIN y autenticarlo; obtenerCajaActual() responde; exportar y restaurar un respaldo completo devuelve los mismos conteos fila por fila; periodo.ts pasa el caso de la venta de las 22:30 hora local (que hoy cae en el dia UTC siguiente).

### Ola 4 — Guardia de permisos y dominios puros de area

**Objetivo.** Que la autorizacion exista del lado de los datos y que cada area tenga su matematica probada antes de tocar un repo transaccional.

- RBAC-04: implementar db/sesion.ts (conSesion, sesionDe, usuarioDe, exigirPermiso, modo permisivo con nombre explicito en el codigo) y colocar el guardia en producto-repo, cliente-repo, proveedor-repo, compra-repo, corte-caja-repo y devolucion-repo; los DOS puntos de factura-repo quedan para FACTURA-GUARDIAS en la ola 6
- PRECIOS-02: dominio/nivel-precio.ts con resolverPrecio (precedencia explicito > cantidad > cliente > normal, promocion compuesta ENCIMA del nivel, motivo sin_precio_en_nivel reportado y nunca silencioso)
- COMPRAS-02: dominio/compra.ts (estadoRecepcion, validarRecepcion, impactoCosto derivando el margen con pctGananciaDesdePrecio y JAMAS con pct_ganancia guardado) + endurecer validarProveedor con esRncValido
- CRM-02: dominio/credito.ts (calcularSaldo, creditoDisponible con limite 0 = sin limite, validarCargoCredito, validarAbono, antiguedad FIFO sin new Date().toISOString())
- CAJA-02: ampliar dominio/caja.ts con DENOMINACIONES_RD, calcularTotalArqueo, validarArqueo, evaluarDiferencia y efectivo esperado neto (fondo + ventas + entradas - salidas - devoluciones), con los campos nuevos OPCIONALES para que los 4 tests existentes sigan verdes
- BACKOFFICE-02: unificar el criterio de fecha en reportes/ (rango de instante UTC en vez de date(fecha_hora), que ademas impedia usar el indice) y anadir ventasPorHora y comparativaPeriodo

**Criterio de salida.** Con sesion de cajero, productoRepo.actualizar lanza PermisoError y la fila queda sin cambios; los 18 archivos de test preexistentes pasan SIN editarse (criterio mas importante de la ola); resolverPrecio da el mismo resultado por el camino de alta y por el de cambio de nivel con promocion vigente; los cuatro modulos de dominio son puros y no importan SqlDriver.

### Ola 5 — Repos de area sin tocar el nucleo transaccional

**Objetivo.** Construir los repos nuevos y los metodos de catalogo de cada area, con la regla de que nadie toca factura-repo en esta ola.

- PRECIOS-03: metodos de nivel en producto-repo y cliente-repo (incluido el arreglo del patron `?? actual.x`, que hoy impide BORRAR un precio ya cargado porque null nunca gana)
- CRM-06: crm-repo NUEVO (interacciones, etiquetas, cumpleanos, recordatorios) con UPDATE estrechos, nunca via cliente-repo.actualizar, que hace `input.aplica_credito ? 1 : 0` sin fallback y apagaria el credito en silencio
- CAJA-03: sesion-caja-repo NUEVO (abrir turno con indice unico parcial como garantia real, movimientos de efectivo, efectivoDisponible); consume el caja-repo de MULTICAJA-02
- COMPRAS-03 (banda 60): tablas de recepcion, costo_historial y pago_compra + compra-repo.crear con cantidad pedida vs recibida e historial de costo escrito SIEMPRE, con inventario encendido o apagado
- MULTICAJA-04: secuencia-ncf-repo con rangos disjuntos validados y consumo atomico en un solo statement (hoy es read-then-write y dos cajas emiten el MISMO NCF con certeza, no por carrera)
- CRM-05: resumenCliente y productosMasCompradosPorCliente como agregados SQL en reportes/, y marcarConvertida en cotizacion-repo

**Criterio de salida.** Dos instalaciones con rangos disjuntos nunca producen el mismo NCF y el indice ux_comprobante_fiscal_ncf no se dispara ni una vez; abrir dos turnos en la misma caja lo rechaza la BASE, no la UI; actualizar un producto con precio_2 en null lo borra de verdad; ningun agente de esta ola edito factura-repo.ts.

### Ola 6 — Pasada unica sobre el nucleo transaccional

**Objetivo.** Resolver de una sola vez el archivo con cinco reclamantes en lugar de serializarlo en cinco olas.

- FACTURA-GUARDIAS (TAREA COMPARTIDA, un solo agente sobre factura-repo.ts y devolucion-repo.ts): (a) exigirPermiso de RBAC en los dos puntos sensibles; (b) numeracion por caja con prefijo y existencia por DELTA relativo en vez de read-modify-write, de MULTICAJA-03; (c) precio recalculado en el servidor con resolverPrecio y cambiarNivelLinea in-place, de PRECIOS-04; (d) guardia de credito y cargo automatico al libro, de CRM-04; (e) guardia de turno abierto y sesion_caja_id, mas el movimiento de caja por devolucion en efectivo, de CAJA-05. Todos los dominios puros ya existen desde la ola 4: esta tarea SOLO cablea.
- CRM-03: credito-repo (libro de movimientos como unica verdad del saldo, cache reconstruible) y guardia al eliminar cliente con deuda
- CAJA-04: corte X y corte Z, cierre con arqueo y autorizacion de diferencia, calcularResumenSesion (que de paso esquiva el bug de zona horaria porque no usa fechas sino el id del turno)
- COMPRAS-04: recepcion posterior en eventos, costo-historial-repo y aplicarAjusteCosto (unico camino por el que un precio de venta cambia a raiz de una compra)
- PRECIOS-07 + BACKOFFICE-04 RESTO: nivel en cotizaciones, margen por nivel con COALESCE(costo_unitario, costo) y contador de lineas estimadas; producto.existenciaBaja distinguiendo 'nada bajo' de 'inventario apagado'

**Criterio de salida.** Cobrar 100% en efectivo se comporta EXACTAMENTE igual que antes (no regresion obligatoria); corte-caja.calcularResumen devuelve los mismos numeros que antes para los mismos datos; es imposible fiar sin cliente, sin credito habilitado o por encima del limite llamando al repo directamente con la UI fuera; un cobro rechazado no deja pagos, ni cambia el estado, ni inserta movimientos; ninguna factura cobrada cambia de monto.

### Ola 7 — Composicion de lectura y puerta de acceso

**Objetivo.** Una sola llamada que alimente el panel del dueno, y una sesion real en la aplicacion.

- BACKOFFICE-05: resumenPanel componiendo todos los agregados en UNA llamada (diez llamadas sueltas con Promise.all congelan el telefono en sql.js, que corre WASM en el hilo principal, y pueden leer estados distintos entre si) con advertencias como union tipada y guardia de rol ANTES de consultar
- MULTICAJA-05: filtros opcionales por caja y por usuario en corte-caja-repo y en reportes/, mas ventasPorCaja y ventasPorUsuario
- BACKOFFICE-06: primitivas de grafica en SVG propio, cero librerias (heredan las variables --sfr-* del tema sin una linea de JS; canvas obligaria a leer getComputedStyle y repintar a mano en cada cambio de tema) con la geometria extraida a un modulo puro y probado
- RBAC-05: ProveedorSesion real, pantalla de Acceso por PIN y primer arranque (usuario semilla con pin_hash NULL), con el portador creado con useRef y MUTADO, nunca reemplazado

**Criterio de salida.** resumenPanel rechaza al cajero aunque se llame a mano desde la consola; el arranque de una instalacion sembrada lleva a 'define tu PIN' y no a Ventas; ninguna grafica produce NaN con series vacias, que es el estado de una instalacion nueva; el objeto repos no cambia de identidad al cambiar de usuario.

### Ola 8 — Pantallas de area

**Objetivo.** Entregar la superficie visible, con los dos archivos calientes de UI resueltos en una sola pasada cada uno.

- VENTAS-UNIFICADA (TAREA COMPARTIDA, un solo agente sobre Ventas.tsx, 1941 lineas, cinco reclamantes): selector de tres niveles con F8 ciclico y fusion de lineas llaveada por nivel y no por comparacion de floats (PRECIOS-06); buscador de cliente con LIMIT y debounce mas saldo visible y ModalCobro consciente del credito (CRM-04); ocultar Modificar sin permiso y atrapar PermisoError (RBAC-06); numero con prefijo de caja incluido el nombre del PDF (MULTICAJA-06); boton de gaveta con rastro en bitacora (CAJA-07). PROHIBIDO Shift+F8: useAtajosTeclado solo anade 'Shift' si la tecla es una letra, asi que se normaliza a 'F8' y colisiona.
- CATALOGO-UI (TAREA COMPARTIDA sobre Productos.tsx y FormularioProducto.tsx): precio_2 y umbral de mayoreo mas importacion y exportacion CSV con el orden de PISTAS corregido (PRECIOS-05); existencia minima (BACKOFFICE-04); historial de costo en el desplegable existente (COMPRAS-07 parcial). OJO: hay que anadir los campos nuevos a diferenciasProducto o el modal dira 'nada cambio' y el formulario cerrara SIN GUARDAR, sin ningun error.
- CRM-07: pantalla Clientes mobile-first y ficha 360 con pestanas, dentro de Clientes (Alt+3), NO como decimo modulo
- COMPRAS-06: captura de compra con pedida vs recibida, producto al vuelo y alta completa de proveedor, con id estable por linea (hoy la key de React es el indice del array y al borrar una fila del medio se mezclan los valores)
- CAJA-06: pantalla Caja (turno, historial, reporte por rango) renombrando el modulo en su MISMO indice para no remapear Alt+6
- BACKOFFICE-07: pantalla Panel con enlaces a las pantallas de gestion que ya existen, sin reimplementarlas
- RBAC-07: pantalla Personal, bloqueo por inactividad con el temporizador en refs (o la bitacora se recarga sola en cada tick) y cambio rapido de usuario
- MULTICAJA-06: seleccion de caja al primer arranque y seccion Cajas en Configuracion

**Criterio de salida.** Verificacion manual a 375px, 768px y 1440px en tema claro y oscuro para cada pantalla; ninguna regla de negocio nueva vive en un componente; todos los mensajes de error mostrados vienen de un ValidacionError o PermisoError del repo; AppShell no menciona ningun modulo por nombre.

### Ola 9 — Cierre y diferidos

**Objetivo.** Terminar lo que compartia archivo con la ola anterior y decidir sobre lo que no deberia entrar en esta tanda.

- COMPRAS-07: bandeja de recepcion y aprobacion de cambio de precio en Compras.tsx (va despues de COMPRAS-06 porque comparten el archivo)
- CAJA-07: comprobante impreso del corte X/Z con reimpresion y turnos en el reporte del dueno
- RBAC-06 RESTO: columna Usuario en la bitacora resuelta con un solo listar() cacheado y reseteo del modulo activo al cambiar de sesion
- RBAC-09 (versionado y actualizacion) y RBAC-10 (configuracion remota), en este orden: RBAC-10 necesita la infraestructura de red de MULTICAJA-07 y la autenticacion real de @sfr/api, asi que es la ultima tarea de toda la tanda.
- MULTICAJA-07 **SE MANTIENE EN ALCANCE** (decision 8). Partida en tres: ApiClient centralizado mas migrar chatbotCliente a el; `crearSqlDriverRemoto` con rutas `/datos` en @sfr/api y token por caja; seleccion de driver en el arranque de los dos shells. Riesgo asumido: un driver HTTP ingenuo vuelve la venta inusable porque `agregarLinea` dispara dos consultas por linea mas una relectura completa en `recalcularTotales` — necesita cache local de catalogo o endpoints por caso de uso, no proxy de SQL crudo. Anadir ademas el candado de instancia unica de la PWA: dos pestanas son dos bases divergentes y ninguna PWA puede ser la caja servidor.
- DIFERIR ESLint/Prettier/CI: el primer lint sobre un repo que nunca se linteo produce miles de cambios de formato justo despues de fusionar ocho ramas, y ademas depende de la decision pendiente sobre comentarios.

**Criterio de salida.** pnpm -r test y pnpm -r typecheck verdes; CHANGELOG.md actualizado bajo [Unreleased]; validacion en staging sobre una COPIA de una base real de cliente antes de proponer produccion.

## 6. Riesgos mayores

| Riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| Una migracion falla a la mitad en la maquina de un cliente y deja la aplicacion tapiada en cada arranque | Maximo, y es el unico riesgo sin arreglo remoto. No existe ni una transaccion en todo el repo y el migrador registra en _migracion DESPUES de ejecutar: si el SQL falla a mitad de camino quedan tablas creadas sin registrar, el siguiente arranque reintenta desde el primer statement y muere con 'duplicate column name' para siempre. El negocio no puede vender y no hay boton que lo saque de ahi. Con diecisiete migraciones nuevas escritas por ocho agentes, la probabilidad deja de ser teorica. | PLATAFORMA-02 en la ola 2, antes que CUALQUIER migracion de area: enTransaccion en los tres drivers y cada migracion envuelta junto con su registro. Mas PLATAFORMA-03 en la ola 3, que da el camino de vuelta (restauracion transaccional) antes de que nadie toque una base real. Mas el test que prohibe ';' dentro de literales y comentarios, porque ese error pasa verde en los tests de Node y revienta SOLO en escritorio. |
| Dos areas suben el mismo contador Array(N).fill('?') y el INSERT se desalinea sin que TypeScript lo note | Alto y silencioso. Verificado que ocurriria hoy: PRECIOS-01 sube producto 19->21 y BACKOFFICE-04 lo sube 19->20; PRECIOS-01 y CRM-01 suben cliente 15->17 los dos. El compilador no dice nada porque el numero es un literal suelto: el fallo aparece cuando un usuario real da de alta un producto o un cliente. | La tarea CENSO-COLUMNAS concentra TODAS las columnas nuevas de las tablas compartidas en un solo agente y una sola pasada, con un test de ida y vuelta por cada INSERT tocado que lee la fila de vuelta. Despues de esa tarea, ningun brief de area tiene permiso para tocar COLS ni el contador: solo anaden metodos. |
| El guardia de permisos se coloca mal y bloquea la venta en produccion, o deja pasar lo que deberia frenar | Alto. RBAC-04 toca nueve repos que son el corazon transaccional, y FACTURA-GUARDIAS concentra cinco guardias distintos en el camino del cobro. Un exigirPermiso de mas deja al colmadero sin facturar; uno de menos deja al cajero cambiando precios y costos desde la pantalla de Ventas, que es exactamente el agujero que el cliente pidio cerrar. | Tres redes. (1) Driver sin sesion adjunta = modo permisivo, expresado con un nombre en el codigo y no con un if mudo, asi que las instalaciones existentes se comportan igual que hoy. (2) Los dieciocho archivos de test preexistentes deben pasar SIN editarse: es el criterio de aceptacion mas importante de la ola 4, y cualquier edicion a un test viejo es senal de que el guardia esta mal puesto. (3) El guardia va ANTES de cualquier escritura y se prueba releyendo la fila para confirmar que no cambio, no solo comprobando que lanzo. |
| Cambiar el criterio de fecha altera cifras que el dueno ya vio, imprimio y dio por buenas | Alto en confianza, no en datos. Las consultas comparan date(fecha_hora) en UTC contra fechas locales, asi que en Republica Dominicana toda venta despues de las 8:00 pm se cuenta en el dia siguiente. Arreglarlo es correcto y necesario, pero significa que un corte del mismo periodo dara distinto que ayer, y el dueno lo leera como un error nuevo del sistema. | Un solo agente cambia el criterio (BACKOFFICE-02, ola 4) y su reporte de tarea debe decir explicitamente que las cifras se mueven y por que. Avisar al cliente ANTES de actualizar, con el ejemplo concreto de la venta de las 22:30. El corte por turno de CAJA-04 esquiva el problema de raiz porque filtra por id de sesion y no por fecha: usarlo como cifra de referencia para reconciliar. |
| El temporizador de inactividad y el estado de sesion disparan un bucle de re-render que vuelve la aplicacion lenta de forma dificil de diagnosticar | Medio-alto y traicionero, porque no rompe nada: solo hace la aplicacion cada vez mas lenta sin errores en consola. El proveedor de datos construye los dieciocho repos en el cuerpo del render sin useMemo, asi que cualquier re-render cambia la identidad de cada repo y vuelve a disparar todos los useEffect(..., [repo]) de los dieciseis archivos que los consumen. | Dos medidas obligatorias y complementarias. (1) El useMemo del proveedor va en la ola 2, antes de que exista cualquier estado de sesion. (2) La sesion viaja en un portador que es un objeto de identidad ESTABLE con un campo mutable: cambiar de usuario MUTA el campo, nunca reemplaza el objeto, asi que no reconstruye nada. Verificacion manual explicita en el criterio de salida: dejar la bitacora abierta varios minutos y confirmar que no se recarga sola en cada tick. |
| La pasada unica sobre factura-repo.ts o sobre Ventas.tsx se hace a medias y empeora lo que venia a arreglar | Alto. Son las dos tareas mas grandes del plan y concentran cinco areas cada una. Ventas.tsx tiene 1941 lineas con estado, deshacer/rehacer, atajos y foco de teclado enredados, y ya contiene un bug de dinero en produccion: la misma regla de precio esta escrita dos veces y las dos copias no coinciden, asi que el mismo producto sale a precio distinto segun si el cajero lo agrego en mayoreo o lo alterno despues. Un cambio parcial deja el bug y anade dos niveles mas. | Ambas tareas llegan cuando ya no tienen que DECIDIR nada: toda la matematica esta en modulos puros construidos y probados dos olas antes, y la pantalla solo consume. El criterio de aceptacion es una prueba de equivalencia entre los dos caminos (agregar directo en un nivel contra agregar y cambiar de nivel) con promocion vigente, que es exactamente el bug actual. Si el agente no llega en una sesion, se parte por funcionalidad completa, nunca por archivo a medias. |
| Ocho ramas llegan al merge y ninguna se probo contra una base real de cliente | Alto. Todos los tests corren sobre bases recien migradas y vacias. Las instalaciones reales tienen facturas cobradas con NCF ya reportado, compras con costo historico, clientes con fiado registrado como pago en efectivo y el inventario apagado de fabrica. Los backfills de CRM, COMPRAS y PRECIOS escriben precisamente sobre esos datos. | Hacer obligatoria, en el test de integridad de migraciones, la prueba de instalacion existente: aplicar solo hasta la migracion 10, sembrar datos, y recien entonces aplicar el resto. Ademas, antes de proponer produccion, restaurar una COPIA de una base real de cliente en staging y correr la actualizacion completa comparando antes y despues los totales de facturas cobradas, el ITBIS del periodo y la ganancia: ninguno de los tres puede moverse por un backfill. |
| El alcance es demasiado grande para una sola tanda y las ultimas olas se entregan sin verificacion manual | Medio-alto. Son cincuenta tareas sobre ocho areas, y las verificaciones que mas valen (375px, tema oscuro, teclado sin mouse, impresora termica real, escritorio Tauri contra PWA) son manuales y caen todas en las olas 8 y 9, justo cuando la presion por cerrar es maxima. | Sacar de esta tanda lo que no es imprescindible y decirlo ahora, no al final: el driver remoto HTTP con caja servidor en LAN (pone los datos en la red por primera vez, toca autenticacion y el arranque de los tres shells, y un driver ingenuo vuelve la venta inusable por latencia) y la instalacion de linter y CI (el primer lint sobre un repo nunca linteado produce miles de cambios de formato justo despues de fusionar ocho ramas). Con eso las olas 8 y 9 caben con margen para probarlas de verdad. |

## 7. Dependencias mal declaradas

Los revisores encontraron estas incoherencias entre lo que una tarea dice que necesita y lo
que el orden de olas le entrega. Hay que arreglarlas al despachar.

- PLATAFORMA-07 declara dependeDe: ['PLATAFORMA-05','PLATAFORMA-06'] y la sintesis CANCELA PLATAFORMA-05. Queda una dependencia colgante y, peor, PLATAFORMA-07 esperaba de ella la factoria crearRepos; si nadie reescribe el brief, el agente busca un entregable que no existe.
- BACKOFFICE-07 declara dependeDe RBAC-02, pero RBAC-02 es dominio puro (catalogo de permisos y hash de PIN) y lo que la pantalla necesita es el usuario activo en la UI, que lo entrega RBAC-05 (ProveedorSesion). La dependencia real es RBAC-05; tal como esta, el Panel podria arrancar sin forma de saber quien esta conectado.
- MULTICAJA-06 declara dependeDe RBAC-02 y su brief la describe como 'la tarea RBAC-02 (login con PIN y sesion)'. RBAC-02 NO es el login: es permisos.ts y pin.ts. El login y la sesion son RBAC-05. La dependencia esta mal nombrada y mal apuntada.
- CAJA-06 declara dependeDe RBAC-01, pero necesita listar usuarios activos para elegir quien abre el turno, y eso es usuario-repo, o sea RBAC-03; y si quiere tomar el usuario de la sesion en vez de un selector, RBAC-05. RBAC-01 solo crea una tabla satelite y unos tipos.
- BACKOFFICE-05 declara dependeDe RBAC-01 cuando lo que consume es el catalogo de roles y permisos, que es RBAC-02. La dependencia apunta a la migracion en vez de al contrato, que es justamente el error que hace que BACKOFFICE-05 se haya escrito su propio ROLES_BACKOFFICE con un vocabulario de roles incompatible.
- RBAC-02 declara dependeDe RBAC-01, pero la sintesis la programa en la ola 1 y a RBAC-01 en la ola 3, o sea al reves de lo declarado. La inversion solo es valida si el brief se reescribe para que RolUsuario nazca en permisos.ts en vez de en tipos.ts; si el brief se ejecuta como esta escrito, el agente de la ola 1 se bloquea buscando un tipo que todavia no existe.
- CAJA-05 no declara ninguna dependencia con MULTICAJA-03, y las dos reescriben abrirTicket y las dos deciden que caja_id lleva la factura (una desde la sesion de turno, otra desde la tabla instalacion). Sin dependencia declarada, la segunda que aterrice pisa el criterio de la primera.
- CRM-04 declara solo CRM-02 y CRM-03, pero reescribe cobrar() y toca Ventas.tsx y ModalCobro.tsx, que tambien reescriben PRECIOS-04, CAJA-05, MULTICAJA-03 y RBAC-04. Ninguna de las cinco se declara entre si: el grafo de dependencias no refleja el conflicto mas caro del plan.
- CAJA-04 anade turnosPorPeriodo y diferenciasPorCajero a reportes-repo.ts sin declarar dependencia con BACKOFFICE-02, que en ese mismo archivo cambia el criterio de fecha de las cinco consultas existentes. Si CAJA-04 llega primero, sus consultas nuevas nacen con el criterio viejo y hay que rehacerlas.
- RBAC-03 y PLATAFORMA-03 estan las dos en la ola 3 y las dos reescriben backup-repo.ts con criterios distintos: PLATAFORMA-03 elimina la lista TABLAS y pasa a descubrir tablas en sqlite_master, y RBAC-03 da instrucciones redactadas contra esa lista ('haz que el respaldo siga incluyendo la tabla usuario pero con pin_hash null'). Falta declarar RBAC-03 dependeDe PLATAFORMA-03 y reescribir esa parte del brief contra la implementacion nueva.
- RBAC-05, MULTICAJA-06 y MULTICAJA-07 reescriben los mismos dos archivos de arranque (packages/web/src/main.tsx y packages/desktop/src/main.tsx): una envuelve con ProveedorSesion, otra mete la seleccion de caja antes del AppShell y la tercera elige entre driver local y remoto. Ninguna declara a las otras. Son doce lineas de archivo donde se cruzan tres areas.
- COMPRAS-02 crea su propio puedeRegistrarCompra y puedeAprobarCambioPrecio dentro de dominio/compra.ts en lugar de depender de RBAC-02, y encima con un conjunto de roles que incluye 'admin', que RBAC-01 elimina al normalizarlo a 'dueno'. Es un cuarto sistema de permisos que la sintesis no detecto (si detecto los otros tres) y que quedaria autorizando compras con un rol que ya no existe.
- CRM-01 y PRECIOS-01 declaran las dos dependeDe: [] y las dos suben el contador Array(15) de cliente-repo a 17 por caminos distintos. Como ninguna declara a la otra ni a una tarea comun, el grafo permite ejecutarlas en paralelo, que es exactamente el escenario en el que el INSERT de clientes queda desalineado sin que TypeScript lo note.
- PRECIOS-05 declara solo PRECIOS-03, pero edita FormularioProducto.tsx y Productos.tsx, que tambien editan BACKOFFICE-04 (existencia minima) y COMPRAS-07 (historial de costo). Tres areas sobre el mismo formulario sin una sola dependencia declarada entre ellas.
- PLATAFORMA-07 declara dependeDe PLATAFORMA-05, pero la sintesis CANCELA PLATAFORMA-05 ('PLATAFORMA-04 y PLATAFORMA-05 quedan CANCELADAS'). PLATAFORMA-07 necesita crearRepos(db), que era el unico entregable rescatado de esa tarea: la dependencia apunta a una tarea inexistente y nadie es dueno explicito de crearRepos/registro.ts.
- CAJA-03 declara dependeDe [CAJA-01, CAJA-02] pero la sintesis decide que consume el caja-repo de MULTICAJA-02. Dependencia real no declarada y en bandas distintas (CAJA=40-49, MULTICAJA=30-39). Ademas CAJA-01 hace INSERT OR IGNORE INTO caja ('caja-1') y MULTICAJA-01 tambien toca caja: dos migraciones siembran/alteran la misma tabla sin declararse entre si.
- BACKOFFICE-05 declara dependeDe RBAC-01, pero su guardia necesita el catalogo de roles y puedeVerBackoffice, que viven en RBAC-02. Peor: su ROLES_BACKOFFICE es ['dueno','admin','superadmin'] mientras RBAC-01 ejecuta UPDATE usuario SET rol='dueno' WHERE rol='admin' — tras esa migracion ningun usuario tiene rol 'admin' y el termino queda muerto en la constante.
- BACKOFFICE-07 declara dependeDe RBAC-02 pero lee 'el rol de la sesion' desde useSesion: eso lo entrega RBAC-05 (ProveedorSesion), no RBAC-02. Mismo error en CAJA-06 (dependeDe RBAC-01, necesita RBAC-05) y en MULTICAJA-06 (dependeDe RBAC-02, necesita RBAC-05 para mostrar el cajero en el ticket impreso).
- CRM-04 declara dependeDe [CRM-02, CRM-03] y no declara ninguna dependencia con PRECIOS-04, MULTICAJA-03, CAJA-05 ni RBAC-04, pese a que las cinco reescriben factura-repo.cobrar()/agregarLinea(). La sintesis lo resuelve fusionandolas en FACTURA-GUARDIAS, pero entonces FACTURA-GUARDIAS necesita credito-repo (CRM-03) y corte-caja calcularResumenSesion (CAJA-04), que estan en la MISMA ola 6 sin orden intra-ola definido.
- RBAC-03 (ola 3) modifica packages/core/src/repos/backup-repo.ts para forzar pin_hash a null, y PLATAFORMA-03 (ola 3) reescribe ese mismo archivo entero eliminando la constante TABLAS. Misma ola, mismo archivo, ninguna de las dos declara a la otra.
- BACKOFFICE-06 incluye 'agregar vitest como devDependency y el script test a packages/ui/package.json', lo mismo que PLATAFORMA-06. La sintesis las separa en ola 7 y ola 1 sin recortar el brief de BACKOFFICE-06: el agente de ola 7 intentara instalar una dependencia que ya esta y crear un vitest.config.ts que ya existe.
- BACKOFFICE-04 declara dependeDe BACKOFFICE-01, pero la sintesis parte la tarea en dos (columnas -> CENSO-COLUMNAS en ola 2; existenciaBaja + formulario -> ola 6/8). El id BACKOFFICE-04 sigue apareciendo como unidad en olas 6 y 8 con dependencias que ya no corresponden.
- COMPRAS-05 declara dependeDe [COMPRAS-01, COMPRAS-02] pero lee compra.fecha_vencimiento para estadoCuentaProveedor y vencidas(); ese campo lo deriva COMPRAS-03 a partir de condicionPago/diasCredito. Sin COMPRAS-03, fecha_vencimiento es NULL en todas las compras y vencidas() devuelve siempre vacio.

## 8. Indice completo de tareas

| Id | Tarea | Esfuerzo | Depende de |
| --- | --- | --- | --- |
| [`PLATAFORMA-01`](./plan/01-PLATAFORMA.md) | Convencion de migraciones: rangos por area, test de integridad y helper de pruebas compartido | M | — |
| [`PLATAFORMA-02`](./plan/01-PLATAFORMA.md) | Atomicidad de migraciones y paridad de los tres drivers | L | PLATAFORMA-01 |
| [`PLATAFORMA-03`](./plan/01-PLATAFORMA.md) | Respaldo sin lista manual y restauracion transaccional | M | PLATAFORMA-02 |
| ~~[`PLATAFORMA-04`](./plan/01-PLATAFORMA.md)~~ | **CANCELADA** — su contenido vive en RBAC-02 | — | — |
| ~~[`PLATAFORMA-05`](./plan/01-PLATAFORMA.md)~~ | **CANCELADA** — el guardia vive en RBAC-04; `crearRepos` pasa a PLATAFORMA-07 | — | — |
| [`PLATAFORMA-06`](./plan/01-PLATAFORMA.md) | Andamiaje de UI: DESIGN.md y banco de pruebas de @sfr/ui | M | — |
| [`PLATAFORMA-07`](./plan/01-PLATAFORMA.md) | Registro declarativo de modulos, proveedor de sesion y filtrado por permiso en AppShell | L | PLATAFORMA-05, PLATAFORMA-06 |
| [`RBAC-01`](./plan/02-RBAC.md) | Migracion 11 (tabla usuario_seguridad + normalizacion de rol) y tipos de dominio Usuario/Caja/RolUsuario | S | — |
| [`RBAC-02`](./plan/02-RBAC.md) | Dominio puro: catalogo cerrado de permisos, defaults por rol, overrides por usuario y hash de PIN con PBKDF2 | M | RBAC-01 |
| [`RBAC-03`](./plan/02-RBAC.md) | usuario-repo.ts (CRUD, autenticar, cambiar PIN) y blindaje del respaldo y del sync para que no filtren pin_hash | M | RBAC-01, RBAC-02 |
| [`RBAC-04`](./plan/02-RBAC.md) | Portador de sesion sobre el driver, exigirPermiso y guardia en los 9 puntos sensibles de los repos | L | RBAC-02, RBAC-03 |
| [`RBAC-05`](./plan/02-RBAC.md) | Sesion en la UI: ProveedorSesion, pantalla de acceso por PIN y primer arranque, cableada en PWA y escritorio | M | RBAC-03, RBAC-04 |
| [`RBAC-06`](./plan/02-RBAC.md) | Navegacion y pantallas por permiso: filtrar modulos, fijar los atajos, resetear el modulo activo y mostrar el usuario en la bitacora | M | RBAC-04, RBAC-05 |
| [`RBAC-07`](./plan/02-RBAC.md) | Gestion de personal, bloqueo por inactividad y cambio rapido de usuario en el punto de venta | L | RBAC-05, RBAC-06 |
| [`PRECIOS-01`](./plan/03-PRECIOS.md) | Migraciones 11-19: columnas de nivel de precio, backfill idempotente y sincronizacion de COLS/contadores | L | — |
| [`PRECIOS-02`](./plan/03-PRECIOS.md) | Dominio: tipo NivelPrecio y resolverPrecio() con la precedencia nivel/cantidad/promocion escrita y testeada | M | — |
| [`PRECIOS-03`](./plan/03-PRECIOS.md) | producto-repo y cliente-repo: cargar los tres precios, el umbral, y asignar niveles permitidos al cliente con validacion | M | PRECIOS-01, PRECIOS-02 |
| [`PRECIOS-04`](./plan/03-PRECIOS.md) | factura-repo: guardia server-side del nivel, precio recalculado en el servidor, cambio de nivel in-place y repricing de los tres niveles | L | PRECIOS-01, PRECIOS-02, PRECIOS-03 |
| [`PRECIOS-05`](./plan/03-PRECIOS.md) | UI del catalogo: precio 2 y umbral en FormularioProducto, niveles permitidos en la ficha de Cliente, importacion y exportacion CSV | M | PRECIOS-03 |
| [`PRECIOS-06`](./plan/03-PRECIOS.md) | UI de Ventas: selector de nivel por linea, chip de nivel del ticket, fusion por nivel y consulta de precio con los tres niveles | L | PRECIOS-04, PRECIOS-05 |
| [`PRECIOS-07`](./plan/03-PRECIOS.md) | Propagacion: nivel en cotizaciones y devoluciones, reporte de margen por nivel y espejo del esquema en Postgres | M | PRECIOS-01, PRECIOS-04 |
| [`CAJA-01`](./plan/04-CAJA.md) | Migracion 11: esquema del turno de caja, movimientos y arqueo | M | — |
| [`CAJA-02`](./plan/04-CAJA.md) | Dominio puro: efectivo esperado neto, arqueo por denominacion y evaluacion de la diferencia | S | CAJA-01 |
| [`CAJA-03`](./plan/04-CAJA.md) | Repos de caja, sesion de turno y movimientos de efectivo | L | CAJA-01, CAJA-02 |
| [`CAJA-04`](./plan/04-CAJA.md) | Corte X, corte Z y cierre de turno con arqueo y autorizacion de la diferencia | L | CAJA-01, CAJA-02, CAJA-03 |
| [`CAJA-05`](./plan/04-CAJA.md) | Guardias de negocio: no se vende con la caja cerrada, la devolucion en efectivo sale de caja y la gaveta deja rastro | M | CAJA-01, CAJA-03 |
| [`CAJA-06`](./plan/04-CAJA.md) | Pantalla Caja: apertura de turno, movimientos, arqueo por denominacion y cierre | L | CAJA-03, CAJA-04, RBAC-01 |
| [`CAJA-07`](./plan/04-CAJA.md) | Comprobante impreso del corte X/Z con reimpresion, gaveta a peticion con rastro y turnos en el reporte del dueno | M | CAJA-04, CAJA-05, CAJA-06 |
| [`COMPRAS-01`](./plan/05-COMPRAS.md) | Migracion 11: recepcion parcial, historial de costo y cuentas por pagar (solo esquema) | M | — |
| [`COMPRAS-02`](./plan/05-COMPRAS.md) | Dominio puro de recepcion, impacto de costo/precio y permisos de compra | M | COMPRAS-01 |
| [`COMPRAS-03`](./plan/05-COMPRAS.md) | compra-repo.crear(): cantidad pedida vs recibida, usuarioId e historial de costo siempre | L | COMPRAS-01, COMPRAS-02 |
| [`COMPRAS-04`](./plan/05-COMPRAS.md) | Recepcion posterior, consulta de impacto de costo y ajuste de precio aprobado | L | COMPRAS-03 |
| [`COMPRAS-05`](./plan/05-COMPRAS.md) | Cuentas por pagar al proveedor: pagos parciales y estado de cuenta (solo core) | M | COMPRAS-01, COMPRAS-02 |
| [`COMPRAS-06`](./plan/05-COMPRAS.md) | UI de captura de compra: pedida vs recibida, producto al vuelo y proveedor completo | L | COMPRAS-03 |
| [`COMPRAS-07`](./plan/05-COMPRAS.md) | UI de recepcion pendiente, aviso de costo con aprobacion e historial de costo por producto | L | COMPRAS-04, COMPRAS-06 |
| [`CRM-01`](./plan/06-CRM.md) | Migraciones 11 y 12: esquema CRM (crédito, interacciones, etiquetas) y backfill de la deuda histórica | M | — |
| [`CRM-02`](./plan/06-CRM.md) | Dominio puro de crédito: saldo, disponible, guardias de cargo/abono y antigüedad FIFO | M | CRM-01 |
| [`CRM-03`](./plan/06-CRM.md) | credito-repo: libro de movimientos, abonos, cuentas por cobrar y guardia al borrar cliente con deuda | L | CRM-01, CRM-02 |
| [`CRM-04`](./plan/06-CRM.md) | Venta a crédito de verdad: guardia en factura-repo.cobrar, buscador de cliente con LIMIT y ModalCobro consciente del saldo | L | CRM-02, CRM-03 |
| [`CRM-05`](./plan/06-CRM.md) | Consultas de la ficha 360 y seguimiento de cotizaciones no convertidas | M | CRM-01 |
| [`CRM-06`](./plan/06-CRM.md) | crm-repo: interacciones con fecha, etiquetas/segmentos, cumpleaños y panel de recordatorios | M | CRM-01 |
| [`CRM-07`](./plan/06-CRM.md) | Pantalla Clientes: rediseño mobile-first y ficha 360 con pestañas (resumen, crédito, actividad, cotizaciones) | L | CRM-03, CRM-05, CRM-06 |
| [`BACKOFFICE-01`](./plan/07-BACKOFFICE.md) | Migracion 11: desfase horario del negocio e indices de factura, mas el modulo de dominio periodo.ts | M | — |
| [`BACKOFFICE-02`](./plan/07-BACKOFFICE.md) | Unificar el criterio de fecha en los agregados existentes y agregar ventas por hora y comparativa de periodos | M | BACKOFFICE-01 |
| [`BACKOFFICE-03`](./plan/07-BACKOFFICE.md) | Agregados de negocio del panel: margen por departamento, productos sin rotacion, devoluciones del periodo y diferencias de caja | M | BACKOFFICE-01, BACKOFFICE-02 |
| [`BACKOFFICE-04`](./plan/07-BACKOFFICE.md) | Migracion 12: existencia minima por producto y consulta de mercancia baja consciente del inventario apagado | M | BACKOFFICE-01 |
| [`BACKOFFICE-05`](./plan/07-BACKOFFICE.md) | resumenPanel: composicion unica de los KPIs con guardia de rol en la capa de datos | M | BACKOFFICE-02, BACKOFFICE-03, BACKOFFICE-04, RBAC-01 |
| [`BACKOFFICE-06`](./plan/07-BACKOFFICE.md) | Primitivas de grafica en SVG propio para @sfr/ui, con la geometria pura probada en vitest | M | — |
| [`BACKOFFICE-07`](./plan/07-BACKOFFICE.md) | Pantalla Panel y su integracion en AppShell, con arranque y visibilidad por rol | L | BACKOFFICE-05, BACKOFFICE-06, RBAC-02 |
| [`MULTICAJA-01`](./plan/08-MULTICAJA.md) | Migracion 11: identidad de instalacion, prefijo de caja y columnas para NCF por caja | S | — |
| [`MULTICAJA-02`](./plan/08-MULTICAJA.md) | Tipos Caja e Instalacion, caja-repo e instalacion-repo | M | MULTICAJA-01 |
| [`MULTICAJA-03`](./plan/08-MULTICAJA.md) | factura-repo y cotizacion-repo seguros entre cajas: numeracion propia, tickets por caja y existencia por delta | M | MULTICAJA-01, MULTICAJA-02 |
| [`MULTICAJA-04`](./plan/08-MULTICAJA.md) | NCF por caja: rangos disjuntos validados y consumo atomico del siguiente numero | L | MULTICAJA-01, MULTICAJA-02, MULTICAJA-03 |
| [`MULTICAJA-05`](./plan/08-MULTICAJA.md) | Corte de caja y reportes filtrados por caja y por usuario | M | MULTICAJA-01, MULTICAJA-02, MULTICAJA-03 |
| [`MULTICAJA-06`](./plan/08-MULTICAJA.md) | Identidad de caja en la aplicacion: seleccion, administracion, indicador en pantalla y en el recibo | L | MULTICAJA-02, MULTICAJA-03, MULTICAJA-05, RBAC-02 |
| [`MULTICAJA-07`](./plan/08-MULTICAJA.md) | Caja servidor en LAN: ApiClient centralizado, ruta de datos en @sfr/api y SqlDriver remoto | L | MULTICAJA-03, MULTICAJA-04, MULTICAJA-05 |
| [`NEGOCIO-FLAGS`](./plan/01-PLATAFORMA.md) | **(anadida)** Ampliar `negocio-repo.guardar()` para los seis interruptores nuevos | M | CENSO-COLUMNAS |
| [`RBAC-08`](./plan/02-RBAC.md) | **(anadida)** Pantalla Soporte (solo superadmin) | L | RBAC-02, RBAC-03, RBAC-04, PLATAFORMA-03, PLATAFORMA-07 |
| [`RBAC-09`](./plan/02-RBAC.md) | **(anadida)** Versionado real y actualizacion de la app | L | RBAC-08, CAJA-03 |
| [`RBAC-10`](./plan/02-RBAC.md) | **(anadida)** Configuracion remota (solo superadmin) | L | MULTICAJA-07, RBAC-04, RBAC-08, NEGOCIO-FLAGS |
| [`CAJA-08`](./plan/04-CAJA.md) | **(anadida)** Verificacion y declaracion de compatibilidad de hardware | M | CAJA-07 |
| [`COMPRAS-08`](./plan/05-COMPRAS.md) | **(anadida)** Puesta en marcha del inventario | M | COMPRAS-03, BACKOFFICE-04, NEGOCIO-FLAGS |
| [`BACKOFFICE-08`](./plan/07-BACKOFFICE.md) | **(anadida)** `recomendaciones()` — el "y cualquier otra recomendacion" | M | BACKOFFICE-03/04/05, CRM-03/05/06, CAJA-04 |

**63 tareas en total.** Las siete marcadas *(anadida)* no estaban en el borrador: cinco las
encontraron los revisores — sin ellas los puntos 3, 6 y 8 se entregaban a medias — y dos salieron
de tu definicion de "modificar la app".
