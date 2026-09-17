import type { Migration } from "./tipos.js";

/**
 * Banda 20-29 (RBAC — usuarios, roles y permisos). id 20: tabla satélite
 * `usuario_seguridad` (control de acceso: intentos fallidos, bloqueo,
 * último acceso) y normalización de `usuario.rol` de 'admin' a 'dueno'.
 *
 * NO se recrea `usuario` ni se le agrega ningún CHECK: SQLite no soporta
 * ALTER TABLE ADD CONSTRAINT, y recrearla reventaría las FK de factura,
 * corte_caja, cotizacion, movimiento_inventario y bitacora_accion en
 * instalaciones reales (los tres drivers corren con
 * PRAGMA foreign_keys = ON). El rol se valida en TypeScript
 * (usuario-repo.validarUsuario), no en el esquema.
 *
 * Dos statements, cada uno idempotente por separado (§00-CONVENCIONES §1.3:
 * el migrador no envuelve en transacción y registra en `_migracion` DESPUÉS
 * de aplicar, así que un fallo a mitad de camino reintenta el bloque
 * completo desde el primer statement): CREATE TABLE IF NOT EXISTS, y un
 * UPDATE que después de correr una vez ya no matchea ninguna fila. Cero
 * `;` dentro de literales o comentarios — el driver de escritorio parte el
 * SQL por ';' a ciegas (tauri-sql-driver.ts:17-22).
 */
export const migracionesRbac: Migration[] = [
  {
    id: 20,
    nombre: "usuarios-seguridad",
    sql: /* sql */ `
      CREATE TABLE IF NOT EXISTS usuario_seguridad (
        usuario_id         TEXT PRIMARY KEY REFERENCES usuario(id),
        ultimo_acceso      TEXT,
        intentos_fallidos  INTEGER NOT NULL DEFAULT 0,
        bloqueado_hasta    TEXT,
        pin_actualizado_at TEXT,
        created_at         TEXT NOT NULL,
        updated_at         TEXT NOT NULL
      );
      UPDATE usuario SET rol = 'dueno' WHERE rol = 'admin';
    `,
  },
];
