// Pruebas de humo de la verificación opcional de tarjeta/transferencia en Corte de Caja
// (§ CAJA). No reimplementan la lógica de `corteCajaRepo.verificarPago` (ya cubierta en
// packages/core/test/corte-caja-repo.test.ts): solo verifican que la pantalla la dispara
// y refleja el resultado. Los datos se preparan ANTES de montar (no con `renderConDatos` +
// mutación posterior): `CorteCaja` solo carga su historial una vez al montar, así que
// mutar después no lo refrescaría sin pasar por sus propios botones.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate, seed, crearRepos, permisosDeRol, type PortadorSesion } from "@sfr/core";
import { createNodeSqliteDriver } from "../../core/src/db/drivers/node-sqlite.js";
import { CorteCaja } from "../src/pantallas/CorteCaja.js";
import { ProveedorDatos } from "../src/data/contexto.js";
import { ProveedorSesion } from "../src/sesion/contexto.js";

beforeEach(() => {
  localStorage.clear();
});

async function montarConTurnoDeTarjeta() {
  const db = createNodeSqliteDriver();
  await migrate(db);
  await seed(db);
  const repos = crearRepos(db);

  await repos.corteCaja.abrirTurno({ montoInicial: 0 });
  const t = await repos.factura.abrirTicket();
  await repos.factura.agregarLinea(t.id, {
    descripcion: "Artículo",
    cantidad: 1,
    precioUnitario: 100,
    impuestoTipo: "itbis18",
    tasaImpuesto: 0.18,
  });
  await repos.factura.cobrar(t.id, { pagos: [{ metodo: "tarjeta", monto: 100 }] });
  await repos.corteCaja.cerrarTurno({ efectivoContado: 0 });

  const sesion: PortadorSesion = {
    usuarioId: null,
    rol: "dueno",
    permisos: permisosDeRol("dueno"),
  };
  return render(
    <ProveedorSesion db={db} sesionInicial={sesion}>
      <ProveedorDatos>
        <CorteCaja />
      </ProveedorDatos>
    </ProveedorSesion>,
  );
}

describe("CorteCaja — verificar tarjeta/transferencia (humo, § CAJA)", () => {
  it("un turno con ventas por tarjeta muestra 'Verificar'; guardar calcula la diferencia", async () => {
    await montarConTurnoDeTarjeta();

    const botonVerificar = await screen.findByText("Verificar");
    fireEvent.click(botonVerificar);

    // La venta de la fixture es RD$100 por tarjeta, pero `total_tarjeta` guarda lo
    // realmente cobrado (con el 5% de recargo de tarjeta, § PRECIOS/COBRO): 105, no 100.
    const campo = await screen.findByLabelText("Monto verificado");
    fireEvent.change(campo, { target: { value: "95" } });
    fireEvent.click(screen.getByText("Guardar"));

    await waitFor(() => expect(screen.getByText(/dif: RD\$ -10\.00/)).toBeTruthy());
  });

  it("un turno sin ventas por transferencia muestra '—' en esa columna, sin botón", async () => {
    await montarConTurnoDeTarjeta();

    await screen.findByText("Verificar"); // espera a que cargue el historial
    const filas = screen.getAllByRole("row");
    const filaDatos = filas[1]; // fila 0 es el encabezado
    expect(filaDatos.textContent).toContain("—");
  });
});

describe("CorteCaja — devoluciones en el turno abierto (humo, § CAJA)", () => {
  it("muestra las devoluciones y el efectivo esperado ya las descuenta", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    await seed(db);
    const repos = crearRepos(db);
    await repos.corteCaja.abrirTurno({ montoInicial: 500 });
    const t = await repos.factura.abrirTicket();
    const linea = await repos.factura.agregarLinea(t.id, {
      descripcion: "Artículo",
      cantidad: 1,
      precioUnitario: 100,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await repos.factura.cobrar(t.id, { pagos: [{ metodo: "efectivo", monto: 100 }] });
    await repos.devolucion.crear({
      facturaId: t.id,
      metodoDevolucion: "efectivo",
      lineas: [{ facturaLineaId: linea.id, cantidad: 1 }],
    });

    const sesion: PortadorSesion = {
      usuarioId: null,
      rol: "dueno",
      permisos: permisosDeRol("dueno"),
    };
    render(
      <ProveedorSesion db={db} sesionInicial={sesion}>
        <ProveedorDatos>
          <CorteCaja />
        </ProveedorDatos>
      </ProveedorSesion>,
    );

    expect(await screen.findByText("Devoluciones (ya descontadas)")).toBeTruthy();
    expect(screen.getAllByText("RD$ 100.00").length).toBeGreaterThan(0);
    const filasEsperado = screen.getAllByText("Efectivo esperado").map((e) => e.parentElement);
    expect(filasEsperado.some((f) => f?.textContent?.includes("RD$ 500.00"))).toBe(true);
  });
});
