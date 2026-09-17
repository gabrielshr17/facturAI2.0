/**
 * Registro único de fábricas de repos (§ PLATAFORMA-07, ola 2).
 *
 * Antes, `packages/ui/src/data/contexto.tsx` enumeraba los ~18 repos a mano en DOS
 * sitios (la interfaz `Repos` y el cuerpo de `ProveedorDatos`), y nueve tareas de seis
 * áreas distintas (CRM-03, CRM-06, COMPRAS-04, COMPRAS-05, MULTICAJA-02, CAJA-03,
 * RBAC-03, BACKOFFICE-07) iban a añadir su repo ahí. A partir de ahora cada área añade
 * UNA línea a este objeto — no toca `crearRepos` (`./index.ts`) ni `ProveedorDatos`.
 *
 * `proveedorFiscal` (§ fiscal/proveedor.ts) queda FUERA de este registro a propósito:
 * su fábrica no toma `SqlDriver`, así que mezclarla aquí obligaría a que todas las
 * entradas tuvieran una firma opcional. `crearRepos` la añade aparte.
 *
 * Ningún repo de aquí acepta todavía la sesión activa — eso es RBAC-04, sobre
 * `packages/core/src/db/sesion.ts` (sesión pegada al driver, no un segundo parámetro
 * en cada fábrica: ver `plan/00-CONVENCIONES.md` §3, "Sesión pegada al driver").
 */
import type { SqlDriver } from "../db/driver.js";
import { crearProductoRepo } from "./producto-repo.js";
import { crearClienteRepo } from "./cliente-repo.js";
import { crearDepartamentoRepo } from "./departamento-repo.js";
import { crearNegocioRepo } from "./negocio-repo.js";
import { crearFacturaRepo } from "./factura-repo.js";
import { crearSecuenciaNcfRepo } from "./secuencia-ncf-repo.js";
import { crearComprobanteFiscalRepo } from "./comprobante-fiscal-repo.js";
import { crearCorteCajaRepo } from "./corte-caja-repo.js";
import { crearMovimientoInventarioRepo } from "./movimiento-inventario-repo.js";
import { crearProveedorRepo } from "./proveedor-repo.js";
import { crearCompraRepo } from "./compra-repo.js";
import { crearComprobanteArchivoRepo } from "./comprobante-archivo-repo.js";
import { crearBitacoraRepo } from "./bitacora-repo.js";
import { crearDevolucionRepo } from "./devolucion-repo.js";
import { crearReportesRepo } from "./reportes-repo.js";
import { crearPromocionRepo } from "./promocion-repo.js";
import { crearBackupRepo } from "./backup-repo.js";
import { crearCotizacionRepo } from "./cotizacion-repo.js";

export const REGISTRO_REPOS = {
  producto: crearProductoRepo,
  cliente: crearClienteRepo,
  departamento: crearDepartamentoRepo,
  negocio: crearNegocioRepo,
  factura: crearFacturaRepo,
  secuenciaNcf: crearSecuenciaNcfRepo,
  comprobanteFiscal: crearComprobanteFiscalRepo,
  corteCaja: crearCorteCajaRepo,
  movimientoInventario: crearMovimientoInventarioRepo,
  proveedor: crearProveedorRepo,
  compra: crearCompraRepo,
  comprobanteArchivo: crearComprobanteArchivoRepo,
  bitacora: crearBitacoraRepo,
  devolucion: crearDevolucionRepo,
  reportes: crearReportesRepo,
  promocion: crearPromocionRepo,
  backup: crearBackupRepo,
  cotizacion: crearCotizacionRepo,
} as const satisfies Record<string, (db: SqlDriver) => unknown>;
