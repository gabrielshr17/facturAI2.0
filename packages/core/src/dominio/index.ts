export { redondear2, ajustarCentavo, calcularCambio, sumar } from "./dinero.js";
export { type ImpuestoTipo, TASA_POR_TIPO, tasaDe } from "./impuesto.js";
export {
  type CalculoPrecioInput,
  type NivelPrecio,
  precioBaseDesdeCosto,
  calcularPrecioVenta,
  pctGananciaDesdePrecio,
  precioTierDesdeCosto,
  MARGEN_NIVEL_2_PCT,
  MARGEN_NIVEL_3_PCT,
  precioSegunNivel,
} from "./precio.js";
export {
  type LineaInput,
  type LineaCalculada,
  type TotalesFactura,
  type MetodoPago,
  type PagoInput,
  type ResultadoCobro,
  calcularLinea,
  calcularTotales,
  procesarCobro,
  aplicarRecargoTarjeta,
} from "./factura.js";
export { type TipoEcf, formatearNcf, tipoEcfSugerido, ETIQUETA_TIPO_ECF } from "./ecf.js";
export {
  type CorteCajaInput,
  type CorteCajaResultado,
  calcularCorteCaja,
  calcularDiferenciaVerificacion,
} from "./caja.js";
export {
  type PoliticaSinExistencia,
  type DisponibilidadInput,
  type DisponibilidadResultado,
  evaluarDisponibilidad,
} from "./inventario.js";
export {
  type TipoPromocion,
  type AplicaAPromocion,
  type DescuentoInput,
  aplicarDescuento,
} from "./promocion.js";
export {
  type RolUsuario,
  type Permiso,
  type PortadorSesion,
  type SesionRepo,
  PERMISOS,
  permisosDeRol,
  resolverPermisos,
  modulosPermitidos,
  puedeVerBackoffice,
  PermisoError,
  SESION_LOCAL,
} from "./permisos.js";
export { hashearPin, verificarPin, CriptoNoDisponibleError } from "./pin.js";
export { marcarSesion, restaurarSesion, debeBloquear } from "./sesion-vigencia.js";
export { type ResultadoCambioUsuario, evaluarCambioUsuario } from "./cambio-usuario.js";
export {
  DESFASE_RD_MIN,
  fechaLocalDeInstante,
  horaLocalDeInstante,
  inicioDiaUtc,
  finDiaUtcExclusivo,
  rangoUtc,
  modificadorSqlite,
  hoyLocal,
  primerDiaDelMesLocal,
  periodoAnterior,
  mesAnteriorDe,
} from "./periodo.js";
