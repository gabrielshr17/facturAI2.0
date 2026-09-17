import type { RolUsuario } from "../../dominio/permisos.js";
import type { Auditoria } from "./comun.js";

/**
 * `RolUsuario` se importa de `dominio/permisos.js` (RBAC-02), no se redeclara
 * aquí: ese archivo ganó la colisión de tres áreas sobre el vocabulario de
 * rol (§00-CONVENCIONES §3, "Catálogo único de permisos..."). A propósito
 * SIN `pin_hash`: el repo nunca lo devuelve fuera de `autenticar`/
 * `cambiarPin`, donde se lee a una variable local que no sale del repo (ver
 * usuario-repo.ts). Exponerlo aquí habría sido la forma más fácil de que un
 * futuro `listar()` lo filtrara de vuelta por accidente.
 */
export interface Usuario extends Auditoria {
  id: string;
  nombre: string;
  rol: RolUsuario;
  activo: number; // 0 | 1
  permisos_json: string | null;
}

/**
 * Tabla satélite (migración 20, banda 20-29): control de acceso separado de
 * los datos de identidad para que `usuario-repo.listar()` pueda seguir
 * haciendo `SELECT` sobre columnas planas de `usuario` sin arrastrar el
 * estado de bloqueo/intentos en cada fila.
 */
export interface UsuarioSeguridad {
  usuario_id: string;
  ultimo_acceso: string | null;
  intentos_fallidos: number;
  bloqueado_hasta: string | null;
  pin_actualizado_at: string | null;
}
