/**
 * Interruptores de UI para funciones que ya tienen código real (no son
 * stubs) pero dependen de configuración externa que todavía no está lista
 * para el usuario final: el chatbot necesita `ANTHROPIC_API_KEY` en
 * packages/api, y el e-CF/NCF necesita secuencias cargadas por la DGII. Sin
 * esa configuración, ambas fallan de forma visible (un error 501 o un
 * cobro rechazado) en vez de simplemente no existir. Estas banderas ocultan
 * el punto de entrada en la UI para que nadie llegue a esos flujos hasta
 * que la configuración esté lista — no se borró ningún código, solo se
 * dejó de renderizar.
 */
export const FUNCIONES_EN_DESARROLLO = {
  chatbot: false,
  fiscal: false,
} as const;
