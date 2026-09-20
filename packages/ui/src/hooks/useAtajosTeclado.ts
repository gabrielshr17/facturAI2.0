import { useEffect, useRef } from "react";

type ManejadorAtajo = (e: KeyboardEvent) => void;

/**
 * Mapa de tecla a su acción. Claves como "F1", "F10", "Escape", o con
 * modificador(es): "Ctrl+P" (Ctrl en Windows/Linux, Cmd en Mac), "Alt+1",
 * "Ctrl+Alt+X". El orden de los modificadores en la clave siempre es
 * Ctrl, luego Alt, luego Shift (ver `normalizarTecla`).
 */
export type MapaAtajos = Record<string, ManejadorAtajo>;

/** Shift ya va "horneado" en `e.key` para símbolos: en un teclado US, Shift+"=" produce
 *  `e.key === "+"`, no "=". Sumar "Shift" al nombre ahí también lo contaría dos veces — un atajo
 *  registrado como "+" (p.ej. sumar cantidad en Ventas) nunca matchearía en la fila principal del
 *  teclado, solo desde el "+" del numérico (que no necesita Shift). Shift sí importa para letras
 *  (mayúscula intencional), así que ahí sigue agregándose. */
function normalizarTecla(e: KeyboardEvent): string {
  const partes: string[] = [];
  if (e.ctrlKey || e.metaKey) partes.push("Ctrl");
  if (e.altKey) partes.push("Alt");
  const esLetra = e.key.length === 1 && /[a-zA-Z]/.test(e.key);
  if (e.shiftKey && esLetra) partes.push("Shift");
  const tecla = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  partes.push(tecla);
  return partes.join("+");
}

/**
 * Interruptor global de TODOS los mapas de atajos registrados con este hook (§ RBAC-07
 * parte B, bloqueo de sesión por inactividad). Vive como variable de módulo, NO como
 * estado de React ni como contexto: si fuera estado/contexto, prenderlo/apagarlo
 * volvería a renderizar cada pantalla que llama a `useAtajosTeclado` (decenas, ver
 * `AppShell.tsx`, `Ventas.tsx`, `Compras.tsx`, etc.), justo el bucle de re-render que
 * PLATAFORMA-07/RBAC-07 vienen documentando para `ProveedorDatos`. Al ser una variable
 * de módulo, el chequeo ocurre DENTRO del handler de `keydown` en el momento en que se
 * presiona una tecla — nunca dispara un render por sí solo.
 *
 * Es el MISMO mecanismo `activo` que ya recibía este hook por parámetro, no uno nuevo:
 * la condición final para ejecutar un atajo es `activo (por llamador) Y NO bloqueado
 * (global)`. `BloqueoInactividad.tsx` es el único componente que debe llamar a
 * `establecerBloqueoGlobalAtajos`, justo en las dos transiciones (bloquear/desbloquear).
 * La entrada de PIN del propio modal de bloqueo NO pasa por este hook (usa su propio
 * `window.addEventListener("keydown", ...)`, igual que `CambioRapidoUsuario.tsx` y
 * `Acceso.tsx`), así que sigue funcionando mientras el resto de la app está bloqueada.
 */
let bloqueadoGlobal = false;

export function establecerBloqueoGlobalAtajos(bloqueado: boolean): void {
  bloqueadoGlobal = bloqueado;
}

/**
 * Registra atajos de teclado globales (teclas de función, Esc, Ctrl+letra,
 * etc.) mientras el componente esté montado. `activo` permite desactivar el
 * mapa sin desmontar (ej. una pantalla detrás de un modal que usa las mismas
 * teclas).
 */
export function useAtajosTeclado(mapa: MapaAtajos, activo = true) {
  const mapaRef = useRef(mapa);
  mapaRef.current = mapa;

  useEffect(() => {
    if (!activo) return;
    function onKeyDown(e: KeyboardEvent) {
      if (bloqueadoGlobal) return;
      const manejador = mapaRef.current[normalizarTecla(e)];
      if (!manejador) return;
      e.preventDefault();
      manejador(e);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activo]);
}
