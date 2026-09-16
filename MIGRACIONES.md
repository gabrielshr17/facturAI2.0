# Convención de migraciones

Ver también [`plan/00-CONVENCIONES.md`](./plan/00-CONVENCIONES.md), que es la fuente
autoritativa; este archivo es su resumen operativo para quien va a escribir una
migración.

## Bandas de id por área

El id de una migración nueva **sale de esta tabla**, nunca de contar el array. El
migrador (`packages/core/src/db/migrator.ts`) deduplica **solo por id** y calcula el
conjunto de aplicadas una vez antes del bucle: si dos áreas eligen el mismo id, en una
base donde ya se aplicó el primero, el segundo **nunca se ejecuta y su tabla no existe**,
sin ningún error visible en el arranque del cliente.

| Banda | Área | Notas |
| --- | --- | --- |
| `1-10` | Base (INTOCABLE) | Ya aplicada en toda instalación real. Nunca editar su SQL. |
| `11-19` | Compartido (censo de columnas) | Un solo agente añade aquí; ver `00-CONVENCIONES.md` sección 3. |
| `20-29` | RBAC | usuarios, roles y permisos |
| `30-39` | MULTICAJA | identidad de instalación y NCF por caja |
| `40-49` | CAJA | turno, arqueo y movimientos de efectivo |
| `50-59` | PRECIOS | tres niveles de precio |
| `60-69` | COMPRAS | recepción, costo histórico y cuentas por pagar |
| `70-79` | CRM | crédito, interacciones y etiquetas |
| `80-89` | BACKOFFICE | panel del dueño |
| `90-94` | PLATAFORMA | reservada (hoy no necesita ninguna) |
| `95-99` | CORRECCIONES | hotfix posteriores al merge |

Los archivos viven en `packages/core/src/db/migraciones/`, uno por banda
(`00-base.ts`, `11-compartido.ts`, `20-rbac.ts`, ...). `migrations.ts` solo importa,
concatena y ordena por id: **cada agente escribe únicamente su archivo**, así que dos
áreas trabajando en paralelo nunca producen un conflicto de merge en el mismo archivo.

## Cómo reservar un id

Anuncia en el PR qué id vas a usar dentro de tu banda, en orden ascendente a partir del
último ya usado en ese archivo. `packages/core/test/migraciones-integridad.test.ts` falla
si dos migraciones repiten id o nombre, si el array queda desordenado, o si un id cae
fuera de todo rango declarado.

## La trampa del `;` (driver de escritorio)

`packages/desktop/src/db/tauri-sql-driver.ts` parte el SQL de cada migración con un
`split(";")` ingenuo. Un `;` dentro de un literal de texto, dentro de un comentario
`-- ...` o en el cuerpo de un `CREATE TRIGGER` (`BEGIN ... ; ... END;`) parte el SQL en
statements inválidos y **revienta solo en escritorio** — los tests corren sobre
`node:sqlite` y la PWA sobre sql.js, y ambos aceptan lotes completos sin partirlos.

**Regla.** Cero triggers. Cero `;` fuera de la separación entre statements completos.
Un comentario del estilo `-- rol: admin; cajero` tapia la app en el equipo del cliente.
El test de integridad detecta este patrón y falla nombrando la migración.

## Excepciones a "no editar tests preexistentes"

| Ola | Archivos | Motivo |
| --- | --- | --- |
| 1 (PLATAFORMA-01) | Los 11 `packages/core/test/*.test.ts` que copiaban a mano `async function nuevaDb()` | Cambio mecánico: se reemplaza la función local por `import { nuevaDb } from "./_ayuda.js"`. Ninguna aserción cambia. Autorizado explícitamente por el brief de PLATAFORMA-01, paso 2. |

## `seed()` no siembra en instalaciones existentes

`packages/core/src/db/seed.ts` sale inmediatamente si ya existe un negocio. Cualquier
dato inicial (roles por defecto, una caja, un catálogo) que se intente sembrar ahí es
invisible para las instalaciones que ya están en uso — que son justamente el caso que no
se puede romper. **El dato inicial va dentro del SQL de la migración**, con
`INSERT OR IGNORE`.

## `ALTER TABLE ... ADD COLUMN` con `REFERENCES`

SQLite no admite `ALTER TABLE ADD COLUMN NOT NULL` sin `DEFAULT`. Y una columna nueva
con `REFERENCES` a otra tabla solo se admite si su valor por defecto es `NULL`. Las
columnas nuevas de tipo `usuario_id` / `caja_id` van **nullable, sin excepción** — no
hay atajo con `NOT NULL DEFAULT algo` cuando hay una clave foránea de por medio.
