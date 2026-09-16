# Backoffice y panel grafico

> Puntos 2 y 6 del pedido. 8 tareas: BACKOFFICE-01 a BACKOFFICE-08.
> Antes de despachar cualquier tarea de este archivo, lee [00-CONVENCIONES.md](./00-CONVENCIONES.md).

> [!IMPORTANT]
> **Los briefs de abajo dicen "migracion 11". Ignora ese numero.** Los escribieron ocho
> agentes en paralelo y los ocho reclamaron el id 11. La banda de ids de esta area es
> **`80-89`**; el reparto completo esta en
> [00-CONVENCIONES.md, seccion 2](./00-CONVENCIONES.md#2-reparto-de-ids-de-migracion-bandas).

> [!NOTE]
> **Decision 4 tomada: se mantiene la convencion real del repositorio.** Cabecera por archivo
> explicando el POR QUE de la decision no obvia, y cero comentarios inline decorativos. Donde
> algun brief de abajo diga "sin comentarios en el codigo", **esta superado por esta decision**.

## Estado actual

NO existe ningun backoffice, ni pantalla de inicio, ni panel, ni concepto de rol en tiempo de ejecucion. La navegacion son 9 modulos hardcoded en un array literal (AppShell.tsx:28-31) renderizados con un bloque de condicionales (AppShell.tsx:190-199): no hay router, ni URL, ni lazy-loading, ni gate por permiso. Lo mas parecido a analitica es reportes-repo.ts (5 consultas: ventasPorDia, productosMasVendidos, resumenGanancia, resumenItbis, ventasPorMetodoPago, todas con firma (desde, hasta)) mas Reportes.tsx (186 lineas): 3 tarjetas de KPI, una tabla de productos mas vendidos, una lista por metodo de pago y UNA barra horizontal hecha con dos <div> anidados y width en porcentaje (Reportes.tsx:144-146). Cero librerias de graficas: el lockfile no contiene recharts, chart.js, d3, apexcharts, echarts ni nada equivalente; las unicas dependencias de UI son lucide-react, jspdf, jspdf-autotable, exceljs y @fontsource-variable/inter (packages/ui/package.json). El unico SVG escrito a mano del repo es el logotipo (Marca.tsx:26-40). Las tres capacidades de "gestion" que pide el cliente YA existen como pantallas separadas y funcionales: Configuracion.tsx (datos del negocio, impresora, respaldo, secuencias NCF, bitacora), Compras.tsx (527 lineas, registrar compra + historial + extraccion IA del comprobante) y Productos.tsx (515 lineas, con ajustarExistencia y historial de movimientos cuando inventario_activo=1). O sea: el backoffice no es "construir gestion", es "construir un panel de inicio grafico y una envoltura de acceso" sobre pantallas que ya estan. Del set de KPIs que pide el cliente, hoy se pueden calcular sin tocar el esquema: vendido en el dia, vendido en el mes, ITBIS del periodo, ventas por metodo, productos mas vendidos y diferencias de caja (corte_caja.diferencia ya se persiste). NO se pueden calcular en absoluto: existencia baja (no hay columna de minimo y producto.existencia es NULL por defecto), cuentas por cobrar vencidas (cliente.saldo_credito nunca se escribe y no hay fecha de vencimiento ni abonos), margen por departamento, productos sin rotacion, comparativa vs mes anterior y horas pico (no hay consultas, y horas pico ademas choca con el bug de zona horaria). La base es SQLite local sobre una interfaz SqlDriver de 5 metodos sin transacciones (driver.ts:11-22), con dos implementaciones muy distintas (sql.js/IndexedDB en PWA, tauri-plugin-sql en escritorio) y migraciones versionadas 1..10 en un array con registro en la tabla _migracion.

### Lo que ya existe y NO hay que reescribir

| Pieza | Evidencia | Se reutiliza como |
| --- | --- | --- |
| reportes-repo.ts con 5 agregados de solo lectura, todos con la misma firma (desde: string, hasta: string) y ya exportados por el barrel | `packages/core/src/repos/reportes-repo.ts:47-137, packages/core/src/repos/index.ts:85-93` | Base del panel. 'Vendido en el dia' = ventasPorDia(hoy,hoy); 'vendido en el mes' = ventasPorDia(primerDia,hoy) sumado; 'ITBIS del periodo' = resumenItbis. Agregar los KPIs nuevos como metodos MAS en este mismo archivo, no en un repo nuevo. |
| Grafico de barras horizontal ya implementado sin libreria: un div contenedor gris con borderRadius 999 y un div interno con width en % y transition | `packages/ui/src/pantallas/Reportes.tsx:144-146` | Prueba de que el patron 'grafica propia con tokens --sfr-*' funciona en este codigo. Es el punto de partida literal para extraer un componente <BarraProporcion> antes de escribir SVG. |
| Exportacion CSV hecha a mano con Blob + createObjectURL + <a download>, atada a Ctrl+E | `packages/ui/src/pantallas/Reportes.tsx:65, packages/ui/src/pantallas/Reportes.tsx:70-83` | Copiar tal cual para el 'exportar' del backoffice. Mismo patron en Configuracion.tsx:63-78 para el respaldo JSON. |
| corteCaja.calcularResumen(desde, hasta): cantidadFacturas, totalVentas, totalItbis y desglose efectivo/tarjeta/transferencia/credito en una sola llamada | `packages/core/src/repos/corte-caja-repo.ts:49-86` | Es EXACTAMENTE el KPI 'vendido hoy' con desglose por metodo. No reescribir la consulta en el panel: llamar a este metodo. |
| corte_caja persiste diferencia (contado - esperado) por cada corte y corteCaja.listar() los devuelve ordenados por fecha_cierre DESC | `packages/core/src/repos/corte-caja-repo.ts:145-149, packages/core/src/db/migrations.ts:231-252` | 'Diferencias de caja' del panel: ya hay datos historicos, solo falta un agregado (SUM/COUNT de diferencias != 0 por periodo) y la grafica. |
| bitacora.listar({entidad, desde, hasta, limite}) sobre bitacora_accion, con indice por timestamp | `packages/core/src/repos/bitacora-repo.ts:64-77, packages/core/src/db/migrations.ts:372-373` | 'Actividad del dia' = listar({desde: hoy, hasta: hoy}). Los datos ya se escriben desde cobrar, registrar_compra, cerrar_caja, ajustar_existencia, eliminar y registrar_devolucion. |
| SeccionBitacora.tsx: componente de tabla de auditoria autocontenido con filtro por entidad y diccionario ETIQUETA_ACCION | `packages/ui/src/componentes/SeccionBitacora.tsx:7-14, packages/ui/src/componentes/SeccionBitacora.tsx:17-66` | Montar este mismo componente en el panel (ya se monta en Configuracion.tsx:167) o extraer su ETIQUETA_ACCION para la tarjeta compacta de actividad. |
| Sistema de navegacion con array MODULOS + mapa ICONO + atajos Alt+N generados y render condicional dentro de un ErrorBoundary por modulo | `packages/ui/src/AppShell.tsx:28-43, packages/ui/src/AppShell.tsx:64-66, packages/ui/src/AppShell.tsx:189-199` | Agregar el panel es tocar 4 puntos de este archivo: el union Modulo (linea 24-26), MODULOS, ICONO y el bloque de condicionales. Ojo con el atajo (ver trampas). |
| Sistema de diseno completo y documentado: tokens c/s en estilos.ts, variables --sfr-* con tema claro y oscuro en estilos-globales.css, y guia escrita de 444 lineas | `packages/ui/src/estilos.ts:22-179, packages/ui/src/estilos-globales.css:18-82, design-guidelines.md:27-45` | Sustituye al DESIGN.md que exige CLAUDE.md §2 (esta con otro nombre: design-guidelines.md). Toda grafica debe pintarse con var(--sfr-*), nunca hex, o se rompe el tema oscuro. |
| money() para formato de montos y la convencion fontVariantNumeric tabular-nums en s.td / s.tdDerecha | `packages/ui/src/estilos.ts:10-12, packages/ui/src/estilos.ts:120-134` | Todo numero del panel pasa por money(). Ya esta documentado que money() NO se usa en inputs ni CSV (design-guidelines.md seccion 3). |
| Hooks de responsive en JS (no @media) porque la app se estiliza inline: useBreakpoint, useEsAngosto, useNavSoloIconos, useEsTactil, sinAtajo | `packages/ui/src/hooks/useBreakpoint.ts:45-121` | El grid de tarjetas del panel tiene que decidir columnas con useEsAngosto(), igual que hacen las demas pantallas. gridTemplateColumns fijo '1fr 1fr 1fr' como el de Reportes.tsx:107 revienta en movil. |
| Patron de SVG inline escrito a mano con currentColor y aria-hidden | `packages/ui/src/componentes/Marca.tsx:26-40` | Precedente directo para las primitivas de grafica propias (sparkline, donut, barras) sin agregar dependencia. |
| Registro de compras completo end-to-end: compra + compra_linea + efecto en costo/existencia + bitacora | `packages/core/src/repos/compra-repo.ts:89-168, packages/ui/src/pantallas/Compras.tsx:44-527` | El requisito 'registrar compras' del backoffice ya esta hecho. El panel debe enlazar a este modulo, no reimplementarlo. |
| Modificacion de inventario: producto.ajustarExistencia() con movimiento_inventario tipo 'ajuste' y bitacora, mas la UI de ajuste e historial en Productos | `packages/core/src/repos/producto-repo.ts:160-185, packages/ui/src/pantallas/Productos.tsx:105-112` | El requisito 'modificar inventario' ya esta hecho. Reutilizar; el panel solo aporta el aviso de existencia baja que enlaza aqui. |
| Sistema de dialogos propio useAlertas(): confirmar/avisar/elegir, con foco atrapado y zIndex 500 | `packages/ui/src/contexto/Alertas.tsx:42-47, packages/ui/src/AppShell.tsx:154` | Cualquier confirmacion del backoffice va por aqui. design-guidelines prohibe alert()/confirm() nativos porque en WebView2 de Tauri pasan desapercibidos. |
| Infraestructura de tests vitest en @sfr/core con driver node:sqlite en memoria y helper nuevaDb() que corre migrate() | `packages/core/test/reportes-repo.test.ts:7-11, packages/core/test/reportes-repo.test.ts:17-31` | Es el UNICO lugar del repo donde se puede hacer TDD. Toda consulta nueva del panel se prueba aqui copiando el helper venta(). |
| Migrador idempotente con registro en _migracion y precedente de ALTER TABLE ADD COLUMN con NOT NULL DEFAULT | `packages/core/src/db/migrator.ts:8-32, packages/core/src/db/migrations.ts:446-453` | Migracion 9 (favorito) es la plantilla exacta para agregar producto.existencia_minima sin romper bases instaladas. |

### Lo que falta

| Capa | Hueco | Por que importa |
| --- | --- | --- |
| ui | No existe ninguna pantalla de inicio/panel. AppShell arranca siempre en 'Ventas' (AppShell.tsx:51) y no hay archivo Panel.tsx / Inicio.tsx / Backoffice.tsx en packages/ui/src/pantallas/ | Es el entregable central del pedido. Hay que crearlo, sumarlo al union Modulo, a MODULOS, a ICONO y al bloque de render, y decidir si el modulo activo inicial deja de ser Ventas. |
| ui | No hay ninguna primitiva de grafica ni libreria instalada (verificado contra pnpm-lock.yaml y packages/ui/package.json). Lo unico que existe es la barra de div de Reportes.tsx:144-146 | Sin decidir e implementar esto no hay 'resumen grafico'. Y la decision arrastra restricciones duras: tema por variables CSS, estilos inline sin clases, y funcionamiento offline garantizado en PWA y Tauri. |
| dominio | No existe usuario-repo.ts, ni sesion, ni login, ni ninguna lectura de usuario.rol en toda la app (grep sobre packages/ui/src y packages/core/src no devuelve nada). El rol declarado en el esquema solo admite 'admin \| cajero' (migrations.ts:49) y no contempla 'superadmin' | El cliente pide un panel PARA el dueno y el superadmin. Hoy no hay forma de saber quien esta usando la app, asi que el panel seria visible para el cajero. Ademas usuario.permisos_json existe pero nadie lo lee ni lo escribe. |
| esquema | producto NO tiene columna de existencia minima / punto de reorden (migrations.ts:78-97; producto-repo.ts COLS en :48-51 enumera las 19 columnas reales) | 'Mercancia con existencia baja' no se puede calcular: lo unico posible hoy es existencia <= 0, que ya se muestra en Productos.tsx:411. Requiere migracion 11 con ALTER TABLE producto ADD COLUMN existencia_minima REAL, mas el campo en ProductoInput, en FormularioProducto y en el mapeo de importacion. |
| repo | No hay consulta de margen por departamento. reportes-repo no hace ningun JOIN a departamento y resumenGanancia (reportes-repo.ts:76-109) devuelve un unico total global | Es uno de los graficos pedidos explicitamente. Necesita una consulta nueva con JOIN factura_linea -> producto -> departamento agrupando por departamento_id, con el mismo descargo de 'costo actual, no historico'. |
| repo | No hay consulta de productos sin rotacion. movimiento-inventario-repo.ts tiene UN solo metodo, listarPorProducto(productoId) (movimiento-inventario-repo.ts:10-17) | 'Productos sin rotacion' exige un LEFT JOIN de producto contra factura_linea en un rango, filtrando los que no aparecen. No existe nada aprovechable. |
| repo | No hay comparativa contra el mes anterior. Todas las consultas reciben (desde, hasta) y devuelven un solo periodo | Pedido explicito. Se resuelve llamando dos veces al mismo agregado y comparando en el repo (no en la UI, por la regla de logica en backend), pero hay que escribir ese metodo. |
| repo | No hay consulta de horas pico. Ninguna consulta usa strftime('%H', fecha_hora) ni agrupa por hora | Pedido explicito, y ademas es el KPI mas afectado por el bug de zona horaria: agrupar por hora UTC en RD desplaza todo 4 horas, dejando el 'pico' de las 7pm reportado a las 11pm. |
| esquema | Cuentas por cobrar no existe como dato. cliente.saldo_credito se inserta en 0 (cliente-repo.ts:64) y actualizar() ni lo menciona (cliente-repo.ts:92-103); cobrar() con metodo 'credito' solo inserta una fila en pago y marca la factura 'cobrada' (factura-repo.ts:421-432). No hay tabla de abonos ni fecha de vencimiento en ninguna parte | 'Cuentas por cobrar vencidas' es imposible hoy y NO es un hueco de panel: es una funcionalidad de negocio completa (saldo, abonos, vencimiento, antiguedad) que hay que disenar antes de poder graficarla. |
| repo | No hay agregado de diferencias de caja. corteCaja.listar() devuelve todos los cortes sin filtro ni totalizacion (corte-caja-repo.ts:145-149) | Para la tarjeta de 'diferencias de caja' del panel hace falta un metodo que filtre por periodo y sume/cuente los cortes descuadrados; traerse el historial completo a la UI y filtrar ahi violaria la regla de logica en el backend. |
| repo | Las devoluciones nunca se restan de las ventas. reportes-repo lo declara explicitamente en su cabecera (reportes-repo.ts:4-9) y Reportes.tsx lo advierte al usuario (Reportes.tsx:102-104). devolucion-repo no expone ningun agregado por periodo | El panel del dueno mostrara 'vendido hoy' inflado. O se agrega un agregado de devoluciones por periodo y se muestra neto, o se repite la misma advertencia visible en cada tarjeta. |
| esquema | No hay indice sobre factura(fecha_hora) ni sobre factura(estado). Los unicos indices relevantes son ix_factura_linea_factura y ix_pago_factura (migrations.ts:159, migrations.ts:171) | Un panel dispara 8-12 agregados por rango de fecha al montar. Cada uno hace scan completo de factura. En sql.js (WASM, base entera en memoria) eso se nota en un telefono con meses de ventas. |
| build | @sfr/ui no tiene runner de tests: su package.json solo define el script typecheck, no hay vitest.config.ts ni carpeta test/ en el paquete | CLAUDE.md §3 exige TDD rojo-verde-refactor. Toda la logica del panel (calculo de KPIs, umbrales, comparativas) tiene que vivir en @sfr/core para poder testearse; si se escribe en el .tsx queda sin cobertura posible. |
| api | packages/ui/src/index.ts solo exporta AppShell, Marca, ProveedorDatos/useRepos, Ventas, Productos, Clientes, Configuracion y los adaptadores de impresora (index.ts:1-9). Reportes, Compras, CorteCaja y ConsultaFacturas NO se exportan | Decision consciente a tomar: si el panel se monta solo dentro de AppShell no hace falta exportarlo; si alguna vez se quiere embeber fuera, hay que sumarlo al barrel. |
| repo | backup-repo.ts enumera las 23 tablas a mano en una constante TABLAS (backup-repo.ts:9-19) | Si el backoffice agrega cualquier tabla nueva (sesion, cuenta por cobrar, configuracion del panel) y no se agrega a esa lista, el respaldo completo la pierde en silencio. |

## Enfoque recomendado

El backoffice NO es construir gestion: registrar compras (Compras.tsx, 527 lineas), modificar inventario (producto.ajustarExistencia + Productos.tsx) y gestionar el negocio (Configuracion.tsx) ya existen y funcionan. Lo que falta es (a) una pantalla de inicio grafica, (b) los agregados que hoy no existen, y (c) una envoltura de acceso con guardia real del lado de los datos. El plan ataca eso de abajo hacia arriba y deja intactas las pantallas que ya sirven; el Panel enlaza a ellas, no las reimplementa.

Cuatro decisiones de diseno que ordenan todo lo demas:

1) GRAFICAS: primitivas SVG propias, CERO librerias. Razon dura, no estetica: todo el repo se estiliza con objetos inline (no hay clases) y el tema claro/oscuro se cambia con un unico data-theme en <html> que solo llega a los componentes via var(--sfr-*). SVG hereda esas variables en fill/stroke sin una linea de JS; Chart.js pinta en <canvas> y obligaria a leer getComputedStyle y repintar a mano en cada cambio de tema. Ademas @media no se puede usar desde estilos inline, asi que el ResponsiveContainer de Recharts duplicaria useBreakpoint, que ya existe. Offline NO es el criterio (Vite empaqueta todo, la fuente ya se auto-aloja, Tauri sirve desde ../dist con csp:null): el criterio es el peso del bundle inicial, porque no hay code-splitting ni lazy() en ningun lado. Ya hay dos precedentes en el repo: la barra de proporcion de Reportes.tsx:144-146 y el SVG a mano de Marca.tsx:26-40. Cuatro primitivas (barra de proporcion, linea/sparkline, barras verticales, anillo) cubren los diez KPIs pedidos en ~250 lineas y 0 KB de dependencia.

2) ZONA HORARIA ANTES QUE CUALQUIER CONSULTA. factura.fecha_hora se guarda en UTC (ids.ts now() = toISOString()) y todas las consultas comparan date(fecha_hora), que SQLite interpreta en UTC, mientras la UI calcula "hoy" en fecha local. En RD (UTC-4) toda venta despues de las 8:00 pm cae en el dia UTC siguiente: el panel del dueno mostraria "vendido hoy" sin las ventas de la noche. Se fija un desfase en minutos persistido en negocio (desfase_horario_min, default -240) y se calculan los limites del dia local en TypeScript, consultando por rango de instante (fecha_hora >= ? AND fecha_hora < ?). Esto ademas es sargable y usa el indice nuevo, al reves que date(fecha_hora), que fuerza scan completo. Se descarta datetime(fecha_hora,'localtime') porque depende de la zona del proceso, que en Tauri y en el navegador no es la misma y en los tests de Node es otra.

3) TODA LA LOGICA EN @sfr/core, INCLUIDA LA COMPOSICION DEL PANEL. @sfr/ui no tiene runner de tests, asi que cualquier calculo escrito en el .tsx queda sin cobertura posible y viola el TDD que exige CLAUDE.md §3. El panel consume UN solo metodo, reportes.resumenPanel(fechaLocal, usuarioId), que compone los agregados, aplica el guardia de rol y devuelve tambien las advertencias (ventas brutas, ganancia estimada, inventario apagado) como union tipada, no como texto suelto. Beneficio secundario: evita las 10-12 llamadas sueltas con Promise.all que en sql.js (WASM, hilo principal) congelan el telefono y ademas pueden leer estados distintos si alguien cobra en medio.

4) EL GUARDIA VIVE EN LOS DATOS, NO EN EL MENU. Ocultar el modulo del panel para el cajero es cosmetico. resumenPanel recibe el usuarioId de la sesion, lee usuario.rol en SQL y lanza PermisoDenegadoError si el rol no esta en ROLES_BACKOFFICE. La UI ademas filtra el modulo, pero el filtro es la segunda linea, no la primera. Esto hace al area dependiente de RBAC para la sesion, pero NO bloqueante: BACKOFFICE-01..04 y 06 se pueden hacer hoy sin sesion.

Orden de ejecucion: 01 (esquema+dominio) -> 02 y 04 (pueden ir en paralelo) -> 03 -> 05 -> 07. La 06 (primitivas SVG) no depende de nada y conviene lanzarla el primer dia en paralelo con 01.

Punto a confirmar con el dueno del repo antes de empezar: CLAUDE.md §0 prohibe comentarios, pero TODOS los archivos de core y ui abren con un bloque JSDoc que explica el porque, y hay comentarios inline densos (AppShell.tsx:291-295, useBreakpoint.ts:9-23). La convencion real del proyecto es documentar decisiones no obvias. Los briefs instruyen imitar al archivo vecino: cabecera JSDoc que explica el porque, sin comentarios inline decorativos.

Queda FUERA de esta area por bloqueo real: cuentas por cobrar vencidas. cliente.saldo_credito se inserta en 0 y nunca se vuelve a escribir, cobrar() con metodo credito solo inserta una fila en pago, y no hay tabla de abonos ni fecha de vencimiento. No es un hueco de panel, es una funcionalidad de credito completa (saldo por factura, abonos, vencimiento, antiguedad) que pertenece al area CRM. El panel deja el hueco visible con un estado "no disponible todavia" en vez de mostrar un cero mentiroso.

### Alternativas descartadas

- Recharts / Chart.js / ApexCharts / ECharts / Nivo: agregan 150-500 KB a un bundle sin code-splitting, y ninguna hereda las variables --sfr-* del tema. Chart.js y ECharts ademas pintan en canvas, lo que obliga a leer getComputedStyle y repintar manualmente en cada cambio de data-theme; Recharts trae su propio ResponsiveContainer que duplica el useBreakpoint que ya existe. Si alguna vez se reevalua, el requisito minimo es: render SVG, sin hoja de estilos propia, y sin su propio sistema de responsive.
- Mover los agregados del panel a packages/api (Fastify): el backend NO esta conectado (auth.ts deja pasar todo como 'dev-local' si no hay Supabase, /fiscal/transmitir devuelve 501, sync-rules.yaml es un placeholder sin proyecto). En esta app local-first los repos de @sfr/core SON la capa de servicio, y ahi es donde se cumple la regla de CLAUDE.md de validar en el backend.
- Un panel-repo.ts nuevo y separado: duplicaria las cinco consultas de reportes-repo.ts o lo importaria en cadena. Los agregados nuevos van como metodos MAS dentro de reportes-repo.ts, que ya tiene la firma (desde, hasta) uniforme y ya esta exportado por el barrel.
- datetime(fecha_hora,'localtime') o strftime con 'localtime' en el SQL: depende de la zona horaria del proceso, que es distinta en el WebView de Tauri, en el navegador y en node:sqlite durante los tests. Un reporte que cambia segun donde corre es peor que uno corrido cuatro horas.
- Tabla de KPIs precalculados o vistas materializadas actualizadas por trigger: SQLite no tiene vistas materializadas, los triggers se parten en el driver de Tauri (split por ';') y el SqlDriver no tiene transacciones, asi que un agregado precalculado puede quedar desincronizado sin forma de repararlo. Con indices sobre factura(fecha_hora) el scan por rango sobra para el volumen de un colmado.
- Introducir react-router para el panel: hoy la navegacion son 9 modulos en un array literal con render condicional, y en Tauri no hay URL que compartir. Meter un router es un refactor de plataforma que no aporta nada al pedido del cliente y toca todas las pantallas.
- Reemplazar Reportes.tsx por el Panel o fusionarlos: Reportes tiene selector de rango, exportacion CSV atada a Ctrl+E y la tabla de mas vendidos, y lo usa el dueno para cerrar el mes. El Panel es de lectura rapida sobre hoy/mes; conviven y el Panel enlaza a Reportes para el detalle.
- Incluir 'cuentas por cobrar vencidas' en esta area: exige disenar credito real (saldo por factura, abonos, vencimiento, antiguedad de saldos). Pertenece a CRM; aqui solo se reserva el hueco visual con estado explicito.
- Instalar jsdom y @testing-library/react para testear los componentes de grafica: agrega tres dependencias de desarrollo y un entorno nuevo para probar render. En su lugar, la geometria (escalas, puntos del path, arcos) se extrae a un modulo puro de TypeScript y se prueba con vitest sin DOM; los componentes quedan como envoltorios delgados.

## Trampas especificas de esta area

- ZONA HORARIA, el bug que arruina 'vendido hoy'. factura.fecha_hora se guarda con now() = new Date().toISOString(), o sea UTC (ids.ts:11-13, factura-repo.ts:181 y :429). Todas las consultas comparan con date(fecha_hora), que SQLite interpreta como UTC (reportes-repo.ts:54, :68, :81, :98, :116, :132; corte-caja-repo.ts:57, :66). Pero la UI calcula 'hoy' en fecha LOCAL (Reportes.tsx:14-19, CorteCaja.tsx:10-15, Compras.tsx:27-32). En Republica Dominicana (UTC-4) toda venta despues de las 8:00 pm local cae en el dia UTC siguiente: el panel mostrara 'vendido hoy' sin las ventas de la noche y el dia siguiente arrancara con ventas de ayer. El repo YA conoce el problema y lo documento para otra cosa (ConsultaCotizaciones.tsx:31-33), y el test lo enmascara porque usa toISOString().slice(0,10) en vez de la fecha local (reportes-repo.test.ts:39). Decidir el criterio ANTES de escribir la primera consulta del panel: o datetime(fecha_hora,'-4 hours') / datetime(fecha_hora,'localtime') en SQL, o guardar offset. No mezclar criterios entre pantallas.
- EL DRIVER DE TAURI PARTE EL SQL POR ';'. tauri-sql-driver.ts:17-22 hace sql.split(';') porque sqlx acepta un solo statement por llamada. Consecuencia: cualquier migracion nueva cuyo SQL contenga un ';' dentro de un literal de texto, de un CREATE TRIGGER, de un CREATE VIEW con CASE, o incluso dentro de un comentario -- , se parte a la mitad y explota SOLO en escritorio (en web y en los tests de Node pasa, porque esos drivers aceptan lotes). La migracion 11 tiene que ser CREATE TABLE / ALTER TABLE / CREATE INDEX planos, como todas las anteriores.
- EL SqlDriver NO TIENE TRANSACCIONES. La interfaz son 5 metodos: exec, run, all, get, close (driver.ts:11-22). No hay begin/commit/rollback. compra-repo.crear() ya inserta cabecera, N lineas, actualiza N productos e inserta N movimientos sin atomicidad (compra-repo.ts:126-162). El panel es solo lectura, asi que no se ve afectado — pero cualquier accion de escritura que se agregue al backoffice (ajuste masivo de inventario, cierre de periodo) hereda el problema y puede dejar la base a medias. Tampoco hay snapshot: dos agregados lanzados con Promise.all (como Reportes.tsx:46-52) pueden leer estados distintos si alguien cobra en medio.
- ProveedorDatos CONSTRUYE EL OBJETO repos EN CADA RENDER, sin useMemo (contexto.tsx:60-82). Hoy no se nota porque su padre solo cambia de estado una vez al cargar el driver (web/main.tsx:23-36, desktop/main.tsx:22-36). Pero la forma natural de implementar 'dueno vs superadmin' es meter la sesion en ese mismo provider — y en cuanto ProveedorDatos re-renderice, la identidad de cada repo cambia, y TODA pantalla que hace useCallback([repo,...]) + useEffect([cargar]) entra en bucle infinito de consultas: Reportes.tsx:43-63, CorteCaja.tsx:34-48, Compras.tsx:94-110. Si se toca ese provider, envolver repos en useMemo primero.
- LOS ATAJOS Alt+N SE ROMPEN EN EL DECIMO MODULO. AppShell.tsx:64-66 genera las claves como `Alt+${i+1}`; con 10 modulos la decima clave es 'Alt+10', un string que normalizarTecla() nunca produce (useAtajosTeclado.ts:18-27 arma 'Alt+' + e.key, y e.key para la tecla 0 es '0'). El atajo queda muerto en silencio, y ademas el title y el numerito visible de la nav (AppShell.tsx:126, :144) mostrarian '10'. Hay que mapear explicitamente (Alt+0, o poner el panel primero y correr el resto).
- HAY BASES INSTALADAS: LAS MIGRACIONES 1..10 SON INTOCABLES. migrator.ts:17-22 salta las que ya figuran en _migracion, asi que editar el SQL de una migracion existente NO tiene efecto en ninguna instalacion real y solo cambia las bases nuevas — divergencia silenciosa entre el escritorio del cliente y el de desarrollo. Toda columna nueva va en una migracion id 11, con ALTER TABLE ... ADD COLUMN y NOT NULL DEFAULT (precedente exacto: migracion 9, migrations.ts:446-453). SQLite no soporta DROP COLUMN ni ALTER COLUMN en estas versiones: lo que se agregue mal se queda.
- LA MISMA UI CORRE SOBRE DOS MOTORES MUY DISTINTOS. sql.js mantiene la base entera en memoria WASM y re-serializa el archivo COMPLETO a IndexedDB tras cada escritura, con debounce de 150 ms (sqljs-driver.ts:64-80). Tauri usa un archivo real vía sqlx. Consecuencias para el panel: (a) en web cada consulta del panel es CPU del hilo principal — 10 agregados con scan completo de factura congelan la UI del telefono; (b) los tipos de retorno no son identicos (sql.js devuelve getAsObject sobre un stmt; tauri hace db.select y devuelve filas[0] para get, tauri-sql-driver.ts:33-39), asi que un SUM() sin filas llega como null en ambos pero conviene normalizar con ?? 0 en el repo, como ya hace reportes-repo.ts:101-107. Probar cualquier consulta nueva en los dos shells, no solo en vitest/node:sqlite.
- LA GANANCIA Y EL MARGEN SON RETROACTIVAMENTE MUTABLES. resumenGanancia usa el costo ACTUAL del producto (reportes-repo.ts:85) y compra-repo.aplicarEfectosInventario() PISA producto.costo con el costo de la ultima compra (compra-repo.ts:70), siempre, tenga o no inventario activo. Por lo tanto un grafico de 'margen por departamento' de marzo cambia solo cuando en septiembre se registra una compra mas cara. No hay costo historico por linea. El panel del dueno tiene que rotular esto como estimacion (Reportes.tsx:102-104 ya lo hace) o el dueno tomara decisiones sobre un numero que se mueve.
- 'EXISTENCIA BAJA' ESTA VACIO EN LA MAYORIA DE INSTALACIONES. producto.existencia es NULL por defecto y crear() la fija en null explicitamente con el comentario 'inventario off en el MVP' (producto-repo.ts:85, migrations.ts:91). Solo se vuelve numero si negocio.inventario_activo=1 (migrations.ts:40, default 0; el seed la deja en 0, seed.ts:31) o si alguien llama ajustarExistencia. Ademas en SQL, `existencia <= 0` NO trae las filas NULL. El panel debe leer negocio.inventario_activo y, si esta apagado, mostrar la tarjeta en estado explicativo en vez de un '0 productos con existencia baja' que parece bueno y es mentira.
- EL REPO ESTA LLENO DE COMENTARIOS EXPLICATIVOS, AL REVES DE LO QUE DICE CLAUDE.md §0. Cada archivo de core y de ui abre con un bloque JSDoc que explica el porque, y hay comentarios inline densos en AppShell.tsx:291-295, useBreakpoint.ts:9-23, sqljs-driver.ts:82-85, tauri-sql-driver.ts:9-13. La convencion REAL del proyecto es documentar decisiones no obvias. Escribir el backoffice sin un solo comentario lo dejaria como codigo ajeno al resto; conviene confirmar el criterio con el dueno del repo antes de elegir.
- TODO SE ESTILIZA CON OBJETOS INLINE, NO CON CLASES, Y ESO LIMITA LA LIBRERIA DE GRAFICAS. design-guidelines.md:27-45 fija que solo hay dos archivos de diseno (estilos.ts sin ningun hex, y estilos-globales.css con reglas por ETIQUETA, no por clase) y que el tema se cambia con un unico data-theme en <html>. Una libreria que traiga su propio CSS o que pinte en <canvas> (Chart.js) no hereda var(--sfr-*): habria que leer getComputedStyle y repintar a mano en cada cambio de tema (useTema). SVG si hereda variables CSS en fill/stroke sin una linea de JS. Ademas @media no se puede usar desde los estilos inline: el responsive se decide en JS via useBreakpoint, asi que una libreria con su propio ResponsiveContainer duplica un mecanismo que ya existe.
- OFFLINE ES REQUISITO DURO Y YA ESTA RESUELTO POR BUNDLING, NO POR CDN. La fuente se auto-aloja justamente por eso (estilos-globales.css:1-4 y design-guidelines seccion 3: 'Nunca cargar fuentes por CDN'), la PWA usa vite-plugin-pwa con autoUpdate (web/vite.config.ts:10-35) y Tauri sirve el frontend desde ../dist con csp: null (tauri.conf.json:6-7, :21-23). O sea: nada bloquea una libreria npm, porque Vite la mete en el bundle y funciona sin internet en ambos shells. El costo real no es la conectividad sino el peso: no hay code-splitting ni lazy() en ningun lado del repo, asi que lo que se agregue entra en el bundle inicial que baja el telefono. Dado que ya existe el patron de barra propia (Reportes.tsx:144-146) y de SVG a mano (Marca.tsx:26-40), la opcion coherente con este codigo es un pequeno set de primitivas SVG propias en packages/ui/src/componentes/ pintadas con var(--sfr-*); si aun asi se quiere libreria, exigir que sea SVG (no canvas) y que no imponga hoja de estilos propia.
- LA TABLA usuario Y LA TABLA caja EXISTEN PERO ESTAN MUERTAS. usuario se siembra con un unico 'usuario-admin' y caja con 'caja-1' (seed.ts:37-47), pero factura.usuario_id, factura.caja_id, corte_caja.usuario_id y bitacora_accion.usuario_id SIEMPRE quedan en null porque la UI nunca los pasa (abrirTicket los acepta como opcionales, factura-repo.ts:182-184; registrarAccion los deja en null, bitacora-repo.ts:38). Consecuencia directa para el panel: 'actividad del dia' no puede decir QUIEN hizo cada cosa, y no se puede segmentar ventas por cajero ni por caja hasta que exista sesion. Es dependencia dura entre el backoffice y el area de login/roles.
- EL BACKEND FASTIFY NO ESTA CONECTADO Y NO SIRVE PARA EL PANEL. auth.ts deja pasar todo como 'dev-local' si no hay Supabase (api/src/plugins/auth.ts:40-44) y sync-rules.yaml es un placeholder declarado sin proyecto (api/sync-rules.yaml:1-12). La regla de CLAUDE.md 'la validacion va en el backend' aqui se cumple poniendo la logica en @sfr/core (los repos SON la capa de servicio de esta app local-first), no en packages/api. No intentar mover los agregados del panel al API.

## Preguntas para el dueno del negocio

- Que es 'superadmin' exactamente: un dueno con varias sucursales, o el proveedor del software entrando a dar soporte? El esquema solo contempla 'admin | cajero' (migrations.ts:49) y la app es de un solo negocio (sync-rules.yaml lo asume explicitamente). La respuesta cambia si hace falta multi-negocio o solo un tercer rol.
- El panel debe ser la pantalla de arranque del dueno (hoy arranca siempre en Ventas, AppShell.tsx:51) y el cajero seguir arrancando en Ventas? Eso obliga a tener login antes del panel, que es un area distinta y bloqueante.
- 'Vendido en el dia' es bruto o neto de devoluciones? Hoy todo el sistema reporta bruto y lo advierte por escrito (reportes-repo.ts:4-9). Si el dueno espera neto, hay que agregar el agregado de devoluciones antes del panel.
- Que significa 'existencia baja': un minimo fijo por producto, un porcentaje, o dias de cobertura segun venta promedio? De esto depende si la columna nueva es existencia_minima REAL o algo mas complejo, y quien la carga (uno por uno, por importacion masiva, o valor por defecto del departamento).
- Que se hace en las instalaciones que tienen el inventario apagado (es el valor por defecto, migrations.ts:40 y seed.ts:31)? Las tarjetas de existencia baja y rotacion quedarian vacias para ellas. Se ocultan, se muestran con un aviso, o se empuja a activar inventario?
- 'Cuentas por cobrar vencidas' implica construir credito de verdad (saldo por factura, abonos, fecha de vencimiento, antiguedad de saldos) o basta con listar las ventas pagadas con metodo 'credito'? Hoy no existe ni lo uno ni lo otro: saldo_credito nunca se escribe.
- Se fija la zona horaria en America/Santo_Domingo, o se usa la del dispositivo? Afecta a todos los KPIs diarios y sobre todo a 'horas pico'. Tambien define si hay que corregir retroactivamente los reportes existentes.
- Con que periodo abre el panel por defecto (hoy, ultimos 7 dias, mes en curso) y el usuario puede cambiarlo? Reportes.tsx ya usa mes-en-curso (Reportes.tsx:33-34); conviene decidir si el panel lo replica o expone un selector propio.
- El panel reemplaza a la pantalla Reportes o convive con ella? Si convive, la nav pasa a 10 modulos con dos entradas parecidas; si la reemplaza, hay que absorber la tabla de productos mas vendidos y la exportacion CSV.

## Tareas

### BACKOFFICE-01 — Migracion 11: desfase horario del negocio e indices de factura, mas el modulo de dominio periodo.ts

**Objetivo.** Cualquier consulta por fecha se puede expresar como un rango de instantes UTC derivado del dia local del negocio, con indices que evitan el scan completo de factura, y todo eso probado con vitest sin tocar ninguna consulta existente.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio: toca una tabla con instalaciones vivas, pero solo con ALTER TABLE ADD COLUMN con DEFAULT, que es el patron ya probado por la migracion 9; el riesgo real es elegir mal el id si otra area migra en paralelo. | nada |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Todo el codigo esta en ESPANOL (nombres de archivo, tipos, columnas SQL, variables). TypeScript estricto, prohibido `any`. Sigue TDD: escribe primero el test, veelo fallar, luego implementa.

CONTEXTO DEL PROBLEMA QUE RESUELVES. factura.fecha_hora se guarda en UTC: packages/core/src/ids.ts:11-13 define now() como new Date().toISOString(), y factura-repo.ts:181 y :429 lo usan. Pero todas las consultas comparan con date(fecha_hora), que SQLite interpreta en UTC, mientras la UI calcula 'hoy' en fecha LOCAL (packages/ui/src/pantallas/Reportes.tsx:14-19, CorteCaja.tsx:10-15). En Republica Dominicana (UTC-4) toda venta despues de las 8:00 pm local cae en el dia UTC siguiente. Tu tarea NO es arreglar las consultas (eso es BACKOFFICE-02): es dejar la base de esquema y el modulo de dominio puro para que se puedan arreglar.

PARTE 1 — MIGRACION. Abre packages/core/src/db/migrations.ts. Hay un array `migrations` con ids 1..10. Las migraciones existentes son INTOCABLES: packages/core/src/db/migrator.ts:17-22 salta las que ya figuran en la tabla _migracion, asi que editar una migracion vieja no tiene efecto en las bases ya instaladas y solo genera divergencia silenciosa. Agrega una migracion NUEVA al final del array. Usa el id 11; si al abrir el archivo el ultimo id ya no es 10 (otra area pudo adelantarse), usa el siguiente id libre y dilo en tu reporte final. Imita EXACTAMENTE la forma de la migracion 9 (migrations.ts:445-453): { id, nombre, sql: /* sql */ `...` } con ALTER TABLE ADD COLUMN y NOT NULL DEFAULT.

SQL exacto (nombre de la migracion: 'desfase_horario_e_indices'):
  ALTER TABLE negocio ADD COLUMN desfase_horario_min INTEGER NOT NULL DEFAULT -240;
  CREATE INDEX ix_factura_fecha_hora ON factura(fecha_hora);
  CREATE INDEX ix_factura_estado_fecha ON factura(estado, fecha_hora);
  CREATE INDEX ix_factura_linea_producto ON factura_linea(producto_id);

TRAMPA CRITICA: packages/desktop/src/db/tauri-sql-driver.ts:17-22 hace sql.split(';') porque sqlx solo acepta un statement por llamada. Cualquier ';' dentro de un literal de texto, de un comentario, de un CREATE TRIGGER o de un CREATE VIEW parte el SQL a la mitad y explota SOLO en escritorio (en web y en los tests de Node pasa, porque esos drivers aceptan lotes). Tu migracion debe ser ALTER TABLE y CREATE INDEX planos. Puedes poner comentarios -- como hacen las demas migraciones, pero NINGUN comentario puede contener un ';'.

Propaga la columna: packages/core/src/repos/tipos.ts (interfaz Negocio, alrededor de la linea 328 donde esta inventario_activo: number) agrega desfase_horario_min: number. packages/core/src/repos/negocio-repo.ts: agrega desfase_horario_min a la constante COLS (linea ~42), al NegocioInput (linea ~21, como number opcional), al INSERT de crear() y al UPDATE de actualizar() (lineas ~93-106); ajusta el contador de placeholders si el INSERT usa Array(n).fill('?'). Valor por defecto cuando el input no lo trae: -240. En packages/core/src/db/seed.ts (linea ~17) agrega la columna al INSERT del negocio de ejemplo con -240.

PARTE 2 — DOMINIO PURO. Crea packages/core/src/dominio/periodo.ts. Imita el estilo de packages/core/src/dominio/caja.ts y dinero.ts: funciones puras exportadas, sin acceso a base de datos, sin Date.now() escondido (la hora actual SIEMPRE entra como parametro con default). Exporta:
  export const DESFASE_RD_MIN = -240;
  fechaLocalDeInstante(isoUtc: string, desfaseMin: number): string  -> 'YYYY-MM-DD'
  horaLocalDeInstante(isoUtc: string, desfaseMin: number): number   -> 0..23
  inicioDiaUtc(fechaLocal: string, desfaseMin: number): string      -> instante ISO UTC del comienzo de ese dia local
  finDiaUtcExclusivo(fechaLocal: string, desfaseMin: number): string -> instante ISO UTC del comienzo del dia local SIGUIENTE
  rangoUtc(desde: string, hasta: string, desfaseMin: number): { inicio: string; finExclusivo: string }
  modificadorSqlite(desfaseMin: number): string -> '-240 minutes' / '+330 minutes' (para strftime cuando haya que AGRUPAR por dia u hora local; el filtrado siempre va por rango)
  hoyLocal(desfaseMin: number, ahora?: Date): string
  primerDiaDelMesLocal(desfaseMin: number, ahora?: Date): string
  periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } -> ventana del mismo largo inmediatamente anterior a `desde`
  mesAnteriorDe(fechaLocal: string): { desde: string; hasta: string } -> mes calendario completo anterior al mes de esa fecha
Registra el modulo en packages/core/src/dominio/index.ts siguiendo el patron de los vecinos, y verifica que packages/core/src/index.ts lo reexporte igual que a los demas modulos de dominio.

TESTS. Crea packages/core/test/periodo.test.ts. Imita el estilo de packages/core/test/caja.test.ts (vitest, describe/it/expect, sin base de datos). Crea tambien packages/core/test/migraciones-panel.test.ts para lo de esquema, imitando packages/core/test/migrations.test.ts (usa createNodeSqliteDriver de ../src/db/drivers/node-sqlite.js y migrate de ../src/db/migrator.js).

COMANDOS: pnpm -F @sfr/core test  y  pnpm -F @sfr/core typecheck. Ambos deben quedar verdes.

NO TOQUES: packages/core/src/repos/reportes-repo.ts, corte-caja-repo.ts, factura-repo.ts ni ninguna consulta existente (eso es BACKOFFICE-02, si lo tocas le pisas el trabajo). NO toques ninguna pantalla de packages/ui. NO edites las migraciones 1..10. NO agregues dependencias. NO crees producto.existencia_minima (eso es BACKOFFICE-04, va en otra migracion). NO uses Intl.DateTimeFormat ni librerias de fechas (date-fns, dayjs, luxon): aritmetica de minutos sobre Date, que es exactamente lo que necesitamos y funciona igual en Node, en el navegador y en el WebView de Tauri. Estilo de comentarios: una cabecera JSDoc por archivo explicando el porque, como hacen los vecinos; nada de comentarios inline decorativos.
```

#### SQL de la migracion

```sql
ALTER TABLE negocio ADD COLUMN desfase_horario_min INTEGER NOT NULL DEFAULT -240;
CREATE INDEX ix_factura_fecha_hora ON factura(fecha_hora);
CREATE INDEX ix_factura_estado_fecha ON factura(estado, fecha_hora);
CREATE INDEX ix_factura_linea_producto ON factura_linea(producto_id);
```

#### Archivos a tocar

- `packages/core/src/db/migrations.ts`
- `packages/core/src/dominio/periodo.ts`
- `packages/core/src/dominio/index.ts`
- `packages/core/src/repos/tipos.ts`
- `packages/core/src/repos/negocio-repo.ts`
- `packages/core/src/db/seed.ts`
- `packages/core/test/periodo.test.ts`
- `packages/core/test/migraciones-panel.test.ts`

#### Criterios de aceptacion

- [ ] La migracion nueva se agrega al final del array `migrations` con id 11 (o el siguiente libre) y las migraciones 1..10 quedan byte por byte iguales.
- [ ] El SQL de la migracion no contiene ningun ';' dentro de literales ni de comentarios: son ALTER TABLE y CREATE INDEX planos, seguros para el split por ';' del driver de Tauri.
- [ ] negocio.desfase_horario_min existe con NOT NULL DEFAULT -240, aparece en la interfaz Negocio, en COLS de negocio-repo, en crear(), en actualizar() y en el seed.
- [ ] periodo.ts no importa nada del directorio db/ ni de repos/: es dominio puro, sin efectos, con la hora actual siempre inyectable por parametro.
- [ ] `pnpm -F @sfr/core test` pasa en verde, incluidos todos los tests que ya existian, y `pnpm -F @sfr/core typecheck` no reporta errores.
- [ ] Ninguna consulta existente cambio de comportamiento: reportes-repo.ts, corte-caja-repo.ts y factura-repo.ts quedan sin modificar en este commit.

#### Pruebas a escribir primero (TDD)

- periodo: fechaLocalDeInstante('2026-03-15T02:30:00.000Z', -240) devuelve '2026-03-14' (2:30 UTC son las 22:30 del dia anterior en RD): este es el caso que hoy rompe 'vendido hoy'.
- periodo: fechaLocalDeInstante('2026-03-15T04:00:00.000Z', -240) devuelve '2026-03-15' (la medianoche local exacta pertenece al dia nuevo).
- periodo: horaLocalDeInstante('2026-03-15T23:10:00.000Z', -240) devuelve 19 (el pico de las 7pm no debe reportarse a las 11pm).
- periodo: inicioDiaUtc('2026-03-15', -240) devuelve '2026-03-15T04:00:00.000Z' y finDiaUtcExclusivo('2026-03-15', -240) devuelve '2026-03-16T04:00:00.000Z'.
- periodo: rangoUtc('2026-03-01','2026-03-31',-240) cubre el mes completo y su finExclusivo es el 2026-04-01T04:00:00.000Z (el ultimo dia entra entero).
- periodo: con desfase 0 el rango de un dia es exactamente 'YYYY-MM-DDT00:00:00.000Z' a 'YYYY-MM-DD+1T00:00:00.000Z' (no se rompe si el negocio no esta en RD).
- periodo: con desfase positivo (+330, India) inicioDiaUtc('2026-03-15', 330) devuelve '2026-03-14T18:30:00.000Z' y modificadorSqlite(330) devuelve '+330 minutes'.
- periodo: modificadorSqlite(-240) devuelve '-240 minutes'.
- periodo: hoyLocal(-240, new Date('2026-03-15T03:00:00.000Z')) devuelve '2026-03-14' y primerDiaDelMesLocal con ese mismo instante devuelve '2026-03-01'.
- periodo: periodoAnterior('2026-03-10','2026-03-16') devuelve { desde:'2026-03-03', hasta:'2026-03-09' } (misma cantidad de dias, pegado al inicio).
- periodo: mesAnteriorDe('2026-01-15') devuelve { desde:'2025-12-01', hasta:'2025-12-31' } (cruza el ano correctamente) y mesAnteriorDe('2026-03-31') devuelve febrero completo.
- migraciones: tras migrate(db), PRAGMA table_info(negocio) incluye desfase_horario_min y su valor por defecto en la fila sembrada es -240.
- migraciones: tras migrate(db), SELECT name FROM sqlite_master WHERE type='index' incluye ix_factura_fecha_hora, ix_factura_estado_fecha e ix_factura_linea_producto.
- migraciones: correr migrate(db) dos veces sobre la misma base devuelve 0 migraciones aplicadas la segunda vez (idempotencia, ya cubierta pero debe seguir verde).
- migraciones: ninguna cadena sql del array `migrations` contiene ';' dentro de comillas simples ni despues de '--' en la misma linea (test de guardia contra el split del driver de Tauri, se aplica a TODO el array).

---

### BACKOFFICE-02 — Unificar el criterio de fecha en los agregados existentes y agregar ventas por hora y comparativa de periodos

**Objetivo.** Las cinco consultas de reportes-repo y el resumen de corte de caja dejan de mezclar dia UTC con dia local, y aparecen los dos agregados temporales que pide el cliente (horas pico y comparativa contra el periodo anterior), todo con la misma firma publica de hoy para no romper las pantallas.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | alto: cambia los numeros que ya ven tres pantallas en produccion; un corte de caja del mismo periodo puede dar distinto que ayer. Hay que avisarlo en el reporte de la tarea para que el dueno no lo lea como un error. | BACKOFFICE-01 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Todo en ESPANOL, TypeScript estricto, prohibido `any`. TDD: primero el test en rojo, despues la implementacion.

PRERREQUISITO: la tarea BACKOFFICE-01 ya dejo packages/core/src/dominio/periodo.ts (con rangoUtc, modificadorSqlite, fechaLocalDeInstante, periodoAnterior) y la columna negocio.desfase_horario_min (default -240). Leelo antes de empezar; es tu herramienta principal.

QUE ESTA MAL HOY. packages/core/src/repos/reportes-repo.ts tiene cinco metodos (ventasPorDia, productosMasVendidos, resumenGanancia, resumenItbis, ventasPorMetodoPago) y todos filtran con `date(fecha_hora) >= date(?) AND date(fecha_hora) <= date(?)` (lineas 54, 68, 81, 90, 98, 116, 131). packages/core/src/repos/corte-caja-repo.ts hace lo mismo en calcularResumen (lineas 57 y 66). fecha_hora esta en UTC pero el parametro que llega es una fecha LOCAL calculada por la UI, asi que en RD (UTC-4) las ventas de despues de las 8:00 pm se cuentan en el dia siguiente. Ademas date(fecha_hora) impide usar el indice ix_factura_fecha_hora que creo BACKOFFICE-01.

QUE TIENES QUE HACER.
1) En reportes-repo.ts agrega una funcion interna que lea el desfase una sola vez por llamada: `SELECT desfase_horario_min FROM negocio LIMIT 1`, con fallback a DESFASE_RD_MIN si no hay fila. Imita como factura-repo.ts:100-101 lee inventario_activo del negocio.
2) Cambia los seis filtros por rango de instante: `fecha_hora >= ? AND fecha_hora < ?` usando rangoUtc(desde, hasta, desfase). NO uses BETWEEN y NO uses <= con el fin: el fin es EXCLUSIVO.
3) Donde se AGRUPA por dia (ventasPorDia, reportes-repo.ts:51-56) cambia `date(fecha_hora)` del GROUP BY por `strftime('%Y-%m-%d', fecha_hora, ?)` pasando modificadorSqlite(desfase) como parametro, para que el dia de la etiqueta sea el dia local.
4) NO cambies las firmas publicas: ventasPorDia(desde, hasta) sigue recibiendo dos fechas locales 'YYYY-MM-DD'. Las pantallas Reportes.tsx, CorteCaja.tsx y Compras.tsx no se tocan y deben seguir funcionando sin editarlas.
5) Agrega DOS metodos nuevos a reportes-repo.ts, en el mismo archivo (no crees un repo nuevo):
   ventasPorHora(desde: string, hasta: string): Promise<VentaPorHora[]> con VentaPorHora { hora: number; totalVentas: number; cantidadFacturas: number }. Agrupa con strftime('%H', fecha_hora, ?) y el modificador del desfase, convierte la hora a number, y devuelve las 24 horas en orden con ceros donde no hubo ventas (que el consumidor no tenga que rellenar huecos para dibujar).
   comparativaPeriodo(desde: string, hasta: string): Promise<ComparativaPeriodo> con ComparativaPeriodo { actual: { ventas: number; facturas: number }; anterior: { ventas: number; facturas: number }; variacionPct: number; desdeAnterior: string; hastaAnterior: string }. El periodo anterior sale de periodoAnterior() del dominio. La variacion se calcula EN EL REPO, no en la UI (regla de CLAUDE.md: la logica de negocio vive en la capa de servicio). Caso borde obligatorio: si anterior.ventas es 0, variacionPct es 0 cuando actual tambien es 0, y 100 cuando actual es mayor que 0; nunca Infinity ni NaN.
6) Normaliza siempre los SUM() con ?? 0 y pasa los montos por redondear2 de ../dominio/dinero.js, como ya hace resumenGanancia (reportes-repo.ts:101-107): sql.js y tauri devuelven null en SUM sin filas.
7) Exporta los tipos nuevos (VentaPorHora, ComparativaPeriodo) desde packages/core/src/repos/index.ts, en el bloque de reportes-repo (lineas 85-93).

TESTS. Edita packages/core/test/reportes-repo.test.ts y packages/core/test/corte-caja-repo.test.ts. OJO: el test actual usa `new Date().toISOString().slice(0,10)` como 'hoy' (reportes-repo.test.ts:39), que es la fecha UTC y justamente enmascara el bug. Cambialo por hoyLocal(desfase) del dominio. Para los casos de zona horaria no dependas de la hora en que corre el test: inserta el instante a mano con un UPDATE directo sobre factura.fecha_hora despues de cobrar (ej. UPDATE factura SET fecha_hora='2026-03-15T02:30:00.000Z'), asi controlas el escenario exacto. El helper venta() que ya existe en reportes-repo.test.ts:17-31 es tu punto de partida para crear facturas cobradas.

COMANDOS: pnpm -F @sfr/core test y pnpm -F @sfr/core typecheck, ambos verdes.

NO TOQUES: ninguna pantalla de packages/ui (las firmas no cambian, asi que no hace falta). NO toques packages/core/src/db/migrations.ts (no necesitas migracion). NO agregues margen por departamento, productos sin rotacion ni devoluciones: eso es BACKOFFICE-03 y va sobre este mismo archivo, asi que deja el archivo limpio y ordenado para quien venga. NO cambies el comportamiento de factura-repo ni de cobrar(). NO uses datetime(...,'localtime') en ningun lado: depende de la zona del proceso y da resultados distintos en Tauri, en el navegador y en los tests. Estilo: cabecera JSDoc por archivo como los vecinos, sin comentarios inline decorativos; actualiza la cabecera de reportes-repo.ts (lineas 4-10) para que mencione el criterio de dia local.
```

#### Archivos a tocar

- `packages/core/src/repos/reportes-repo.ts`
- `packages/core/src/repos/corte-caja-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/test/reportes-repo.test.ts`
- `packages/core/test/corte-caja-repo.test.ts`

#### Criterios de aceptacion

- [ ] Ningun metodo de reportes-repo.ts ni corte-caja-repo.ts filtra ya con date(fecha_hora): todos usan fecha_hora >= ? AND fecha_hora < ? con los limites calculados por rangoUtc.
- [ ] Las firmas publicas de los cinco metodos existentes y de calcularResumen no cambian, y Reportes.tsx, CorteCaja.tsx y Compras.tsx siguen compilando y funcionando sin editarlos.
- [ ] ventasPorHora devuelve siempre 24 filas ordenadas de 0 a 23, con totalVentas 0 en las horas sin ventas.
- [ ] comparativaPeriodo calcula la variacion dentro del repo y nunca devuelve Infinity, -Infinity ni NaN.
- [ ] Todos los SUM() pasan por ?? 0 y los montos por redondear2.
- [ ] `pnpm -F @sfr/core test` y `pnpm -F @sfr/core typecheck` verdes, con los tests viejos adaptados al criterio de dia local (no borrados).

#### Pruebas a escribir primero (TDD)

- ventasPorDia: una venta con fecha_hora '2026-03-15T02:30:00.000Z' (22:30 del 14 en RD) se cuenta en ventasPorDia('2026-03-14','2026-03-14') y NO aparece en el 15. Este test debe fallar antes del cambio.
- ventasPorDia: una venta con fecha_hora '2026-03-15T04:00:00.000Z' (medianoche local del 15) se cuenta en el 15 y no en el 14 (limite exacto).
- ventasPorDia: la etiqueta `fecha` de la fila agrupada es la fecha LOCAL, no la UTC, para esa misma venta de las 22:30.
- resumenItbis y ventasPorMetodoPago: la misma venta nocturna cae en el dia local correcto (el criterio es uniforme en los cinco metodos).
- corteCaja.calcularResumen: la venta nocturna del 14 entra en calcularResumen('2026-03-14','2026-03-14') y su total coincide con el de ventasPorDia para ese dia (dos caminos, un solo numero).
- ventasPorHora: una venta a las '2026-03-15T23:10:00.000Z' aparece en la hora 19 y no en la 23.
- ventasPorHora: sin ventas en el rango devuelve 24 filas con totalVentas 0 y cantidadFacturas 0.
- ventasPorHora: dos ventas en la misma hora local suman en una sola fila.
- comparativaPeriodo: con 100 vendido en el periodo actual y 50 en el anterior devuelve variacionPct 100.
- comparativaPeriodo: con 0 en el anterior y 0 en el actual devuelve variacionPct 0 (no NaN); con 0 en el anterior y algo vendido en el actual devuelve 100 (no Infinity).
- comparativaPeriodo: devuelve desdeAnterior y hastaAnterior con la misma cantidad de dias que el rango pedido y pegados justo antes de `desde`.
- Regresion: todos los tests que ya existian en reportes-repo.test.ts y corte-caja-repo.test.ts siguen verdes tras cambiar el calculo de 'hoy' a fecha local.

---

### BACKOFFICE-03 — Agregados de negocio del panel: margen por departamento, productos sin rotacion, devoluciones del periodo y diferencias de caja

**Objetivo.** Existen y estan probadas las cuatro consultas de analisis que el cliente pidio y que hoy no se pueden calcular, cada una devolviendo tambien el descargo que la hace honesta (costo actual, no historico).

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio: son consultas nuevas de solo lectura, pero el margen por departamento expone un numero mutable retroactivamente que el dueno puede tomar como verdad contable si no se rotula como estimacion. | BACKOFFICE-01, BACKOFFICE-02 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Todo en ESPANOL, TypeScript estricto, prohibido `any`. TDD estricto: test en rojo primero.

PRERREQUISITOS YA HECHOS: packages/core/src/dominio/periodo.ts (rangoUtc, modificadorSqlite) y reportes-repo.ts ya migrado a filtrar por rango de instante UTC (fecha_hora >= ? AND fecha_hora < ?) leyendo negocio.desfase_horario_min. Copia ese patron exacto en cada consulta nueva: NO vuelvas a escribir date(fecha_hora) en ningun lado.

AGREGAS CUATRO METODOS. Tres van en packages/core/src/repos/reportes-repo.ts (mismo archivo, mismo estilo que los metodos que ya estan) y uno en packages/core/src/repos/corte-caja-repo.ts.

1) reportes.margenPorDepartamento(desde, hasta): Promise<MargenDepartamento[]>
   MargenDepartamento { departamentoId: string | null; nombre: string; ingresos: number; costoEstimado: number; margen: number; margenPct: number; ingresosSinCosto: number }
   JOIN factura_linea -> factura -> producto -> departamento, filtrando f.estado='cobrada' AND f.deleted_at IS NULL AND fl.deleted_at IS NULL. Agrupa por departamento_id. Las lineas sin producto vinculado (fl.producto_id IS NULL, o sea venta rapida) NO tienen costo conocido: agrupalas en una fila con departamentoId null y nombre 'Sin departamento' y acumula su importe en ingresosSinCosto, igual que ya hace resumenGanancia (reportes-repo.ts:93-100 y :107). margenPct es (margen / ingresos) * 100 redondeado, y es 0 si ingresos es 0 (nunca NaN ni Infinity). Ordena por ingresos DESC.
   ADVERTENCIA QUE DEBES CODIFICAR, NO SOLO DOCUMENTAR: el costo usado es producto.costo ACTUAL, y compra-repo.ts:70 (aplicarEfectosInventario) PISA producto.costo con el costo de la ultima compra, tenga o no inventario activo. Por eso el margen de marzo cambia solo cuando en septiembre se registra una compra mas cara. Es la misma limitacion que ya declara la cabecera de reportes-repo.ts:4-9.
2) reportes.productosSinRotacion(desde, hasta, limite = 20): Promise<ProductoSinRotacion[]>
   ProductoSinRotacion { productoId: string; descripcion: string; existencia: number | null; costo: number; valorInmovilizado: number; ultimaVenta: string | null }
   Productos activos (activo=1 AND deleted_at IS NULL) que NO aparecen en ninguna factura_linea de factura cobrada dentro del rango. Usalo con NOT EXISTS o LEFT JOIN ... IS NULL. ultimaVenta es el MAX(f.fecha_hora) historico del producto convertido a fecha LOCAL con fechaLocalDeInstante, o null si nunca se vendio. valorInmovilizado es existencia * costo, y es 0 cuando existencia es null (inventario apagado). Ordena por valorInmovilizado DESC y luego por descripcion.
3) reportes.devolucionesPeriodo(desde, hasta): Promise<ResumenDevoluciones> con ResumenDevoluciones { cantidad: number; total: number }
   Sobre la tabla devolucion (mira packages/core/src/repos/devolucion-repo.ts y la migracion que la crea en migrations.ts:376-415 para los nombres exactos de columnas). Sirve para que el panel pueda mostrar venta NETA. Es la unica forma de cerrar el hueco que reportes-repo.ts:4-9 y Reportes.tsx:102-104 declaran por escrito hoy.
4) corteCaja.resumenDiferencias(desde, hasta): Promise<ResumenDiferenciasCaja>
   ResumenDiferenciasCaja { cantidadCortes: number; cortesDescuadrados: number; totalSobrante: number; totalFaltante: number; peorFaltante: number }
   Filtra corte_caja por fecha_cierre dentro del rango (fecha_cierre ya es una fecha local 'YYYY-MM-DD', NO un instante: no le apliques la conversion de zona horaria) y deleted_at IS NULL. totalSobrante suma las diferencias positivas, totalFaltante suma el valor absoluto de las negativas, peorFaltante es la peor diferencia negativa en valor absoluto. Ponlo junto a listar() (corte-caja-repo.ts:145-149). El objetivo explicito es que la UI NO se traiga el historial completo para filtrarlo del lado del cliente.

Normaliza todos los SUM() con ?? 0 y pasa los montos por redondear2 de ../dominio/dinero.js. Exporta los cuatro tipos nuevos desde packages/core/src/repos/index.ts en los bloques correspondientes.

TESTS. Crea packages/core/test/reportes-analisis.test.ts (los tres primeros) y agrega los casos de resumenDiferencias a packages/core/test/corte-caja-repo.test.ts. Imita el helper nuevaDb() y el helper venta() de packages/core/test/reportes-repo.test.ts:7-31; para departamentos usa crearDepartamentoRepo y para productos crearProductoRepo, ambos exportados desde ../src/index.js.

COMANDOS: pnpm -F @sfr/core test y pnpm -F @sfr/core typecheck, verdes.

NO TOQUES: nada de packages/ui (esta tarea no tiene UI). NO toques migrations.ts (no necesitas columnas nuevas; la de existencia minima la hace BACKOFFICE-04 en paralelo). NO modifiques los cinco metodos existentes de reportes-repo ni calcularResumen de corte-caja-repo: BACKOFFICE-02 ya los dejo como deben quedar. NO intentes calcular cuentas por cobrar vencidas: cliente.saldo_credito se inserta en 0 (cliente-repo.ts:64) y nunca se actualiza, no hay tabla de abonos ni fecha de vencimiento; ese dato NO existe y pertenece al area CRM. NO agregues dependencias. Estilo: cabecera JSDoc por archivo, sin comentarios inline decorativos.
```

#### Archivos a tocar

- `packages/core/src/repos/reportes-repo.ts`
- `packages/core/src/repos/corte-caja-repo.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/test/reportes-analisis.test.ts`
- `packages/core/test/corte-caja-repo.test.ts`

#### Criterios de aceptacion

- [ ] Los cuatro metodos nuevos filtran por rango de instante UTC con rangoUtc (salvo resumenDiferencias, que filtra por fecha_cierre, que ya es fecha local) y ninguno reintroduce date(fecha_hora).
- [ ] margenPorDepartamento separa el importe sin costo conocido en ingresosSinCosto y nunca lo suma al costo estimado, replicando el criterio de resumenGanancia.
- [ ] margenPct, y cualquier otro porcentaje, devuelve 0 cuando el denominador es 0: ningun metodo puede devolver NaN ni Infinity.
- [ ] productosSinRotacion no lista productos inactivos ni eliminados, y devuelve valorInmovilizado 0 cuando existencia es null.
- [ ] resumenDiferencias devuelve los agregados ya calculados: la UI no necesita listar() ni filtrar del lado del cliente para armar la tarjeta.
- [ ] `pnpm -F @sfr/core test` y `pnpm -F @sfr/core typecheck` verdes, sin romper ningun test previo.

#### Pruebas a escribir primero (TDD)

- margenPorDepartamento: con dos departamentos y ventas en ambos, cada fila trae sus ingresos y su costo, y la suma de ingresos coincide con resumenGanancia.ingresos del mismo rango.
- margenPorDepartamento: una venta rapida sin producto vinculado cae en la fila de departamentoId null y su importe aparece en ingresosSinCosto, no en costoEstimado.
- margenPorDepartamento: un producto sin departamento_id cae tambien en la fila null sin romper la consulta.
- margenPorDepartamento: un departamento con ingresos 0 devuelve margenPct 0 y no NaN.
- margenPorDepartamento: tras registrar una compra mas cara del mismo producto (compra-repo.crear con aplicarEfectosInventario), el margen historico CAMBIA; el test lo afirma explicitamente para dejar documentada la limitacion en vez de fingir que no existe.
- productosSinRotacion: un producto vendido dentro del rango NO aparece; uno vendido solo fuera del rango SI aparece, y trae su ultimaVenta en fecha local.
- productosSinRotacion: un producto que nunca se vendio aparece con ultimaVenta null.
- productosSinRotacion: un producto con activo=0 o deleted_at no null nunca aparece.
- productosSinRotacion: con existencia 10 y costo 25, valorInmovilizado es 250; con existencia null es 0.
- devolucionesPeriodo: sin devoluciones devuelve { cantidad: 0, total: 0 } y no null.
- devolucionesPeriodo: una devolucion dentro del rango se cuenta y su total coincide con el monto devuelto; una fuera del rango no.
- resumenDiferencias: tres cortes con diferencias +100, -50 y 0 devuelven cantidadCortes 3, cortesDescuadrados 2, totalSobrante 100, totalFaltante 50 y peorFaltante 50.
- resumenDiferencias: un corte con fecha_cierre fuera del rango no se cuenta.
- resumenDiferencias: sin cortes en el rango devuelve todo en 0, nunca null ni NaN.

---

### BACKOFFICE-04 — Migracion 12: existencia minima por producto y consulta de mercancia baja consciente del inventario apagado

**Objetivo.** El KPI 'mercancia con existencia baja' pasa a ser calculable: hay umbral por producto, se puede cargar desde el formulario, la validacion vive en el repo y la consulta distingue 'no hay nada bajo' de 'el inventario esta apagado'.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio: toca COLS y los placeholders de INSERT/UPDATE de producto-repo, que es el repo mas usado de la app; un placeholder mal contado rompe el alta de productos. | BACKOFFICE-01 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Migracion + repo + 'PARTE 3 — FORMULARIO (minima, sobre un formulario que YA existe)'. Ese 'minima' es enganoso: el campo hay que anadirlo tambien a diferenciasProducto, porque si no el modal de confirmacion dira que no cambio nada y el formulario se cerrara SIN GUARDAR y sin ningun error. Un campo que se ve y no se guarda es peor que un campo que falta. Ademas FormularioProducto.tsx lo reclaman tambien PRECIOS-05 y COMPRAS-07.
>   **Arreglo.** Dejar en BACKOFFICE-04 solo la migracion, el repo y la validacion en validarProducto. El campo del formulario se va a CATALOGO-UI junto con precio_2 y el historial de costo, con la trampa de diferenciasProducto escrita en el brief y un test de esa funcion pura.

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Todo en ESPANOL, TypeScript estricto, prohibido `any`. TDD: primero los tests de core en rojo.

POR QUE ESTA TAREA EXISTE. El cliente pide ver 'mercancia con existencia baja'. Hoy es imposible: la tabla producto no tiene columna de minimo (mira las 19 columnas reales en la constante COLS de packages/core/src/repos/producto-repo.ts:48-51) y lo unico que se puede preguntar es existencia <= 0, que ya se muestra en Productos.tsx:411. Peor: producto.existencia es NULL por defecto (producto-repo.ts:85 la fija en null con la nota 'inventario off en el MVP') y solo se vuelve numero si negocio.inventario_activo = 1, que por defecto es 0 (migrations.ts:40, seed.ts:31). En SQL, `existencia <= 0` NO trae las filas NULL. Si la consulta no lo contempla, el panel dira '0 productos con existencia baja' en instalaciones donde el inventario simplemente no se usa: un numero que parece bueno y es mentira.

PARTE 1 — MIGRACION. En packages/core/src/db/migrations.ts agrega una migracion NUEVA al final del array (id 12; si el ultimo id ya no es 11, usa el siguiente libre y avisalo). Imita la migracion 9 (migrations.ts:445-453). Nombre: 'producto_existencia_minima'. SQL:
  ALTER TABLE producto ADD COLUMN existencia_minima REAL NOT NULL DEFAULT 0;
  CREATE INDEX ix_producto_existencia ON producto(existencia);
Solo ALTER TABLE y CREATE INDEX planos, y ningun ';' dentro de comentarios ni literales: packages/desktop/src/db/tauri-sql-driver.ts:17-22 parte el SQL por ';' y cualquier otra cosa explota solo en escritorio. NO edites las migraciones anteriores: migrator.ts:17-22 las saltea en las bases ya instaladas, asi que editarlas solo crea divergencia silenciosa. SQLite en estas versiones no soporta DROP COLUMN: lo que agregues mal se queda.

SEMANTICA DEL UMBRAL (decidida, implementala tal cual): existencia_minima = 0 significa 'sin umbral configurado', no 'umbral cero'. Un producto esta BAJO si existencia_minima > 0 AND existencia IS NOT NULL AND existencia <= existencia_minima. Un producto esta AGOTADO si existencia IS NOT NULL AND existencia <= 0. Son dos estados distintos y la consulta los distingue.

PARTE 2 — REPO. En packages/core/src/repos/producto-repo.ts:
  - Agrega existencia_minima a COLS (pasa de 19 a 20 columnas: ajusta TODOS los Array(19).fill('?') del archivo, hay INSERT y UPDATE).
  - Agrega existencia_minima?: number a ProductoInput, con default 0 en crear() y soporte en actualizar().
  - Agrega la regla a validarProducto(): si existencia_minima viene y es negativa, error { campo: 'existencia_minima', mensaje: 'La existencia minima no puede ser negativa.' }. Imita las validaciones que ya estan en producto-repo.ts:26-38; se lanza como ValidacionError desde crear() y actualizar(). Este es el guardia del lado de los datos: no alcanza con validar en el formulario.
  - Agrega el campo a la interfaz Producto en packages/core/src/repos/tipos.ts.
  - Agrega el metodo: existenciaBaja(limite = 50): Promise<ResumenExistenciaBaja> con ResumenExistenciaBaja { inventarioActivo: boolean; cantidadBajos: number; cantidadAgotados: number; filas: ProductoBajo[] } y ProductoBajo { productoId: string; descripcion: string; existencia: number; existenciaMinima: number; agotado: boolean }. Lee inventario_activo con `SELECT inventario_activo FROM negocio LIMIT 1` igual que factura-repo.ts:100-101; si esta apagado devuelve inventarioActivo false, contadores en 0 y filas vacia SIN correr la consulta. Ordena los agotados primero y despues por la distancia al umbral.
  - Exporta los tipos nuevos desde packages/core/src/repos/index.ts en el bloque de producto-repo (lineas 2-7).

PARTE 3 — FORMULARIO (minima, sobre un formulario que YA existe). En packages/ui/src/componentes/FormularioProducto.tsx agrega el campo 'Existencia minima' junto a los de costo y precio, imitando exactamente el estilo de los campos vecinos (s.input, s.label de ../estilos.js, sin clases CSS, sin @media). Mapealo a ProductoInput. Es un campo mas en un formulario existente, no una pantalla nueva.

VERIFICA ANTES DE CERRAR: packages/core/src/repos/backup-repo.ts enumera las tablas a mano en la constante TABLAS (lineas 9-19). Confirma que el respaldo selecciona columnas con * y no una lista fija; si fuera una lista fija, agrega la columna nueva o el respaldo la pierde en silencio. Reportalo en tu resumen final.

TESTS. Crea packages/core/test/producto-existencia-baja.test.ts imitando el helper nuevaDb() de packages/core/test/reportes-repo.test.ts:7-11. Para activar inventario usa crearNegocioRepo y actualiza inventario_activo, y para mover existencias usa producto.ajustarExistencia (producto-repo.ts:160-185).

COMANDOS: pnpm -F @sfr/core test, pnpm -F @sfr/core typecheck y pnpm -F @sfr/ui typecheck, los tres verdes.

NO TOQUES: packages/ui/src/pantallas/Productos.tsx mas alla de lo que exija compilar (la columna nueva en la tabla es opcional y no forma parte de esta tarea), packages/ui/src/componentes/ImportarProductos.tsx (mapear la columna en la importacion masiva queda como seguimiento, dilo en tu reporte), reportes-repo.ts, corte-caja-repo.ts, AppShell.tsx y contexto.tsx. NO crees la pantalla del panel. NO agregues dependencias.
```

#### SQL de la migracion

```sql
ALTER TABLE producto ADD COLUMN existencia_minima REAL NOT NULL DEFAULT 0;
CREATE INDEX ix_producto_existencia ON producto(existencia);
```

#### Archivos a tocar

- `packages/core/src/db/migrations.ts`
- `packages/core/src/repos/producto-repo.ts`
- `packages/core/src/repos/tipos.ts`
- `packages/core/src/repos/index.ts`
- `packages/ui/src/componentes/FormularioProducto.tsx`
- `packages/core/test/producto-existencia-baja.test.ts`

#### Criterios de aceptacion

- [ ] La migracion nueva va al final del array con id 12 (o el siguiente libre), es ALTER TABLE + CREATE INDEX plano y no contiene ';' en comentarios ni literales.
- [ ] producto.existencia_minima existe con NOT NULL DEFAULT 0 y esta en COLS, en Producto, en ProductoInput, en crear(), en actualizar() y en el formulario.
- [ ] Un existencia_minima negativo es rechazado por validarProducto y lanza ValidacionError desde el repo, no solo desde la UI.
- [ ] existenciaBaja devuelve inventarioActivo false con contadores en 0 cuando negocio.inventario_activo es 0, para que la UI pueda explicar en vez de mostrar un cero enganoso.
- [ ] existencia_minima = 0 nunca marca un producto como bajo: 0 significa 'sin umbral configurado'.
- [ ] Los productos con existencia NULL nunca aparecen como bajos ni como agotados.
- [ ] `pnpm -F @sfr/core test`, `pnpm -F @sfr/core typecheck` y `pnpm -F @sfr/ui typecheck` verdes.

#### Pruebas a escribir primero (TDD)

- migracion: tras migrate(db), PRAGMA table_info(producto) incluye existencia_minima con default 0, y los productos creados antes del cambio quedan en 0 (no en null).
- crear(): sin existencia_minima el producto se guarda con 0.
- crear()/actualizar(): con existencia_minima -1 lanza ValidacionError con campo 'existencia_minima'.
- actualizar(): cambiar existencia_minima de 0 a 5 persiste y se lee de vuelta.
- existenciaBaja: con negocio.inventario_activo = 0 devuelve { inventarioActivo: false, cantidadBajos: 0, cantidadAgotados: 0, filas: [] } aunque existan productos con existencia baja cargada.
- existenciaBaja: con inventario activo, un producto con existencia 3 y minima 5 aparece como bajo y agotado false.
- existenciaBaja: un producto con existencia 10 y minima 5 NO aparece.
- existenciaBaja: un producto con existencia 0 aparece con agotado true y se ordena antes que los bajos.
- existenciaBaja: un producto con existencia null (inventario nunca tocado para ese item) no aparece en ninguna de las dos listas.
- existenciaBaja: un producto con existencia 2 y minima 0 NO aparece como bajo (0 es 'sin umbral'), pero si su existencia fuera 0 si apareceria como agotado.
- existenciaBaja: un producto inactivo o eliminado nunca aparece.
- existenciaBaja: respeta el parametro limite y los contadores reflejan el total real aunque filas venga recortada.

---

### BACKOFFICE-05 — resumenPanel: composicion unica de los KPIs con guardia de rol en la capa de datos

**Objetivo.** Existe un unico metodo de core que devuelve todo lo que el panel muestra, con sus advertencias tipadas, y que rechaza con PermisoDenegadoError a quien no tenga rol de backoffice, exista o no la pantalla.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | medio: depende de que RBAC defina los nombres de rol; si RBAC nombra distinto al dueno ('propietario' en vez de 'dueno'), hay que ajustar una sola constante, pero el guardia queda mal configurado hasta que se ajuste. | BACKOFFICE-02, BACKOFFICE-03, BACKOFFICE-04, RBAC-01 |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Todo en ESPANOL, TypeScript estricto, prohibido `any`. TDD: tests en rojo primero.

PRERREQUISITOS YA HECHOS: dominio/periodo.ts (hoyLocal, primerDiaDelMesLocal, mesAnteriorDe, rangoUtc); reportes-repo con los cinco agregados migrados a dia local mas ventasPorHora, comparativaPeriodo, margenPorDepartamento, productosSinRotacion y devolucionesPeriodo; corteCaja.resumenDiferencias; producto.existenciaBaja. Leelos antes de escribir nada: tu trabajo es COMPONER, no reescribir consultas.

POR QUE SE COMPONE EN CORE Y NO EN LA PANTALLA. (a) packages/ui no tiene runner de tests, asi que cualquier calculo en el .tsx queda sin cobertura y viola el TDD que exige CLAUDE.md §3. (b) En la PWA la base corre en sql.js: WASM en el hilo principal (packages/web/src/db/sqljs-driver.ts). Diez llamadas sueltas disparadas con Promise.all desde el componente, como hace Reportes.tsx:46-52, congelan la UI del telefono y ademas pueden leer estados distintos entre si si alguien cobra en medio, porque el SqlDriver no tiene transacciones ni snapshot (packages/core/src/db/driver.ts:11-22, cinco metodos: exec, run, all, get, close).

QUE CONSTRUYES. Un metodo nuevo en packages/core/src/repos/reportes-repo.ts (mismo archivo, no un repo nuevo):
  resumenPanel(input: { fechaLocal: string; usuarioId: string | null }): Promise<ResumenPanel>
fechaLocal es 'YYYY-MM-DD' en hora local del negocio; el metodo deriva por dentro el mes en curso (primerDiaDelMesLocal) y el mes anterior (mesAnteriorDe). Forma de ResumenPanel:
  { fechaLocal, dia: { ventas, facturas, itbis, porMetodo: ResumenPorMetodo[] }, mes: { ventas, facturas, itbis, ganancia: ResumenGanancia }, mesAnterior: ComparativaPeriodo, ventasPorDiaDelMes: VentaPorDia[], ventasPorHoraHoy: VentaPorHora[], masVendidosDelMes: ProductoVendido[], margenPorDepartamento: MargenDepartamento[], productosSinRotacion: ProductoSinRotacion[], existenciaBaja: ResumenExistenciaBaja, diferenciasCaja: ResumenDiferenciasCaja, devolucionesDelMes: ResumenDevoluciones, ventaNetaDelMes: number, actividad: BitacoraAccion[], advertencias: AdvertenciaPanel[] }
  type AdvertenciaPanel = 'ventas_brutas' | 'ganancia_estimada' | 'costo_desconocido_en_lineas' | 'inventario_apagado' | 'cobrar_credito_sin_seguimiento'
Las advertencias se calculan en el repo a partir de los datos reales (inventario_apagado solo si existenciaBaja.inventarioActivo es false; costo_desconocido_en_lineas solo si ganancia.ingresosSinCosto > 0), NO son una lista fija y NO son texto libre: la pantalla mapea cada valor del union a su mensaje. Asi la UI no puede inventarse un descargo ni olvidarse de mostrarlo.
  'actividad' sale de bitacora.listar({ desde: fechaLocal, hasta: fechaLocal, limite: 15 }) (packages/core/src/repos/bitacora-repo.ts:64-77). Podes importar crearBitacoraRepo dentro de reportes-repo o replicar la consulta; preferi reutilizar.
  ventaNetaDelMes = mes.ventas - devolucionesDelMes.total, calculado en el repo.

GUARDIA DE ACCESO (la parte que NO puede vivir en el menu). Crea packages/core/src/dominio/permisos.ts con: export const ROLES_BACKOFFICE = ['dueno', 'admin', 'superadmin'] as const; type RolBackoffice; export function puedeVerBackoffice(rol: string | null | undefined): boolean. Crea la clase PermisoDenegadoError (mismo patron que ValidacionError en producto-repo.ts:40-45, exportada desde el barrel). resumenPanel, ANTES de correr una sola consulta, resuelve el rol del usuario: si existe packages/core/src/repos/usuario-repo.ts (lo entrega RBAC-01) usalo; si todavia no existe, resuelvelo con `SELECT rol FROM usuario WHERE id = ? AND activo = 1` y NO crees un usuario-repo propio (seria un archivo duplicado que RBAC va a tener que borrar). Reglas: usuarioId null o usuario inexistente o inactivo -> PermisoDenegadoError; rol fuera de ROLES_BACKOFFICE (por ejemplo 'cajero') -> PermisoDenegadoError; rol permitido -> sigue. Ojo: el esquema declara rol TEXT DEFAULT 'admin' con el comentario 'admin | cajero' (migrations.ts:49) y no contempla 'dueno' ni 'superadmin'; NO cambies el esquema aqui, eso es de RBAC. Tu constante acepta los tres valores para que el dia que RBAC los introduzca esto ya funcione.

Exporta ResumenPanel, AdvertenciaPanel, PermisoDenegadoError, ROLES_BACKOFFICE y puedeVerBackoffice desde packages/core/src/repos/index.ts y desde dominio/index.ts segun corresponda, siguiendo el patron de los vecinos.

TESTS. Crea packages/core/test/panel-resumen.test.ts (composicion y advertencias) y packages/core/test/permisos-backoffice.test.ts (dominio puro). Helper nuevaDb() como en packages/core/test/reportes-repo.test.ts:7-11. Para los usuarios inserta filas directamente en la tabla usuario con db.run, no dependas de que exista usuario-repo.

COMANDOS: pnpm -F @sfr/core test y pnpm -F @sfr/core typecheck, verdes.

NO TOQUES: nada de packages/ui (la pantalla es BACKOFFICE-07). NO toques migrations.ts. NO modifiques los agregados que hicieron BACKOFFICE-02 y 03: solo los llamas. NO crees packages/core/src/repos/usuario-repo.ts. NO agregues login, sesion ni hash de PIN: eso es RBAC, y si lo haces aqui van a chocar dos implementaciones. NO agregues dependencias.
```

#### Archivos a tocar

- `packages/core/src/repos/reportes-repo.ts`
- `packages/core/src/dominio/permisos.ts`
- `packages/core/src/dominio/index.ts`
- `packages/core/src/repos/index.ts`
- `packages/core/test/panel-resumen.test.ts`
- `packages/core/test/permisos-backoffice.test.ts`

#### Criterios de aceptacion

- [ ] resumenPanel es el unico punto de entrada del panel: devuelve dia, mes, comparativa, series, margen, rotacion, existencia baja, diferencias de caja, devoluciones y actividad en una sola llamada.
- [ ] El guardia de rol corre ANTES de cualquier consulta de datos y lanza PermisoDenegadoError; un cajero no obtiene numeros aunque llame al metodo directamente desde la consola del navegador.
- [ ] advertencias es un union tipado derivado de los datos reales, no una lista fija ni texto libre.
- [ ] ventaNetaDelMes se calcula en el repo, no en la pantalla.
- [ ] Ningun campo del resultado puede ser NaN, Infinity ni null inesperado con una base recien migrada y vacia.
- [ ] `pnpm -F @sfr/core test` y `pnpm -F @sfr/core typecheck` verdes, sin tocar packages/ui.

#### Pruebas a escribir primero (TDD)

- permisos (dominio puro): puedeVerBackoffice devuelve true para 'dueno', 'admin' y 'superadmin', y false para 'cajero', para null, para undefined y para '' .
- guardia: resumenPanel con usuarioId null lanza PermisoDenegadoError y no ejecuta consultas (se verifica porque falla incluso con la base vacia y sin negocio sembrado).
- guardia: resumenPanel con el id de un usuario rol 'cajero' lanza PermisoDenegadoError.
- guardia: resumenPanel con el id de un usuario rol 'admin' pero activo = 0 lanza PermisoDenegadoError.
- guardia: resumenPanel con un usuarioId que no existe en la tabla lanza PermisoDenegadoError.
- guardia: resumenPanel con un usuario rol 'dueno' activo devuelve el resumen.
- composicion: con dos ventas de hoy y una de ayer, dia.ventas cuenta solo las de hoy y mes.ventas cuenta las tres (mismo mes).
- composicion: dia.ventas coincide exactamente con corteCaja.calcularResumen(fechaLocal, fechaLocal).totalVentas para los mismos datos (un solo numero por dos caminos).
- composicion: mesAnterior trae el rango del mes calendario anterior y su variacionPct, sin NaN cuando el mes anterior no tuvo ventas.
- composicion: con una devolucion registrada en el mes, ventaNetaDelMes es mes.ventas menos el total devuelto.
- advertencias: contiene 'inventario_apagado' cuando negocio.inventario_activo es 0 y NO lo contiene cuando es 1.
- advertencias: contiene 'costo_desconocido_en_lineas' solo cuando hubo ventas sin producto vinculado en el mes.
- advertencias: siempre contiene 'ventas_brutas' y 'ganancia_estimada' mientras las consultas sigan sin descontar devoluciones y usen costo actual.
- base vacia: sobre una base recien migrada y sembrada, resumenPanel con un usuario valido devuelve ceros y arreglos vacios, sin lanzar y sin NaN.
- actividad: devuelve las acciones de bitacora del dia pedido, mas reciente primero, limitadas a 15.

---

### BACKOFFICE-06 — Primitivas de grafica en SVG propio para @sfr/ui, con la geometria pura probada en vitest

**Objetivo.** @sfr/ui tiene cuatro componentes de grafica accesibles, que respetan el tema claro/oscuro y el responsive por JS del proyecto, sin una sola dependencia nueva, y su matematica esta cubierta por tests.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo: codigo nuevo y aislado, sin base de datos; el unico punto de contacto con lo existente es la barra de Reportes.tsx, que es un reemplazo visualmente identico. | nada |

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Todo en ESPANOL, TypeScript estricto, prohibido `any`. TDD sobre la geometria: primero los tests en rojo.

DECISION YA TOMADA, NO LA REABRAS: nada de librerias de grafica (recharts, chart.js, d3, apexcharts, echarts, nivo). Razones duras: (1) todo el repo se estiliza con objetos inline, no hay clases, y el tema claro/oscuro se cambia con un unico atributo data-theme en <html> que solo llega a los componentes a traves de variables CSS var(--sfr-*) (packages/ui/src/estilos.ts:22-40 y packages/ui/src/estilos-globales.css:18-82). El SVG hereda esas variables en fill y stroke sin una linea de JS; una libreria que pinte en canvas obligaria a leer getComputedStyle y repintar a mano en cada cambio de tema. (2) @media no se puede usar desde estilos inline: el responsive se decide en JS con packages/ui/src/hooks/useBreakpoint.ts, asi que el ResponsiveContainer de una libreria duplicaria un mecanismo que ya existe. (3) No hay code-splitting ni lazy() en ningun lado del repo: todo lo que agregues entra en el bundle inicial que baja el telefono. Ya hay dos precedentes en el codigo: la barra de proporcion de packages/ui/src/pantallas/Reportes.tsx:144-146 y el SVG a mano de packages/ui/src/componentes/Marca.tsx:26-40.

PARTE 1 — GEOMETRIA PURA Y TESTEABLE. Crea packages/ui/src/graficas/geometria.ts: TypeScript puro, sin React, sin DOM. Exporta al menos:
  escalaLineal(valor: number, min: number, max: number, destinoMin: number, destinoMax: number): number
  extremos(valores: number[]): { min: number; max: number }  (con lista vacia devuelve { min: 0, max: 0 })
  puntosDePolilinea(valores: number[], ancho: number, alto: number, margen: number): Array<{ x: number; y: number }>
  rutaDeLinea(puntos: Array<{ x: number; y: number }>): string  (atributo d de un <path>)
  rutaDeArea(puntos, alto): string  (la misma linea cerrada contra la base, para el relleno suave)
  arco(porcentaje: number, radio: number, grosor: number): string  (atributo d para el anillo)
  ticksSuaves(max: number, cantidad: number): number[]  (referencias redondas: 0, 500, 1000...)
  proporcion(valor: number, total: number): number  (0..100, y 0 cuando total es 0, nunca NaN ni Infinity)
PARTE 2 — RUNNER DE TESTS EN @sfr/ui. Hoy packages/ui/package.json solo define el script typecheck. Agrega el script "test": "vitest run" y "test:watch": "vitest", y vitest como devDependency con la MISMA version que usa packages/core/package.json (^2.1.8). No agregues jsdom ni @testing-library: los tests son de geometria pura y corren en Node. Crea packages/ui/vitest.config.ts minimo (include de test/**/*.test.ts) solo si vitest no toma los tests por defecto.

PARTE 3 — COMPONENTES. Crea packages/ui/src/graficas/ con cuatro componentes delgados que solo dibujan lo que calcula geometria.ts, mas un index.ts que los reexporte:
  BarraProporcion.tsx — la barra horizontal que ya existe inline en Reportes.tsx:144-146, extraida tal cual (contenedor con background var gris claro, borderRadius 999, altura 7, hijo con width en % y transition 200ms).
  LineaTiempo.tsx — sparkline con area suave para ventas por dia del mes.
  BarrasVerticales.tsx — para ventas por hora (24 barras) y margen por departamento.
  Anillo.tsx — para reparto por metodo de pago.
Reglas obligatorias para los cuatro:
  - Colores SOLO con los tokens de packages/ui/src/estilos.ts (c.azul, c.verde, c.gris, c.grisClaro, c.borde...), que son var(--sfr-*). NI UN SOLO hex literal: un hex rompe el tema oscuro en silencio.
  - <svg> con viewBox y width:'100%', height:'auto', preserveAspectRatio: escala sin JS y sin @media.
  - Accesibilidad: role="img" y aria-label descriptivo con el dato resumido en palabras, mas un <title> dentro del svg; los adornos internos con aria-hidden. Una grafica que solo se entiende viendola deja fuera al lector de pantalla.
  - Estado vacio explicito: sin datos, renderiza un texto corto tipo 'Sin datos en este periodo' con color c.gris, nunca un svg vacio ni un NaN en el atributo d.
  - Formatea los montos con money() de packages/ui/src/estilos.ts (money NO se usa en inputs ni en CSV, ver design-guidelines.md seccion 3).
  - Sin estado interno, sin useEffect, sin timers: son funciones de datos a SVG. Si hace falta decidir cuantas columnas o si se rota una etiqueta, el componente recibe la decision por props y quien la toma es la pantalla con useEsAngosto() (packages/ui/src/hooks/useBreakpoint.ts:69).

PARTE 4 — PRUEBA DE REUSO. Reemplaza la barra inline de Reportes.tsx:144-146 por <BarraProporcion>. Es el unico cambio permitido en esa pantalla y no debe alterar su aspecto ni su comportamiento.

PARTE 5 — DOCUMENTACION. Agrega a design-guidelines.md (raiz del repo; es el DESIGN.md de este proyecto, con otro nombre) una seccion 'Graficas' con: la decision de no usar libreria y por que, el inventario de las cuatro primitivas con sus props, la regla de solo tokens var(--sfr-*), y la regla de accesibilidad (role img + aria-label + title).

COMANDOS: pnpm -F @sfr/ui test y pnpm -F @sfr/ui typecheck, verdes.

NO TOQUES: packages/core (esta tarea es solo de UI), AppShell.tsx, packages/ui/src/data/contexto.tsx, ninguna otra pantalla que no sea la barra de Reportes.tsx. NO crees la pantalla del panel (es BACKOFFICE-07). NO instales ninguna dependencia de runtime; la unica dependencia nueva permitida es vitest en devDependencies. NO uses <canvas>. Estilo: cabecera JSDoc por archivo como los vecinos, sin comentarios inline decorativos.
```

#### Archivos a tocar

- `packages/ui/src/graficas/geometria.ts`
- `packages/ui/src/graficas/BarraProporcion.tsx`
- `packages/ui/src/graficas/LineaTiempo.tsx`
- `packages/ui/src/graficas/BarrasVerticales.tsx`
- `packages/ui/src/graficas/Anillo.tsx`
- `packages/ui/src/graficas/index.ts`
- `packages/ui/test/geometria.test.ts`
- `packages/ui/package.json`
- `packages/ui/src/pantallas/Reportes.tsx`
- `design-guidelines.md`

#### Criterios de aceptacion

- [ ] Cero dependencias nuevas de runtime: el diff de packages/ui/package.json solo agrega vitest en devDependencies y los scripts de test.
- [ ] Ningun archivo de graficas contiene un color hex literal: todos los colores salen de los tokens de estilos.ts, que son var(--sfr-*), y por lo tanto el tema oscuro funciona sin una linea de JS.
- [ ] Los cuatro componentes escalan por viewBox con width 100%: no usan @media, no miden el DOM y no tienen su propio sistema de responsive.
- [ ] Cada grafica expone role="img", aria-label con el dato en palabras y un <title> interno.
- [ ] Ningun atributo d, width o height puede quedar en NaN con datos vacios, con un solo punto o con todos los valores en cero.
- [ ] La barra de Reportes.tsx usa la primitiva nueva y la pantalla se ve y se comporta igual que antes.
- [ ] `pnpm -F @sfr/ui test` y `pnpm -F @sfr/ui typecheck` verdes, y design-guidelines.md tiene la seccion Graficas.

#### Pruebas a escribir primero (TDD)

- geometria: proporcion(25, 100) es 25; proporcion(0, 0) es 0 y no NaN; proporcion(5, 0) es 0 y no Infinity.
- geometria: extremos([]) devuelve { min: 0, max: 0 } y no Infinity/-Infinity.
- geometria: escalaLineal invierte bien el eje Y (un valor maximo cae en la coordenada mas chica, porque en SVG el 0 esta arriba).
- geometria: puntosDePolilinea con un solo valor devuelve un punto valido dentro del area y no divide por cero.
- geometria: puntosDePolilinea con todos los valores iguales devuelve una linea horizontal centrada, sin NaN.
- geometria: puntosDePolilinea respeta el margen: ningun punto cae fuera de [margen, ancho-margen] ni de [margen, alto-margen].
- geometria: rutaDeLinea devuelve una cadena que empieza en M y no contiene 'NaN' para ninguna de las entradas anteriores.
- geometria: rutaDeArea cierra la figura contra la base (termina en Z) y no contiene 'NaN'.
- geometria: arco(0, r, g) y arco(100, r, g) devuelven rutas validas sin NaN (el caso 100% es el que suele romperse por el arco completo).
- geometria: ticksSuaves(1234, 4) devuelve valores redondos ascendentes cuyo ultimo elemento es mayor o igual que 1234.
- geometria: ticksSuaves(0, 4) no devuelve una lista vacia ni valores repetidos.

---

### BACKOFFICE-07 — Pantalla Panel y su integracion en AppShell, con arranque y visibilidad por rol

**Objetivo.** El dueno y el superadmin abren la app en un panel grafico que muestra dia, mes, comparativa, horas pico, margen, rotacion, existencia baja, diferencias de caja y actividad, y enlaza a las pantallas de gestion que ya existen; el cajero ni lo ve ni puede obtener sus datos.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| L | medio-alto: toca AppShell y el provider de datos, que son los dos archivos de los que cuelga toda la app; el useMemo del provider es obligatorio o aparecen bucles de consultas en tres pantallas que hoy funcionan. | BACKOFFICE-05, BACKOFFICE-06, RBAC-02 |

> [!WARNING]
> **Correcciones obligatorias antes de despachar esta tarea.**
> Las detectaron los revisores adversariales sobre el borrador. Aplicalas al brief.
>
> - **Problema.** Ademas de construir el Panel entero (nueve secciones con graficas) y de integrarlo en AppShell con remapeo de atajos, su 'PASO 1' es un arreglo de plataforma que no le pertenece: envolver en useMemo el objeto de repos de contexto.tsx, que es de lo que dependen las nueve pantallas. Un arreglo transversal escondido dentro de una tarea de pantalla es un arreglo que se pierde si esa tarea se recorta.
>   **Arreglo.** El useMemo sale de aqui y se va a la tarea de plataforma que rehace el proveedor (la sintesis ya lo hace: hay que reescribir el brief para que no quede duplicado y para que el agente del Panel no lo vuelva a tocar). El Panel ademas conviene partirlo en KPIs y series primero, y margen, rotacion y recomendaciones despues.

#### Brief para el agente

```text
Trabajas en el monorepo pnpm C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale. Todo en ESPANOL, TypeScript estricto, prohibido `any`. Mobile-first, sin emojis como iconos (iconos de lucide-react), sin alert()/confirm() nativos.

PRERREQUISITOS YA HECHOS: reportes.resumenPanel({ fechaLocal, usuarioId }) devuelve TODO lo que la pantalla necesita en una sola llamada, con advertencias tipadas y guardia de rol (lanza PermisoDenegadoError); packages/ui/src/graficas/ tiene BarraProporcion, LineaTiempo, BarrasVerticales y Anillo; dominio/permisos.ts exporta puedeVerBackoffice(rol); RBAC ya expone la sesion en la UI. Leelos antes de escribir nada. Tu pantalla NO calcula nada: pide, formatea y dibuja.

PASO 1 — ARREGLAR UNA TRAMPA ANTES DE TOCAR NADA MAS. packages/ui/src/data/contexto.tsx:60-82 construye el objeto `repos` en CADA render, sin useMemo. Hoy no se nota porque su padre solo cambia de estado una vez al cargar el driver. En cuanto el provider re-renderice (y meter la sesion ahi es exactamente lo que lo hace re-renderizar), la identidad de cada repo cambia y TODA pantalla que hace useCallback([repo,...]) + useEffect([cargar]) entra en bucle infinito de consultas: Reportes.tsx:43-63, CorteCaja.tsx:34-48, Compras.tsx:94-110. Envolve el objeto repos en useMemo con dependencia [db] ANTES de agregar nada al provider. Verificalo abriendo Reportes y mirando que no se dispare la carga en bucle.

PASO 2 — PANTALLA. Crea packages/ui/src/pantallas/Panel.tsx. Estructura de lectura, de arriba hacia abajo:
  - Fila de KPIs: vendido hoy (con desglose por metodo en Anillo), vendido en el mes, venta neta del mes, ITBIS del periodo, y la comparativa contra el mes anterior como variacion con su flecha (TrendingUp / TrendingDown de lucide-react, nunca un emoji).
  - Serie de ventas por dia del mes con LineaTiempo; horas pico con BarrasVerticales (24 barras).
  - Margen por departamento con BarrasVerticales o BarraProporcion; productos sin rotacion como lista corta con su valor inmovilizado.
  - Existencia baja: si resumen.existenciaBaja.inventarioActivo es false, NO muestres '0 productos'; muestra la tarjeta en estado explicativo ('El inventario esta apagado en la configuracion del negocio') con enlace a Configuracion. Si esta activo, lista los agotados primero con enlace a Productos.
  - Diferencias de caja del mes (cortes descuadrados, sobrante, faltante) con enlace a Corte de caja.
  - Actividad del dia: reutiliza el criterio de packages/ui/src/componentes/SeccionBitacora.tsx (sobre todo su diccionario ETIQUETA_ACCION, lineas 7-14) en version compacta. Recorda que usuario_id siempre llega null hasta que RBAC pase el usuario a los repos: si es null, mostra la accion sin autor en vez de inventar uno.
  - Cuentas por cobrar: tarjeta en estado 'no disponible todavia' con una linea de explicacion. El dato NO existe (cliente.saldo_credito se inserta en 0 y nunca se actualiza, no hay abonos ni vencimientos) y pertenece al area CRM. Prohibido mostrar un 0 que parezca un saldo real.
  - Advertencias: renderiza resumen.advertencias mapeando cada valor del union a su mensaje, con TriangleAlert de lucide-react, imitando el aviso que ya existe en Reportes.tsx:116-122.
  - Accesos rapidos a Compras, Productos, Reportes y Configuracion: el backoffice NO reimplementa la gestion, la enlaza.
Estado y errores: una sola llamada a resumenPanel dentro de un useCallback con useEffect, como Reportes.tsx:43-63. Captura PermisoDenegadoError y renderiza un mensaje de acceso restringido; captura cualquier otro error y degrada solo esa seccion, sin tumbar la pantalla (CLAUDE.md §7). Nunca dejes un catch vacio.
Responsive: la grilla de tarjetas decide columnas con useEsAngosto() de packages/ui/src/hooks/useBreakpoint.ts:69. Un gridTemplateColumns fijo '1fr 1fr 1fr' como el de Reportes.tsx:107 revienta en movil. Verifica a 375, 768 y 1440.
Estilos: solo objetos inline con s y c de packages/ui/src/estilos.ts, montos con money(). Ni un hex.

PASO 3 — INTEGRACION EN AppShell.tsx. Hay cuatro puntos: el union Modulo (lineas 24-26), el array MODULOS (28-31), el mapa ICONO (33-43) y el bloque de render condicional (190-199). Agrega 'Panel' con el icono LayoutDashboard de lucide-react.
  TRAMPA DE LOS ATAJOS: AppShell.tsx:64-66 genera las claves como `Alt+${i+1}`; con 10 modulos la decima queda 'Alt+10', una cadena que normalizarTecla() nunca produce (useAtajosTeclado.ts:18-27 arma 'Alt+' + e.key, y e.key de la tecla cero es '0'). El atajo quedaria muerto en silencio y el numerito de la nav mostraria '10'. Reemplaza la generacion implicita por un mapa explicito `const ATAJO: Record<Modulo, string>` con Panel = 'Alt+0' y el resto igual que hoy (Ventas sigue en Alt+1: no cambies la memoria muscular del cajero). Usa ese mapa tambien en el title (linea 126) y en el numerito visible (linea 144).
  VISIBILIDAD POR ROL: filtra MODULOS con puedeVerBackoffice(rol de la sesion) para que el cajero no vea la entrada, y ademas hace que el bloque de render del Panel no renderice nada si el rol no lo permite. Esto es la SEGUNDA linea de defensa: la primera es el guardia de core en resumenPanel, que ya rechaza al cajero aunque llame al metodo a mano.
  MODULO INICIAL: hoy es siempre 'Ventas' (AppShell.tsx:51). Pasa a 'Panel' cuando el rol lo permite y sigue en 'Ventas' para el cajero. No rompas el caso de sesion todavia no resuelta: mientras el rol sea desconocido, arranca en Ventas.

PASO 4 — BARRIL. packages/ui/src/index.ts exporta hoy solo AppShell, Marca, ProveedorDatos/useRepos, Ventas, Productos, Clientes, Configuracion y los adaptadores de impresora. Reportes, Compras y CorteCaja NO se exportan porque solo se montan dentro de AppShell. Segui ese criterio: NO exportes Panel salvo que lo necesites fuera, y decilo en tu reporte.

COMANDOS: pnpm -F @sfr/ui typecheck, pnpm -F @sfr/ui test, pnpm -F @sfr/core test. Ademas levanta los DOS shells y comprobalo en ambos: packages/web (PWA con sql.js, la base entera en memoria WASM en el hilo principal) y packages/desktop (Tauri con sqlite real). Los drivers no son identicos y una pantalla que anda en web puede fallar en escritorio.

NO TOQUES: packages/core (si falta un dato, es que falta un agregado y eso es BACKOFFICE-03 o 05, no lo calcules en el .tsx). NO reescribas Reportes.tsx, Compras.tsx, Productos.tsx, CorteCaja.tsx ni Configuracion.tsx: el panel enlaza a ellas. NO introduzcas un router ni lazy(): el repo no tiene ninguno de los dos y no es el momento. NO agregues dependencias. NO uses alert() ni confirm(): en el WebView2 de Tauri pasan desapercibidos; usa useAlertas de packages/ui/src/contexto/Alertas.tsx:42-47. NO muestres ningun KPI calculado en el componente: todo viene de resumenPanel.
```

#### Archivos a tocar

- `packages/ui/src/pantallas/Panel.tsx`
- `packages/ui/src/AppShell.tsx`
- `packages/ui/src/data/contexto.tsx`
- `packages/ui/src/index.ts`
- `design-guidelines.md`

#### Criterios de aceptacion

- [ ] El objeto repos de contexto.tsx esta envuelto en useMemo con dependencia [db], y Reportes, CorteCaja y Compras no entran en bucle de consultas al re-renderizar el provider.
- [ ] Panel.tsx no contiene ningun calculo de KPI: todos los numeros salen de resumenPanel y solo se formatean con money().
- [ ] La tarjeta de existencia baja muestra estado explicativo cuando el inventario esta apagado, y la de cuentas por cobrar muestra 'no disponible todavia', nunca un cero que parezca un saldo.
- [ ] El cajero no ve el modulo Panel en la navegacion y, si llegara a el, no obtiene datos porque el guardia de core rechaza la llamada.
- [ ] El atajo del decimo modulo funciona de verdad (Alt+0) y el numerito de la nav coincide con la tecla; Ventas conserva Alt+1.
- [ ] El modulo inicial es Panel para dueno y superadmin, y Ventas para el cajero y mientras el rol sea desconocido.
- [ ] La pantalla se ve correcta a 375, 768 y 1440 px, con las columnas decididas por useEsAngosto, y funciona tanto en packages/web como en packages/desktop.
- [ ] Ningun catch queda vacio: un fallo de datos degrada solo su seccion y deja el resto del panel en pie.

#### Pruebas a escribir primero (TDD)

- core (regresion, ya cubierta por BACKOFFICE-05, debe seguir verde): resumenPanel rechaza al cajero; la pantalla no puede aflojar ese guardia.
- geometria (regresion de BACKOFFICE-06): las primitivas no producen NaN con series vacias, que es justo el estado del panel en una instalacion nueva.
- Manual en packages/web (sql.js): con base recien migrada y sembrada, el panel carga sin errores de consola, muestra ceros y estados vacios, y no se queda colgado.
- Manual en packages/web: tras cobrar dos facturas, vendido hoy coincide con lo que muestra Corte de caja para el mismo dia.
- Manual en packages/web: una venta cobrada despues de las 8:00 pm hora local sigue contando en el dia de HOY y no salta al dia siguiente (es el bug de zona horaria que arreglo BACKOFFICE-01/02, verificado de punta a punta).
- Manual en packages/desktop (Tauri/sqlite): el panel carga con los mismos numeros que la PWA sobre datos equivalentes.
- Manual: con inventario_activo en 0, la tarjeta de existencia baja muestra la explicacion y el enlace a Configuracion, no un '0 productos'.
- Manual: con un usuario rol cajero en sesion, el modulo Panel no aparece en la navegacion y el arranque sigue siendo Ventas.
- Manual: Alt+0 abre el Panel y Alt+1 sigue abriendo Ventas.
- Manual a 375 px: las tarjetas se apilan en una columna, no hay scroll horizontal y los botones de acceso rapido miden al menos 44 px de alto.
- Manual: alternar el tema claro/oscuro repinta las graficas sin recargar y sin que quede ningun color fijo fuera de tono.

---

### BACKOFFICE-08 — `recomendaciones()`: el "y cualquier otra recomendacion"

**Objetivo.** Entregar la ultima frase del punto 6 como una lista accionable y ordenada por dinero, componiendo seis fuentes que otras tareas ya calculan y que hoy nadie junta.

| Esfuerzo | Riesgo | Depende de |
| --- | --- | --- |
| M | bajo — funcion pura sobre agregados ya existentes, sin escrituras | BACKOFFICE-03, BACKOFFICE-04, BACKOFFICE-05, CRM-03, CRM-05, CRM-06, CAJA-04 |

> [!WARNING]
> **Esta tarea la anadieron los revisores.** En el borrador, "cualquier otra recomendacion" no
> tenia ni una tarea. Lo doloroso es que **los datos ya los producen otras seis tareas** y nadie
> los componia: seis fuentes listas, cero composicion. El campo `advertencias` de BACKOFFICE-05 no
> sirve para esto — son descargos sobre la calidad del dato ("ganancia estimada", "inventario
> apagado"), no recomendaciones accionables.

#### Brief para el agente

```text
Repo: C:/Users/saint/Desktop/Bootcamp Builder AA/facturAIForSale (monorepo pnpm, TypeScript
estricto, TODO en espanol). TDD con vitest: rojo primero. Lee antes plan/00-CONVENCIONES.md.

LAS SEIS FUENTES YA EXISTEN cuando llegas a esta tarea. No las recalcules ni las consultes tu:
  - productosSinRotacion (BACKOFFICE-03)  -> cuanto dinero hay inmovilizado y en cuantos productos
  - existenciaBaja (BACKOFFICE-04)        -> que hay que reponer
  - cuentasPorCobrar con antiguedad (CRM-03) -> quien debe, cuanto, y desde hace cuanto
  - seguimientoNoConvertidas (CRM-05)     -> que cotizaciones vencen
  - recordatoriosPendientes y cumpleanosDelMes (CRM-06) -> que toca hoy
  - diferenciasPorCajero (CAJA-04)        -> que cajero descuadra siempre

QUE HACER:

1. FUNCION PURA, en packages/core/src/dominio/recomendaciones.ts. Recibe los seis agregados YA
   CALCULADOS como parametros y devuelve Recomendacion[] tipado:
     { tipo, titulo, detalle, montoImplicado, moduloDestino, severidad }
   Pura significa sin SqlDriver, sin new Date() dentro (la fecha entra como parametro, igual que
   hace dominio/periodo.ts de BACKOFFICE-01). Es lo que la hace testeable, que es lo que exige el
   TDD del proyecto — y packages/ui no tiene runner de tests propio salvo el que instala
   PLATAFORMA-06, asi que la logica NO puede vivir en el componente.

2. EL REPO SOLO COMPONE. reportes.recomendaciones(fechaLocal) llama a los seis agregados y delega
   en la funcion pura. Cero reglas de negocio en el repo y cero en la pantalla.

3. ORDEN POR montoImplicado DESCENDENTE. Es lo que convierte una lista en una recomendacion: el
   dueno tiene que ver primero donde esta el dinero. Una recomendacion sin monto (un cumpleanos,
   un recordatorio) va AL FINAL, nunca arriba.

4. REDACCION en espanol dominicano llano y SIEMPRE con cifras. Usa money() del proyecto para
   formatear. Ejemplos del tono exacto que se busca:
     "RD$ 45,200 inmovilizados en 12 productos sin rotacion en 90 dias"
     "4 clientes deben RD$ 18,300 con mas de 60 dias"
     "Reponer 7 productos agotados"
     "3 cotizaciones vencen esta semana"
   Nada de "considere revisar el inventario".

5. DEGRADACION OBLIGATORIA, y es la parte que separa esto de un panel que miente:
   - Si el inventario esta apagado (negocio.inventario_activo = 0), las recomendaciones de
     existencia y de rotacion NO aparecen como "0 productos". Se OMITEN, y en su lugar se anade
     UNA recomendacion de tipo 'configuracion' que invite a encender el inventario y enlace al
     asistente de COMPRAS-08.
   - Lo mismo si no hay ninguna caja con turnos cerrados (no hay de que sacar descuadres) o si
     ningun cliente tiene credito habilitado (no hay cuentas por cobrar que vigilar).
   Una recomendacion vacia que parece buena noticia es peor que no mostrarla.

6. montoImplicado VA EN PESOS Y NUNCA MEZCLA UNIDADES. No sumes "7 productos" con "RD$ 18,300"
   para ordenar. Si una recomendacion no tiene monto en pesos, su montoImplicado es null y cae al
   final por la regla del punto 3.

7. La seccion en la pantalla Panel (BACKOFFICE-07): lista, cada item enlaza a moduloDestino. No
   inventes graficas aqui; esto es texto accionable.

NO TOQUES: los seis agregados fuente. Si alguno todavia no existe cuando empiezas, tu funcion los
recibe igual como parametro y el test se los pasa a mano — por eso es pura. Eso te permite
terminar esta tarea aunque una de las seis venga con retraso.
```

#### Archivos a tocar

- `packages/core/src/dominio/recomendaciones.ts` (nuevo)
- `packages/core/src/repos/reportes/` (metodo de composicion)
- `packages/ui/src/pantallas/Panel.tsx` (seccion de recomendaciones)
- `packages/core/test/recomendaciones.test.ts` (nuevo)

#### Criterios de aceptacion

- [ ] `recomendaciones()` es pura: no importa `SqlDriver` ni llama a `new Date()` internamente
- [ ] La lista sale ordenada por `montoImplicado` descendente, con las recomendaciones sin monto al final
- [ ] Con el inventario apagado, **no** aparecen recomendaciones de existencia con cero: aparece una de tipo `configuracion` que enlaza al asistente
- [ ] Todos los textos llevan cifras formateadas con `money()`, en espanol llano
- [ ] `montoImplicado` esta siempre en pesos o es `null`; nunca cuenta unidades
- [ ] Cada recomendacion enlaza a un `moduloDestino` que existe en el registro de modulos
- [ ] `pnpm -r test` y `pnpm -r typecheck` en verde

#### Pruebas a escribir primero (TDD)

- Con las seis fuentes vacias, devuelve una lista vacia (no seis recomendaciones diciendo "0")
- Ordena por `montoImplicado` descendente, y una recomendacion con monto `null` queda la ultima aunque llegue primera en la entrada
- Con `inventarioActivo: false`, omite existencia y rotacion y anade exactamente una recomendacion de tipo `configuracion`
- Con `inventarioActivo: true` y cero productos bajos, **no** emite la recomendacion de reponer
- El texto de cuentas por cobrar incluye el numero de clientes y el monto formateado
- Nunca suma un conteo de productos dentro de `montoImplicado`
- Un cumpleanos del mes produce una recomendacion con `montoImplicado` null y severidad baja

---

