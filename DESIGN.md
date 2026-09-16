# DESIGN.md — facturAI

Este archivo es el que exige `CLAUDE.md` antes de tocar cualquier pantalla. **No reemplaza**
[`design-guidelines.md`](./design-guidelines.md) (444 líneas, en la raíz): esa sigue siendo la
guía extendida — color, componentes (`s.*`), diálogos, iconografía, checklist de pantalla
nueva. Este archivo hace tres cosas que `design-guidelines.md` no hace:

1. Cita los **tokens exactos tal como están hoy en el código** (no una copia que se puede
   desincronizar), con su archivo y línea.
2. **Corrige un drift verificado** entre `design-guidelines.md` y el código real (`useAtajosTeclado`).
3. Documenta **cuatro patrones nuevos** que ninguna de las dos guías cubría todavía, porque
   las áreas de la ola 1 en adelante los necesitan: acceso por PIN, módulo sin permiso,
   sub-pestañas y página de secciones.

Si algo de aquí y de `design-guidelines.md` alguna vez se contradice, **gana el código fuente
citado**, no ninguno de los dos documentos — ambos son una fotografía, y el código se mueve.

---

## 1. Tokens (fuente: el código, no esta lista)

Los tokens viven en exactamente dos archivos. Esta tabla es una fotografía tomada para este
reporte; ante cualquier duda, se relee el archivo.

| Archivo | Qué define |
|---|---|
| `packages/ui/src/estilos-globales.css` | Variables `--sfr-*`, tema claro en `:root` (líneas 18–53) y oscuro en `[data-theme="dark"]` (líneas 55–82) |
| `packages/ui/src/estilos.ts` | Objetos `c` (línea 22) y `s` (línea 49), que consumen esas variables vía `var(--sfr-*)` |

### 1.1 Color — hex exactos

| Rol (`c.*`) | Variable | Claro | Oscuro |
|---|---|---|---|
| `azul` (acento/primario) | `--sfr-acento` | `#991b1b` | `#c1121f` |
| `azulOscuro` (primario fuerte) | `--sfr-acento-oscuro` | `#7f1d1d` | `#fca5a5` |
| `azulClaro` (primario tenue) | `--sfr-acento-claro` | `#fef2f2` | `rgba(193,18,31,.18)` |
| `rojo` (peligro/error) | `--sfr-peligro` | `#b91c1c` | `#f87171` |
| `rojoFondo` | `--sfr-peligro-fondo` | `#fee2e2` | `rgba(248,113,113,.18)` |
| — `seleccion` (fila elegida, **neutro a propósito**: no compite con peligro) | `--sfr-seleccion` | `#e2e8f0` | `rgba(148,163,184,.22)` |
| `verde` (éxito) | `--sfr-exito` | `#16a34a` | `#4ade80` |
| `verdeFondo` | `--sfr-exito-fondo` | `#f0fdf4` | `rgba(74,222,128,.14)` |
| `amarillo` (advertencia) | `--sfr-advertencia` | `#92400e` | `#fbbf24` |
| `amarilloFondo` | `--sfr-advertencia-fondo` | `#fef3c7` | `rgba(251,191,36,.14)` |
| `gris` | `--sfr-gris` | `#6b7280` | `#9ca3af` |
| `grisClaro` | `--sfr-gris-claro` | `#f3f4f6` | `#27272a` |
| `borde` | `--sfr-borde` | `#e5e7eb` | `#303033` |
| `texto` | `--sfr-texto` | `#1f2937` | `#f4f4f5` |
| `fondo` | `--sfr-fondo` | `#f8fafc` | `#0a0a0a` |
| `superficie` | `--sfr-superficie` | `#ffffff` | `#18181b` |

`azul`/`azulOscuro`/`azulClaro` son **nombres de rol** heredados (primario / primario-fuerte /
primario-tenue), no de matiz — el acento real es rojo granate. No renombrar al vuelo; elegir
el token por su rol, nunca por su nombre. **Ningún color se define solo en un tema**: uno
nuevo se declara en `:root` **y** en `[data-theme="dark"]`, y recién ahí se expone en `c`.
`estilos.ts` no contiene hex — solo `var(--sfr-…)`.

### 1.2 Espaciado — base-8

Múltiplos de 2 con 8 como unidad de trabajo (no una grilla estricta de 8px en cada valor, pero
sí su múltiplo o submúltiplo más cercano):

| Uso | Valor |
|---|---|
| `gap` entre controles de una barra | 6 / 8 / 10 |
| `gap` de layout (nav↔contenido, tarjeta↔tarjeta) | 16 |
| Padding de tarjeta (`s.tarjeta`) | 18 |
| Padding de `<main>` en `amplio`/`medio` | `24 32` |
| Padding de `<main>` en `compacto`/`movil` | `12 14` |
| Padding de botón primario/secundario | `9 18` |
| Padding de celda de tabla (`s.td`) | `13 14` |

### 1.3 Radios

| Radio | Uso |
|---|---|
| 8 | Botón, input, ítem de nav |
| 12 | Tarjeta (`s.tarjeta`) |
| 16 | Modal |
| 999 | Badge, píldora, botón circular (tema, "saltar al contenido" cuando es pill) |

### 1.4 Tipografía

Inter Variable autoalojada (`@fontsource-variable/inter`, sin CDN — un POS debe verse igual
sin internet). Escala real (`estilos.ts` + usos en pantallas):

| Uso | Tamaño | Peso |
|---|---|---|
| Título de módulo (`h2`) | 22 (18 en cajón/móvil) | 600, `letterSpacing: -0.3` |
| Título de tarjeta/modal (`h3`) | 18 | 600 |
| Mensaje de modal | 15 | 400, `lineHeight: 1.5` |
| Cuerpo, tabla, input, botón (`s.input`, `s.td`) | 14 | 400/500 |
| Etiqueta de campo (`s.label`), metadatos | 13 | 500, color `c.gris` |
| `th`, badge, pista de atajo (`.sfr-kbd`) | 11–12 | 600, `th` en mayúsculas |

Pesos disponibles de la variable font: 400 (cuerpo), 500 (etiquetas/botón secundario), 600
(botón primario, encabezado de tabla, badge), 700 (solo la marca "facturAI").

Detalle completo de componentes, sombras, z-index y checklist de pantalla nueva:
[`design-guidelines.md` §3–5](./design-guidelines.md#3-tipografía).

---

## 2. Breakpoints — mobile-first, verificado a 375/768/1440

Fuente: `packages/ui/src/hooks/useBreakpoint.ts:24-38`. La app se estiliza con `style={{}}`
inline (sin clases), así que el responsive se decide en JS, no con `@media`, salvo el puñado
de reglas que un objeto inline no puede expresar (`:hover`, `pointer: coarse`, scrollbars),
que viven en `estilos-globales.css`.

| Tramo | Ancho (`useBreakpoint.ts:26-28`) | Barra lateral | Contenido |
|---|---|---|---|
| `movil` | <700 | cajón (hamburguesa) | apilado |
| `compacto` | 700–939 | tira de iconos (60px) | apilado |
| `medio` | 940–1099 | tira de iconos (60px) | dos columnas |
| `amplio` | ≥1100 | completa (216px) | dos columnas |

El orden en que las cosas ceden es deliberado y es la regla que manda sobre cualquier
pantalla nueva: **lo primero que se sacrifica es el cromo de navegación** (la barra pierde
etiquetas), **después el contenido se apila**, y la barra solo sale del flujo (a un cajón) en
el último tramo. Los tres anchos de verificación obligatoria y lo que debe verse en cada uno:

- **375px** (`movil`) — barra en cajón oculto tras el botón de menú; contenido en una sola
  columna; campos con `font-size: 16px` (evita el zoom automático de iOS); botones con
  `min-height: 44px` bajo `pointer: coarse`.
- **768px** (`compacto`) — barra como tira de solo iconos (con `title`/`aria-label` por
  ítem); contenido todavía apilado en una columna.
- **1440px** (`amplio`) — barra completa con etiqueta de texto junto a cada icono; contenido
  en dos columnas donde la pantalla lo use (p. ej. Ventas: ticket + totales).

Toda pantalla y todo patrón nuevo de este documento (PIN, sub-pestañas, secciones) se verifica
en los tres anchos, en tema claro **y** oscuro, antes de darse por terminado — es el mismo
criterio que ya exige `design-guidelines.md` y que repite `00-CONVENCIONES.md`.

Hooks para consultarlo sin leer el ancho a mano: `useEsAngosto()`, `useNavSoloIconos()`,
`useNavEnCajon()`, `useEsMovil()`, `useEsTactil()` (éste por tipo de puntero, no por ancho: una
tablet mide 800–1100px pero se maneja con el dedo).

---

## 3. Corrección de drift: `useAtajosTeclado` — comportamiento REAL

> [!IMPORTANT]
> `design-guidelines.md:293` afirma que `useAtajosTeclado(mapa, activo)` hace
> `preventDefault()` **antes** de mirar si hay algo que hacer en el mapa. **Eso ya no es lo
> que hace el código.** Verificado en `packages/ui/src/hooks/useAtajosTeclado.ts:41-46`:
>
> ```ts
> function onKeyDown(e: KeyboardEvent) {
>   const manejador = mapaRef.current[normalizarTecla(e)];
>   if (!manejador) return;      // busca el manejador PRIMERO
>   e.preventDefault();          // preventDefault() SOLO si existe
>   manejador(e);
> }
> ```
>
> El orden real es **al revés** de lo que dice la guía: primero se normaliza la tecla y se
> busca en el mapa: si no hay manejador registrado para esa combinación, la función retorna
> sin llamar a `preventDefault()` y la tecla sigue su curso normal en el navegador (se puede
> seguir tecleando `+`, `-`, `Supr`, etc. en cualquier campo de texto sin que el atajo se lo
> coma). `preventDefault()` solo corre cuando SÍ hay un manejador para esa tecla exacta.
>
> **Consecuencia práctica, la contraria de la que traía la guía vieja:** una tecla que
> también se escribe (`+`, `-`, `Supr`, dígitos) puede entrar al mapa de atajos sin bloquear
> el tecleo normal en el resto de la pantalla, siempre que esa tecla + los modificadores no
> coincida con ningún atajo activo en ese momento. Sigue siendo buena práctica que una tecla
> imprimible sea condicional al contexto (`activo`) o tenga su propio listener si hace falta
> más control fino, pero la razón ya no es "si no, la tecla deja de poderse teclear en TODA la
> pantalla" (así funcionaba antes) — con el código actual el bloqueo es exactamente por la
> tecla que sí tiene manejador, no por todas.
>
> Todo lo demás que `design-guidelines.md` §7 dice sobre atajos (la tecla se escribe en el
> botón, `↑`/`↓` mueven el foco y no el valor, el mapa se desactiva con `activo=false` detrás
> de un modal, orden de modificadores Ctrl→Alt→Shift) sigue vigente y no tiene drift.

---

## 4. Patrones nuevos

Cuatro pautas que ni `design-guidelines.md` ni el código documentaban todavía, porque hasta
ahora ningún área las necesitaba.

### 4.1 Acceso por PIN

Pantalla de entrada de un solo propósito, para un cajero de pie con las manos ocupadas.

- **Teclado numérico grande en pantalla**, dispuesto 3×4 (`1 2 3` / `4 5 6` / `7 8 9` /
  `Borrar 0 Entrar`), como complemento al teclado físico — no en su lugar: quien tiene
  teclado sigue pudiendo escribir el PIN con las teclas numéricas.
- Cada tecla del panel es un botón real (nunca un `<div onClick>`), con `min-height: 44px` y
  `min-width: 44px` **siempre**, no solo bajo `pointer: coarse` — esta pantalla se opera tanto
  con mouse/teclado en el escritorio de la caja como con el dedo en una tablet, y en las dos
  el blanco tiene que ser generoso porque el error de tecleo cuesta un reintento completo.
  Radio 8 (mismo token que cualquier botón), `gap: 8` entre teclas.
- El PIN se enmascara mientras se teclea: puntos rellenos (`●`) en vez de dígitos, del mismo
  tamaño que la tecla que los generó, para dar retroalimentación de "cuántos dígitos llevo"
  sin exponer el valor a quien mire por encima del hombro (cajero al lado, cliente frente al
  mostrador).
- Un PIN incorrecto no cierra el flujo ni redirige: limpia los puntos, sacude sutilmente el
  indicador (misma familia de animación que `s.errorBox`, `0.15s ease-out`) y muestra el
  mensaje de error en el lugar donde iban los puntos — nunca en un `alert()`/modal que tape el
  teclado numérico, porque el siguiente intento es inmediato.
- Recordar la decisión de producto ya tomada (`PLAN-MEJORAS.md` §2): el PIN es control de
  disciplina y auditoría, **no** una barrera de seguridad. La pantalla no debe comunicar una
  falsa sensación de "caja fuerte" (sin candados, sin cuenta regresiva amenazante); el tono es
  operativo, igual que el resto de la app.
- Bloqueo por inactividad (cuando llegue, ola 8): reutiliza el MISMO componente de teclado
  numérico, no una variante — es la misma tarea ("dame el PIN de quien va a operar ahora"),
  solo que aparece sobre la pantalla congelada en vez de al arrancar.

### 4.2 Módulo al que el usuario no tiene permiso

`design-guidelines.md` no fija un criterio para esto porque hoy no hay permisos. **Criterio
elegido, a falta de uno previo: se OCULTA, no se deshabilita.**

- El ítem del módulo simplemente no aparece en el menú lateral (`nav`) para quien no tiene el
  permiso — ni atenuado, ni con candado, ni con tooltip de "no autorizado". Un menú más corto
  es más rápido de escanear para quien sí puede operar los módulos que quedan, y un ítem
  visible-pero-bloqueado es una invitación a probar que no vale la pena atender.
- El atajo `Alt+N` de un módulo oculto **no debe hacer nada** (no cambia de pantalla) — ver la
  advertencia equivalente en la tarea que introduce el registro de módulos: filtrar por
  permiso también filtra el mapa de atajos, no solo el render del `<nav>`.
- Si un enlace profundo o un estado persistido (`localStorage`) apunta a un módulo que el
  usuario ya no puede ver, la app cae al módulo por defecto (Ventas) sin mensaje de error —
  es un caso de configuración cambiada, no un error del usuario.
- Excepción explícita: dentro de una pantalla ya permitida, una ACCIÓN puntual sin permiso
  (por ejemplo "Modificar" en un ticket de Ventas para quien no tiene el permiso de editar)
  **sí se deshabilita en vez de ocultarse**, porque ocultar un botón que el resto del equipo
  usa todo el tiempo rompe la memoria muscular de quien SÍ puede usarlo cuando cambia de
  usuario en el mismo puesto (cambio rápido de usuario, ola 8). La regla depende de la
  granularidad: módulo completo → oculto; acción dentro de un módulo que uno ya ve →
  deshabilitado con motivo (`title`/mensaje) de por qué.

### 4.3 Sub-pestañas dentro de un módulo

Molde real: `packages/ui/src/pantallas/ConsultaFacturas.tsx:308-341`. Envuelve **Facturas
cobradas** y **Cotizaciones** en una sola pantalla con pestañas — decisión tomada a propósito
para no sumar un décimo ítem al menú lateral, que habría roto el esquema de atajos `Alt+1..9`
(ver la nota en el propio archivo, línea 308-310).

- `useState` local a la pantalla (`"facturas" | "cotizaciones"`), nunca en la URL ni en el
  estado global: es un detalle de esa pantalla, no de navegación de la app.
- Grupo de botones tipo píldora (`borderRadius: 999`), `gap: 6`, cada uno con su icono
  (`lucide-react`, 15px) + etiqueta. La pestaña activa toma el mismo tratamiento visual que
  cualquier estado "seleccionado/activo" del sistema: fondo `c.azulClaro`, texto
  `c.azulOscuro`, borde `1px solid c.azul`, `fontWeight: 600` — el mismo triplete de tokens
  que ya usa el ítem de navegación activo (`c.azulClaro`/`c.azulOscuro`/`c.azul` en
  `AppShell.tsx`), para que "esto está seleccionado" se lea igual en toda la app sea cual sea
  el nivel de navegación.
- El contenido de cada pestaña es un componente propio y completo (`FacturasCobradas`,
  `ConsultaCotizaciones`), montado condicionalmente — no una pestaña ocultando con CSS al
  otro: así cada una gestiona su propio `useEffect`/carga de datos sin interferir con la otra.
- Usar este patrón cuando dos pantallas comparten módulo y atajo de navegación por escasez de
  espacio en el menú (9 ítems, `Alt+1..9`) y su contenido es lo bastante afín para convivir en
  un solo módulo — no como sustituto general de "tengo muchas pantallas y no sé dónde
  ponerlas".

### 4.4 Página compuesta de secciones independientes

Molde real: `packages/ui/src/pantallas/Configuracion.tsx` (`SeccionImpresoraTermica`,
`SeccionSecuenciasNcf`, el bloque de "Respaldo y exportación" en línea, `SeccionBitacora`,
apiladas entre las líneas ~150–167).

- Cada sección es su **propio componente**, con su propio estado y su propia lógica de
  guardado/acción — nunca un único formulario gigante con un solo botón "Guardar" al final.
  La sección de datos generales del negocio SÍ tiene su propio `s.formFooter` con
  "Guardar configuración"; las demás (impresora, NCF, respaldo, bitácora) actúan de inmediato
  sobre su propio control, sin depender de un guardado global.
- Todas envueltas en `s.tarjeta` (radio 12, `padding: 18`, `boxShadow: sombra.sm`), apiladas
  verticalmente con `marginTop: 16` entre una y la siguiente — mismo espaciado que separa
  cualquier otro par de tarjetas en la app.
- Encabezado de sección: `h3` con icono de `lucide-react` (18px) + texto, igual que el
  encabezado de cualquier tarjeta (`design-guidelines.md` §5, tamaños de icono).
  Un párrafo corto de contexto en `c.gris`/13px antes del control, cuando la sección lo
  necesita (p. ej. "Descarga toda la información del negocio… en un archivo JSON" antes del
  botón de exportar).
- Usar este patrón para cualquier pantalla que agrupe configuraciones o utilidades
  heterogéneas sin un flujo secuencial entre ellas (a diferencia de un formulario de alta,
  donde los campos sí dependen unos de otros). Es el molde correcto para **Panel** del
  backoffice (ola 8): enlaces a pantallas de gestión que ya existen, cada uno en su propia
  tarjeta, sin reimplementarlas.

---

## 5. Iconografía

Todos los iconos son de `lucide-react`. **Nunca emojis como icono** — ni siquiera como
alternativa provisional. `aria-hidden="true"` en el icono; el nombre accesible va en el texto
visible o en `aria-label` del control que lo contiene. Tamaños por contexto en
[`design-guidelines.md` §5](./design-guidelines.md#5-componentes) (16 en línea con texto de
14, 18 en título de tarjeta, 20–22 en título de módulo/modal, 14 en controles compactos, 15
en pestañas del patrón §4.3 de este documento).

---

## 6. Cómo se relaciona esto con el resto del repo

- `packages/00-CONVENCIONES.md` §5 ya fija la regla de comentarios (cabecera por archivo,
  cero decorativos) y "todo en español" — se aplican igual a cualquier componente construido
  a partir de este documento.
- Antes de escribir una pantalla nueva, repasar también el checklist de
  `design-guidelines.md` (final del archivo): iconos con `aria-hidden`, foco visible,
  `prefers-reduced-motion` respetado, y los tres anchos de verificación de la sección 2 de
  este archivo.
