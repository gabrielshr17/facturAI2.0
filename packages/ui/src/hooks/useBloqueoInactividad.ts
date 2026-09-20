import { useCallback, useEffect, useRef, useState } from "react";
import { debeBloquear } from "@sfr/core";

const EVENTOS_ACTIVIDAD = ["mousemove", "mousedown", "keydown", "touchstart", "wheel"] as const;

/** Cada cuánto se revisa si ya pasó el límite. No hace falta más resolución que esto
 *  para un límite pensado en minutos, y una revisión cada 5s no le cuesta nada a la
 *  batería/CPU de un punto de venta que suele estar enchufado. */
const INTERVALO_CHEQUEO_MS = 5_000;

export interface BloqueoInactividadApi {
  /** `true` mientras la pantalla está bloqueada. Solo cambia en las dos transiciones
   *  reales (bloquear/desbloquear) — nunca en cada tick del temporizador. */
  bloqueado: boolean;
  /** Bloquea de inmediato, sin esperar el límite (atajo manual, ej. Ctrl+L). */
  bloquearAhora: () => void;
  /** Desbloquea y reinicia el contador de inactividad desde este instante. */
  desbloquear: () => void;
}

/**
 * Temporizador de inactividad (§ RBAC-07 parte B).
 *
 * TRAMPA CRÍTICA que este hook existe para evitar (documentada en `data/contexto.tsx`
 * y en el brief de la tarea): si el "reloj" de inactividad viviera en un `useState`
 * que se actualiza cada tick, cualquier componente que lo consumiera (o un padre
 * suyo por encima de `<ProveedorDatos>`) se volvería a renderizar cada tick, y con
 * él todo su árbol — reventando la identidad estable de `repos` que `ProveedorDatos`
 * protege con `useMemo`. Por eso:
 *
 * - La última actividad y el propio "¿ya está bloqueado?" viven en `useRef`, no en
 *   estado. Los listeners de mouse/teclado (que disparan en ráfaga) solo escriben el
 *   ref — cero renders por movimiento de mouse.
 * - El único `useState` (`bloqueado`) se actualiza EXCLUSIVAMENTE en las dos
 *   transiciones reales (`bloquearAhora`/`desbloquear`), nunca en el intervalo que
 *   revisa la condición — ese intervalo llama a `debeBloquear` (función pura de
 *   `@sfr/core`, § `dominio/sesion-vigencia.ts`) contra el ref y solo actualiza
 *   estado si la respuesta cambia de "no" a "sí".
 * - La decisión de "cuánto es demasiado" no se reimplementa acá: se invoca
 *   `debeBloquear`, nunca se recalcula la resta de fechas a mano.
 */
export function useBloqueoInactividad(
  limiteMinutos: number,
  habilitado = true,
): BloqueoInactividadApi {
  const ultimaActividadRef = useRef(new Date());
  const bloqueadoRef = useRef(false);
  const [bloqueado, setBloqueado] = useState(false);

  const registrarActividad = useCallback(() => {
    ultimaActividadRef.current = new Date();
  }, []);

  const bloquearAhora = useCallback(() => {
    if (bloqueadoRef.current) return;
    bloqueadoRef.current = true;
    setBloqueado(true);
  }, []);

  const desbloquear = useCallback(() => {
    bloqueadoRef.current = false;
    ultimaActividadRef.current = new Date();
    setBloqueado(false);
  }, []);

  useEffect(() => {
    if (!habilitado || bloqueado) return;
    for (const evento of EVENTOS_ACTIVIDAD)
      window.addEventListener(evento, registrarActividad, { passive: true });
    return () => {
      for (const evento of EVENTOS_ACTIVIDAD)
        window.removeEventListener(evento, registrarActividad);
    };
    // Mientras está bloqueada no tiene sentido seguir registrando actividad: la pantalla
    // solo debe "despertar" cuando `desbloquear()` reinicia el contador a propósito.
  }, [habilitado, bloqueado, registrarActividad]);

  useEffect(() => {
    if (!habilitado) return;
    const id = window.setInterval(() => {
      if (bloqueadoRef.current) return;
      if (debeBloquear(ultimaActividadRef.current, new Date(), limiteMinutos)) {
        bloquearAhora();
      }
    }, INTERVALO_CHEQUEO_MS);
    return () => window.clearInterval(id);
  }, [habilitado, limiteMinutos, bloquearAhora]);

  return { bloqueado, bloquearAhora, desbloquear };
}
