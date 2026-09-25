/**
 * Catálogo único de permisos, roles y contrato de sesión (§ RBAC-02, ola 1).
 *
 * DECISIÓN DE CONVENCIONES (`plan/00-CONVENCIONES.md` §3): tres tareas de tres áreas
 * distintas iban a escribir un módulo de permisos con vocabularios de rol
 * incompatibles (RBAC: cajero|supervisor|dueno|superadmin; PLATAFORMA: admin|cajero;
 * BACKOFFICE: dueno|admin|superadmin). Gana este archivo, con los cuatro roles de
 * RBAC congelados. No existe `packages/core/src/seguridad/`: cualquier módulo que
 * hable de permisos importa de aquí.
 *
 * `RolUsuario` se declara AQUÍ (no en `repos/tipos.ts`) porque `usuario-repo.ts`
 * (RBAC-01) todavía no existe: esta tarea no puede depender de una tarea que se
 * despacha después. `repos/tipos.ts` reexporta el tipo para que RBAC-01 lo consuma
 * sin redefinirlo.
 *
 * El catálogo `Permiso` se derivó por grep de los sitios reales que llaman a
 * `registrarAccion(` en `packages/core/src/repos/*.ts` (producto, cliente,
 * proveedor, compra, corte de caja, devolución y factura) y de los módulos reales
 * del array `MODULOS` de `packages/ui/src/AppShell.tsx`, no de ningún documento de
 * planificación — un borrador previo nombraba `descuentos` y `anular`, y ninguno de
 * los dos corresponde a una acción que exista hoy en el código.
 *
 * `permisos_json` en la tabla `usuario` guarda SOLO EXCEPCIONES sobre el default del
 * rol (`{ "producto.editar": true }` concede, `{ "compra.registrar": false }` quita),
 * nunca la lista completa: así, cambiar mañana los permisos por defecto de un rol no
 * queda congelado en filas viejas de la base.
 *
 * Criterio de `puedeVerBackoffice` (BACKOFFICE-05 todavía no existe, así que este
 * archivo fija el criterio con el que esa tarea tendrá que ser consistente): ve el
 * panel de dueño quien tiene `personal.gestionar` O visibilidad del módulo
 * "Reportes" — ambos son señales de "administra el negocio", no solo "opera la
 * caja". Un cajero o supervisor no tiene ninguno de los dos por defecto.
 */

export type RolUsuario = "cajero" | "supervisor" | "dueno" | "superadmin";

export type Permiso =
  | "modulo.ventas"
  | "modulo.productos"
  | "modulo.clientes"
  | "modulo.facturas"
  | "modulo.compras"
  | "modulo.corte_caja"
  | "modulo.reportes"
  | "modulo.promociones"
  | "modulo.configuracion"
  | "producto.eliminar"
  | "producto.ajustar_existencia"
  | "producto.editar"
  | "cliente.eliminar"
  | "proveedor.eliminar"
  | "compra.registrar"
  | "caja.abrir"
  | "caja.cerrar"
  | "devolucion.registrar"
  | "factura.eliminar"
  | "factura.cobrar"
  | "reporte.ganancia"
  | "personal.gestionar";

/**
 * Nombre del módulo de AppShell.tsx que corresponde a cada permiso de visibilidad.
 * `producto.editar` no tiene módulo propio (Productos ya se ve con `modulo.productos`);
 * existe aparte porque el guardia real vive en `productoRepo.actualizar`, no en un
 * botón: hoy cualquiera con acceso a Ventas abre el formulario completo del producto
 * y le cambia costo y precio desde ahí (ver RBAC-04).
 */
const MODULO_POR_PERMISO: ReadonlyMap<Permiso, string> = new Map([
  ["modulo.ventas", "Ventas"],
  ["modulo.productos", "Productos"],
  ["modulo.clientes", "Clientes"],
  ["modulo.facturas", "Facturas"],
  ["modulo.compras", "Compras"],
  ["modulo.corte_caja", "Corte de caja"],
  ["modulo.reportes", "Reportes"],
  ["modulo.promociones", "Promociones"],
  ["modulo.configuracion", "Configuración"],
]);

export const PERMISOS: readonly Permiso[] = [
  "modulo.ventas",
  "modulo.productos",
  "modulo.clientes",
  "modulo.facturas",
  "modulo.compras",
  "modulo.corte_caja",
  "modulo.reportes",
  "modulo.promociones",
  "modulo.configuracion",
  "producto.eliminar",
  "producto.ajustar_existencia",
  "producto.editar",
  "cliente.eliminar",
  "proveedor.eliminar",
  "compra.registrar",
  "caja.abrir",
  "caja.cerrar",
  "devolucion.registrar",
  "factura.eliminar",
  "factura.cobrar",
  "reporte.ganancia",
  "personal.gestionar",
];

const PERMISOS_CAJERO: readonly Permiso[] = ["modulo.ventas", "factura.cobrar", "caja.abrir"];

const PERMISOS_SUPERVISOR: readonly Permiso[] = [
  ...PERMISOS_CAJERO,
  "modulo.compras",
  "modulo.corte_caja",
  "compra.registrar",
  "caja.cerrar",
  "devolucion.registrar",
];

/**
 * El dueño tiene "prácticamente todo" (pedido del cliente) salvo `personal.gestionar`
 * de forma explícita en esta lista aparte, para que el permiso quede visible como
 * la pieza que distingue al dueño del supervisor, y no enterrado en un spread.
 */
const PERMISOS_DUENO: readonly Permiso[] = [
  ...PERMISOS_SUPERVISOR,
  "modulo.productos",
  "modulo.clientes",
  "modulo.facturas",
  "modulo.reportes",
  "modulo.promociones",
  "modulo.configuracion",
  "producto.eliminar",
  "producto.ajustar_existencia",
  "producto.editar",
  "cliente.eliminar",
  "proveedor.eliminar",
  "factura.eliminar",
  "reporte.ganancia",
  "personal.gestionar",
];

export function permisosDeRol(rol: RolUsuario): ReadonlySet<Permiso> {
  switch (rol) {
    case "cajero":
      return new Set(PERMISOS_CAJERO);
    case "supervisor":
      return new Set(PERMISOS_SUPERVISOR);
    case "dueno":
      return new Set(PERMISOS_DUENO);
    case "superadmin":
      return new Set(PERMISOS);
  }
}

function esPermiso(clave: string): clave is Permiso {
  return (PERMISOS as readonly string[]).includes(clave);
}

/**
 * Aplica las excepciones de `permisos_json` sobre el default del rol. Un JSON que no
 * parsea NO se traga en silencio (CLAUDE.md prohíbe catch vacío): se avisa por
 * `alAvisar` y se devuelven los permisos del rol sin ninguna excepción aplicada, en
 * vez de lanzar y tumbar el flujo de quien solo quería saber qué puede hacer.
 */
export function resolverPermisos(
  usuario: { rol: RolUsuario; permisos_json: string | null },
  alAvisar?: (mensaje: string) => void,
): ReadonlySet<Permiso> {
  const base = new Set(permisosDeRol(usuario.rol));
  if (!usuario.permisos_json) return base;

  let excepciones: Record<string, boolean>;
  try {
    excepciones = JSON.parse(usuario.permisos_json) as Record<string, boolean>;
  } catch {
    alAvisar?.(
      `permisos_json no es JSON válido para el rol '${usuario.rol}'; se aplican solo los permisos por defecto del rol.`,
    );
    return base;
  }

  for (const [clave, concedido] of Object.entries(excepciones)) {
    if (!esPermiso(clave)) continue;
    if (concedido) base.add(clave);
    else base.delete(clave);
  }
  return base;
}

export function modulosPermitidos(permisos: ReadonlySet<Permiso>): string[] {
  const modulos: string[] = [];
  for (const [permiso, modulo] of MODULO_POR_PERMISO) {
    if (permisos.has(permiso)) modulos.push(modulo);
  }
  return modulos;
}

export function puedeVerBackoffice(permisos: ReadonlySet<Permiso>): boolean {
  return permisos.has("personal.gestionar") || permisos.has("modulo.reportes");
}

/**
 * Contrato de sesión (RBAC-04 lo implementa; aquí solo se declara para que la UI y
 * las tareas de otras áreas puedan construir contra él sin esperar). `PermisoError`
 * sigue el mismo patrón que `ValidacionError` de `producto-repo.ts` (clase exportada,
 * sin dependencia circular, mensaje legible para mostrar en la UI).
 */
export interface PortadorSesion {
  usuarioId: string | null;
  rol: RolUsuario;
  permisos: ReadonlySet<Permiso>;
}

export interface SesionRepo {
  obtenerActual(): PortadorSesion | null;
}

export class PermisoError extends Error {
  constructor(public permiso: Permiso) {
    super(`No tiene permiso para realizar esta acción: '${permiso}'.`);
    this.name = "PermisoError";
  }
}

/**
 * Sesión por defecto que reproduce el comportamiento actual en instalaciones sin login
 * (§ PLATAFORMA-07, ola 2): rol `superadmin` con todos los permisos, para no bloquear
 * ningún módulo ni acción hasta que RBAC-04 (guardia en los repos) y RBAC-05 (proveedor
 * de sesión real con pantalla de acceso por PIN) traigan usuarios reales. `useSesion()`
 * de `packages/ui/src/sesion/contexto.tsx` usa este valor como default del contexto, y
 * `crearRepos(db)` de `packages/core/src/repos/index.ts` NO la consume todavía: ningún
 * repo acepta sesión hasta RBAC-04.
 */
export const SESION_LOCAL: PortadorSesion = {
  usuarioId: null,
  rol: "superadmin",
  permisos: new Set(PERMISOS),
};

const PERMISOS_SOLO_EN_CAJA: readonly Permiso[] = [
  "modulo.ventas",
  "factura.cobrar",
  "caja.abrir",
  "caja.cerrar",
  "devolucion.registrar",
  "personal.gestionar",
];

export const SESION_COPIA_REMOTA: PortadorSesion = {
  usuarioId: null,
  rol: "dueno",
  permisos: new Set(PERMISOS.filter((p) => !PERMISOS_SOLO_EN_CAJA.includes(p))),
};
