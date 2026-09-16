/**
 * Tipo compartido por todos los archivos de banda. Vive aparte de migrations.ts
 * para que este archivo no dependa del concatenador (evita el ciclo de imports
 * banda -> migrations.ts -> banda).
 */
export interface Migration {
  id: number;
  nombre: string;
  sql: string;
}
