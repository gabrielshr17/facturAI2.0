export type OrigenAccion = "app" | "chatbot";

/** Registro append-only de "quién y cuándo" (§ Caja y auditoría). No es una entidad sincronizable editable. */
export interface BitacoraAccion {
  id: string;
  usuario_id: string | null;
  origen: OrigenAccion;
  accion: string;
  entidad: string;
  entidad_id: string | null;
  resumen: string | null;
  confirmada: number; // 0 | 1
  timestamp: string;
}
