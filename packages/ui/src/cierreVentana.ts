/**
 * Punto de conexión entre `ui` (agnóstico de plataforma) y el cierre real de la
 * ventana, que solo existe en el escritorio (Tauri) — mismo patrón que
 * `impresion/termica.ts` (`configurarAdaptadorImpresora`), pero en la dirección
 * CONTRARIA: ahí `ui` llama hacia afuera cuando necesita imprimir; acá es la
 * PLATAFORMA la que llama hacia adentro cuando el usuario intenta cerrar la
 * ventana, porque quien sabe si hace falta pedir el arqueo antes de dejar
 * cerrar es `AppShell` (dueño del turno/la sesión), no el escritorio.
 *
 * La PWA (`@sfr/web`) nunca registra un manejador — cerrar una pestaña de
 * navegador no se puede interceptar de forma confiable de todas formas — así
 * que `ejecutarManejadorCierreVentana` sin nadie registrado deja cerrar.
 */
export type ManejadorCierreVentana = () => Promise<"cerrar" | "cancelar">;

let manejador: ManejadorCierreVentana | null = null;

/** `AppShell` lo llama mientras está montado (un `useEffect`); la función que
 *  devuelve desregistra, para llamar en el cleanup de ese mismo efecto. */
export function registrarManejadorCierreVentana(fn: ManejadorCierreVentana): () => void {
  manejador = fn;
  return () => {
    if (manejador === fn) manejador = null;
  };
}

/** El escritorio (Tauri) llama esto cuando el usuario intenta cerrar la ventana. */
export async function ejecutarManejadorCierreVentana(): Promise<"cerrar" | "cancelar"> {
  if (!manejador) return "cerrar";
  return manejador();
}
