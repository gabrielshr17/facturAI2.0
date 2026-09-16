# Compras ampliado

> Punto 4 del pedido. 8 tareas: COMPRAS-01 a COMPRAS-08.
> Antes de despachar cualquier tarea de este archivo, lee [00-CONVENCIONES.md](./00-CONVENCIONES.md).

> [!IMPORTANT]
> **Los briefs de abajo dicen "migracion 11". Ignora ese numero.** Los escribieron ocho
> agentes en paralelo y los ocho reclamaron el id 11. La banda de ids de esta area es
> **`60-69`**; el reparto completo esta en
> [00-CONVENCIONES.md, seccion 2](./00-CONVENCIONES.md#2-reparto-de-ids-de-migracion-bandas).

> [!NOTE]
> **Decision 4 tomada: se mantiene la convencion real del repositorio.** Cabecera por archivo
> explicando el POR QUE de la decision no obvia, y cero comentarios inline decorativos. Donde
> algun brief de abajo diga "sin comentarios en el codigo", **esta superado por esta decision**.

## Estado actual

Hoy existe un modulo de Compras funcional de una sola pasada. `compra-repo.crear()` (packages/core/src/repos/compra-repo.ts:89-168) recibe cabecera + lineas de golpe, calcula totales con `calcularTotales` del dominio de factura, inserta 1 fila en `compra`, N en `compra_linea`, y luego llama a `aplicarEfectosInventario()` (linea 61-86) que para cada linea CON producto_id hace `UPDATE producto SET costo=?` (pisa el costo con el ultimo costo, siempre, sin confirmacion ni historial ni tocar precio_venta) y, SOLO si negocio.inventario_activo=1, suma a existencia e inserta un `movimiento_inventario` tipo 'compra' con costo y referencia_id=compra.id. El repo NO tiene actualizar/eliminar/anular: una compra registrada es inmutable. La pantalla Compras.tsx (527 lineas) ya trae: buscador de proveedor con navegacion por flechas, ALTA RAPIDA de proveedor (solo nombre, F6, linea 124-136), buscador de producto que precarga costo/impuesto (linea 144-151), "producto nuevo" que agrega una linea suelta con producto_id=null que NUNCA se registra en el catalogo (linea 153-162), edicion inline de cantidad y costo unitario, ADJUNTAR COMPROBANTE (foto/PDF) que se guarda base64 inline via comprobante-archivo-repo, boton opcional "Analizar con IA" contra el backend Fastify, e historial filtrable por fecha con panel de detalle. Lo que NO existe en ninguna capa: distincion pedida/recibida, recepcion parcial, tabla o consulta de historial de costo por producto, cualquier recalculo o aviso de precio de venta al subir el costo, creacion de producto al vuelo desde la compra, edicion de proveedor (no hay pantalla de Proveedores en ningun lado, solo el alta rapida dentro de Compras), y absolutamente nada de cuentas por pagar (la tabla `pago` tiene `factura_id TEXT NOT NULL`, es exclusiva de ventas; `compra` no tiene monto_pagado ni estado_pago; `proveedor` no tiene saldo). Tampoco hay usuario_id: compra-repo ni siquiera acepta el parametro (a diferencia de factura/corte/cotizacion), asi que la bitacora de "registrar_compra" y el movimiento_inventario quedan anonimos. Migraciones usadas: 1..10; la 5 es "compras". Cero transacciones SQL en todo el repositorio.

### Lo que ya existe y NO hay que reescribir

| Pieza | Evidencia | Se reutiliza como |
| --- | --- | --- |
| compra-repo.crear(): valida, calcula totales/ITBIS por linea, inserta cabecera + lineas y dispara efectos de inventario | `packages/core/src/repos/compra-repo.ts:89-168` | Punto de entrada a extender con cantidadPedida/cantidadRecibida y usuarioId. NO reescribir: el calculo de totales via calcularTotales/calcularLinea (lineas 100-105, 136) ya cuadra con los tests. |
| aplicarEfectosInventario(): pisa producto.costo y, con inventario activo, suma existencia + inserta movimiento_inventario tipo 'compra' con costo y referencia_id | `packages/core/src/repos/compra-repo.ts:61-86` | Es el gancho exacto donde entra el historial de costo y el recalculo de precio. El INSERT de movimiento_inventario (linea 79-84) es hoy el UNICO rastro de costo historico que existe. |
| proveedor-repo completo: crear/actualizar/eliminar(soft)/obtener/listar con busqueda sin acentos via normalizar() | `packages/core/src/repos/proveedor-repo.ts:29-97` | CRUD listo. Solo falta ampliar validarProveedor (linea 16-25) que hoy valida nombre y correo pero NO usa esRncValido, que ya existe exportado en @sfr/core. |
| Alta rapida de proveedor desde la misma pantalla de Compras, con atajo F6 | `packages/ui/src/pantallas/Compras.tsx:124-136 (crearProveedorRapido), 299-315 (UI), 90 (atajo)` | El cliente pide 'alta de proveedor desde la misma pantalla' y YA ESTA. Solo hay que ampliar el mini-formulario de 1 campo (nombre) a RNC/telefono/direccion. |
| Vinculacion de una linea a un producto existente, con precarga de costo, impuesto_tipo y tasa del producto | `packages/ui/src/pantallas/Compras.tsx:138-151 (buscarProducto/agregarLineaProducto)` | La mitad del requisito 'vincular a existente o crear al vuelo' ya funciona. Falta solo la rama de crear. |
| Adjuntar comprobante (foto/PDF) a la compra + descarga desde el detalle | `packages/core/src/repos/comprobante-archivo-repo.ts:26-52 y packages/ui/src/pantallas/Compras.tsx:238-248, 408-436, 510-521` | El requisito 'adjuntar el comprobante' esta COMPLETO. No rehacerlo. Ojo con la trampa del base64 inline (ver trampas). |
| Analisis del comprobante con IA que rellena NCF/fecha/proveedor/clasificacion (nunca las lineas) | `packages/ui/src/pantallas/Compras.tsx:174-196 y packages/ui/src/data/chatbotCliente.ts:68-81` | Si se pide prellenar lineas desde la foto, el canal HTTP y el tipo DatosExtraidosComprobante ya existen; hay que ampliar el endpoint /chatbot/analizar-comprobante, no crear otro cliente. |
| calcularPrecioVenta / precioBaseDesdeCosto / pctGananciaDesdePrecio (inverso: margen real implicito en un precio) | `packages/core/src/dominio/precio.ts:26-62` | Es EXACTAMENTE la matematica del 'recalculo de precios cuando sube el costo'. pctGananciaDesdePrecio (linea 42) existe justamente porque pct_ganancia guardado miente cuando el precio fue manual. |
| Patron de confirmacion 'antes -> despues' campo por campo antes de guardar cambios de producto | `packages/ui/src/componentes/ModalConfirmarCambios.tsx:15-45 y diferenciasProducto en packages/ui/src/componentes/FormularioProducto.tsx:26-47` | Es el componente de UI listo para el 'aviso cuando sube el costo': recibe CambioProducto[] y muestra tachado -> nuevo. Reusar tal cual para confirmar costo y precio nuevos. |
| producto-repo.crear(ProductoInput) que deriva precio_venta del costo + % si no se da precio manual | `packages/core/src/repos/producto-repo.ts:56-104` | Para crear el producto al vuelo desde una linea de compra: pasar costo=costoUnitario e impuesto_tipo de la linea. |
| movimiento-inventario-repo.listarPorProducto() y su UI de historial desplegable por producto | `packages/core/src/repos/movimiento-inventario-repo.ts:10-17 y packages/ui/src/pantallas/Productos.tsx:126, 463-468` | Sitio natural donde colgar el historial de costo por producto sin inventar pantalla nueva. |
| registrarAccion(db, {...}) compartida, con usuarioId opcional; ValidacionError con {campo, mensaje} | `packages/core/src/repos/bitacora-repo.ts:35-55 y packages/core/src/repos/producto-repo.ts:41-46` | Toda accion nueva (recibir mercancia, aprobar costo, pagar a proveedor) debe pasar por aqui. La firma YA acepta usuarioId; el problema es que nadie se lo pasa. |
| Tests de compras ya montados sobre node:sqlite en memoria con migrate() real | `packages/core/test/compra-repo.test.ts:14-18, 43-148` | Archivo exacto donde escribir los tests en rojo (TDD). El helper nuevaDb() y los casos de inventario on/off (lineas 82-117) son la plantilla. |

### Lo que falta

| Capa | Hueco | Por que importa |
| --- | --- | --- |
| esquema | compra_linea no distingue cantidad pedida de cantidad recibida: solo tiene `cantidad REAL NOT NULL DEFAULT 1` | Es el requisito central. Sin una segunda columna (cantidad_pedida vs cantidad_recibida) no hay forma de expresar 'pedi 100, llegaron 60' y el inventario se infla con mercancia que no llego. |
| esquema | No existe estado de recepcion en `compra` (nada tipo pendiente/parcial/completa) ni fecha de recepcion | Sin estado no hay bandeja de 'compras pendientes de recibir' ni forma de saber que queda debiendo el proveedor. |
| esquema | No existe tabla de historial de costo por producto. El unico rastro es movimiento_inventario.costo, y SOLO se escribe si negocio.inventario_activo=1 | Con inventario apagado (que es el default de la migracion 1) el costo se pisa y el valor anterior desaparece para siempre. No se puede auditar ni graficar la evolucion del costo. |
| esquema | No existe nada de cuentas por pagar: `compra` no tiene monto_pagado/estado_pago/fecha_vencimiento, `proveedor` no tiene saldo, y la tabla `pago` es exclusiva de ventas (factura_id TEXT NOT NULL) | Evaluar cuentas por pagar implica tabla nueva (pago_compra) o columnas en compra + saldo en proveedor. No hay ningun cimiento; solo existe el equivalente de ventas: cliente.aplica_credito/limite_credito/saldo_credito. |
| repo | compra-repo no tiene actualizar(), recibir(), anular() ni eliminar(): una compra es inmutable tras crearla | Recepcion parcial exige escribir DESPUES de crear la compra (recibir mercancia mas tarde). Hoy no hay ninguna ruta de escritura posterior en el repo. |
| repo | aplicarEfectosInventario pisa producto.costo sin comparar contra el costo anterior, sin registrar el cambio y sin tocar precio_venta ni pct_ganancia | Si el costo sube de 35 a 42 y el precio queda en 50, el margen real cae en silencio y nadie se entera. Es el segundo requisito explicito del cliente. |
| repo | compra-repo no acepta usuarioId en ningun metodo, a diferencia de factura/corte/cotizacion; registrarAccion se llama sin usuario y movimiento_inventario hardcodea usuario_id null | El cliente pide que 'supervisor, dueno y superadmin' puedan registrar compras. No hay sesion ni rol ni usuario-repo, asi que la regla de autorizacion no se puede escribir en el servicio (regla del proyecto: validacion SIEMPRE en el repo, nunca solo en la UI). Este modulo depende del modulo de usuarios. |
| ui | La linea suelta ('+ Producto nuevo') crea producto_id=null permanente; nunca se ofrece dar de alta el producto en el catalogo | Requisito explicito 'crear el producto nuevo al vuelo'. Ademas, sin producto_id la linea no afecta inventario ni costo (compra-repo.ts:68) y el articulo queda invisible para Ventas. |
| ui | La grilla de lineas en Compras.tsx tiene solo Descripcion / Cantidad / Costo unitario / Subtotal; no hay columna de recibida, ni vinculo al producto, ni indicador de costo anterior vs nuevo | Es donde el usuario tiene que ver 'costo anterior 35 -> nuevo 42 (+20%)' y capturar lo que realmente llego. |
| ui | No existe pantalla de Proveedores en ningun modulo (AppShell.tsx:28-31 lista 9 modulos y ninguno es Proveedores); el alta rapida captura solo el nombre | proveedor-repo tiene actualizar() y eliminar() que NINGUNA UI llama. Un RNC mal escrito no se puede corregir desde la app, y cuentas por pagar sin estado de cuenta por proveedor no sirve. |
| ui | Compras.tsx no importa useBreakpoint/useEsAngosto: usa gridTemplateColumns '1fr 1fr 1fr' fijo (linea 267) y un panel lateral de 340px (linea 464) | Regla mobile-first del proyecto. Otras pantallas (Ventas, ConsultaFacturas, ConsultaCotizaciones) ya adaptan por tramo; Compras se rompe a 375px. |
| repo | backup-repo.TABLAS es un array literal fijo de 23 tablas | Cualquier tabla nueva (costo_historial, pago_compra) que no se agregue ahi queda FUERA del respaldo sin error ni aviso: perdida de datos silenciosa al restaurar. |
| api | packages/api/db/schema.sql y sync-rules.yaml no reflejan las tablas nuevas y ya estan desactualizados (schema.sql corta en bitacora_accion: faltan devolucion, promocion, cotizacion y producto.favorito de las migraciones 7-10) | Es la traduccion a Postgres para la Fase 2. Si se agregan columnas ahora y no se espejan, la deuda crece; conviene decidir explicitamente si se actualiza o se asume desincronizado. |
| repo | Cero tests para recepcion parcial, historial de costo, recalculo de precio y pagos a proveedor | El proyecto exige TDD rojo-verde-refactor con vitest. compra-repo.test.ts cubre solo el flujo actual (totales, con/sin fiscal, costo pisado, inventario on/off, filtros). |

## Enfoque recomendado

UNA sola migracion (id 11) para toda el area, y ni una linea de logica nueva encima del esquema viejo. Razon: el migrador aplica por id y salta lo ya registrado (packages/core/src/db/migrator.ts:17-29), asi que editar 1-10 es imposible en instalaciones reales, y el exec() de Tauri parte el SQL por ';' a lo bruto (packages/desktop/src/db/tauri-sql-driver.ts:17-22), asi que cada migracion extra es otra oportunidad de romper solo el escritorio. La 11 lleva DDL plano (ALTER TABLE ADD COLUMN / CREATE TABLE / CREATE INDEX, cero TRIGGER, cero ';' dentro de literales) mas UPDATEs de backfill que dejan el comportamiento actual EXACTAMENTE igual: cantidad_recibida = cantidad y estado_recepcion = 'completa' en todo lo historico, para que ningun reporte que el dueno ya vio cambie de numero.

Cinco decisiones de diseno que gobiernan el area:

1) `compra_linea.cantidad` NO se renombra: pasa a significar cantidad PEDIDA y se agrega `cantidad_recibida REAL NOT NULL DEFAULT 0` como acumulador. Renombrar arrastraria compra-repo, los tests y el calculo de totales sin ganar nada semantico.

2) La recepcion parcial es un EVENTO, no una edicion. Tablas `compra_recepcion` + `compra_recepcion_linea`: cada llegada se registra con su fecha y su usuario, y `compra_linea.cantidad_recibida` / `compra.estado_recepcion` son la vista denormalizada recalculada desde esos eventos. Es la unica forma de auditar quien recibio que y cuando SIN depender de movimiento_inventario, que solo se escribe si negocio.inventario_activo=1 (el default de fabrica es 0).

3) El costo se historia SIEMPRE y el precio NUNCA se toca solo. `costo_historial` se escribe con inventario on u off, arreglando la asimetria de compra-repo.ts:70-84 que hoy pisa el costo antes del `if (!inventarioActivo) continue` y pierde el valor anterior para siempre. producto.costo sigue siendo el ULTIMO costo (se agrega `negocio.politica_costo` como costura para promedio ponderado, sin activarlo: cambiarlo reescribiria retroactivamente reportes-repo.resumenGanancia). El precio de venta solo cambia por una llamada explicita y aprobada `aplicarAjusteCosto`, y el margen se deriva SIEMPRE con pctGananciaDesdePrecio(costo_anterior, precio_actual, tasa) (packages/core/src/dominio/precio.ts:42), nunca con el pct_ganancia guardado, que vale 0 cuando el precio se escribio a mano y desplomaria el precio. "Manual manda" (precio.ts:56) se respeta: el sistema avisa y sugiere, el humano aprueba.

4) El inventario suma lo RECIBIDO, no lo pedido. Como no hay transacciones en ningun driver (SqlDriver no expone begin/commit), los efectos se aplican despues de que la compra y sus lineas ya estan escritas y son idempotentes por (compra_id, recepcion_id): si una escritura se corta a la mitad, reintentar no duplica existencia.

5) La autorizacion vive en core. `dominio/compra.ts` expone puedeRegistrarCompra(rol) / puedeAprobarCambioPrecio(rol) y todo metodo de escritura acepta usuarioId; esconder un boton en Compras.tsx no es el guardia. Dependencia BLANDA de RBAC: usuarioId es nullable hoy, y cuando el modulo de usuarios aterrice solo hay que pasarle la sesion. Ninguna tarea de esta area espera a RBAC.

Lo que este modulo NO hace: no toca packages/api/db/schema.sql ni sync-rules.yaml (ya estan desincronizados desde la migracion 7; se asume divergencia declarada y se salda en el area PLATAFORMA), no agrega transacciones a los drivers (PLATAFORMA), no saca el comprobante base64 de SQLite (PLATAFORMA) y por eso limita los adjuntos a uno por compra, no uno por recepcion. El codigo TypeScript nuevo lleva cabecera por archivo que explica el POR QUE de la decision no obvia y cero comentarios inline decorativos (convencion real del repo, decision 4 tomada); en migrations.ts se mantiene el estilo del archivo con comentarios SQL cortos y sin ';'.

### Alternativas descartadas

- Renombrar compra_linea.cantidad a cantidad_pedida: obliga a ALTER TABLE RENAME COLUMN (fragil con el split por ';' de Tauri), rompe compra-repo, COLS_LINEA, los tests y el backfill, y no aporta semantica que no aporte ya el par cantidad/cantidad_recibida documentado en tipos.ts.
- Colgar el historial de costo de movimiento_inventario: es la causa raiz del agujero. movimiento_inventario.costo solo se escribe si negocio.inventario_activo=1 (compra-repo.ts:79-84) y ese flag viene apagado de fabrica (migrations.ts:40), asi que con inventario off el costo anterior desaparece sin rastro. Tabla costo_historial propia, escrita siempre.
- Recalcular el precio de venta automaticamente al subir el costo usando producto.pct_ganancia: pct_ganancia solo se actualiza cuando el precio se DERIVA; si el dueno escribio el precio a mano vale tipicamente 0, y calcularPrecioVenta con pct 0 devuelve costo + ITBIS, desplomando el precio. Ademas viola la regla de dominio 'manual manda' (precio.ts:56). Se avisa y se sugiere; aprueba un humano con permiso.
- Cambiar producto.costo a promedio ponderado en esta tanda: reportes-repo.resumenGanancia (reportes-repo.ts:84-106) multiplica cantidades vendidas por el costo ACTUAL, asi que cambiar la politica reescribe retroactivamente TODA la ganancia historica que el dueno ya vio. Se deja negocio.politica_costo='ultimo' como costura inerte.
- Reutilizar la tabla `pago` para pagos a proveedor: `pago.factura_id TEXT NOT NULL` (migrations.ts:163) es exclusiva de ventas; aflojarlo a nullable obligaria a recrear la tabla en una migracion y contaminaria corte de caja y reportes por metodo de pago. Tabla pago_compra separada.
- Agregar transacciones (begin/commit/rollback) al SqlDriver dentro de esta area: toca los tres drivers y choca con el debounce de 150ms de sql.js que reserializa la base entera (packages/web/src/db/sqljs-driver.ts:64-80). Se mitiga con orden de escritura (cabecera y lineas primero, efectos despues) y efectos idempotentes por referencia. La transaccionalidad real es tarea del area PLATAFORMA.
- Crear una pantalla de Proveedores completa dentro de Compras: proveedor-repo ya tiene actualizar/eliminar sin UI, pero un modulo nuevo en AppShell (MODULOS, AppShell.tsx:28-31) pertenece al area BACKOFFICE. Aqui solo se amplia el alta rapida existente (Compras.tsx:124-136) a RNC/telefono/direccion con validacion de RNC en core.
- Adjuntar un comprobante por cada recepcion parcial: comprobante_archivo guarda base64 dentro de SQLite (migrations.ts:341) y en la PWA cada escritura reserializa la base completa, encareciendo hasta las ventas. Se mantiene un adjunto por compra hasta que PLATAFORMA decida el almacenamiento de archivos.
- Espejar las tablas nuevas en packages/api/db/schema.sql y sync-rules.yaml: ese schema ya corta en bitacora_accion y le faltan devolucion, promocion, cotizacion y producto.favorito (migraciones 7-10). Actualizar solo lo de compras dejaria un espejo a medias mas enganoso que uno declaradamente desfasado; se salda de una vez en PLATAFORMA.

## Trampas especificas de esta area

- CERO TRANSACCIONES EN TODO EL REPO. `SqlDriver` (packages/core/src/db/driver.ts:11-22) no expone begin/commit/rollback y no hay un solo BEGIN/COMMIT en core, web ni desktop. compra-repo.crear() ya hace 1 + N + hasta 3N escrituras sueltas; agregar historial de costo + recalculo de precio + pagos multiplica las escrituras no atomicas. Si falla a mitad queda una compra a medias sin forma de revertirla (no hay anular()). Si se decide agregar transacciones hay que tocar los TRES drivers, y ojo con sql.js: persiste con un debounce de 150ms serializando la base ENTERA (packages/web/src/db/sqljs-driver.ts:64-80), asi que una transaccion abierta interactua mal con el snapshot.
- EL exec() DE TAURI PARTE EL SQL POR ';' A LO BRUTO (packages/desktop/src/db/tauri-sql-driver.ts:17-22, split(';')). Una migracion nueva con TRIGGER (BEGIN...END;), con un DEFAULT que contenga ';' o con un string literal con ';' se parte en pedazos invalidos y REVIENTA SOLO EN ESCRITORIO — los tests de Node y la PWA pasan verdes porque sus drivers aceptan lotes. Regla practica: la migracion 11 solo puede contener CREATE TABLE / ALTER TABLE ADD COLUMN / CREATE INDEX planos.
- INSTALACIONES REALES: el migrador aplica por id y salta las ya registradas en `_migracion` (packages/core/src/db/migrator.ts:17-29). NUNCA editar las migraciones 1-10 (en una base existente el cambio jamas se aplica y el esquema queda divergente segun cuando se instalo). Toda columna nueva va en una migracion 11. SQLite no admite ALTER TABLE ADD COLUMN NOT NULL sin DEFAULT: el precedente correcto es migrations.ts:451 (`ADD COLUMN favorito INTEGER NOT NULL DEFAULT 0`). Y hace falta BACKFILL explicito: si se agrega cantidad_recibida, toda compra historica quedaria como 'no recibida' salvo que la migracion haga UPDATE compra_linea SET cantidad_recibida = cantidad.
- EL DRIVER DE NODE (tests) NO ACEPTA BOOLEANS NI undefined COMO PARAMETROS: packages/core/src/db/drivers/node-sqlite.ts:31 hace db.prepare(sql).run(...params) sobre node:sqlite, que solo bindea null/number/string/bigint/Uint8Array. Todo el codigo existente ya bindea 0/1 y null explicitos por eso. Un `input.pagada ?? undefined` rompe los tests con un TypeError confuso.
- PRAGMA foreign_keys = ON esta en node-sqlite.ts:24 y en sqljs-driver.ts:62 PERO NO en el driver de Tauri. Una FK nueva (por ejemplo costo_historial.compra_id o pago_compra.proveedor_id) se valida en tests y en la PWA y NO en escritorio: se pueden insertar huerfanos solo en la app que mas se usa. No asumir integridad referencial del motor.
- producto.costo se pisa con el ULTIMO costo (compra-repo.ts:70), no promedio ponderado, y reportes-repo.resumenGanancia calcula la ganancia multiplicando cantidades vendidas por el producto.costo ACTUAL (packages/core/src/repos/reportes-repo.ts:84-106; la limitacion esta documentada en las lineas 7-9). Consecuencia: cambiar la politica de costo reescribe retroactivamente TODOS los reportes de ganancia historicos del negocio. Tocar esto sin avisar es cambiar numeros que el dueno ya vio.
- RECALCULAR EL PRECIO CON pct_ganancia GUARDADO PUEDE DESPLOMAR EL PRECIO. pct_ganancia solo se actualiza cuando el precio se DERIVA; si el dueno escribio el precio a mano, pct_ganancia se queda en lo que tuviera (tipicamente 0) — esta documentado en packages/core/src/dominio/precio.ts:30-41. Un `calcularPrecioVenta({costo: nuevo, pctGanancia: producto.pct_ganancia})` con pct 0 devuelve el costo mas ITBIS. Hay que derivar el margen REAL con pctGananciaDesdePrecio(costo_anterior, precio_actual, tasa) (precio.ts:42) antes de reaplicar. Ademas 'manual manda' (precio.ts:56) es una regla del dominio: recalcular automaticamente la viola.
- LA ASIMETRIA COSTO/INVENTARIO YA EXISTE Y ES LA CAUSA DEL AGUJERO DE HISTORIAL: el costo se pisa SIEMPRE (compra-repo.ts:70, antes del `if (!inventarioActivo) continue` de la linea 71), pero el movimiento_inventario que guarda ese costo solo se escribe con inventario activo (lineas 79-84). Con inventario apagado — el default de fabrica — el costo anterior se pierde sin dejar rastro. El historial de costo NO puede colgarse de movimiento_inventario.
- La UI escribe la fecha como `${fecha}T12:00:00.000` SIN 'Z' a proposito (Compras.tsx:220-223: fecha-hora flotante para que date() de SQLite y new Date() coincidan con el dia elegido), mientras los tests usan '...Z' (compra-repo.test.ts:50). Toda consulta nueva por fecha (vencimientos de cuentas por pagar) debe usar date(campo) >= date(?) como ya hace listar() (compra-repo.ts:185-186), nunca comparacion de strings.
- comprobante_archivo guarda el PDF/foto EN BASE64 DENTRO DE SQLITE (migrations.ts:341, contenido_base64 TEXT NOT NULL). En la PWA cada escritura re-serializa la base COMPLETA a IndexedDB (sqljs-driver.ts:69: db.export()), asi que cada comprobante adjuntado hace mas lenta toda escritura posterior, incluidas las ventas. Ya es deuda latente y choca frontalmente con la regla global 'no binarios en la base'. Mas adjuntos por recepcion parcial la agravan.
- Las lineas del formulario son estado local sin id y la key de React es el INDICE del array (Compras.tsx:383-384, LineaLocal en 18-25). Con recepcion parcial hay que editar por linea y potencialmente reordenar/filtrar: hace falta un id local estable o se mezclan los valores entre filas al borrar una del medio.
- validarLineaCompra exige cantidad > 0 (compra-repo.ts:43-45). Una recepcion de 0 unidades de un articulo (llego el pedido pero ese renglon no vino) seria rechazada hoy: la validacion hay que separarla en 'pedida > 0' y 'recibida >= 0'.
- El repo esta LLENO de comentarios JSDoc explicativos y densos (ver compra-repo.ts:9-16, precio.ts:30-46, useBreakpoint.ts:3-23), en contra de la regla global 'sin comentarios en el codigo'. Hay que decidir conscientemente si el codigo nuevo sigue el estilo del repo o la regla; mezclarlos deja el modulo inconsistente.
- La busqueda de proveedor y de producto traen TODAS las filas y filtran en JS (proveedor-repo.ts:89-94, producto-repo.ts:216-230, comentado en 207-214). Es deliberado (SQLite no quita diacriticos). Una pantalla de cuentas por pagar que liste proveedores con saldo debe seguir ese patron o justificar el SQL.

## Preguntas para el dueno del negocio

- Politica de costo: ¿el costo del producto pasa a ser el ULTIMO costo de compra (como hoy) o promedio ponderado? Ojo: cambiarlo reescribe retroactivamente todos los reportes de ganancia que el dueno ya vio.
- Al subir el costo, ¿el precio de venta se recalcula AUTOMATICAMENTE manteniendo el margen, solo se AVISA, o se pide confirmacion producto por producto? ¿Y que pasa con los productos cuyo precio fue escrito a mano (la regla actual del sistema es que el precio manual manda)?
- ¿Hay un umbral para el aviso (por ejemplo, avisar solo si el costo sube mas de un X%) o se avisa de cualquier variacion?
- Recepcion parcial: ¿una compra se recibe en VARIOS eventos con fechas distintas (necesita tabla de recepciones), o se corrige la cantidad una sola vez al confirmar la llegada? ¿Se permite recibir MAS de lo pedido?
- ¿El inventario suma cuando se registra la compra (como hoy) o cuando se RECIBE la mercancia? Si pasa a recibir, las compras historicas ya sumaron: hay que decidir que se asume de ellas.
- Cuentas por pagar: ¿hace falta registrar pagos PARCIALES al proveedor, fecha de vencimiento y condiciones (contado / 30 / 60 dias)? ¿Se necesita estado de cuenta por proveedor y alerta de vencidas, o basta con marcar la compra como pagada/no pagada?
- Permisos: el cliente nombra supervisor, dueno y superadmin, pero hoy NO existe login, ni sesion, ni usuario-repo, ni ninguna comprobacion de rol. ¿Este modulo espera al modulo de usuarios, o se construye sin permisos y se le agregan despues? (La regla del proyecto prohibe dejar la regla de autorizacion solo en el frontend.)
- ¿Quien puede APROBAR un cambio de costo que dispara un cambio de precio? ¿Es el mismo permiso que registrar la compra o uno distinto?
- El comprobante adjunto hoy vive como base64 DENTRO de la base de datos, lo que la engorda y hace mas lenta cada venta posterior. ¿Se acepta asi por ahora o este modulo obliga a decidir ya el almacenamiento de archivos fuera de la base?
- Producto creado al vuelo desde una compra: ¿con que precio de venta y que % de ganancia nace? ¿Se le pide al usuario en el momento, se usa un % por defecto del negocio, o queda inactivo hasta que alguien lo complete en Productos?
- ¿Hace falta una pantalla de Proveedores propia (editar RNC/telefono, ver historial y saldo) o alcanza con el alta rapida desde Compras? Hoy proveedor-repo tiene actualizar() y eliminar() que ninguna pantalla llama.

## Tareas

### COMPRAS-01 — Migracion 11: recepcion parcial, historial de costo y cuentas por pagar (solo esquema)

**Objetivo.** El esquema soporta pedida/recibida, eventos de recepcion, historial de costo y pagos a proveedor, con backfill que deja el comportamiento actual identico y el respaldo completo.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio — una migracion mal formada solo falla en escritorio (split por ';') mientras tests y PWA quedan verdes, y el backfill reescribe todas las compras historicas de una instalacion real. | nada |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript estricto, TODO en espanol: nombres, tipos y columnas SQL). Trabaja en una rama feature/ (nunca en master) y NO escribas comentarios en el codigo TypeScript.

TAREA: agregar UNA migracion con id 11 al array `migrations` de packages/core/src/db/migrations.ts, los tipos correspondientes en packages/core/src/repos/tipos.ts, las tablas nuevas al respaldo en packages/core/src/repos/backup-repo.ts y los tests de esquema. NADA de logica de repos en esta tarea.

PATRON A IMITAR: la migracion 9 (migrations.ts:451, `ALTER TABLE producto ADD COLUMN favorito INTEGER NOT NULL DEFAULT 0`) para columnas nuevas, y la migracion 5 'compras' (migrations.ts:278-350) para CREATE TABLE + CREATE INDEX. Los tipos imitan `Compra`/`CompraLinea` en packages/core/src/repos/tipos.ts:244-270 (todos extienden `Auditoria`).

El SQL exacto propuesto esta en el campo migracionSql de esta tarea: usalo tal cual salvo que encuentres un conflicto real de nombres.

REGLAS DURAS DEL ESQUEMA EN ESTE REPO (romper una de estas revienta solo en produccion):
- NUNCA edites las migraciones 1-10. El migrador (packages/core/src/db/migrator.ts:17-29) aplica por id y salta las ya registradas en `_migracion`: en una instalacion existente tu cambio jamas se aplicaria.
- El exec() del driver de Tauri (packages/desktop/src/db/tauri-sql-driver.ts:17-22) hace split(';') a lo bruto. Prohibido: TRIGGER, bloques BEGIN...END, cualquier ';' dentro de un string literal o de un comentario. Solo ALTER TABLE ADD COLUMN / CREATE TABLE / CREATE INDEX / UPDATE planos.
- SQLite no admite ADD COLUMN NOT NULL sin DEFAULT. Toda columna nueva NOT NULL lleva DEFAULT.
- ADD COLUMN con REFERENCES solo se permite si el default es NULL (por eso usuario_id va sin NOT NULL).
- El backfill (los UPDATE al final) es obligatorio: sin el, toda compra historica quedaria como 'no recibida' y el inventario y los reportes que el dueno ya vio cambiarian de sentido.

TIPOS a agregar en tipos.ts: `EstadoRecepcion = "pendiente" | "parcial" | "completa"`, `EstadoPago = "no_registrado" | "pendiente" | "parcial" | "pagada"`, `CondicionPago = "contado" | "credito"`, `PoliticaCosto = "ultimo" | "promedio"`, `OrigenCambioCosto = "compra" | "manual" | "ajuste"`, y las interfaces `CostoHistorial`, `CompraRecepcion`, `CompraRecepcionLinea`, `PagoCompra` (todas extienden Auditoria). Amplia `Compra` con estado_recepcion, fecha_recepcion, usuario_id, condicion_pago, dias_credito, fecha_vencimiento, monto_pagado, estado_pago; `CompraLinea` con cantidad_recibida; `Negocio` con politica_costo y umbral_aviso_costo_pct.

backup-repo.ts: agrega "costo_historial", "compra_recepcion", "compra_recepcion_linea", "pago_compra" al array TABLAS (backup-repo.ts:9-19). Si falta una, se pierde en silencio al restaurar.

NO TOQUES: packages/core/src/repos/compra-repo.ts, proveedor-repo.ts, producto-repo.ts ni ningun otro repo; packages/ui/** completo; packages/api/db/schema.sql y packages/api/sync-rules.yaml (se asumen desincronizados a proposito, se saldan en el area PLATAFORMA); las migraciones 1 a 10.

CIERRE: `pnpm -r typecheck` y `pnpm --filter @sfr/core test` en verde, los tests existentes de packages/core/test/compra-repo.test.ts deben seguir pasando SIN modificarlos.
```

#### SQL de la migracion

```sql
{
  id: 11,
  nombre: "compras_recepcion_costo_pagos",
  sql: /* sql */ `
    -- Recepcion: cantidad queda como PEDIDA, cantidad_recibida es el acumulado.
    ALTER TABLE compra_linea ADD COLUMN cantidad_recibida REAL NOT NULL DEFAULT 0;
    ALTER TABLE compra ADD COLUMN estado_recepcion TEXT NOT NULL DEFAULT 'pendiente';
    ALTER TABLE compra ADD COLUMN fecha_recepcion TEXT;
    ALTER TABLE compra ADD COLUMN usuario_id TEXT REFERENCES usuario(id);

    -- Cuentas por pagar al proveedor.
    ALTER TABLE compra ADD COLUMN condicion_pago TEXT NOT NULL DEFAULT 'contado';
    ALTER TABLE compra ADD COLUMN dias_credito INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE compra ADD COLUMN fecha_vencimiento TEXT;
    ALTER TABLE compra ADD COLUMN monto_pagado REAL NOT NULL DEFAULT 0;
    ALTER TABLE compra ADD COLUMN estado_pago TEXT NOT NULL DEFAULT 'pendiente';

    -- Politica de costo y umbral de aviso, por negocio.
    ALTER TABLE negocio ADD COLUMN politica_costo TEXT NOT NULL DEFAULT 'ultimo';
    ALTER TABLE negocio ADD COLUMN umbral_aviso_costo_pct REAL NOT NULL DEFAULT 0;

    -- Historial de costo: se escribe SIEMPRE, con inventario on u off.
    CREATE TABLE costo_historial (
      id                     TEXT PRIMARY KEY,
      producto_id            TEXT NOT NULL REFERENCES producto(id),
      costo_anterior         REAL NOT NULL DEFAULT 0,
      costo_nuevo            REAL NOT NULL DEFAULT 0,
      variacion_pct          REAL NOT NULL DEFAULT 0,
      precio_venta_anterior  REAL NOT NULL DEFAULT 0,
      precio_venta_nuevo     REAL,
      margen_anterior_pct    REAL NOT NULL DEFAULT 0,
      margen_resultante_pct  REAL NOT NULL DEFAULT 0,
      origen                 TEXT NOT NULL DEFAULT 'compra',
      compra_id              TEXT REFERENCES compra(id),
      compra_linea_id        TEXT REFERENCES compra_linea(id),
      usuario_id             TEXT REFERENCES usuario(id),
      fecha                  TEXT NOT NULL,
      created_at             TEXT NOT NULL,
      updated_at             TEXT NOT NULL,
      deleted_at             TEXT
    );
    CREATE INDEX ix_costo_historial_producto ON costo_historial(producto_id);
    CREATE INDEX ix_costo_historial_fecha ON costo_historial(fecha);

    -- Cada llegada de mercancia es un evento con su fecha y su usuario.
    CREATE TABLE compra_recepcion (
      id          TEXT PRIMARY KEY,
      compra_id   TEXT NOT NULL REFERENCES compra(id),
      fecha       TEXT NOT NULL,
      usuario_id  TEXT REFERENCES usuario(id),
      notas       TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );
    CREATE INDEX ix_compra_recepcion_compra ON compra_recepcion(compra_id);

    CREATE TABLE compra_recepcion_linea (
      id               TEXT PRIMARY KEY,
      recepcion_id     TEXT NOT NULL REFERENCES compra_recepcion(id),
      compra_linea_id  TEXT NOT NULL REFERENCES compra_linea(id),
      cantidad         REAL NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      deleted_at       TEXT
    );
    CREATE INDEX ix_compra_recepcion_linea_recepcion ON compra_recepcion_linea(recepcion_id);
    CREATE INDEX ix_compra_recepcion_linea_compra_linea ON compra_recepcion_linea(compra_linea_id);

    -- Pagos al proveedor. Tabla propia: pago.factura_id es NOT NULL (solo ventas).
    CREATE TABLE pago_compra (
      id          TEXT PRIMARY KEY,
      compra_id   TEXT NOT NULL REFERENCES compra(id),
      fecha       TEXT NOT NULL,
      metodo      TEXT NOT NULL DEFAULT 'efectivo',
      monto       REAL NOT NULL DEFAULT 0,
      referencia  TEXT,
      usuario_id  TEXT REFERENCES usuario(id),
      notas       TEXT,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL,
      deleted_at  TEXT
    );
    CREATE INDEX ix_pago_compra_compra ON pago_compra(compra_id);

    -- Backfill: lo historico se considera recibido completo y sin pagos registrados.
    UPDATE compra_linea SET cantidad_recibida = cantidad;
    UPDATE compra SET estado_recepcion = 'completa', fecha_recepcion = fecha, estado_pago = 'no_registrado', monto_pagado = 0;
  `,
}
```

#### Archivos a tocar

- `packages/core/src/db/migrations.ts`
- `packages/core/src/repos/tipos.ts`
- `packages/core/src/repos/backup-repo.ts`
- `packages/core/test/migrations.test.ts`

#### Criterios de aceptacion

- [ ] La migracion 11 aplica sobre una base nueva y sobre una base que ya estaba en la 10, sin error en los tres drivers (node:sqlite en tests es el gate obligatorio).
- [ ] Ninguna migracion del array contiene la palabra TRIGGER ni un ';' dentro de un literal de cadena.
- [ ] Tras migrar una base con compras preexistentes: toda compra_linea tiene cantidad_recibida = cantidad, toda compra tiene estado_recepcion='completa', fecha_recepcion=fecha y estado_pago='no_registrado'.
- [ ] backup-repo.TABLAS incluye las cuatro tablas nuevas y exportarTodo() las devuelve como arrays vacios en una base recien migrada.
- [ ] tipos.ts compila sin `any` y expone EstadoRecepcion, EstadoPago, CondicionPago, CostoHistorial, CompraRecepcion, CompraRecepcionLinea y PagoCompra.
- [ ] packages/core/test/compra-repo.test.ts pasa sin ninguna modificacion.

#### Pruebas a escribir primero (TDD)

- migrations.test.ts: migrar una base nueva y verificar via PRAGMA table_info(compra_linea) que existe cantidad_recibida REAL NOT NULL con default 0.
- migrations.test.ts: PRAGMA table_info(compra) incluye estado_recepcion, fecha_recepcion, usuario_id, condicion_pago, dias_credito, fecha_vencimiento, monto_pagado y estado_pago.
- migrations.test.ts: aplicar solo migraciones 1..10, insertar a mano una compra con dos lineas, aplicar la 11 y comprobar que cantidad_recibida == cantidad en ambas lineas y estado_recepcion == 'completa'.
- migrations.test.ts: tras la 11, estado_pago de la compra historica es 'no_registrado' y monto_pagado es 0 (no se inventa deuda ni pago).
- migrations.test.ts: guardia anti-Tauri — para cada migracion, expect(m.sql).not.toMatch(/TRIGGER/i) y ningun ';' dentro de comillas simples.
- migrations.test.ts: SELECT count(*) FROM costo_historial / compra_recepcion / compra_recepcion_linea / pago_compra devuelve 0 en base nueva (las tablas existen).
- backup-repo.test.ts (o migrations.test.ts): toda tabla de sqlite_master que no empiece por '_' ni por 'sqlite_' esta presente en backup-repo.TABLAS.

---

### COMPRAS-02 — Dominio puro de recepcion, impacto de costo/precio y permisos de compra

**Objetivo.** La matematica de recepcion, de variacion de costo y de precio sugerido vive en funciones puras probadas, sin base de datos.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo — funciones puras sin IO; el unico riesgo real es reintroducir el uso de pct_ganancia guardado, que los tests bloquean. | COMPRAS-01 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Rama feature/, TypeScript estricto sin `any`, TODO en espanol, SIN comentarios en el codigo nuevo.

TAREA: crear packages/core/src/dominio/compra.ts con funciones PURAS (sin SqlDriver, sin IO) y exportarlas desde packages/core/src/index.ts. Ademas, endurecer validarProveedor.

PATRON A IMITAR: packages/core/src/dominio/precio.ts (funciones puras, redondear2 desde dominio/dinero.js) y packages/core/src/dominio/validacion.ts (tieneValor, esRncValido, ErrorValidacion).

FUNCIONES A ESCRIBIR:
1. `estadoRecepcion(lineas: { cantidad: number; cantidadRecibida: number }[]): EstadoRecepcion` — 'pendiente' si todo recibido es 0, 'completa' si toda linea llego a su cantidad pedida (o mas), 'parcial' en cualquier otro caso. Lista vacia => 'pendiente'.
2. `validarRecepcion(input: { pedida: number; recibidaAcumulada: number; aRecibir: number; permitirExceso: boolean }): ErrorValidacion[]` — aRecibir debe ser >= 0 (0 es VALIDO: ese renglon no llego), y recibidaAcumulada + aRecibir no puede superar pedida salvo permitirExceso. Devuelve el mismo shape {campo, mensaje} que el resto del repo.
3. `impactoCosto(input: { costoAnterior: number; costoNuevo: number; precioVentaActual: number; tasaImpuesto: number; umbralAvisoPct: number }): ImpactoCosto` con { variacionPct, margenAnteriorPct, margenResultantePct, precioSugerido, requiereAviso }.
   CRITICO: margenAnteriorPct se calcula con pctGananciaDesdePrecio(costoAnterior, precioVentaActual, tasaImpuesto) de packages/core/src/dominio/precio.ts:42 — NUNCA con producto.pct_ganancia guardado, que vale 0 cuando el precio se escribio a mano y hundiria el precio sugerido hasta costo+ITBIS. precioSugerido = calcularPrecioVenta({ costo: costoNuevo, pctGanancia: margenAnteriorPct, tasaImpuesto, precioManual: null }). margenResultantePct = el margen que queda si NO se cambia el precio, o sea pctGananciaDesdePrecio(costoNuevo, precioVentaActual, tasaImpuesto). requiereAviso = variacionPct > umbralAvisoPct (con umbral 0, cualquier subida avisa). Con costoAnterior 0 o costoNuevo == costoAnterior, variacionPct = 0 y requiereAviso = false.
4. `puedeRegistrarCompra(rol: string): boolean` y `puedeAprobarCambioPrecio(rol: string): boolean` — el cliente nombro supervisor, dueno y superadmin. Hoy la tabla usuario solo documenta 'admin | cajero', asi que acepta el conjunto {admin, supervisor, dueno, superadmin} para registrar y {admin, dueno, superadmin} para aprobar cambios de precio, y deja el mapeo en una constante exportada para que el area RBAC lo reemplace sin tocar los llamadores. NO consultes la base aqui.
5. En packages/core/src/repos/proveedor-repo.ts, amplia `validarProveedor` (linea 16-25) para que use `esRncValido` (ya exportado desde dominio/validacion.ts:20) cuando venga rnc con valor. No cambies nada mas de ese archivo.

DEPENDENCIA: los tipos EstadoRecepcion/EstadoPago los agrega COMPRAS-01 en packages/core/src/repos/tipos.ts; importalos de ahi, no los redeclares. RBAC es dependencia BLANDA: no esperes por ese modulo, esta tarea no lo necesita.

NO TOQUES: packages/core/src/repos/compra-repo.ts, producto-repo.ts, packages/core/src/db/** (la migracion ya la hizo COMPRAS-01), packages/ui/** completo, y no modifiques dominio/precio.ts (solo se consume).

CIERRE: `pnpm --filter @sfr/core test` y `pnpm -r typecheck` verdes.
```

#### Archivos a tocar

- `packages/core/src/dominio/compra.ts`
- `packages/core/src/index.ts`
- `packages/core/src/repos/proveedor-repo.ts`
- `packages/core/test/dominio-compra.test.ts`

#### Criterios de aceptacion

- [ ] dominio/compra.ts no importa SqlDriver ni ids.js: es 100% puro y testeable sin base de datos.
- [ ] impactoCosto deriva el margen con pctGananciaDesdePrecio y jamas lee pct_ganancia.
- [ ] validarRecepcion acepta aRecibir = 0 y rechaza exceso salvo permitirExceso explicito.
- [ ] validarProveedor rechaza un RNC invalido con {campo:'rnc'} y sigue aceptando proveedor sin RNC.
- [ ] Todo exportado desde @sfr/core y sin `any` en ninguna firma.

#### Pruebas a escribir primero (TDD)

- impactoCosto: costo 35 -> 42 con precio 50 y tasa 0.18 devuelve variacionPct 20, margenAnteriorPct = pctGananciaDesdePrecio(35,50,0.18), precioSugerido que reconstruye ese mismo margen sobre 42, y margenResultantePct menor que el anterior.
- impactoCosto: producto con precio escrito a mano y pct_ganancia 0 guardado — el precio sugerido NO cae a costo+ITBIS (guardia contra el bug de pct_ganancia).
- impactoCosto: costoAnterior 0 devuelve variacionPct 0 y requiereAviso false, sin Infinity ni NaN.
- impactoCosto: producto exento (tasaImpuesto 0) mantiene margen sin sumar impuesto.
- impactoCosto: con umbralAvisoPct 10, una subida de 5% no avisa y una de 15% si; una BAJADA de costo nunca dispara requiereAviso.
- estadoRecepcion: [] => 'pendiente'; todo 0 => 'pendiente'; una linea a medias => 'parcial'; todas completas => 'completa'; una linea recibida de mas => 'completa'.
- validarRecepcion: aRecibir 0 devuelve [] ; recibidaAcumulada 60 + aRecibir 50 sobre pedida 100 devuelve error de cantidad; con permitirExceso true lo acepta; aRecibir negativo devuelve error.
- puedeRegistrarCompra('cajero') === false y puedeRegistrarCompra('supervisor') === true; puedeAprobarCambioPrecio('supervisor') === false.
- validarProveedor: rnc '130123456' valido, rnc '123' invalido con campo 'rnc', rnc null sin error.

---

### COMPRAS-03 — compra-repo.crear(): cantidad pedida vs recibida, usuarioId e historial de costo siempre

**Objetivo.** Registrar una compra captura lo pedido y lo que realmente llego, historia todo cambio de costo con inventario on u off, y deja de tocar el precio de venta en silencio.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | medio — se toca el unico camino de escritura del modulo y varias escrituras no atomicas; una regresion aqui altera existencia y costos de toda la operacion. | COMPRAS-01, COMPRAS-02 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** El cierre dice 'los 6 tests que ya existen en compra-repo.test.ts deben seguir verdes'. El archivo tiene 9 (grep -c 'it(' devuelve 9). Un agente que compruebe contra 6 puede dar por buena una corrida que perdio tres. Mismo tipo de error en varios briefs: BACKOFFICE-01 y COMPRAS-01 mandan editar 'el INSERT de crear() y el UPDATE de actualizar()' de negocio-repo, metodos que no existen — ese repo expone guardar() (upsert).
>   **Arreglo.** Sustituir los conteos y nombres de metodo citados de memoria por una instruccion verificable: 'ningun archivo de packages/core/test/ preexistente aparece en git diff --stat' y 'el numero de tests que pasan no baja respecto a la corrida previa'.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Rama feature/, TypeScript estricto sin `any`, espanol, SIN comentarios en codigo nuevo. TDD: escribe primero los tests en rojo en packages/core/test/compra-repo.test.ts (helper nuevaDb() en las lineas 14-18, casos de inventario on/off en 82-117 como plantilla).

TAREA: ampliar packages/core/src/repos/compra-repo.ts, SIN reescribirlo. El calculo de totales via calcularTotales/calcularLinea (lineas 100-105 y 136) ya cuadra con los tests: no lo toques.

1. `LineaCompraInput` gana `cantidadRecibida?: number`. Si se omite, vale igual que `cantidad` (comportamiento de hoy: se registra y se recibe de una pasada). `CompraInput` gana `usuarioId?: string | null`, `condicionPago?: CondicionPago`, `diasCredito?: number`, `fechaVencimiento?: string | null`.
2. Separa `validarLineaCompra` (linea 38-50): `cantidad` (pedida) debe ser > 0, pero `cantidadRecibida` debe ser >= 0 y <= cantidad. Hoy la validacion exige cantidad > 0 para todo y rechazaria una recepcion de 0 unidades de un renglon que no llego. Usa `validarRecepcion` de packages/core/src/dominio/compra.ts (lo escribio COMPRAS-02).
3. Guardia de autorizacion EN EL REPO: si input.usuarioId viene con valor, resuelve el rol del usuario (SELECT rol FROM usuario WHERE id=?) y lanza ValidacionError si `puedeRegistrarCompra(rol)` es false. Si usuarioId es null, no bloquees (hoy no hay sesion; RBAC es dependencia blanda). Esconder el boton en la UI NO es el guardia.
4. `compra.estado_recepcion` se calcula con `estadoRecepcion(...)` del dominio, y `fecha_recepcion` se llena solo si algo llego. Si algo llega junto con la compra, inserta UN evento en `compra_recepcion` + sus `compra_recepcion_linea`, para que la recepcion inicial sea del mismo tipo que las posteriores.
5. Reescribe `aplicarEfectosInventario` (lineas 61-86) asi: recorre solo lineas con producto_id; la existencia y el movimiento_inventario suman `cantidadRecibida`, NO `cantidad` (si recibida es 0, no se escribe movimiento); `movimiento_inventario.usuario_id` deja de ser null y lleva el usuarioId; y ANTES de hacer UPDATE producto SET costo, lee el costo y el precio_venta anteriores y, si el costo cambia, inserta una fila en `costo_historial` con costo_anterior, costo_nuevo, variacion_pct, precio_venta_anterior, margen_anterior_pct, margen_resultante_pct, precio_venta_nuevo = NULL, origen 'compra', compra_id, compra_linea_id y usuario_id, usando `impactoCosto` del dominio. Este INSERT va SIEMPRE, fuera del `if (!inventarioActivo) continue`: hoy el costo se pisa antes de ese continue (linea 70-71) y con inventario apagado — el default de fabrica — el costo anterior se pierde para siempre.
6. producto.precio_venta y producto.pct_ganancia NO se tocan aqui bajo ninguna circunstancia. El ajuste de precio es explicito y aprobado, y lo implementa COMPRAS-04.
7. `registrarAccion` (packages/core/src/repos/bitacora-repo.ts:35-55) ya acepta usuarioId: pasaselo.

ORDEN DE ESCRITURA (no hay transacciones en ningun driver y SqlDriver no expone begin/commit): primero la cabecera, luego las lineas, luego el evento de recepcion, y al final los efectos sobre producto/movimiento/costo_historial. No agregues transacciones — es tarea del area PLATAFORMA.

TRAMPA DEL DRIVER DE TESTS: packages/core/src/db/drivers/node-sqlite.ts:31 solo bindea null/number/string/bigint/Uint8Array. Nunca pases booleanos ni `undefined` como parametro (`x ?? undefined` revienta con un TypeError confuso): usa 0/1 y null explicitos, como ya hace todo el repo.

NO TOQUES: packages/core/src/db/migrations.ts (el esquema ya esta, es de COMPRAS-01), dominio/factura.ts, dominio/precio.ts, dominio/compra.ts (solo se consume), producto-repo.ts, packages/ui/** completo.

CIERRE: los 6 tests que ya existen en compra-repo.test.ts deben seguir verdes; el unico que puede cambiar de expectativa es el que verifica que se pisa el costo, y si lo cambias documenta por que en el reporte de tarea. `pnpm --filter @sfr/core test` y `pnpm -r typecheck` verdes.
```

#### Archivos a tocar

- `packages/core/src/repos/compra-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/test/compra-repo.test.ts`

#### Criterios de aceptacion

- [ ] Una compra sin cantidadRecibida explicita se comporta exactamente como hoy: estado_recepcion 'completa' y el mismo efecto en existencia y totales.
- [ ] costo_historial recibe una fila por cada linea con producto_id cuyo costo cambia, con negocio.inventario_activo = 0 y = 1 por igual.
- [ ] producto.precio_venta y producto.pct_ganancia quedan intactos tras registrar una compra que sube el costo.
- [ ] La existencia suma cantidadRecibida, nunca cantidad; con cantidadRecibida 0 no se inserta movimiento_inventario.
- [ ] compra.usuario_id, movimiento_inventario.usuario_id y la fila de bitacora llevan el usuarioId recibido.
- [ ] Un usuarioId cuyo rol es 'cajero' hace fallar crear() con ValidacionError desde el repo, no desde la UI.
- [ ] Ningun parametro booleano ni undefined llega a db.run().

#### Pruebas a escribir primero (TDD)

- crear() sin cantidadRecibida: estado_recepcion 'completa', totales y existencia identicos al test actual (no regresion).
- crear() con cantidadRecibida 0 en todas las lineas: estado_recepcion 'pendiente', fecha_recepcion null, cero filas en movimiento_inventario, existencia del producto sin cambios.
- crear() con pedida 100 y recibida 60: estado_recepcion 'parcial', existencia +60, movimiento_inventario.cantidad 60, compra_linea.cantidad 100 y cantidad_recibida 60.
- crear() con recibida 120 sobre pedida 100: ValidacionError con campo cantidad_recibida.
- crear() con producto de costo 35 y precio 50, linea a costo 42, negocio.inventario_activo = 0: hay 1 fila en costo_historial con costo_anterior 35 y costo_nuevo 42, y producto.precio_venta sigue siendo 50.
- Mismo caso con inventario_activo = 1: sigue habiendo exactamente 1 fila en costo_historial (no duplicada) mas el movimiento_inventario.
- crear() con costo igual al anterior: no se escribe fila en costo_historial.
- crear() con linea de producto_id null: no revienta, no toca inventario ni costo_historial.
- crear() con usuarioId de un usuario rol 'cajero': rejects ValidacionError; con rol 'supervisor': crea y persiste compra.usuario_id.
- crear() con usuarioId null (sin sesion): crea igual que hoy, sin bloquear.
- Se genera exactamente un compra_recepcion + N compra_recepcion_linea cuando llega mercancia con la compra, y ninguno cuando todo llega en 0.

---

### COMPRAS-04 — Recepcion posterior, consulta de impacto de costo y ajuste de precio aprobado

**Objetivo.** Una compra pendiente se puede recibir en varios eventos, y el cambio de precio derivado de un costo nuevo solo ocurre con una aprobacion explicita validada en core.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | alto — sin transacciones, una recepcion a medias puede dejar existencia sumada y estado desfasado; la idempotencia por evento y los tests de doble recepcion son la unica red. | COMPRAS-03 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Marcada L y son dos repos con dos dominios distintos: recepcion por eventos (recibir con idempotencia sin transacciones, listarPendientes, obtenerRecepciones) y costo-historial-repo entero (listarPorProducto, pendientesDeAjuste y aplicarAjusteCosto, que es el unico camino por el que cambia un precio de venta). Ademas registra dos repos en dos archivos y arrastra el riesgo alto de que una recepcion a medias duplique existencia.
>   **Arreglo.** (A) recepcion posterior con su idempotencia y los tests de doble recepcion; (B) costo-historial-repo y aplicarAjusteCosto. La (B) depende de la (A) solo para tener datos de prueba, asi que puede ir detras sin bloquear.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Rama feature/, TypeScript estricto sin `any`, espanol, SIN comentarios en codigo nuevo. TDD primero.

TAREA A — packages/core/src/repos/compra-repo.ts, metodos nuevos (imita el estilo del objeto `repo` existente, lineas 88-193):
- `recibir(compraId, input: { lineas: { compraLineaId: string; cantidad: number }[]; fecha?: string; usuarioId?: string | null; notas?: string | null; permitirExceso?: boolean })`: valida cada linea con `validarRecepcion` de packages/core/src/dominio/compra.ts contra lo ya acumulado, inserta un `compra_recepcion` + sus `compra_recepcion_linea`, suma a `compra_linea.cantidad_recibida`, recalcula `compra.estado_recepcion` con `estadoRecepcion(...)` y llena `fecha_recepcion`, suma existencia e inserta movimiento_inventario solo si negocio.inventario_activo = 1 y solo por el delta recibido, y registra bitacora 'recibir_mercancia' con usuarioId. Guardia de rol identico al de crear(): si viene usuarioId, resuelve rol y exige `puedeRegistrarCompra(rol)`.
- `listarPendientes(filtro?: { proveedorId?: string | null })`: compras con estado_recepcion distinto de 'completa', mas reciente primero. Para filtros de fecha usa `date(campo) >= date(?)` como ya hace listar() (lineas 185-186): la UI escribe fechas flotantes sin 'Z' (Compras.tsx:220-223) y la comparacion de strings da resultados equivocados.
- `obtenerRecepciones(compraId)`: eventos con sus lineas, mas antiguo primero.
- `recibir()` debe ser idempotente por evento: no hay transacciones (SqlDriver no expone begin/commit), asi que si el mismo evento se reintenta no puede duplicar existencia. Escribe el evento primero y usa su id como referencia.

TAREA B — packages/core/src/repos/costo-historial-repo.ts (NUEVO). Imita packages/core/src/repos/movimiento-inventario-repo.ts:10-17 (es el repo mas corto del proyecto y el patron exacto de lectura por producto):
- `listarPorProducto(productoId, limite?)` ordenado por fecha descendente.
- `pendientesDeAjuste()`: filas donde precio_venta_nuevo IS NULL y margen_resultante_pct < margen_anterior_pct, es decir el costo subio y nadie ajusto el precio.
- `aplicarAjusteCosto(costoHistorialId, input: { precioNuevo: number; usuarioId?: string | null })`: UNICO camino por el que el precio de venta cambia a raiz de una compra. Valida que precioNuevo >= 0, exige `puedeAprobarCambioPrecio(rol)` cuando viene usuarioId, actualiza producto.precio_venta y recalcula producto.pct_ganancia con `pctGananciaDesdePrecio(costo_nuevo, precioNuevo, tasa)` de packages/core/src/dominio/precio.ts:42, sella la fila de costo_historial con precio_venta_nuevo y registra bitacora 'ajustar_precio_por_costo' con el antes y el despues.

REGLA DE ORO: nada de esto recalcula el precio automaticamente. El sistema avisa (impactoCosto) y sugiere; el precio solo cambia si alguien con permiso llama aplicarAjusteCosto. La regla 'manual manda' (packages/core/src/dominio/precio.ts:56) es dominio, no preferencia de UI.

Registra el repo nuevo en packages/core/src/repos/index.ts y en packages/ui/src/data/contexto.tsx (interfaz Repos + ProveedorDatos), imitando como esta registrado `movimientoInventario`. Ese es el UNICO cambio permitido en packages/ui en esta tarea.

TRAMPA DEL DRIVER DE TESTS: node-sqlite.ts:31 solo bindea null/number/string/bigint/Uint8Array — nunca booleanos ni undefined.

NO TOQUES: packages/core/src/db/** (esquema ya cerrado por COMPRAS-01), dominio/compra.ts y dominio/precio.ts (solo se consumen), producto-repo.ts salvo si necesitas un metodo de lectura ya existente, packages/ui/src/pantallas/** (las pantallas son de COMPRAS-06 y COMPRAS-07).

CIERRE: `pnpm --filter @sfr/core test` y `pnpm -r typecheck` verdes, sin tocar los tests que ya existian.
```

#### Archivos a tocar

- `packages/core/src/repos/compra-repo.ts`
- `packages/core/src/repos/costo-historial-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/ui/src/data/contexto.tsx`
- `packages/core/test/compra-repo.test.ts`
- `packages/core/test/costo-historial-repo.test.ts`

#### Criterios de aceptacion

- [ ] Dos recepciones parciales sobre la misma compra dejan estado_recepcion 'parcial' y luego 'completa', con cantidad_recibida acumulada correctamente.
- [ ] La existencia solo sube por el delta de cada evento, nunca por el total pedido, y nunca dos veces por el mismo evento.
- [ ] El precio de venta de un producto no cambia por ninguna operacion de recepcion: solo cambia si se llama aplicarAjusteCosto.
- [ ] aplicarAjusteCosto recalcula pct_ganancia con pctGananciaDesdePrecio y deja la fila de costo_historial sellada con precio_venta_nuevo.
- [ ] Un usuario con rol que no puede aprobar cambios de precio recibe ValidacionError desde el repo.
- [ ] listarPendientes no usa comparacion de strings para fechas, sino date(campo).

#### Pruebas a escribir primero (TDD)

- recibir(): compra pedida 100 recibida 0, primer evento 40 => estado 'parcial', existencia +40; segundo evento 60 => estado 'completa', existencia +100 en total, dos filas en compra_recepcion.
- recibir(): intentar recibir 70 cuando quedan 60 => ValidacionError; con permitirExceso true => se acepta y estado queda 'completa'.
- recibir() con cantidad 0 en un renglon: valido, no escribe movimiento_inventario para esa linea.
- recibir() con negocio.inventario_activo = 0: no toca existencia ni movimiento_inventario, pero SI crea el evento compra_recepcion y actualiza cantidad_recibida y estado_recepcion.
- recibir() con usuarioId rol 'cajero' => ValidacionError; rol 'supervisor' => ok y compra_recepcion.usuario_id persistido.
- listarPendientes(): devuelve la compra con estado 'pendiente' y 'parcial', excluye la 'completa'.
- obtenerRecepciones(): devuelve los eventos en orden cronologico con sus lineas.
- costoHistorialRepo.listarPorProducto(): tras dos compras con costos distintos devuelve 2 filas, la mas reciente primero.
- pendientesDeAjuste(): incluye la fila de un costo que subio sin ajuste y excluye la de un costo que bajo y la ya sellada.
- aplicarAjusteCosto(): producto de costo 35 precio 50 que pasa a costo 42 y se aprueba precio 60 => producto.precio_venta 60, pct_ganancia recalculado desde 42 y 60, costo_historial.precio_venta_nuevo 60, fila de bitacora con usuario_id.
- aplicarAjusteCosto() con precioNuevo negativo => ValidacionError; con usuarioId de rol sin permiso de aprobar => ValidacionError y el precio NO cambia.

---

### COMPRAS-05 — Cuentas por pagar al proveedor: pagos parciales y estado de cuenta (solo core)

**Objetivo.** Una compra a credito acumula pagos parciales, su estado de pago se deriva de los pagos reales y cada proveedor tiene saldo y vencidas consultables.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio — introduce dinero derivado (monto_pagado/estado_pago) que puede divergir de los pagos reales si algun camino lo escribe a mano; el recalculo desde la suma en anular() es la mitigacion. | COMPRAS-01, COMPRAS-02 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Rama feature/, TypeScript estricto sin `any`, espanol, SIN comentarios en codigo nuevo. TDD primero. Esta tarea NO toca pantallas.

TAREA: crear packages/core/src/repos/pago-compra-repo.ts. Imita la estructura de packages/core/src/repos/compra-repo.ts (funcion `crearPagoCompraRepo(db: SqlDriver)` que devuelve un objeto de metodos) y la forma de validar de proveedor-repo.ts (validarX -> ErrorValidacion[] -> throw ValidacionError).

METODOS:
- `registrar(input: { compraId: string; monto: number; metodo: string; fecha?: string; referencia?: string | null; usuarioId?: string | null; notas?: string | null })`: valida monto > 0, que la compra exista y no este eliminada, y que monto no supere el saldo pendiente (total - monto_pagado). Inserta en `pago_compra`, actualiza `compra.monto_pagado` sumando, y recalcula `compra.estado_pago`: 'pagada' si monto_pagado >= total (con tolerancia de centavo via redondear2 de dominio/dinero.js), 'parcial' si hay algo pagado, 'pendiente' si nada. Registra bitacora 'pagar_compra' con usuarioId.
- `anular(pagoId, usuarioId?)`: soft delete (deleted_at) y recalculo de monto_pagado y estado_pago desde la SUMA de los pagos vivos, nunca restando a ciegas del acumulado.
- `listarPorCompra(compraId)`.
- `estadoCuentaProveedor(proveedorId)`: por cada compra del proveedor con estado_pago distinto de 'pagada' y de 'no_registrado', devuelve total, monto_pagado, saldo, fecha_vencimiento y si esta vencida. El saldo total del proveedor se calcula aqui, en core, nunca sumando en la UI.
- `vencidas(alDia?: string)`: compras con saldo > 0 y fecha_vencimiento anterior al dia dado.

REGLAS:
- `compra.estado_pago` y `compra.monto_pagado` son DERIVADOS de pago_compra: ningun metodo debe aceptarlos como entrada desde fuera. Si algun dia divergen, la verdad son los pagos.
- El backfill de la migracion 11 dejo lo historico en estado_pago 'no_registrado' con monto_pagado 0: eso significa 'antes de que existiera el control de pagos', y NO debe aparecer como deuda en estadoCuentaProveedor ni en vencidas. Es deliberado: no se inventa deuda historica.
- Toda consulta por fecha usa `date(campo) <= date(?)`, nunca comparacion de strings: la UI escribe fechas flotantes sin 'Z' (packages/ui/src/pantallas/Compras.tsx:220-223) y los tests usan ISO con 'Z'.
- La tabla `pago` de ventas NO se toca: su factura_id es NOT NULL y es de otro dominio.
- Si COMPRAS-03 ya expone condicionPago/diasCredito en CompraInput, la fecha_vencimiento debe derivarse alli; aqui solo se lee. No dupliques ese calculo.

TRAMPA DEL DRIVER DE TESTS: packages/core/src/db/drivers/node-sqlite.ts:31 solo bindea null/number/string/bigint/Uint8Array — nada de booleanos ni undefined. Y PRAGMA foreign_keys esta ON en tests y PWA pero NO en el driver de Tauri, asi que valida la existencia de la compra en codigo y no confies en la FK.

Registra el repo en packages/core/src/repos/index.ts y en packages/ui/src/data/contexto.tsx (interfaz Repos + ProveedorDatos), imitando como esta registrado `compra`. Ese es el UNICO cambio permitido en packages/ui.

NO TOQUES: packages/core/src/db/** (esquema cerrado por COMPRAS-01, pago_compra ya existe), compra-repo.ts salvo para leer, packages/ui/src/pantallas/**, packages/core/src/repos/factura-repo.ts ni nada de ventas.

CIERRE: `pnpm --filter @sfr/core test` y `pnpm -r typecheck` verdes.
```

#### Archivos a tocar

- `packages/core/src/repos/pago-compra-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/ui/src/data/contexto.tsx`
- `packages/core/test/pago-compra-repo.test.ts`

#### Criterios de aceptacion

- [ ] estado_pago y monto_pagado de compra nunca se reciben como entrada: siempre se derivan de la suma de pagos vivos.
- [ ] Un pago que supera el saldo es rechazado en el repo con ValidacionError.
- [ ] Anular un pago recalcula el estado desde cero y puede devolver una compra de 'pagada' a 'parcial'.
- [ ] Las compras historicas ('no_registrado') no aparecen como deuda ni como vencidas.
- [ ] estadoCuentaProveedor devuelve el saldo ya calculado en core; la UI no tendria que sumar nada.

#### Pruebas a escribir primero (TDD)

- registrar(): compra total 1000, pago 400 => monto_pagado 400 y estado_pago 'parcial'; segundo pago 600 => 1000 y 'pagada'.
- registrar(): pago de 1200 sobre saldo 1000 => ValidacionError con campo monto; pago 0 o negativo => ValidacionError.
- registrar(): tolerancia de centavo — pagos 333.33 + 333.33 + 333.34 sobre total 1000 dejan 'pagada' y no 'parcial'.
- anular(): tras anular el segundo pago, estado_pago vuelve a 'parcial' y monto_pagado a 400, y el pago anulado no aparece en listarPorCompra.
- estadoCuentaProveedor(): con dos compras (una pagada, una parcial) devuelve solo la parcial con su saldo correcto.
- estadoCuentaProveedor(): una compra migrada con estado_pago 'no_registrado' NO aparece.
- vencidas('2026-08-01'): incluye la compra con fecha_vencimiento 2026-07-20 y saldo > 0, excluye la de 2026-08-15 y la que ya esta pagada.
- vencidas(): funciona con fechas flotantes sin 'Z' (formato que escribe la UI) y con ISO 'Z' por igual.
- registrar() con compraId inexistente => ValidacionError (no se apoya en la FK, que no se valida en escritorio).
- registrar() con usuarioId: pago_compra.usuario_id y la fila de bitacora lo llevan.

---

### COMPRAS-06 — UI de captura de compra: pedida vs recibida, producto al vuelo y proveedor completo

**Objetivo.** El formulario de Compras captura lo pedido y lo recibido por linea, permite dar de alta el producto y el proveedor completos sin salir de la pantalla, y funciona a 375px.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | medio — es la pantalla mas cargada del modulo (527 lineas con adjuntos, IA y atajos); el riesgo real es romper el flujo de comprobante o los atajos de teclado existentes. | COMPRAS-03 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Rama feature/, TypeScript estricto sin `any`, espanol, SIN comentarios en codigo nuevo, SIN emojis como iconos (usa lucide-react, ya es dependencia). Mobile-first.

ANTES DE TOCAR UI: lee C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale/design-guidelines.md y respeta sus tokens. Si introduces un patron visual nuevo (por ejemplo la insignia de estado de recepcion pendiente/parcial/completa), documentalo ahi PRIMERO y luego implementalo.

TAREA: ampliar packages/ui/src/pantallas/Compras.tsx (527 lineas). Es una evolucion, no una reescritura: el buscador de proveedor con navegacion por flechas, el adjunto de comprobante base64 (lineas 238-248, 408-436, 510-521) y el boton 'Analizar con IA' (174-196) YA FUNCIONAN y se conservan intactos.

1. GRILLA DE LINEAS: pasa de Descripcion / Cantidad / Costo unitario / Subtotal a Descripcion / Pedida / Recibida / Costo unitario / Subtotal. Por defecto Recibida = Pedida (el caso normal: llego todo), con un interruptor 'La mercancia llega despues' que pone todas las recibidas en 0. Cuando la linea esta vinculada a un producto con costo anterior distinto, muestra al lado del costo el indicador 'antes 35.00 -> 42.00 (+20%)' usando `impactoCosto` de @sfr/core (dominio/compra.ts). Es SOLO informativo aqui: la aprobacion del precio es la pantalla de COMPRAS-07.
2. ID ESTABLE POR LINEA: hoy `LineaLocal` (lineas 18-25) no tiene id y la key de React es el indice del array (383-384). Con una columna mas y filas que se borran del medio, los valores se mezclan entre filas. Agrega `id: string` generado con crypto.randomUUID() y usalo como key.
3. PRODUCTO AL VUELO: la opcion '+ Producto nuevo' (lineas 153-162) hoy crea una linea con producto_id null que NUNCA entra al catalogo, y por eso esa linea no afecta inventario ni costo (compra-repo.ts:68) y el articulo queda invisible para Ventas. Ofrece, en el mismo panel, dar de alta el producto llamando a `productos.crear()` (packages/core/src/repos/producto-repo.ts:56-104) con costo = costo unitario de la linea, impuesto_tipo de la linea y el % de ganancia que el usuario indique (o el precio de venta a mano). Al crearlo, vincula la linea al producto_id resultante. Mantener la opcion de dejarlo sin vincular es valido, pero el usuario tiene que ver que ese renglon no tocara inventario.
4. ALTA DE PROVEEDOR: amplia el mini formulario de alta rapida (lineas 124-136 y 299-315, atajo F6) de un solo campo a nombre + RNC + telefono + direccion. La validacion del RNC ya vive en core (validarProveedor, ampliada por COMPRAS-02): muestra el ValidacionError que llega, no revalides en el cliente.
5. RESPONSIVE: Compras.tsx no importa useBreakpoint. Usa `useEsAngosto` / `useBreakpoint` de packages/ui/src/hooks/useBreakpoint.ts como ya hacen Ventas, ConsultaFacturas y ConsultaCotizaciones: el gridTemplateColumns fijo '1fr 1fr 1fr' (linea 267) y el panel lateral de 340px (linea 464) tienen que apilar en movil. Objetivos verificables: 375px, 768px y 1440px sin scroll horizontal y con areas tactiles de 44px o mas.
6. Pasa `usuarioId` a repo.crear() si el contexto ya lo tiene; si el modulo de usuarios (RBAC) todavia no existe, pasa null. NO implementes permisos escondiendo botones: el guardia vive en compra-repo (COMPRAS-03).

NO TOQUES: ningun archivo de packages/core (si falta algo en un repo, para y reportalo en vez de meter logica de negocio en la pantalla); packages/ui/src/AppShell.tsx (no se agregan modulos nuevos aqui); packages/ui/src/pantallas/Productos.tsx; el flujo de comprobante base64 y el de IA.

SIN SUITE DE UI: @sfr/ui no tiene runner de tests. El gate automatico es `pnpm -r typecheck` verde y `pnpm --filter @sfr/core test` verde; si necesitas una regla nueva verificable, escribela como funcion en core con su test, no en el componente.

CIERRE: adjunta capturas a 375px y a 1440px en el reporte de tarea (la regla del proyecto exige capturas para cambios de UI).
```

#### Archivos a tocar

- `packages/ui/src/pantallas/Compras.tsx`
- `design-guidelines.md`

#### Criterios de aceptacion

- [ ] La grilla muestra Pedida y Recibida por linea, con Recibida = Pedida por defecto y un modo 'llega despues' que las pone en 0.
- [ ] Cada LineaLocal tiene id propio y la key de React ya no es el indice: borrar una fila del medio no mezcla valores.
- [ ] Se puede crear un producto del catalogo desde una linea de compra y la linea queda vinculada a ese producto_id.
- [ ] El alta rapida de proveedor captura nombre, RNC, telefono y direccion, y muestra el error de RNC que devuelve core.
- [ ] A 375px no hay scroll horizontal, el panel lateral apila y los controles tienen 44px de area tactil.
- [ ] La pantalla no contiene ninguna regla de negocio: toda validacion mostrada proviene de un ValidacionError de core.

#### Pruebas a escribir primero (TDD)

- Verificacion manual guiada (no hay runner en @sfr/ui): registrar una compra de 2 lineas con todo recibido y comprobar en Productos que la existencia subio igual que antes del cambio.
- Manual: marcar 'llega despues', guardar, y comprobar que la compra queda pendiente y la existencia NO cambio.
- Manual: linea con pedida 100 y recibida 60 guardada correctamente (verificable en el panel de detalle del historial).
- Manual: crear producto al vuelo desde una linea y encontrarlo luego en el buscador de Ventas.
- Manual: alta de proveedor con RNC invalido muestra el mensaje de core y no crea nada.
- Manual: recorrido a 375px, 768px y 1440px sin scroll horizontal, capturas adjuntas.
- Gate automatico: `pnpm -r typecheck` sin errores y `pnpm --filter @sfr/core test` verde.

---

### COMPRAS-07 — UI de recepcion pendiente, aviso de costo con aprobacion e historial de costo por producto

**Objetivo.** El usuario ve que compras faltan por recibir, las recibe por cantidad real, y aprueba o rechaza el precio nuevo cuando el costo sube.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | medio — toca la misma pantalla que COMPRAS-06 (conflictos si se corren en paralelo) y es el punto donde un error de UI puede aplicar un precio equivocado a un producto que ya se vende. | COMPRAS-04, COMPRAS-06 |

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Rama feature/, TypeScript estricto sin `any`, espanol, SIN comentarios en codigo nuevo, SIN emojis como iconos (lucide-react). Mobile-first.

ANTES DE TOCAR UI: lee design-guidelines.md en la raiz del repo y respeta sus tokens; documenta ahi cualquier patron nuevo antes de implementarlo.

TAREA A — Bandeja de recepcion, dentro de packages/ui/src/pantallas/Compras.tsx (como una seccion o pestana junto al historial existente, NO como modulo nuevo en AppShell): lista `repo.listarPendientes()` con proveedor, fecha, total y una insignia de estado (pendiente / parcial). Al abrir una, muestra por linea: pedida, ya recibida, falta, y un campo 'recibo ahora'. Guardar llama a `repo.recibir(...)` (implementado en COMPRAS-04) y refresca. No sumes ni valides cantidades en el componente: el limite y el estado los calcula core.

TAREA B — Aviso y aprobacion de cambio de precio: cuando una compra o una recepcion deja filas con costo al alza sin ajustar (`costoHistorial.pendientesDeAjuste()`), muestra un panel de confirmacion con, por producto, costo anterior -> costo nuevo, precio actual, margen que queda si no se toca nada, y precio sugerido editable. REUSA packages/ui/src/componentes/ModalConfirmarCambios.tsx (lineas 15-45), que ya presenta el patron tachado -> nuevo con CambioProducto[]; si el shape no calza, extiende el tipo en lugar de escribir un modal paralelo. Aprobar llama a `costoHistorial.aplicarAjusteCosto(id, { precioNuevo, usuarioId })`. Debe existir la opcion explicita 'dejar el precio como esta' que cierra sin escribir. El precio NUNCA se aplica solo: la regla de dominio es que el precio manual manda (packages/core/src/dominio/precio.ts:56).

TAREA C — Historial de costo por producto, en packages/ui/src/pantallas/Productos.tsx: cuelga la lista de `costoHistorial.listarPorProducto(id)` del mismo desplegable donde ya se muestra el historial de movimientos de inventario (Productos.tsx:126 y 463-468). Imita ese patron exacto: no inventes pantalla nueva. Muestra fecha, costo anterior -> nuevo, variacion % y si se ajusto el precio.

RESPONSIVE: usa `useEsAngosto` / `useBreakpoint` de packages/ui/src/hooks/useBreakpoint.ts como hacen Ventas y ConsultaFacturas. Verifica 375px, 768px y 1440px, sin scroll horizontal, areas tactiles de 44px o mas.

PERMISOS: si el modulo RBAC ya existe, pasa el usuarioId de la sesion a recibir() y a aplicarAjusteCosto(); si no, pasa null. No implementes el permiso escondiendo botones: el guardia esta en core (COMPRAS-03 y COMPRAS-04) y el error que devuelve se muestra tal cual.

NO TOQUES: ningun archivo de packages/core (si falta un metodo, para y reportalo, no lo suplas con logica en el componente); packages/ui/src/AppShell.tsx (nada de modulos nuevos); el formulario de captura de compra ni el flujo de comprobante base64 / IA (son de COMPRAS-06, evita el conflicto trabajando despues de que esa tarea este fusionada).

SIN SUITE DE UI: @sfr/ui no tiene runner. Gate automatico: `pnpm -r typecheck` y `pnpm --filter @sfr/core test` verdes.

CIERRE: capturas a 375px y 1440px en el reporte de tarea.
```

#### Archivos a tocar

- `packages/ui/src/pantallas/Compras.tsx`
- `packages/ui/src/pantallas/Productos.tsx`
- `packages/ui/src/componentes/ModalConfirmarCambios.tsx`
- `design-guidelines.md`

#### Criterios de aceptacion

- [ ] Existe una bandeja de compras pendientes de recibir con insignia de estado y detalle por linea (pedida / recibida / falta).
- [ ] Recibir mercancia desde la UI llama a repo.recibir() y el estado y la existencia cambian exactamente como en los tests de core.
- [ ] El aviso de costo muestra costo anterior, costo nuevo, margen resultante y precio sugerido, y ofrece 'dejar el precio como esta'.
- [ ] Ningun camino de la UI cambia un precio sin pasar por aplicarAjusteCosto.
- [ ] Productos muestra el historial de costo del producto en el mismo desplegable que los movimientos, sin pantalla nueva.
- [ ] 375px, 768px y 1440px sin scroll horizontal y con areas tactiles de 44px o mas.
- [ ] AppShell.MODULOS sigue teniendo 9 modulos.

#### Pruebas a escribir primero (TDD)

- Manual: compra creada con 'llega despues' aparece en la bandeja como pendiente; recibir 40 de 100 la deja parcial; recibir el resto la saca de la bandeja.
- Manual: intentar recibir mas de lo que falta muestra el mensaje de error que devuelve core y no escribe nada.
- Manual: compra que sube el costo de 35 a 42 en un producto de precio 50 abre el aviso con el precio sugerido correcto; 'dejar el precio como esta' cierra sin cambiar precio_venta.
- Manual: aprobar el precio sugerido actualiza precio_venta y la fila queda sellada (deja de aparecer como pendiente de ajuste).
- Manual: producto con precio escrito a mano no recibe una sugerencia que lo desplome a costo+ITBIS.
- Manual: el desplegable de Productos lista el historial de costo con variacion %.
- Manual: recorrido a 375px, 768px y 1440px, capturas adjuntas.
- Gate automatico: `pnpm -r typecheck` sin errores y `pnpm --filter @sfr/core test` verde.

---

### COMPRAS-08 — Puesta en marcha del inventario

**Objetivo.** El dueno puede encender el inventario con datos reales ya cargados, para que "cantidad recibida" deje de guardarse sin mover nada y "mercancia con existencia baja" deje de ser un cartel explicativo.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | alto — encender el inventario cambia el comportamiento de la venta en un negocio que ya esta operando | COMPRAS-03, BACKOFFICE-04, NEGOCIO-FLAGS |

> [!WARNING]
> **Esta tarea la anadieron los revisores.** El inventario viene **apagado de fabrica**
> (`migrations.ts:40`, comentado literalmente *"MVP: off"*) y ninguna de las 56 tareas lo encendia
> ni acompanaba al dueno a encenderlo. Sin ella, dos de tus ocho puntos se entregan como carteles:
> COMPRAS-03 dice explicitamente que con inventario apagado no toca existencia, y BACKOFFICE-04
> devuelve `inventarioActivo: false` con los contadores en cero.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript
estricto, TODO en espanol). TDD con vitest: rojo primero. Lee antes plan/00-CONVENCIONES.md.

CONTEXTO YA VERIFICADO, no lo re-verifiques ni lo des por falso:
- `negocio.inventario_activo` es INTEGER NOT NULL DEFAULT 0 (migrations.ts:40).
- LA CASILLA PARA ENCENDERLO YA EXISTE, en Configuracion.tsx:136-137. NO tienes que crearla.
  Lo que falta no es el interruptor: es todo lo que hay que hacer ANTES de tocarlo.
- `producto.existencia` es NULL por defecto y producto-repo.crear() la fija en null de forma
  explicita (producto-repo.ts:85, con el comentario "inventario off en el MVP").
- TRAMPA DE SQL: `existencia <= 0` NO devuelve las filas con NULL. Encender el flag sin cargar
  existencias deja el panel del dueno diciendo "0 productos con existencia baja", que parece una
  buena noticia y es mentira.
- ImportarProductos.tsx:150-156 YA llama productos.ajustarExistencia() cuando la columna
  existencia esta mapeada, tanto al crear como al actualizar. AMPLIA ese camino; no escribas un
  importador nuevo. El mapeo de columnas vive en packages/ui/src/importacion/mapeo.ts.
- producto-repo.ajustarExistencia() (producto-repo.ts:160-185) corrige a un valor absoluto y
  escribe un movimiento_inventario de tipo 'ajuste' con usuario_id NULL.
- `movimiento_inventario.tipo` es TEXT SIN CHECK en el esquema (migracion 4, migrations.ts:263-277).
  Por tanto anadir 'conteo_inicial' al union TipoMovimientoInventario (tipos.ts:217) NO REQUIERE
  MIGRACION. Compruebalo tu mismo antes de darlo por bueno.

QUE HACER:

1. EN CORE, la regla de negocio (no en el componente): un metodo
   `productoRepo.conteoInicial(filas: { productoId, existencia, existenciaMinima? }[])` que
   valide y escriba, dejando un movimiento de tipo 'conteo_inicial' por cada producto tocado.
   Anade 'conteo_inicial' a TipoMovimientoInventario. El motivo de separarlo de 'ajuste' es que el
   dueno pueda distinguir despues "asi arrancamos" de "alguien corrigio esto a mano".

2. EL ASISTENTE, en Configuracion, alrededor de la casilla que ya existe. Cuatro pasos:
   (a) Explicar en espanol llano QUE CAMBIA al encenderlo, sin jerga: a partir de ahora cada venta
       descuenta existencia, cada compra la suma, y los productos marcados con politica 'bloquear'
       dejaran de poder venderse cuando lleguen a cero. Esto ultimo es lo que puede parar la caja
       un lunes por la manana y es lo que hay que decir antes, no despues.
   (b) Cargar existencias y minimos por CSV, reusando ImportarProductos y su mapeo, con la columna
       existencia_minima que crea BACKOFFICE-04 anadida al mapeo.
   (c) Preguntar explicitamente que hacer con los productos que NO vengan en el archivo: dejarlos
       en NULL (no se controlan) o ponerlos en 0 (se controlan y aparecen como agotados). Explica
       la diferencia con esas palabras; es la decision que determina si el panel dice la verdad.
   (d) Encender el flag AL FINAL, no al principio. Si el dueno abandona a la mitad, el negocio
       tiene que quedar exactamente como estaba.

3. DEGRADACION HONESTA: mientras el inventario este apagado, la pantalla de Compras debe decir que
   la cantidad recibida se esta guardando como historial pero no mueve existencia. Hoy el usuario
   escribe un dato y no pasa nada, sin ninguna explicacion.

DEPENDENCIA QUE TIENES QUE VERIFICAR ANTES DE EMPEZAR: NEGOCIO-FLAGS arregla un bug por el que
guardar() con input parcial APAGA inventario_activo en silencio (negocio-repo.ts:73-74 y 97-98).
Si ese arreglo no esta, el dueno enciende el inventario y la siguiente escritura de configuracion
lo apaga. No empieces sin el.

NO TOQUES: compra-repo.ts (COMPRAS-03 lo esta editando en la misma ola), factura-repo.ts,
ninguna migracion.
```

#### Archivos a tocar

- `packages/core/src/repos/producto-repo.ts`
- `packages/core/src/repos/tipos.ts`
- `packages/ui/src/componentes/ImportarProductos.tsx`
- `packages/ui/src/importacion/mapeo.ts`
- `packages/ui/src/pantallas/Configuracion.tsx`
- `packages/ui/src/pantallas/Compras.tsx` (solo el aviso de degradacion)
- `packages/core/test/producto-repo.test.ts`

#### Criterios de aceptacion

- [ ] `conteoInicial()` escribe un `movimiento_inventario` de tipo `conteo_inicial` por producto tocado, distinguible de un ajuste manual posterior
- [ ] El asistente enciende `inventario_activo` **al final**; abandonarlo a la mitad deja el negocio igual que estaba
- [ ] El dueno elige explicitamente que pasa con los productos ausentes del CSV (NULL o 0) y la pantalla explica la diferencia
- [ ] Con el inventario apagado, Compras dice que la cantidad recibida no mueve existencia
- [ ] La advertencia sobre los productos con politica `bloquear` aparece **antes** de encender, no despues
- [ ] No se anadio ninguna migracion: `conteo_inicial` entra solo como valor del union de TypeScript
- [ ] `pnpm -r test` y `pnpm -r typecheck` en verde

#### Pruebas a escribir primero (TDD)

- `conteoInicial()` sobre productos con `existencia` NULL los deja con el valor dado y escribe un movimiento por cada uno
- El movimiento escrito tiene `tipo === "conteo_inicial"`, no `"ajuste"`
- `conteoInicial()` con una existencia negativa lanza `ValidacionError` y **no escribe ninguna fila** (ni producto ni movimiento)
- Un producto ya con existencia cargada recibe el delta correcto, no un duplicado
- Tras `conteoInicial()`, la consulta de existencia baja de BACKOFFICE-04 devuelve resultados reales en vez de `inventarioActivo: false`
- Un producto ausente del conteo conserva `existencia` NULL y **no** aparece como agotado
- `conteoInicial([])` no enciende el flag ni escribe nada

---

