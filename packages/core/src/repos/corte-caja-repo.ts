import type { SqlDriver } from "../db/driver.js";
import { newId, now } from "../ids.js";
import { calcularCorteCaja, calcularDiferenciaVerificacion } from "../dominio/caja.js";
import { redondear2 } from "../dominio/dinero.js";
import type { ErrorValidacion } from "../dominio/validacion.js";
import { exigirPermiso, sesionDe, usuarioDe } from "../db/sesion.js";
import { ValidacionError } from "./producto-repo.js";
import { registrarAccion } from "./bitacora-repo.js";
import type { CorteCaja } from "./tipos.js";

/** Totales de ventas cobradas en un período (para armar el corte de caja). */
export interface ResumenPeriodoVentas {
  desde: string;
  hasta: string;
  cantidadFacturas: number;
  totalVentas: number;
  totalItbis: number;
  totalEfectivo: number;
  totalTarjeta: number;
  totalTransferencia: number;
  totalCredito: number;
  totalDevoluciones: number;
}

export interface AbrirTurnoInput {
  montoInicial: number;
}

export interface CerrarTurnoInput {
  efectivoContado: number;
}

export interface VerificarPagoInput {
  tarjetaVerificado?: number | null;
  transferenciaVerificado?: number | null;
}

const COLS = `id, caja_id, usuario_id, fecha_apertura, fecha_cierre, monto_inicial,
  total_ventas, total_itbis, total_efectivo, total_tarjeta, total_transferencia,
  total_credito, efectivo_esperado, efectivo_contado, diferencia,
  tarjeta_verificado, tarjeta_diferencia, transferencia_verificado, transferencia_diferencia,
  estado, created_at, updated_at, deleted_at`;

/**
 * `desde`/`hasta` ahora son timestamps ISO completos (no solo fechas): un
 * turno se acota por el instante exacto de apertura/cierre, no por el día,
 * para que dos turnos consecutivos el mismo día nunca se solapen ni dejen
 * huecos. La comparación es de texto directo (sin `date(...)`) porque
 * `now()` (`ids.ts`) y `factura.fecha_hora` usan el mismo formato ISO 8601,
 * que ordena igual como texto que como fecha.
 */
function validarPeriodo(desde: string, hasta: string): ErrorValidacion[] {
  const errores: ErrorValidacion[] = [];
  if (!desde || !hasta) {
    errores.push({ campo: "periodo", mensaje: "Debe indicar el inicio y el fin del período." });
  } else if (desde > hasta) {
    errores.push({
      campo: "periodo",
      mensaje: "El inicio del período no puede ser posterior al fin.",
    });
  }
  return errores;
}

type MetodoCaja = "efectivo" | "tarjeta" | "transferencia" | "credito";

const METODOS_CAJA: readonly string[] = ["efectivo", "tarjeta", "transferencia", "credito"];

export function crearCorteCajaRepo(db: SqlDriver) {
  async function metodoDeLaDevolucion(
    explicito: string | null,
    facturaId: string,
  ): Promise<MetodoCaja> {
    if (explicito && METODOS_CAJA.includes(explicito)) return explicito as MetodoCaja;

    const metodos = await db.all<{ metodo: string }>(
      "SELECT DISTINCT metodo FROM pago WHERE factura_id=? AND deleted_at IS NULL",
      [facturaId],
    );
    const unico = metodos.length === 1 ? metodos[0]?.metodo : undefined;
    return unico && METODOS_CAJA.includes(unico) ? (unico as MetodoCaja) : "efectivo";
  }

  return {
    /** Totales de ventas cobradas entre `desde` y `hasta` (timestamps ISO, inclusive). */
    async calcularResumen(desde: string, hasta: string): Promise<ResumenPeriodoVentas> {
      const errores = validarPeriodo(desde, hasta);
      if (errores.length) throw new ValidacionError(errores);

      const agregada = await db.get<{
        cantidad: number;
        totalVentas: number | null;
        totalItbis: number | null;
        totalCambio: number | null;
      }>(
        `SELECT COUNT(*) as cantidad, SUM(total) as totalVentas, SUM(total_itbis) as totalItbis,
                SUM(cambio) as totalCambio
         FROM factura
         WHERE estado='cobrada' AND deleted_at IS NULL
           AND fecha_hora >= ? AND fecha_hora <= ?`,
        [desde, hasta],
      );

      const porMetodo = await db.all<{ metodo: string; total: number }>(
        `SELECT p.metodo as metodo, SUM(p.monto) as total
         FROM pago p
         JOIN factura f ON f.id = p.factura_id
         WHERE f.estado='cobrada' AND f.deleted_at IS NULL AND p.deleted_at IS NULL
           AND f.fecha_hora >= ? AND f.fecha_hora <= ?
         GROUP BY p.metodo`,
        [desde, hasta],
      );
      const totales = { efectivo: 0, tarjeta: 0, transferencia: 0, credito: 0 };
      for (const fila of porMetodo) {
        if (fila.metodo in totales) totales[fila.metodo as keyof typeof totales] = fila.total;
      }

      // `pago.monto` en efectivo guarda lo TENDIDO por el cliente (p. ej. RD$200 para
      // cubrir una venta de RD$150), no lo que se queda en la gaveta. El cambio siempre
      // sale en efectivo (ver `procesarCobro` en dominio/factura.ts), así que hay que
      // restarlo aquí o el corte de caja espera de más por cada venta con cambio.
      const devoluciones = await db.all<{
        id: string;
        factura_id: string;
        total: number;
        itbis: number;
        metodo_devolucion: string | null;
      }>(
        `SELECT id, factura_id, total, itbis, metodo_devolucion
         FROM devolucion
         WHERE deleted_at IS NULL AND fecha >= ? AND fecha <= ?`,
        [desde, hasta],
      );
      let totalDevoluciones = 0;
      let itbisDevuelto = 0;
      for (const d of devoluciones) {
        totalDevoluciones += d.total;
        itbisDevuelto += d.itbis;
        const metodo = await metodoDeLaDevolucion(d.metodo_devolucion, d.factura_id);
        totales[metodo] = redondear2(totales[metodo] - d.total);
      }

      const totalEfectivoNeto = redondear2(totales.efectivo - (agregada?.totalCambio ?? 0));

      return {
        desde,
        hasta,
        cantidadFacturas: agregada?.cantidad ?? 0,
        totalVentas: redondear2((agregada?.totalVentas ?? 0) - totalDevoluciones),
        totalItbis: redondear2((agregada?.totalItbis ?? 0) - itbisDevuelto),
        totalEfectivo: totalEfectivoNeto,
        totalTarjeta: totales.tarjeta,
        totalTransferencia: totales.transferencia,
        totalCredito: totales.credito,
        totalDevoluciones: redondear2(totalDevoluciones),
      };
    },

    /** El turno abierto ahora mismo (a lo sumo uno, ver migración 40-caja), o null. */
    async turnoAbierto(): Promise<CorteCaja | null> {
      const fila = await db.get<CorteCaja>(
        `SELECT ${COLS} FROM corte_caja WHERE estado='abierto' AND deleted_at IS NULL LIMIT 1`,
      );
      return fila ?? null;
    },

    /** Abre un turno nuevo con el fondo de caja inicial. Requiere `caja.abrir`. */
    async abrirTurno(input: AbrirTurnoInput): Promise<CorteCaja> {
      exigirPermiso(db, "caja.abrir");
      const errores: ErrorValidacion[] = [];
      if (input.montoInicial < 0) {
        errores.push({ campo: "montoInicial", mensaje: "El monto inicial no puede ser negativo." });
      }
      if (errores.length) throw new ValidacionError(errores);

      if (await this.turnoAbierto()) {
        throw new ValidacionError([
          { campo: "turno", mensaje: "Ya hay un turno de caja abierto." },
        ]);
      }

      const ts = now();
      const c: CorteCaja = {
        id: newId(),
        caja_id: null,
        usuario_id: usuarioDe(db),
        fecha_apertura: ts,
        fecha_cierre: ts,
        monto_inicial: input.montoInicial,
        total_ventas: 0,
        total_itbis: 0,
        total_efectivo: 0,
        total_tarjeta: 0,
        total_transferencia: 0,
        total_credito: 0,
        efectivo_esperado: input.montoInicial,
        efectivo_contado: 0,
        diferencia: 0,
        tarjeta_verificado: null,
        tarjeta_diferencia: null,
        transferencia_verificado: null,
        transferencia_diferencia: null,
        estado: "abierto",
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      };

      await db.run(`INSERT INTO corte_caja (${COLS}) VALUES (${Array(23).fill("?").join(",")})`, [
        c.id,
        c.caja_id,
        c.usuario_id,
        c.fecha_apertura,
        c.fecha_cierre,
        c.monto_inicial,
        c.total_ventas,
        c.total_itbis,
        c.total_efectivo,
        c.total_tarjeta,
        c.total_transferencia,
        c.total_credito,
        c.efectivo_esperado,
        c.efectivo_contado,
        c.diferencia,
        c.tarjeta_verificado,
        c.tarjeta_diferencia,
        c.transferencia_verificado,
        c.transferencia_diferencia,
        c.estado,
        c.created_at,
        c.updated_at,
        c.deleted_at,
      ]);
      await registrarAccion(db, {
        accion: "abrir_caja",
        entidad: "corte_caja",
        entidadId: c.id,
        resumen: `Turno abierto con fondo inicial RD$ ${c.monto_inicial.toFixed(2)}`,
      });
      return c;
    },

    /**
     * Cierra el turno abierto con el efectivo contado. Quien lo abrió puede
     * cerrarlo sin `caja.cerrar` (cierre propio, p. ej. al cerrar sesión); de
     * lo contrario hace falta `caja.cerrar` (cierre forzado por supervisor+,
     * p. ej. un turno que quedó abierto tras un cierre inesperado).
     */
    async cerrarTurno(input: CerrarTurnoInput): Promise<CorteCaja> {
      const abierto = await this.turnoAbierto();
      if (!abierto) {
        throw new ValidacionError([{ campo: "turno", mensaje: "No hay ningún turno abierto." }]);
      }

      const sesion = sesionDe(db);
      const esPropio = sesion !== null && sesion.usuarioId === abierto.usuario_id;
      if (!esPropio) exigirPermiso(db, "caja.cerrar");

      if (input.efectivoContado < 0) {
        throw new ValidacionError([
          { campo: "efectivoContado", mensaje: "El efectivo contado no puede ser negativo." },
        ]);
      }

      const ts = now();
      const resumen = await this.calcularResumen(abierto.fecha_apertura, ts);
      const { efectivoEsperado, diferencia } = calcularCorteCaja({
        montoInicial: abierto.monto_inicial,
        totalEfectivo: resumen.totalEfectivo,
        efectivoContado: input.efectivoContado,
      });

      await db.run(
        `UPDATE corte_caja SET fecha_cierre=?, total_ventas=?, total_itbis=?, total_efectivo=?,
           total_tarjeta=?, total_transferencia=?, total_credito=?, efectivo_esperado=?,
           efectivo_contado=?, diferencia=?, estado='cerrado', updated_at=? WHERE id=?`,
        [
          ts,
          resumen.totalVentas,
          resumen.totalItbis,
          resumen.totalEfectivo,
          resumen.totalTarjeta,
          resumen.totalTransferencia,
          resumen.totalCredito,
          efectivoEsperado,
          input.efectivoContado,
          diferencia,
          ts,
          abierto.id,
        ],
      );
      await registrarAccion(db, {
        accion: "cerrar_caja",
        entidad: "corte_caja",
        entidadId: abierto.id,
        resumen: `Turno ${abierto.fecha_apertura} a ${ts}, diferencia RD$ ${diferencia.toFixed(2)}`,
      });

      const cerrado = await db.get<CorteCaja>(`SELECT ${COLS} FROM corte_caja WHERE id=?`, [
        abierto.id,
      ]);
      if (!cerrado) throw new Error("No se pudo leer el corte tras cerrarlo.");
      return cerrado;
    },

    /**
     * Verificación opcional de tarjeta/transferencia (§ CAJA): un supervisor transcribe, para
     * un corte YA CERRADO (de cualquier fecha, no solo el último), el monto real del reporte
     * de lote del datáfono o de una confirmación bancaria. No es un conteo ciego — a
     * diferencia del efectivo, el número viene de una fuente externa, así que no hay nada que
     * esconder. Solo toca la(s) columna(s) del método que de verdad viene en `input`; el otro
     * método queda exactamente como estaba (una verificación no borra la otra). Requiere
     * `caja.cerrar`, el mismo permiso que ya exige un cierre forzado.
     */
    async verificarPago(corteCajaId: string, input: VerificarPagoInput): Promise<CorteCaja> {
      exigirPermiso(db, "caja.cerrar");
      const corte = await db.get<CorteCaja>(
        `SELECT ${COLS} FROM corte_caja WHERE id=? AND deleted_at IS NULL`,
        [corteCajaId],
      );
      if (!corte) throw new Error(`Corte ${corteCajaId} no existe`);

      const errores: ErrorValidacion[] = [];
      if (input.tarjetaVerificado != null && input.tarjetaVerificado < 0) {
        errores.push({
          campo: "tarjetaVerificado",
          mensaje: "El monto verificado de tarjeta no puede ser negativo.",
        });
      }
      if (input.transferenciaVerificado != null && input.transferenciaVerificado < 0) {
        errores.push({
          campo: "transferenciaVerificado",
          mensaje: "El monto verificado de transferencia no puede ser negativo.",
        });
      }
      if (errores.length) throw new ValidacionError(errores);

      const tarjetaVerificado =
        input.tarjetaVerificado !== undefined ? input.tarjetaVerificado : corte.tarjeta_verificado;
      const tarjetaDiferencia =
        tarjetaVerificado != null
          ? calcularDiferenciaVerificacion(corte.total_tarjeta, tarjetaVerificado)
          : null;
      const transferenciaVerificado =
        input.transferenciaVerificado !== undefined
          ? input.transferenciaVerificado
          : corte.transferencia_verificado;
      const transferenciaDiferencia =
        transferenciaVerificado != null
          ? calcularDiferenciaVerificacion(corte.total_transferencia, transferenciaVerificado)
          : null;

      await db.run(
        `UPDATE corte_caja SET tarjeta_verificado=?, tarjeta_diferencia=?,
           transferencia_verificado=?, transferencia_diferencia=?, updated_at=? WHERE id=?`,
        [
          tarjetaVerificado,
          tarjetaDiferencia,
          transferenciaVerificado,
          transferenciaDiferencia,
          now(),
          corteCajaId,
        ],
      );
      const partes: string[] = [];
      if (input.tarjetaVerificado !== undefined) {
        partes.push(
          `Tarjeta: RD$ ${tarjetaVerificado?.toFixed(2) ?? "—"} (diferencia RD$ ${tarjetaDiferencia?.toFixed(2) ?? "—"})`,
        );
      }
      if (input.transferenciaVerificado !== undefined) {
        partes.push(
          `Transferencia: RD$ ${transferenciaVerificado?.toFixed(2) ?? "—"} (diferencia RD$ ${transferenciaDiferencia?.toFixed(2) ?? "—"})`,
        );
      }
      await registrarAccion(db, {
        accion: "verificar_pago_corte",
        entidad: "corte_caja",
        entidadId: corteCajaId,
        resumen: partes.join("; "),
      });

      const actualizado = await db.get<CorteCaja>(`SELECT ${COLS} FROM corte_caja WHERE id=?`, [
        corteCajaId,
      ]);
      if (!actualizado) throw new Error("No se pudo leer el corte tras verificar el pago.");
      return actualizado;
    },

    async listar(): Promise<CorteCaja[]> {
      return db.all<CorteCaja>(
        `SELECT ${COLS} FROM corte_caja WHERE deleted_at IS NULL AND estado='cerrado'
         ORDER BY fecha_cierre DESC, created_at DESC`,
      );
    },
  };
}

export type CorteCajaRepo = ReturnType<typeof crearCorteCajaRepo>;
