import { describe, it, expect, beforeEach } from "vitest";
import type { SqlDriver } from "../src/db/driver.js";
import { nuevaDb } from "./_ayuda.js";
import { crearFacturaRepo, crearCorteCajaRepo, ValidacionError } from "../src/index.js";

describe("corteCajaRepo — resumen y ciclo de turno (Corte de caja)", () => {
  let db: SqlDriver;
  beforeEach(async () => {
    db = await nuevaDb();
  });

  async function venta(
    facturas: ReturnType<typeof crearFacturaRepo>,
    pagos: { metodo: "efectivo" | "tarjeta" | "transferencia" | "credito"; monto: number }[],
  ) {
    const t = await facturas.abrirTicket();
    const total = pagos.reduce((s, p) => s + p.monto, 0);
    await facturas.agregarLinea(t.id, {
      descripcion: "Artículo",
      cantidad: 1,
      precioUnitario: total,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await facturas.cobrar(t.id, { pagos });
  }

  it("calcula totales por método de pago del período", async () => {
    const facturas = crearFacturaRepo(db);
    const cortes = crearCorteCajaRepo(db);

    await venta(facturas, [{ metodo: "efectivo", monto: 100 }]);
    await venta(facturas, [
      { metodo: "tarjeta", monto: 60 },
      { metodo: "efectivo", monto: 40 },
    ]);

    const resumen = await cortes.calcularResumen(
      "2000-01-01T00:00:00.000Z",
      "2999-01-01T00:00:00.000Z",
    );
    expect(resumen.cantidadFacturas).toBe(2);
    expect(resumen.totalVentas).toBe(200);
    expect(resumen.totalEfectivo).toBe(140);
    // 60 + 5% de recargo de tarjeta (§ PRECIOS/COBRO): esto es lo realmente cobrado en la
    // tarjeta, no el monto de venta que cubría esa fila de pago.
    expect(resumen.totalTarjeta).toBe(63);
    expect(resumen.totalTransferencia).toBe(0);
  });

  it("no incluye tickets abiertos (sin cobrar) en el resumen", async () => {
    const facturas = crearFacturaRepo(db);
    const cortes = crearCorteCajaRepo(db);
    await facturas.abrirTicket();

    const resumen = await cortes.calcularResumen(
      "2000-01-01T00:00:00.000Z",
      "2999-01-01T00:00:00.000Z",
    );
    expect(resumen.cantidadFacturas).toBe(0);
    expect(resumen.totalVentas).toBe(0);
  });

  it("rechaza un período con 'desde' posterior a 'hasta'", async () => {
    const cortes = crearCorteCajaRepo(db);
    await expect(
      cortes.calcularResumen("2026-02-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
    ).rejects.toBeInstanceOf(ValidacionError);
  });

  it("turnoAbierto() es null cuando no hay ningún turno abierto", async () => {
    const cortes = crearCorteCajaRepo(db);
    expect(await cortes.turnoAbierto()).toBeNull();
  });

  it("abrirTurno crea el turno con el fondo inicial y estado 'abierto'", async () => {
    const cortes = crearCorteCajaRepo(db);
    const turno = await cortes.abrirTurno({ montoInicial: 500 });
    expect(turno.estado).toBe("abierto");
    expect(turno.monto_inicial).toBe(500);
    expect(turno.efectivo_esperado).toBe(500);
    expect(await cortes.turnoAbierto()).toMatchObject({ id: turno.id });
  });

  it("rechaza abrirTurno con fondo inicial negativo", async () => {
    const cortes = crearCorteCajaRepo(db);
    await expect(cortes.abrirTurno({ montoInicial: -1 })).rejects.toBeInstanceOf(ValidacionError);
  });

  it("rechaza abrir un segundo turno mientras el primero sigue abierto", async () => {
    const cortes = crearCorteCajaRepo(db);
    await cortes.abrirTurno({ montoInicial: 0 });
    await expect(cortes.abrirTurno({ montoInicial: 0 })).rejects.toBeInstanceOf(ValidacionError);
  });

  it("rechaza cerrarTurno cuando no hay ningún turno abierto", async () => {
    const cortes = crearCorteCajaRepo(db);
    await expect(cortes.cerrarTurno({ efectivoContado: 0 })).rejects.toBeInstanceOf(
      ValidacionError,
    );
  });

  it("cerrarTurno calcula efectivo esperado y diferencia con el fondo inicial del turno abierto", async () => {
    const facturas = crearFacturaRepo(db);
    const cortes = crearCorteCajaRepo(db);

    await cortes.abrirTurno({ montoInicial: 500 });
    await venta(facturas, [{ metodo: "efectivo", monto: 100 }]);
    const cerrado = await cortes.cerrarTurno({ efectivoContado: 610 });

    expect(cerrado.total_efectivo).toBe(100);
    expect(cerrado.efectivo_esperado).toBe(600); // 500 fondo + 100 ventas
    expect(cerrado.diferencia).toBe(10); // sobraron 10
    expect(cerrado.estado).toBe("cerrado");
    expect(await cortes.turnoAbierto()).toBeNull();
  });

  it("rechaza cerrarTurno con efectivo contado negativo", async () => {
    const cortes = crearCorteCajaRepo(db);
    await cortes.abrirTurno({ montoInicial: 0 });
    await expect(cortes.cerrarTurno({ efectivoContado: -1 })).rejects.toBeInstanceOf(
      ValidacionError,
    );
  });

  it("no cuenta una venta hecha ANTES de abrir el turno (regresión: 'números aleatorios')", async () => {
    const facturas = crearFacturaRepo(db);
    const cortes = crearCorteCajaRepo(db);

    await venta(facturas, [{ metodo: "efectivo", monto: 999 }]); // venta previa, fuera de cualquier turno
    // Pequeña espera: `now()` (`ids.ts`) es de resolución de milisegundo, y sin esto la venta
    // y la apertura del turno pueden caer en el mismo milisegundo, empatando el límite
    // inferior inclusivo de `calcularResumen` (mismo motivo que el `setTimeout` de más abajo,
    // en "listar() solo devuelve turnos cerrados").
    await new Promise((r) => setTimeout(r, 5));
    await cortes.abrirTurno({ montoInicial: 0 });
    const cerrado = await cortes.cerrarTurno({ efectivoContado: 0 });

    expect(cerrado.total_ventas).toBe(0);
  });

  it("no cuenta dos veces la misma venta entre dos turnos consecutivos (regresión: solapamiento)", async () => {
    const facturas = crearFacturaRepo(db);
    const cortes = crearCorteCajaRepo(db);

    await cortes.abrirTurno({ montoInicial: 0 });
    await venta(facturas, [{ metodo: "efectivo", monto: 100 }]);
    const primerCierre = await cortes.cerrarTurno({ efectivoContado: 100 });
    expect(primerCierre.total_ventas).toBe(100);

    // Ver el comentario de la prueba anterior sobre la resolución de milisegundo de `now()`:
    // en la vida real un cambio de turno nunca es instantáneo (hay que autenticar al
    // siguiente usuario), pero en esta prueba sin esta espera el cierre del primer turno y
    // la venta que ya contó podían caer en el mismo milisegundo que la apertura del segundo.
    await new Promise((r) => setTimeout(r, 5));
    await cortes.abrirTurno({ montoInicial: 0 });
    await venta(facturas, [{ metodo: "efectivo", monto: 50 }]);
    const segundoCierre = await cortes.cerrarTurno({ efectivoContado: 50 });

    expect(segundoCierre.total_ventas).toBe(50); // no incluye la venta del turno anterior
  });

  it("listar() solo devuelve turnos cerrados, más reciente primero", async () => {
    const facturas = crearFacturaRepo(db);
    const cortes = crearCorteCajaRepo(db);

    await cortes.abrirTurno({ montoInicial: 0 });
    await venta(facturas, [{ metodo: "efectivo", monto: 50 }]);
    await cortes.cerrarTurno({ efectivoContado: 50 });
    await new Promise((r) => setTimeout(r, 5));

    await cortes.abrirTurno({ montoInicial: 0 });
    await venta(facturas, [{ metodo: "efectivo", monto: 30 }]);
    const segundo = await cortes.cerrarTurno({ efectivoContado: 30 });

    const lista = await cortes.listar();
    expect(lista).toHaveLength(2);
    expect(lista[0]?.id).toBe(segundo.id);
    expect(lista.every((c) => c.estado === "cerrado")).toBe(true);
  });
});
