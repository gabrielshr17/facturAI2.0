import type { Auditoria } from "./comun.js";

export interface Departamento extends Auditoria {
  id: string;
  nombre: string;
  activo: number; // 0 | 1
}
