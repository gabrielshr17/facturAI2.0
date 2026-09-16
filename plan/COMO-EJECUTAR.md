# Como ejecutar este plan

Guia para la sesion (o las sesiones) que van a implementar las 63 tareas. El prompt de arranque
esta al final; esto es el contexto que lo hace funcionar.

---

## Lo primero: que NO hay que hacer

La causa mas probable de que esto salga mal no es un error tecnico, es que una sesion nueva
decida rehacer el trabajo de planificacion. Concretamente:

- **No vuelvas a auditar el codigo para "confirmar" el plan.** Ya se hizo: ocho agentes leyeron el
  repositorio por area, dos revisores adversariales atacaron el resultado, y las correcciones ya
  estan incorporadas en los briefs. Volver a auditar quema horas y produce las mismas conclusiones.
- **No replantees las decisiones de la seccion 3 de `PLAN-MEJORAS.md`.** Estan tomadas por el
  dueno del proyecto, con su consecuencia escrita. Si una te parece equivocada, dilo en una frase
  y sigue; no la cambies por tu cuenta.
- **No intentes varias tareas a la vez en la misma sesion.** Una tarea por sesion o por agente.
  Los briefs estan dimensionados para eso.
- **No empieces por la tarea que te parezca mas facil.** El orden de olas existe porque las tareas
  comparten archivos calientes; saltarselo garantiza conflictos de merge.

---

## Estado actual

- **Ninguna tarea esta implementada.** El plan esta escrito; el codigo esta como estaba.
- La rama es `master`. **`CLAUDE.md` prohibe trabajar directamente ahi.**
- Lo siguiente que toca es la **ola 1** (`PLAN-MEJORAS.md`, seccion 5).

---

## Orden de lectura obligatorio

Antes de escribir una linea, en este orden:

1. **`plan/00-CONVENCIONES.md`, entero.** Son las cinco trampas que rompen produccion, el reparto
   de ids de migracion por banda, y las convenciones del repositorio. Sin esto, un agente
   competente escribe codigo que pasa los tests y revienta en la maquina del cliente.
2. **`PLAN-MEJORAS.md`, seccion 3 (decisiones tomadas).** Nueve decisiones con su consecuencia.
3. **`PLAN-MEJORAS.md`, seccion 5 (olas).** Para saber en que ola estas y cual es su criterio de
   salida.
4. **El brief de tu tarea**, en el archivo de area que le corresponde.

---

## Dos avisos sobre los briefs

Los escribieron ocho agentes en paralelo, antes de la sintesis y de que se tomaran las decisiones.
Dos cosas quedaron desactualizadas dentro del texto de los briefs, y **el aviso gana sobre el
brief**:

| El brief dice | Lo correcto |
| --- | --- |
| "migracion 11" | El id sale de la **tabla de bandas** (`00-CONVENCIONES.md`, seccion 2). Los ocho agentes reclamaron el id 11. |
| "sin comentarios en el codigo" | **Decision 4**: cabecera por archivo explicando el *por que*, cero comentarios inline decorativos. |

Cada archivo de area lleva los dos avisos arriba del todo.

---

## Ciclo por tarea

1. **Rama.** `git checkout -b <tipo>/<id-en-minusculas>` — por ejemplo `feature/rbac-01`. Tipos:
   `feature`, `fix`, `refactor`, `chore`, `docs`. **Nunca trabajar en `master`.**
2. **Rojo.** Escribe primero las pruebas de la seccion "Pruebas a escribir primero" del brief.
   Confirma que fallan por el motivo correcto.
3. **Verde.** Implementa lo minimo que las haga pasar.
4. **Refactor.** Sin cambiar comportamiento.
5. **Verifica.** `pnpm -r test` y `pnpm -r typecheck`. Si tocaste UI, comprueba a 375 px, 768 px y
   1440 px, en tema claro y oscuro.
6. **Repasa la definicion de terminado** (`00-CONVENCIONES.md`, seccion 6).
7. **Commit** en formato convencional: `feat(caja): abrir turno con fondo inicial`. Un cambio
   logico por commit. Entrada en `CHANGELOG.md` bajo `[Unreleased]` si se nota de cara al usuario.
8. **Reporte de tarea**: archivos tocados y que cambio, pruebas anadidas y estado de la suite, lo
   que quedo deliberadamente sin hacer y por que, y lo que merece abrirse como issue.

---

## Cuando pararse y preguntar

- **Regla de las 2 correcciones.** Si un fallo sobrevive dos intentos seguidos, para. Enuncia la
  hipotesis y pregunta; no sigas adivinando.
- **Si el brief choca con el codigo real.** Los briefs citan rutas y lineas verificadas, pero el
  codigo se mueve. Si algo no esta donde dice, para y reporta — no "arregles" el brief por tu
  cuenta ni asumas que la ruta equivalente es la buena.
- **Si una tarea necesita tocar un archivo que su brief prohibe.** Los "NO TOQUES" existen porque
  otra tarea de otra ola es la duena de ese archivo. Tocarlo garantiza un conflicto.
- **Si vas a editar un test que ya existia.** Solo se permite donde la ola lo autorice
  explicitamente. Fuera de eso es motivo de rechazo en revision.

---

## Lo que hay que vigilar en cada ola

| Ola | Lo que mas probablemente salga mal |
| --- | --- |
| 1 | Dividir `migrations.ts` sin romper el orden de aplicacion en bases ya instaladas |
| 2 | `CENSO-COLUMNAS` toca los contadores `Array(N)` de cinco repos: un desajuste no lo ve TypeScript |
| 3 | El respaldo tiene que poder **restaurarse**, no solo exportarse, antes de que nadie migre |
| 4 | El guardia de permisos no puede romper los 18 archivos de test existentes |
| 5 | Nadie edita `factura-repo.ts` en esta ola. Nadie. |
| 6 | Un solo agente sobre `factura-repo.ts`, con cinco cambios a la vez. Es la ola mas delicada |
| 7 | `resumenPanel` en **una** llamada: diez consultas con `Promise.all` congelan el telefono |
| 8 | `VENTAS-UNIFICADA` y `CATALOGO-UI` son un agente cada una, no cinco |
| 9 | `RBAC-10` no se construye hasta que `@sfr/api` tenga autenticacion real |

---

## Prompt de arranque

Para pegar en una sesion nueva. Ajusta la ola y la tarea.

```text
Vamos a implementar el plan que ya esta escrito en este repositorio. NO lo replantees ni vuelvas
a auditar el codigo para confirmarlo: ya se audito con ocho agentes y dos revisores
adversariales, y las correcciones estan incorporadas.

Lee, en este orden y completos, antes de escribir una linea:
  1. plan/00-CONVENCIONES.md
  2. PLAN-MEJORAS.md, secciones 3 (decisiones tomadas) y 5 (olas)
  3. plan/COMO-EJECUTAR.md

Estamos en la OLA 1 y ninguna tarea esta implementada todavia.

Quiero que implementes UNA sola tarea: <ID>. Su brief esta en plan/<archivo de area>.md.

Reglas que no se negocian:
- Rama propia, nunca master. Formato: feature/<id-en-minusculas>.
- TDD: primero las pruebas de la seccion "Pruebas a escribir primero" del brief, en rojo, y
  confirma que fallan por el motivo correcto antes de implementar.
- El id de migracion sale de la tabla de bandas de 00-CONVENCIONES seccion 2, NO del "migracion 11"
  que diga el brief.
- Estilo de comentarios: decision 4 (cabecera por archivo explicando el por que; cero comentarios
  inline decorativos). Donde el brief diga "sin comentarios", esta superado.
- Respeta la lista "NO TOQUES" del brief al pie de la letra.
- No edites ningun test preexistente salvo que la ola lo autorice.
- Si un fallo sobrevive dos intentos, para y dime la hipotesis en vez de seguir probando.
- Si el brief cita una ruta o linea que no coincide con el codigo, para y dimelo.

Termina con: `pnpm -r test` y `pnpm -r typecheck` en verde, entrada en CHANGELOG.md bajo
[Unreleased] si el cambio se nota de cara al usuario, y un reporte de tarea (archivos tocados,
pruebas anadidas, estado de la suite, lo que quedo sin hacer y por que).

Empieza leyendo los tres documentos y despues dime tu plan para <ID> antes de tocar nada.
```

### Variante para despachar varias tareas de la misma ola en paralelo

Solo dentro de una ola, y solo si sus briefs no comparten archivos:

```text
[el mismo prompt de arriba, y ademas:]

Lanza un agente por tarea, en paralelo, para: <ID-1>, <ID-2>, <ID-3>.
A cada agente pasale SU brief completo, plus plan/00-CONVENCIONES.md.
Cada agente trabaja en su propia rama. Ninguno toca un archivo que no este en SU lista de
"Archivos a tocar". Cuando terminen, revisa que no se pisaron antes de fusionar nada.
```
