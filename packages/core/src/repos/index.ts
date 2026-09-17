/**
 * `crearRepos(db)` compone el objeto de repos que consume `packages/ui/src/data/contexto.tsx`
 * a partir de `REGISTRO_REPOS` (`./registro.js`), para que ningún área tenga que volver a
 * editar la lista de 18+ repos a mano. `proveedorFiscal` se añade aparte porque su fábrica no
 * toma `SqlDriver` (§ registro.ts). El único `as Repos` de este archivo existe porque
 * `Object.fromEntries` no puede inferir un tipo más preciso que `Record<string, unknown>`
 * a partir de un `Object.entries` en tiempo de ejecución: el tipo `Repos` (mapeado 1 a 1
 * desde `REGISTRO_REPOS`) es la fuente de verdad, no el cast.
 */
import type { SqlDriver } from "../db/driver.js";
import { crearProveedorFiscalSimulado, type ProveedorFiscal } from "../fiscal/proveedor.js";
import { REGISTRO_REPOS } from "./registro.js";

export type Repos = {
  [K in keyof typeof REGISTRO_REPOS]: ReturnType<(typeof REGISTRO_REPOS)[K]>;
} & {
  /**
   * *** SIMULADO — no transmite nada real a la DGII. *** Placeholder hasta decidir PAC vs
   * integración directa. Sustituir aquí por la implementación real cuando esté disponible.
   */
  proveedorFiscal: ProveedorFiscal;
};

export function crearRepos(db: SqlDriver): Repos {
  const entradas = Object.entries(REGISTRO_REPOS) as Array<
    [keyof typeof REGISTRO_REPOS, (db: SqlDriver) => unknown]
  >;
  const repos = Object.fromEntries(entradas.map(([nombre, fabrica]) => [nombre, fabrica(db)]));
  return { ...repos, proveedorFiscal: crearProveedorFiscalSimulado() } as Repos;
}

export { REGISTRO_REPOS } from "./registro.js";
export * from "./tipos.js";
export {
  crearProductoRepo,
  validarProducto,
  ValidacionError,
  type ProductoInput,
  type ProductoRepo,
} from "./producto-repo.js";
export {
  crearClienteRepo,
  validarCliente,
  type ClienteInput,
  type ClienteRepo,
} from "./cliente-repo.js";
export {
  crearDepartamentoRepo,
  type DepartamentoRepo,
} from "./departamento-repo.js";
export {
  crearNegocioRepo,
  validarNegocio,
  type NegocioInput,
  type NegocioRepo,
} from "./negocio-repo.js";
export {
  crearFacturaRepo,
  type AbrirTicketInput,
  type AgregarLineaInput,
  type SincronizarPrecioProductoInput,
  type FiltroFacturasCobradas,
  type FacturaRepo,
} from "./factura-repo.js";
export {
  crearSecuenciaNcfRepo,
  UMBRAL_BAJO,
  type SecuenciaNcfInput,
  type SecuenciaNcfRepo,
} from "./secuencia-ncf-repo.js";
export {
  crearComprobanteFiscalRepo,
  type CrearComprobanteInput,
  type ComprobanteFiscalRepo,
} from "./comprobante-fiscal-repo.js";
export {
  crearCorteCajaRepo,
  type ResumenPeriodoVentas,
  type RegistrarCorteInput,
  type CorteCajaRepo,
} from "./corte-caja-repo.js";
export {
  crearMovimientoInventarioRepo,
  type MovimientoInventarioRepo,
} from "./movimiento-inventario-repo.js";
export {
  crearProveedorRepo,
  validarProveedor,
  type ProveedorInput,
  type ProveedorRepo,
} from "./proveedor-repo.js";
export {
  crearCompraRepo,
  type LineaCompraInput,
  type CompraInput,
  type CompraRepo,
} from "./compra-repo.js";
export {
  crearComprobanteArchivoRepo,
  type CrearComprobanteArchivoInput,
  type ComprobanteArchivoRepo,
} from "./comprobante-archivo-repo.js";
export {
  crearBitacoraRepo,
  registrarAccion,
  type RegistrarAccionInput,
  type FiltroBitacora,
  type BitacoraRepo,
} from "./bitacora-repo.js";
export {
  crearDevolucionRepo,
  prepararDevolucion,
  type LineaDevolucionInput,
  type DevolucionInput,
  type DevolucionRepo,
} from "./devolucion-repo.js";
export {
  crearReportesRepo,
  type VentaPorDia,
  type ProductoVendido,
  type ResumenGanancia,
  type ResumenItbis,
  type ResumenPorMetodo,
  type ReportesRepo,
} from "./reportes-repo.js";
export {
  crearPromocionRepo,
  type PromocionInput,
  type PromocionRepo,
} from "./promocion-repo.js";
export {
  crearBackupRepo,
  type RespaldoCompleto,
  type BackupRepo,
} from "./backup-repo.js";
export {
  crearCotizacionRepo,
  type LineaCotizacionInput,
  type CrearCotizacionInput,
  type FiltroCotizaciones,
  type CotizacionRepo,
} from "./cotizacion-repo.js";
