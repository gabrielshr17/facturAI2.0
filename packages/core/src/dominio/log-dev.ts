/**
 * Traducción de logs técnicos (errores/advertencias capturados en runtime) a
 * una oración en español que un desarrollador pueda leer sin abrir DevTools
 * primero. Vive en `@sfr/core` (no en `packages/ui`) porque es pura y
 * testeable, y `packages/ui` no tiene runner de tests (§ convención del repo).
 */
export interface LogDevEntry {
  nivel: "error" | "warn";
  mensaje: string;
  detalle?: string | null;
  timestamp: string;
}

const PATRONES: { patron: RegExp; descripcion: string }[] = [
  {
    patron: /cannot read properties of undefined \(reading 'invoke'\)/i,
    descripcion:
      "La app intentó hablar con la base de datos de Tauri (window.__TAURI__.invoke), pero no está " +
      "disponible en este contexto. Esto pasa si se abre la URL de desarrollo en un navegador normal " +
      "en vez de la ventana de escritorio.",
  },
  {
    patron: /failed to fetch|networkerror/i,
    descripcion: "Fallo de red: la app no pudo completar una petición. Revisa la conexión o si el servidor está disponible.",
  },
  {
    patron: /quotaexceedederror|exceeded the quota/i,
    descripcion: "El almacenamiento local del navegador está lleno. Revisa qué se está guardando en localStorage/IndexedDB.",
  },
];

const GENERICO: Record<LogDevEntry["nivel"], string> = {
  error: "Error inesperado de la aplicación. Revisa el detalle técnico abajo.",
  warn: "Advertencia de la aplicación, sin impacto inmediato conocido. Revisa el detalle técnico abajo.",
};

export function describirLogDev(log: LogDevEntry): string {
  const coincidencia = PATRONES.find((p) => p.patron.test(log.mensaje));
  return coincidencia ? coincidencia.descripcion : GENERICO[log.nivel];
}
