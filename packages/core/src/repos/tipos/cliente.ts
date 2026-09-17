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
  /** Nivel de precio preferido del cliente (§ PRECIOS: "normal" | "especial" | "mayoreo"). */
  nivel_precio: string | null;
  /** JSON con los niveles que este cliente puede usar, si se restringe. */
  niveles_permitidos_json: string | null;
  fecha_nacimiento: string | null;
  /** Días de crédito propios del cliente (§ CRM), si difieren del default del negocio. */
  dias_credito: number | null;
}
