# Convenciones obligatorias

> **Todo agente lee este archivo antes de escribir una sola linea.** Son las reglas que
> hacen que ocho agentes trabajando en paralelo no se destruyan entre si, y las trampas
> concretas de este repositorio que un agente sin contexto pisa en los primeros diez minutos.

## 1. Las cinco trampas que rompen produccion

Estas cinco aparecieron en las ocho auditorias por separado. No son teoricas: estan en el
codigo hoy y cada una tiene una ruta y una linea.

### 1.1 El driver de escritorio parte el SQL por `;` a ciegas

`packages/desktop/src/db/tauri-sql-driver.ts:17-22` hace literalmente `sql.split(";")`.
Consecuencia: una migracion que contenga un `;` dentro de un literal de texto, dentro de un
comentario `--` o en el cuerpo de un `CREATE TRIGGER` (`BEGIN ... ; ... END;`) se parte en
pedazos invalidos y **revienta solo en escritorio**. Los tests corren sobre `node:sqlite` y la
PWA sobre sql.js, y ambos aceptan lotes: el error pasa `pnpm test` en verde y aparece en la
maquina del cliente.

**Regla.** Una migracion solo puede contener `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN`,
`CREATE INDEX` y `UPDATE` planos. Cero triggers. Cero `;` fuera de la separacion entre
statements. Un comentario en espanol del estilo `-- rol: admin; cajero` tapia la app.

### 1.2 No existen transacciones en ninguna parte

`SqlDriver` (`packages/core/src/db/driver.ts:11-22`) expone exactamente `exec`, `run`, `all`,
`get` y `close`. No hay un solo `BEGIN`/`COMMIT`/`ROLLBACK` en `core`, `web`, `desktop` ni `ui`.
`compra-repo.crear()` ya hace 1 + N + hasta 3N escrituras sueltas sin atomicidad, y
`cobrarConFiscal` consume el NCF **antes** de transmitir y crear el comprobante.

**Regla.** Disena cada operacion para que el orden la haga recuperable: hijos primero, cambio
de estado del padre AL FINAL, en un solo `UPDATE` con guarda (`WHERE estado='abierta'`).
Cuando puedas, prefiere una tabla de eventos sobre la que se calcula el total con `SUM()` a
mantener un acumulador que hay que actualizar en una segunda escritura.

> **Ojo con la solucion aparente.** Anadir `enTransaccion` al driver de Tauri **no funciona**:
> `db.execute()` de `tauri-plugin-sql` corre contra un *pool* de sqlx y cada llamada toma una
> conexion distinta, asi que el `BEGIN` no envuelve nada. Ver la correccion en PLATAFORMA-02.

### 1.3 Hay bases de datos instaladas en negocios reales

`migrate()` (`packages/core/src/db/migrator.ts:17-30`) corre en cada arranque, aplica por `id`
y salta las ya registradas en `_migracion`. De ahi tres reglas duras:

- **Nunca** edites las migraciones 1 a 10. En una base existente el cambio jamas se aplica, y
  el esquema queda divergente segun cuando se instalo cada copia.
- SQLite no admite `ALTER TABLE ADD COLUMN NOT NULL` sin `DEFAULT`. El precedente correcto es
  `migrations.ts:451` (`ADD COLUMN favorito INTEGER NOT NULL DEFAULT 0`).
- `ADD COLUMN` con `REFERENCES` solo se admite si el valor por defecto es NULL. Las columnas
  `usuario_id` / `caja_id` nuevas van nullable, sin excepcion.
- El migrador registra en `_migracion` **despues** de aplicar y no envuelve en transaccion. Si
  una migracion de tres statements falla en el segundo, queda a medias y sin registrar: el
  siguiente arranque la reintenta desde el primero y muere con *duplicate column name*, **para
  siempre**. Cada statement debe ser idempotente por separado.

### 1.4 `seed()` no sirve para sembrar nada en instalaciones existentes

`packages/core/src/db/seed.ts:10-11` sale inmediatamente si ya existe un negocio. Todo dato
inicial (roles por defecto, la caja principal, un catalogo) que un area intente sembrar ahi
sera invisible justo para las instalaciones que no se pueden romper. **El dato inicial va
dentro del SQL de la migracion, con `INSERT OR IGNORE`.**

### 1.5 Tres motores SQLite distintos, y solo uno esta cubierto por los tests

| Entorno | Motor | `PRAGMA foreign_keys` | Lotes de statements |
| --- | --- | --- | --- |
| Tests (vitest) | `node:sqlite` | ON (`node-sqlite.ts:24`) | si |
| PWA | sql.js / WASM | ON (`sqljs-driver.ts:62`) | si |
| Escritorio | rusqlite/sqlx | **NO declarado** | **no** |

Un test verde en `core` **no** prueba que funcione en escritorio. Ademas:

- El driver de Node no acepta booleanos ni `undefined` como parametros: solo
  `null`/`number`/`string`/`bigint`/`Uint8Array`. Por eso todo el codigo existente bindea `0`/`1`
  y `null` explicitos. Un `input.pagada ?? undefined` rompe los tests con un TypeError confuso.
- sql.js persiste con *debounce* de 150 ms y **re-serializa la base entera** en cada guardado
  (`sqljs-driver.ts:64-80`). Cuantas menos escrituras sueltas haga una operacion, mejor.

## 2. Reparto de ids de migracion (bandas)

Las ocho areas quieren anadir migraciones a la vez y todas escribieron "migracion 11". Este es
el reparto en vigor. **El id de tu migracion sale de esta tabla, no de contar el array.**

| Banda | Area | Tablas y columnas |
| --- | --- | --- |
| `1-10` | Base ya aplicada (INTOCABLE) | negocio, usuario, caja, departamento, producto, cliente, factura, factura_linea, pago, secuencia_ncf, comprobante_fiscal, corte_caja, movimiento_inventario, proveedor, compra, compra_linea, comprobante_archivo, bitacora_accion, devolucion, devolucion_linea, promocion, cotizacion, cotizacion_linea |
| `11-19` | COMPARTIDO - censo de columnas (un solo agente, ver andamiaje) | producto (precio_2, cantidad_minima_mayoreo, existencia_minima), cliente (nivel_precio, niveles_permitidos_json, fecha_nacimiento, dias_credito), negocio (desfase_horario_min, politica_costo, umbral_aviso_costo_pct, exige_caja_abierta, arqueo_ciego, umbral_diferencia_caja), factura (prefijo_caja), factura_linea (nivel_precio, costo_unitario), cotizacion_linea (nivel_precio), devolucion_linea (nivel_precio), devolucion (metodo_devolucion), compra_linea (cantidad_recibida), compra (condicion_pago, dias_credito, fecha_vencimiento, monto_pagado, estado_pago, estado_recepcion, fecha_recepcion) |
| `20-29` | RBAC - usuarios, roles y permisos | usuario_seguridad, normalizacion de usuario.rol admin->dueno |
| `30-39` | MULTICAJA - identidad de instalacion y NCF por caja | instalacion, caja.prefijo, cotizacion.caja_id, cotizacion.prefijo_caja, secuencia_ncf.caja_id, ux_factura_caja_numero, ix_factura_caja_estado |
| `40-49` | CAJA - turno, arqueo y movimientos de efectivo | sesion_caja, movimiento_caja, corte_caja (sesion_id, tipo, total_entradas, total_salidas, total_devoluciones_efectivo, arqueo_json, diferencia_motivo, autorizado_por_id, secuencia), factura.sesion_caja_id |
| `50-59` | PRECIOS - tres niveles de precio | backfill factura_linea.nivel_precio desde es_mayoreo, indices de nivel |
| `60-69` | COMPRAS - recepcion, costo historico y cuentas por pagar | costo_historial, compra_recepcion, compra_recepcion_linea, pago_compra, backfill de recepcion completa en compras historicas |
| `70-79` | CRM - credito, interacciones y etiquetas | credito_movimiento, cliente_interaccion, etiqueta, cliente_etiqueta, ix_factura_cliente, ix_cotizacion_cliente, backfill de deuda historica desde pago.metodo='credito' |
| `80-89` | BACKOFFICE - panel del dueno | ix_factura_fecha_hora, ix_factura_estado_fecha, ix_factura_linea_producto, ix_producto_existencia |
| `90-94` | PLATAFORMA - reservada (hoy no necesita ninguna) | — |
| `95-99` | CORRECCIONES - hotfix posteriores al merge | — |

> El orden de las bandas **es** el orden de aplicacion en una base nueva, y coincide con el
> orden de las olas. En una base que ya aplico una banda alta, una migracion de banda baja
> anadida despues se aplicara igual, pero **tarde**: no escribas una migracion que asuma que
> otra de banda superior todavia no corrio.

## 3. Andamiaje comun: construir antes de paralelizar

Estas piezas las consumen varias areas. Si no existen primero, cada agente inventa la suya y
el merge es imposible.

### Division de migrations.ts en un archivo por banda

migrations.ts es HOY un unico array de 502 lineas al que ocho areas quieren anadir en el mismo final del archivo: el conflicto de merge es seguro aunque los ids no choquen. Se convierte packages/core/src/db/migrations.ts en un concatenador que importa packages/core/src/db/migraciones/00-base.ts, 11-compartido.ts, 20-rbac.ts, 30-multicaja.ts, 40-caja.ts, 50-precios.ts, 60-compras.ts, 70-crm.ts, 80-backoffice.ts y los une ordenados por id. Cada agente escribe SOLO su archivo. Se anade un test de integridad que falla si hay ids duplicados, ids fuera de banda, array desordenado o un ';' dentro de un literal o de un comentario '--' (esto ultimo rompe solo en escritorio por el split ingenuo de tauri-sql-driver.ts:17-22). Se anade tambien packages/core/test/_ayuda.ts con nuevaDb(), nuevaDbMigrada() y nuevaDbHasta(id), que hoy esta copiado a mano en 18 archivos de test.

**Archivo.** `packages/core/src/db/migraciones/`
**Lo consumen.** RBAC-01, CRM-01, BACKOFFICE-01, BACKOFFICE-04, COMPRAS-01, PRECIOS-01, MULTICAJA-01, CAJA-01, CENSO-COLUMNAS

### Censo de columnas: una sola pasada sobre COLS y los contadores Array(N)

ESTE ES EL ANDAMIAJE QUE MAS CONFLICTOS ELIMINA. Los repos usan listas explicitas de columnas (const COLS) mas INSERT con Array(N).fill('?') y N HARDCODEADO: verificado producto 19, cliente 15, factura 19, factura_linea 14, negocio 15, corte_caja 19, compra 15, compra_linea 13, cotizacion_linea 13, devolucion_linea 14. Si dos areas suben el mismo contador, TypeScript no dice nada y el INSERT revienta en runtime en la maquina del cliente. Hoy PRECIOS-01 sube producto 19->21 y BACKOFFICE-04 lo sube 19->20; PRECIOS-01 y CRM-01 suben cliente 15->17 los dos; BACKOFFICE-01, COMPRAS-01 y CAJA-01 hacen tres ALTER independientes sobre negocio. Un unico agente anade, en la banda 11-19, TODAS las columnas nuevas sin REFERENCES a tablas que aun no existen (producto.precio_2, producto.cantidad_minima_mayoreo, producto.existencia_minima, cliente.nivel_precio, cliente.niveles_permitidos_json, cliente.fecha_nacimiento, cliente.dias_credito, negocio.desfase_horario_min, negocio.politica_costo, negocio.umbral_aviso_costo_pct, negocio.exige_caja_abierta, negocio.arqueo_ciego, negocio.umbral_diferencia_caja, factura.prefijo_caja, factura_linea.nivel_precio, factura_linea.costo_unitario, cotizacion_linea.nivel_precio, devolucion_linea.nivel_precio, devolucion.metodo_devolucion, compra_linea.cantidad_recibida y el resto de columnas planas de compra) y actualiza COLS, el contador y tipos.ts UNA sola vez. A partir de ahi ningun area vuelve a tocar esas constantes: solo anaden metodos.

**Archivo.** `packages/core/src/db/migraciones/11-compartido.ts`
**Lo consumen.** PRECIOS-01, PRECIOS-03, CRM-01, BACKOFFICE-01, BACKOFFICE-04, COMPRAS-01, COMPRAS-03, CAJA-01, MULTICAJA-01, MULTICAJA-03

### Catalogo unico de permisos, roles y contrato de sesion

Tres areas escriben un modulo de permisos y DOS de ellas en el mismo path: RBAC-02 y BACKOFFICE-05 escriben packages/core/src/dominio/permisos.ts, y PLATAFORMA-04 escribe packages/core/src/seguridad/permisos.ts, con tres vocabularios de rol incompatibles (RBAC: cajero|supervisor|dueno|superadmin; PLATAFORMA: admin|cajero; BACKOFFICE: dueno|admin|superadmin). DECISION: gana RBAC-02, un solo archivo, y los cuatro roles quedan congelados en cajero|supervisor|dueno|superadmin. packages/core/src/seguridad/ NO se crea. La funcion puedeVerBackoffice de BACKOFFICE-05 pasa a ser una funcion DENTRO de este archivo, no un modulo aparte. El archivo exporta ademas el CONTRATO de sesion (SesionRepo, PortadorSesion, PermisoError) aunque su implementacion llegue despues, para que la UI pueda construir su proveedor en la misma ola sin esperar a RBAC-04.

**Archivo.** `packages/core/src/dominio/permisos.ts`
**Lo consumen.** RBAC-03, RBAC-04, RBAC-05, RBAC-06, RBAC-07, BACKOFFICE-05, BACKOFFICE-07, COMPRAS-02, COMPRAS-03, CAJA-06, PLATAFORMA-07

### Hash de PIN isomorfico (PBKDF2 sobre crypto.subtle)

RBAC-02 y PLATAFORMA-04 escriben el mismo PBKDF2 en dos paths distintos. Gana RBAC-02: packages/core/src/dominio/pin.ts. Cero dependencias de runtime (packages/core/package.json no tiene ninguna y debe seguir asi: el mismo bundle corre en sql.js, en el webview de Tauri y en node:sqlite). Formato versionado dentro del propio string, pbkdf2$sha256$<iteraciones>$<salBase64>$<hashBase64>, y verificarPin lee las iteraciones DEL hash y no de una constante, para poder subirlas manana sin invalidar los PIN existentes. Comparacion en tiempo constante. Si globalThis.crypto.subtle no existe (PWA servida por http:// sobre la LAN, que no es contexto seguro) lanza un error con mensaje accionable en vez de reventar sin explicacion.

**Archivo.** `packages/core/src/dominio/pin.ts`
**Lo consumen.** RBAC-03, RBAC-05, RBAC-07

### Sesion pegada al driver: conSesion, usuarioDe, exigirPermiso

RBAC-04 y PLATAFORMA-05 propusieron dos seams CONTRADICTORIOS para lo mismo. Gana RBAC-04 (sesion adjunta al driver) por mecanica verificada, no por gusto: (1) tsconfig.base.json tiene noUnusedParameters:true, asi que el segundo parametro de PLATAFORMA-05 solo se puede declarar en los repos que lo usan, lo que rompe la uniformidad que buscaba; (2) registrarAccion(db, input) tiene 9 sitios de llamada verificados que solo tienen `db` en el closure, y con la sesion pegada al driver el usuario_id se rellena solo sin tocar esos 9 sitios ni la firma; (3) packages/ui/src/data/contexto.tsx construye los 18 repos en el cuerpo del render SIN useMemo, asi que una sesion pasada a las factorias cambiaria la identidad de cada repo en cada login y volveria a disparar todos los useEffect(..., [repo]) de los 16 archivos que usan useRepos; (4) driver sin sesion adjunta = modo permisivo = comportamiento exacto de hoy, asi que los 18 archivos de test existentes siguen verdes sin editarse y las instalaciones ya en uso no se rompen. Lo unico que se rescata de PLATAFORMA-05 es su factoria crearRepos, que va en el siguiente andamio.

**Archivo.** `packages/core/src/db/sesion.ts`
**Lo consumen.** RBAC-05, RBAC-06, RBAC-07, FACTURA-GUARDIAS, BACKOFFICE-05, COMPRAS-03, COMPRAS-04, CAJA-03, CAJA-05, MULTICAJA-06

### crearRepos(db) y ProveedorDatos memorizado

packages/ui/src/data/contexto.tsx enumera hoy los 18 repos a mano en la interfaz Repos y otra vez en ProveedorDatos, y NUEVE tareas de seis areas distintas quieren anadir su repo ahi (credito, crm, caja, instalacion, sesionCaja, costoHistorial, pagoCompra, usuario). Se mueve la construccion a crearRepos(db) en packages/core/src/repos/index.ts, alimentada por un registro en packages/core/src/repos/registro.ts donde cada area anade UNA linea al final. ProveedorDatos queda envuelto en useMemo con dependencia [db]: sin eso, en cuanto el proveedor re-renderice (y meter sesion es justo lo que lo hace re-renderizar) las tres pantallas que hacen useCallback([repo]) + useEffect([cargar]) — Reportes, CorteCaja y Compras — entran en bucle infinito de consultas.

**Archivo.** `packages/core/src/repos/registro.ts`
**Lo consumen.** CRM-03, CRM-06, COMPRAS-04, COMPRAS-05, MULTICAJA-02, CAJA-03, RBAC-03, BACKOFFICE-07, PLATAFORMA-07

### Registro declarativo de modulos con atajo fijo

AppShell.tsx cablea los nueve modulos en CUATRO lugares del mismo archivo (union de tipos 24-26, array MODULOS 28-31, record ICONO 33-43, cadena de nueve renders 189-199) y los atajos salen del INDICE del array (linea 64-66). Cinco areas quieren tocarlo: Backoffice anade Panel, RBAC anade Personal, Caja renombra Corte de caja a Caja, MULTICAJA mete el indicador de caja, RBAC-06 filtra por permiso. Ese techo YA deformo el producto: ConsultaFacturas.tsx:308-310 dice por escrito que las cotizaciones se volvieron pestana interna para no sumar un decimo item que romperia Alt+1..9. Se crea un registro unico donde el atajo es un DATO fijo por modulo (nunca el indice) y se admite atajo null, para que el decimo y siguientes entren sin inventar un 'Alt+10' que normalizarTecla nunca produce. Filtrar por permiso deja de reasignar atajos.

**Archivo.** `packages/ui/src/navegacion/modulos.ts`
**Lo consumen.** RBAC-06, RBAC-07, BACKOFFICE-07, CAJA-06, MULTICAJA-06, CRM-07

### SqlDriver.enTransaccion y paridad de los tres drivers

No existe ni una transaccion en todo el repo y SqlDriver ni siquiera puede expresarlas (solo exec/run/all/get, verificado). El migrador ejecuta db.exec(m.sql) y recien DESPUES inserta en _migracion: una migracion que falle a la mitad deja tablas creadas sin registrar, el reintento choca con 'table already exists' y la app queda tapiada en cada arranque, sin salida para el usuario. Con ocho areas a punto de migrar bases de clientes reales, esto va antes que cualquier migracion de area. Se anade enTransaccion OPCIONAL (ningun consumidor existente se rompe), se envuelve cada migracion, se detecta el id duplicado ANTES de ejecutar nada, y se iguala el driver de escritorio, que hoy ni activa PRAGMA foreign_keys ni parte bien los statements. Se extrae partirStatements a core para poder probarlo sin cargar el plugin de Tauri.

**Archivo.** `packages/core/src/db/driver.ts`
**Lo consumen.** CENSO-COLUMNAS, RBAC-01, MULTICAJA-01, CAJA-01, PRECIOS-01, COMPRAS-01, CRM-01, BACKOFFICE-01, PLATAFORMA-03

### Respaldo sin lista manual y restauracion transaccional

backup-repo.ts tiene la lista TABLAS escrita a mano y solo sabe exportar. Cuatro areas iban a editar esa lista para meter sus tablas nuevas (usuario_seguridad, sesion_caja, movimiento_caja, credito_movimiento, costo_historial, compra_recepcion, pago_compra, etiqueta...), con conflicto garantizado y con el fallo silencioso de que una tabla olvidada sale del respaldo del cliente sin ningun aviso. Se sustituye la lista por descubrimiento en tiempo de ejecucion sobre sqlite_master y se anade importarTodo dentro de una transaccion. Esto elimina el conflicto Y da el camino de vuelta ANTES de que ocho areas empiecen a migrar instalaciones reales. Nota: el respaldo debe forzar pin_hash a null y excluir usuario_seguridad (hoy es inofensivo porque pin_hash es NULL, y RBAC-03 es justo la tarea que le da valor).

**Archivo.** `packages/core/src/repos/backup-repo.ts`
**Lo consumen.** RBAC-03, CRM-01, COMPRAS-01, CAJA-01, MULTICAJA-01

### Zona horaria: dominio/periodo.ts y division de reportes-repo

factura.fecha_hora se guarda en UTC (ids.ts now() es toISOString) pero TODAS las consultas comparan date(fecha_hora), que SQLite interpreta en UTC, mientras la UI calcula 'hoy' en fecha local. En Republica Dominicana (UTC-4) toda venta despues de las 8:00 pm cae en el dia UTC siguiente: el panel del dueno mostraria 'vendido hoy' sin las ventas de la noche, y el corte de caja no cuadra. Siete areas quieren anadir metodos a reportes-repo.ts (Backoffice, CRM, Precios, Caja, Multicaja) y dos de ellas ademas quieren cambiar el criterio de fecha de los cinco metodos existentes. Se crea periodo.ts (funciones puras con la hora actual siempre inyectable, sin librerias de fecha) y se divide reportes-repo.ts en un directorio reportes/ con un archivo por familia, para que cinco areas puedan anadir sin tocar el mismo archivo. Prohibido datetime(...,'localtime'): depende de la zona del proceso, distinta en Tauri, en el navegador y en los tests.

**Archivo.** `packages/core/src/dominio/periodo.ts`
**Lo consumen.** BACKOFFICE-02, BACKOFFICE-03, BACKOFFICE-05, CRM-05, PRECIOS-07, CAJA-04, MULTICAJA-05

### caja-repo e instalacion-repo unicos

MULTICAJA-02 y CAJA-03 crean LOS DOS packages/core/src/repos/caja-repo.ts. Gana la version de MULTICAJA-02, que es la mas completa: trae el prefijo de caja (necesario para la numeracion C1-000123) y la tabla instalacion, que responde 'que caja es esta instalacion' desde los datos y no desde localStorage. CAJA-03 lo CONSUME y se limita a crear sesion-caja-repo.ts (el turno). Sin esta unificacion, el area de Caja abriria turnos contra un catalogo de cajas que el area de Multicaja esta redefiniendo en paralelo.

**Archivo.** `packages/core/src/repos/caja-repo.ts`
**Lo consumen.** CAJA-03, CAJA-05, CAJA-06, MULTICAJA-03, MULTICAJA-05, MULTICAJA-06

### DESIGN.md derivado y banco de pruebas de @sfr/ui

CLAUDE.md exige DESIGN.md antes de cualquier UI y NO existe (la guia real es design-guidelines.md, 23 KB, con drift verificado: su linea 293 describe al reves lo que hace useAtajosTeclado.ts:42-45, asi que un agente que la siga escribiria atajos sobre una premisa falsa). Ademas packages/ui/package.json no tiene script test, asi que pnpm -r test SALTA el paquete entero en silencio, y por eso ocho areas escribieron en sus briefs el mismo rodeo: 'packages/ui no tiene runner, pon la logica en core'. Se deriva DESIGN.md de design-guidelines.md corrigiendo el drift y anadiendo lo que las areas nuevas necesitan (acceso por PIN, modulo sin permiso, sub-pestanas, pagina de secciones), y se instala vitest+jsdom con un helper renderConDatos. OJO: el vitest.config debe llevar el bloque css.postcss vacio que ya tiene packages/core/vitest.config.ts, o la corrida se rompe por un postcss.config ajeno del home del usuario.

**Archivo.** `DESIGN.md`
**Lo consumen.** RBAC-05, RBAC-06, RBAC-07, CRM-07, PRECIOS-05, PRECIOS-06, COMPRAS-06, COMPRAS-07, CAJA-06, BACKOFFICE-06, BACKOFFICE-07, MULTICAJA-06

## 4. Archivos calientes: quien los toca y cuando

Estos archivos tienen varios reclamantes. La regla general es **una sola pasada por un solo
agente**, no una edicion por area.

| Archivo | Areas que lo quieren | Mitigacion |
| --- | --- | --- |
| `packages/core/src/db/migrations.ts` | RBAC, CRM, BACKOFFICE, COMPRAS, PRECIOS, MULTICAJA, CAJA | CONFLICTO NUMERO UNO: siete areas reclaman el id 11 y las ocho anaden al final del mismo array de 502 lineas. Doble mitigacion, ambas obligatorias. (1) Dividir en packages/core/src/db/migraciones/ con un archivo por banda; migrations.ts pasa a concatenar y ordenar. Cada agente escribe SOLO su archivo, asi que el merge es trivial. (2) Bandas de ids documentadas en MIGRACIONES.md y un test que falla ante id duplicado o fuera de banda. La banda importa aunque no haya conflicto textual, porque migrator.ts deduplica SOLO por id y lo calcula UNA vez antes del bucle: si dos areas eligen el 11, en una base donde ya se aplico el primero el segundo NO se ejecuta NUNCA y su tabla no existe, sin error visible, solo en el equipo del cliente. |
| `packages/core/src/repos/producto-repo.ts (const COLS + Array(19).fill('?'))` | PRECIOS, BACKOFFICE, RBAC, COMPRAS | PRECIOS-01 sube el contador 19->21 y BACKOFFICE-04 lo sube 19->20: si ambos aterrizan, el INSERT queda desalineado y revienta en runtime SIN que TypeScript diga nada. Se resuelve con la tarea CENSO-COLUMNAS (ola 2): un solo agente anade precio_2, cantidad_minima_mayoreo y existencia_minima a la vez y ajusta COLS y el contador UNA vez, con un test de ida y vuelta que lee la fila insertada. A partir de ahi PRECIOS-03 y BACKOFFICE-04 solo anaden METODOS. El guardia exigirPermiso de RBAC-04 va en otra ola (4) porque toca el mismo archivo. |
| `packages/core/src/repos/cliente-repo.ts (const COLS + Array(15).fill('?'))` | CRM, PRECIOS, RBAC | CRM-01 sube 15->17 (fecha_nacimiento, dias_credito) y PRECIOS-01 sube 15->17 (nivel_precio, niveles_permitidos_json): el mismo choque silencioso. Lo absorbe CENSO-COLUMNAS, que anade las cuatro columnas de una vez y deja el contador en 19. Despues, en olas distintas: PRECIOS-03 (ola 5, metodos de nivel), CRM-03 (ola 6, guardia de deuda al eliminar). Aprovechar el censo para arreglar tambien el patron `?? actual.x` de la linea 102, que hace `input.aplica_credito ? 1 : 0` sin fallback y APAGA el credito del cliente en cualquier update parcial. |
| `packages/core/src/repos/factura-repo.ts` | RBAC, PRECIOS, CRM, MULTICAJA, CAJA | Cinco reclamantes sobre el archivo transaccional mas critico (497 lineas, camino del cobro). Serializarlo costaria cinco olas. Se resuelve con la tarea compartida FACTURA-GUARDIAS (ola 6): UN agente hace las cinco cosas en una pasada, con todos los dominios puros ya construidos y probados en la ola 4, de modo que la tarea solo cablea y no decide nada. Su criterio de aceptacion es de no regresion: cobrar 100% en efectivo debe comportarse exactamente igual, y corte-caja.calcularResumen debe devolver los mismos numeros que antes para los mismos datos. Se le anade devolucion-repo.ts al mismo agente, porque es la otra mitad del mismo nucleo y tiene tres reclamantes. |
| `packages/ui/src/pantallas/Ventas.tsx` | PRECIOS, CRM, RBAC, CAJA, MULTICAJA | 1941 lineas, la pantalla critica del producto, con estado de React, deshacer/rehacer, atajos, fusion de lineas y foco de teclado enredados. Cinco reclamantes. Misma medicina: tarea compartida VENTAS-UNIFICADA en la ola 8, despues de que TODOS los repos esten estables, para que la pantalla solo consuma. Dos trampas para el brief de ese agente: la fusion de lineas compara floats por igualdad (linea 504) y con tres niveles dos niveles pueden tener el mismo precio numerico, asi que la clave pasa a ser producto_id + nivel; y Shift+F8 esta prohibido porque useAtajosTeclado solo anade 'Shift' si la tecla es una letra y se normalizaria a 'F8'. |
| `packages/ui/src/AppShell.tsx` | BACKOFFICE, RBAC, CAJA, MULTICAJA, CRM | Cuatro listas cableadas en el mismo archivo (union 24-26, MODULOS 28-31, ICONO 33-43, cadena de renders 189-199) y atajos derivados del INDICE del array. Cinco areas lo editan en los mismos cuatro puntos. Se resuelve en la ola 2 con PLATAFORMA-07: registro declarativo en navegacion/modulos.ts donde el atajo es un DATO fijo por modulo y se admite atajo null. Despues, cada area anade UNA linea al registro. CAJA renombra 'Corte de caja' a 'Caja' en su MISMA entrada para no mover Alt+6, y BACKOFFICE deja de necesitar el remapeo a Alt+0 que su plan proponia. |
| `packages/ui/src/data/contexto.tsx` | CRM, COMPRAS, MULTICAJA, CAJA, RBAC, BACKOFFICE, PLATAFORMA | Nueve tareas de seis areas anaden su repo a la interfaz Repos y a ProveedorDatos, ambos escritos a mano. Se resuelve en la ola 2 moviendo la construccion a crearRepos(db) en core, alimentada por repos/registro.ts donde cada area anade una sola linea al final. Ademas hay un defecto latente que el conflicto destapa: el objeto de 18 repos se construye en el CUERPO del render sin useMemo, asi que en cuanto el proveedor re-renderice (y meter la sesion es justo lo que lo hace re-renderizar) Reportes, CorteCaja y Compras entran en bucle infinito de consultas. El useMemo es parte de la misma tarea, no un extra. |
| `packages/core/src/repos/reportes-repo.ts` | BACKOFFICE, CRM, PRECIOS, CAJA, MULTICAJA | Cinco areas anaden metodos a un archivo de 140 lineas, y dos de ellas ademas quieren cambiar el criterio de fecha de los cinco metodos que ya existen. Se divide en packages/core/src/repos/reportes/ con un archivo por familia (ventas, margen, cliente, turnos, caja) y un barrel que compone el repo. BACKOFFICE-02 (ola 4) es el UNICO que toca los cinco metodos historicos para unificar el criterio de fecha; despues cada area anade su archivo en paralelo. El cambio de criterio altera cifras que tres pantallas ya muestran en produccion: tiene que ir avisado en el reporte de tarea para que el dueno no lo lea como un error. |
| `packages/core/src/repos/tipos.ts` | RBAC, CRM, BACKOFFICE, COMPRAS, PRECIOS, MULTICAJA, CAJA | Siete areas anaden interfaces al mismo archivo de 329 lineas. Aunque sea aditivo, siete parches en la misma region producen conflictos de contexto en git. Se divide en packages/core/src/repos/tipos/ con un archivo por dominio mas un barrel; el censo de columnas de la ola 2 actualiza las interfaces compartidas (Producto, Cliente, Negocio, Factura, FacturaLinea) de una vez, y cada area crea su propio archivo para sus tipos nuevos. |
| `packages/core/src/dominio/permisos.ts` | RBAC, BACKOFFICE, PLATAFORMA | Colision literal de path: RBAC-02 y BACKOFFICE-05 escriben EL MISMO archivo, y PLATAFORMA-04 escribe uno equivalente en seguridad/permisos.ts, con tres vocabularios de rol incompatibles. Decision cerrada: el archivo es de RBAC-02, los roles quedan en cajero\|supervisor\|dueno\|superadmin, packages/core/src/seguridad/ no se crea y PLATAFORMA-04 se cancela. puedeVerBackoffice pasa a ser una funcion dentro de permisos.ts. Mismo criterio para el hash de PIN: dominio/pin.ts de RBAC-02, no seguridad/pin.ts. |
| `packages/core/src/repos/caja-repo.ts` | MULTICAJA, CAJA | MULTICAJA-02 y CAJA-03 crean el mismo archivo desde cero. Gana MULTICAJA-02, que trae ademas caja.prefijo (necesario para la numeracion por caja) e instalacion-repo (que responde 'que caja es esta instalacion' desde los datos y no desde localStorage). CAJA-03 lo consume y se limita a sesion-caja-repo. MULTICAJA (banda 30) va antes que CAJA (banda 40) tambien en el orden de aplicacion, porque su migracion hace INSERT OR IGNORE de la caja por defecto que sesion_caja va a referenciar. |
| `packages/core/src/repos/negocio-repo.ts (COLS + Array(15))` | BACKOFFICE, COMPRAS, CAJA | Tres areas hacen tres ALTER independientes sobre negocio (desfase_horario_min; politica_costo y umbral_aviso_costo_pct; exige_caja_abierta, arqueo_ciego y umbral_diferencia_caja) y las tres tocan el mismo contador. Absorbido por CENSO-COLUMNAS. Atencion a un detalle que decide si la actualizacion rompe instalaciones vivas: exige_caja_abierta se declara con DEFAULT 1 y acto seguido, en la MISMA migracion, se hace UPDATE negocio SET exige_caja_abierta = 0, para que las instalaciones existentes no se queden sin poder vender el dia de la actualizacion y las nuevas (donde seed inserta el negocio despues de migrar) nazcan con el turno obligatorio. |
| `packages/core/src/repos/backup-repo.ts (const TABLAS)` | RBAC, CRM, COMPRAS, CAJA, MULTICAJA | Cinco areas anaden sus tablas nuevas a una lista escrita a mano, con el agravante de que una tabla olvidada sale del respaldo del cliente sin ningun aviso ni test que falle. Se elimina la lista: PLATAFORMA-03 (ola 3) descubre las tablas en tiempo de ejecucion sobre sqlite_master. Con eso ninguna de las cinco areas vuelve a tocar el archivo. |
| `packages/ui/src/componentes/FormularioProducto.tsx y pantallas/Productos.tsx` | PRECIOS, BACKOFFICE, COMPRAS | Tres areas anaden campos al mismo formulario, que ademas se usa desde Productos Y desde el 'Modificar' de Ventas. Tarea compartida CATALOGO-UI en la ola 8. Trampa que debe ir en el brief: hay que anadir cada campo nuevo a diferenciasProducto (el diff previo a guardar), porque Productos.guardar() retorna cuando cambios.length===0, asi que al editar SOLO el campo nuevo el formulario se cierra SIN GUARDAR y sin error visible. |
| `packages/api/db/schema.sql y packages/api/sync-rules.yaml` | RBAC, COMPRAS, PRECIOS, MULTICAJA, PLATAFORMA | Ya estan desincronizados: les faltan las migraciones 7, 8 y 10 (devolucion, devolucion_linea, promocion, cotizacion, cotizacion_linea). Mantenerlos a mano en paralelo con ocho areas migrando es deuda que no se paga sola. Decision: PLATAFORMA-03 los pone al dia UNA vez en la ola 3, y a partir de ahi solo RBAC los toca, para dos cosas que no son cosmeticas: el espejo de usuario_seguridad y quitar el SELECT * sobre usuario de sync-rules.yaml, que en Fase 2 replicaria el pin_hash de todo el personal a cada cliente. |

## 5. Convenciones del repositorio que un agente rompe sin querer

- **Todo en espanol**, incluidos nombres de archivo, de tipo y de columna SQL.
- Los repos son *factories* `crearXxxRepo(db: SqlDriver)` que devuelven un objeto literal.
  No son clases.
- El error de validacion es `ValidacionError`, importado desde `producto-repo.js` — no desde
  `validacion.ts`. Es raro y es asi.
- Las columnas se listan en una constante `COLS` y los `INSERT` usan ``Array(n).fill("?")``.
  **Si `n` no coincide con el numero de columnas de `COLS`, TypeScript no lo detecta y explota
  en runtime en la maquina del cliente.** Los contadores actuales: producto 19, cliente 15,
  factura 19, factura_linea 14, cotizacion 16.
- Los `SELECT` usan lista explicita de columnas, no `SELECT *`: una columna nueva es
  **invisible** hasta agregarla a `COLS`. Y hay una copia de `COLS_FACTURA_LINEA` duplicada en
  `devolucion-repo.ts:41-42`.
- Todo repo nuevo se exporta en `packages/core/src/repos/index.ts` **y** se inyecta en el
  objeto `Repos` de `packages/ui/src/data/contexto.tsx`.
- `precio_venta` **incluye ITBIS** por convencion de todo el dominio (`dominio/precio.ts:8-13`).
  Cualquier precio nuevo sigue esa convencion o el desglose fiscal sale descuadrado.
- La guia de diseno real es `design-guidelines.md` en la raiz (23 KB). `estilos.ts` **no puede
  contener ningun hex**, solo `var(--sfr-*)`, y todo color nuevo se declara en
  `estilos-globales.css` en `:root` **y** en `[data-theme="dark"]`.
- `tsconfig.base.json:16-17` activa `noUnusedLocals` y `noUnusedParameters`: un andamio a medio
  hacer (un parametro `sesion` todavia sin usar) **no compila** y bloquea a las ocho areas.

### La contradiccion de los comentarios

`CLAUDE.md` §0 dice **"sin comentarios en el codigo"**. El repositorio entero esta densamente
comentado en espanol, con una cabecera por archivo que explica el *por que* de cada decision
(`AppShell.tsx:45-49`, `useBreakpoint.ts:3-23`, `precio.ts:30-46`). Las ocho auditorias lo marcaron.

> [!IMPORTANT]
> **DECIDIDO: gana la convencion real del repositorio.**
>
> - **Si**: una cabecera por archivo que explique el *por que* de la decision no obvia.
> - **No**: comentarios inline decorativos que repiten lo que el codigo ya dice.
>
> El motivo es que este codigo tiene trampas que son invisibles sin explicacion — el `split(";")`
> del driver de escritorio, el `pct_ganancia` que solo se actualiza cuando el precio se deriva, el
> contador `Array(N)` que no valida nada. Un archivo nuevo sin esa cabecera deja al siguiente
> agente sin la informacion que costo horas encontrar.
>
> Donde un brief diga "sin comentarios en el codigo", **esta regla lo supera**.

## 6. Definicion de terminado

Una tarea no esta lista hasta que:

- [ ] `pnpm -r test` y `pnpm -r typecheck` en verde.
- [ ] Ningun archivo de test preexistente aparece en `git diff --stat`, salvo que la tabla de
      excepciones de `MIGRACIONES.md` lo autorice explicitamente para tu ola.
- [ ] El numero de tests que pasan no bajo respecto a la corrida previa.
- [ ] Si el cambio se nota de cara al usuario, hay una entrada nueva en `CHANGELOG.md` bajo
      `[Unreleased]`.
- [ ] Si tocaste una migracion: la app **arranca** sobre una copia de una base real en los dos
      shells (PWA y escritorio). La corrida de Tauri es manual y va firmada en el reporte.
- [ ] Si tocaste UI: verificado a 375 px, 768 px y 1440 px, en tema claro y oscuro.
- [ ] Ninguna regla de negocio vive solo en un componente. El guardia esta en el repo.
