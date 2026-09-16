import type { Auditoria } from "./comun.js";

export interface Cliente extends Auditoria {
  id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  comentarios: string | null;
  aplica_credito: number; // 0 | 1
  limite_credito: number;
  saldo_credito: number;
  documento_tipo: "rnc" | "cedula" | null;
  documento_numero: string | null;
}
