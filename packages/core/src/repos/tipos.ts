export * from "./tipos/index.js";

/** RolUsuario se declara en dominio/permisos.ts (RBAC-02); se reexporta aquí para que
 *  RBAC-01 (usuario-repo.ts) lo consuma sin redefinirlo. */
export type { RolUsuario } from "../dominio/permisos.js";
