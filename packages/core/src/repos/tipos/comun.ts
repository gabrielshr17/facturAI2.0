/** Campos de auditoría comunes a todas las entidades sincronizables. */
export interface Auditoria {
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}
