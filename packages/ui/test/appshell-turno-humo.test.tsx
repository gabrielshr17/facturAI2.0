// Pruebas de humo del ciclo de turno de caja enganchado a la sesión (§ CAJA): login
// abre turno, logout lo cierra, y Ctrl+U (cambio rápido de usuario) cierra el saliente
// antes de dejar entrar al siguiente — ver AppShell.tsx y CambioRapidoUsuario.tsx. No
// reimplementan la lógica de `corteCajaRepo` (ya cubierta en packages/core/test/
// corte-caja-repo.test.ts): solo verifican que la UI la dispara en el momento correcto.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  migrate,
  seed,
  crearRepos,
  permisosDeRol,
  conSesion,
  crearPortadorSesion,
  type PortadorSesion,
} from "@sfr/core";
import { ejecutarManejadorCierreVentana } from "../src/cierreVentana.js";
import { createNodeSqliteDriver } from "../../core/src/db/drivers/node-sqlite.js";
import { AppShell } from "../src/AppShell.js";
import { ProveedorDatos, useRepos, type Repos } from "../src/data/contexto.js";
import { ProveedorSesion, useSesion } from "../src/sesion/contexto.js";

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  localStorage.clear();
});

function SondaSesion({ onCambio }: { onCambio: (sesion: PortadorSesion) => void }) {
  const { sesion } = useSesion();
  onCambio(sesion);
  return null;
}

function SondaRepos({ onListo }: { onListo: (repos: Repos) => void }) {
  onListo(useRepos());
  return null;
}

function escribirPin(pin: string) {
  for (const digito of pin) {
    fireEvent.click(screen.getByRole("button", { name: digito }));
  }
}

/** Monta AppShell con exige_caja_abierta=true y una sesión de cajero ya autenticada. */
async function montarConCajaExigida(sesionExtra?: { onCambio?: (s: PortadorSesion) => void }) {
  const db = createNodeSqliteDriver();
  await migrate(db);
  await seed(db);
  const repos = crearRepos(db);
  await repos.negocio.guardar({ nombre_comercial: "Negocio Prueba", exige_caja_abierta: true });
  const cajero = await repos.usuario.crear({
    nombre: "Cajero Uno",
    rol: "cajero",
    pin: "1234",
    activo: true,
  });
  const sesion: PortadorSesion = {
    usuarioId: cajero.id,
    rol: "cajero",
    permisos: permisosDeRol("cajero"),
  };

  let reposDeLaUi: Repos | null = null;
  const resultado = render(
    <ProveedorSesion db={db} sesionInicial={sesion}>
      <ProveedorDatos>
        <SondaRepos onListo={(r) => (reposDeLaUi = r)} />
        {sesionExtra?.onCambio && <SondaSesion onCambio={sesionExtra.onCambio} />}
        <AppShell plataforma="Web" />
      </ProveedorDatos>
    </ProveedorSesion>,
  );
  return {
    ...resultado,
    db,
    repos,
    cajero,
    get reposDeLaUi() {
      return reposDeLaUi!;
    },
  };
}

describe("Ciclo de turno de caja enganchado a la sesión (humo, § CAJA)", () => {
  it("con exige_caja_abierta=true, login sin turno abierto pide el fondo inicial antes de mostrar Ventas", async () => {
    await montarConCajaExigida();

    expect(await screen.findByText("¿Con cuánto efectivo empieza la caja?")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Módulos" })).toBeNull();

    fireEvent.click(screen.getByText("Abrir turno"));

    await waitFor(() => expect(screen.getByRole("navigation", { name: "Módulos" })).toBeTruthy());
  });

  it("cerrar sesión con un turno abierto pide contar el efectivo antes de salir de verdad", async () => {
    let ultimaSesion: PortadorSesion | null = null;
    const { repos } = await montarConCajaExigida({ onCambio: (s) => (ultimaSesion = s) });

    await screen.findByText("¿Con cuánto efectivo empieza la caja?");
    fireEvent.click(screen.getByText("Abrir turno"));
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Módulos" })).toBeTruthy());
    expect((await repos.corteCaja.turnoAbierto())?.estado).toBe("abierto");

    fireEvent.click(screen.getByLabelText("Cerrar sesión"));

    expect(await screen.findByText("Cerrar turno para salir")).toBeTruthy();
    // Cerrar sesión no debe haberse ejecutado todavía: la sesión sigue siendo la del cajero.
    expect(ultimaSesion!.usuarioId).not.toBeNull();

    // Arqueo por denominación (§ blind count): nunca aparece el total calculado (550) en
    // pantalla mientras se cuenta, solo las etiquetas de cada denominación.
    fireEvent.change(screen.getByLabelText("RD$ 25"), { target: { value: "2" } }); // 50
    fireEvent.change(screen.getByLabelText("RD$ 500"), { target: { value: "1" } }); // 500
    expect(screen.queryByText(/550/)).toBeNull();

    fireEvent.click(screen.getByText("Cerrar turno", { selector: "button" }));

    // Paso de confirmación: se muestra el efectivo contado antes de cerrar de verdad.
    expect(await screen.findByText("Confirmar cierre")).toBeTruthy();
    expect(ultimaSesion!.usuarioId).not.toBeNull();

    fireEvent.click(screen.getByText("Confirmar cierre"));

    await waitFor(() => expect(ultimaSesion!.usuarioId).toBeNull());
    expect(await repos.corteCaja.turnoAbierto()).toBeNull();
    const [cerrado] = await repos.corteCaja.listar();
    expect(cerrado.efectivo_contado).toBe(550); // 2×25 + 1×500
  });

  it("la pantalla de confirmación del cierre también muestra tarjeta, transferencia y crédito", async () => {
    // Estos totales no son un conteo ciego (ya quedaron registrados electrónicamente), así
    // que se muestran siempre en la confirmación, sin depender del toggle de "mostrar el
    // efectivo esperado" en Configuración.
    const { repos } = await montarConCajaExigida();

    await screen.findByText("¿Con cuánto efectivo empieza la caja?");
    fireEvent.click(screen.getByText("Abrir turno"));
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Módulos" })).toBeTruthy());

    const t = await repos.factura.abrirTicket();
    await repos.factura.agregarLinea(t.id, {
      descripcion: "Artículo",
      cantidad: 1,
      precioUnitario: 100,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });
    await repos.factura.cobrar(t.id, { pagos: [{ metodo: "tarjeta", monto: 100 }] });

    fireEvent.click(screen.getByLabelText("Cerrar sesión"));
    await screen.findByText("Cerrar turno para salir");
    fireEvent.click(screen.getByText("Cerrar turno", { selector: "button" }));

    // La venta de tarjeta lleva el 5% de recargo (§ PRECIOS/COBRO): 105, no 100.
    await waitFor(() => expect(screen.getByText("RD$ 105.00")).toBeTruthy());
    expect(screen.getByText("Transferencia")).toBeTruthy();
    expect(screen.getByText("Crédito")).toBeTruthy();
  });

  it("Ctrl+U con un turno abierto pide cerrarlo antes de mostrar el selector de usuario", async () => {
    const { repos } = await montarConCajaExigida();

    await screen.findByText("¿Con cuánto efectivo empieza la caja?");
    fireEvent.click(screen.getByText("Abrir turno"));
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Módulos" })).toBeTruthy());

    await repos.usuario.crear({ nombre: "Cajero Dos", rol: "cajero", pin: "2222", activo: true });

    fireEvent.keyDown(window, { key: "u", ctrlKey: true });

    expect(await screen.findByText("Cerrar turno para cambiar de usuario")).toBeTruthy();
    expect(screen.queryByText("¿Quién va a usar la caja ahora?")).toBeNull();

    fireEvent.click(screen.getByText("Cerrar turno", { selector: "button" }));
    expect(await screen.findByText("Confirmar cierre")).toBeTruthy();
    fireEvent.click(screen.getByText("Confirmar cierre"));

    fireEvent.click(await screen.findByText("Cajero Dos"));
    escribirPin("2222");
    fireEvent.click(screen.getByText("Entrar (Enter)"));

    // El cambio de usuario deja la caja sin turno abierto: la compuerta de AppShell
    // vuelve a pedir el fondo inicial para el usuario entrante (no lo hace este modal).
    await waitFor(() =>
      expect(screen.getByText("¿Con cuánto efectivo empieza la caja?")).toBeTruthy(),
    );
  });

  it("un turno abierto por OTRO usuario bloquea el login con un mensaje claro (regresión real)", async () => {
    // Reproduce exactamente el bug real: "Administrador" abre un turno; después, sin que
    // nadie lo cierre, "Cajero Dos" inicia sesión por su cuenta (login nuevo, no Ctrl+U) y
    // se queda atrapado — no puede cerrar el turno de otro al salir (necesita `caja.cerrar`,
    // que un cajero no tiene). La compuerta debe bloquear ANTES, al entrar, no dejar que
    // trabaje todo el turno para enterarse recién al salir.
    let ultimaSesion: PortadorSesion | null = null;
    const db = createNodeSqliteDriver();
    await migrate(db);
    await seed(db);
    const repos = crearRepos(db);
    await repos.negocio.guardar({ nombre_comercial: "Negocio Prueba", exige_caja_abierta: true });

    // "Administrador" (usuario-admin, de la semilla) abre un turno sin pasar por la UI.
    const portadorAdmin = crearPortadorSesion({
      usuarioId: "usuario-admin",
      rol: "dueno",
      permisos: permisosDeRol("dueno"),
    });
    await crearRepos(conSesion(db, portadorAdmin)).corteCaja.abrirTurno({ montoInicial: 100 });

    const cajeroDos = await repos.usuario.crear({
      nombre: "Cajero Dos",
      rol: "cajero",
      pin: "2222",
      activo: true,
    });
    const sesionCajeroDos: PortadorSesion = {
      usuarioId: cajeroDos.id,
      rol: "cajero",
      permisos: permisosDeRol("cajero"),
    };

    render(
      <ProveedorSesion db={db} sesionInicial={sesionCajeroDos}>
        <ProveedorDatos>
          <SondaSesion onCambio={(s) => (ultimaSesion = s)} />
          <AppShell plataforma="Web" />
        </ProveedorDatos>
      </ProveedorSesion>,
    );

    expect(await screen.findByText("Hay un turno abierto")).toBeTruthy();
    expect(screen.getByText(/Administrador/)).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Módulos" })).toBeNull();
    // No debe ofrecer "abrir turno": ya hay uno, solo que no es suyo.
    expect(screen.queryByText("¿Con cuánto efectivo empieza la caja?")).toBeNull();

    fireEvent.click(screen.getByText("Volver al login"));
    await waitFor(() => expect(ultimaSesion!.usuarioId).toBeNull());
    // El turno de Administrador sigue intacto — Cajero Dos nunca lo tocó.
    expect((await repos.corteCaja.turnoAbierto())?.usuario_id).toBe("usuario-admin");
  });

  it("cerrar la ventana (botón nativo) con un turno propio abierto pide contar el efectivo", async () => {
    const { repos } = await montarConCajaExigida();

    await screen.findByText("¿Con cuánto efectivo empieza la caja?");
    fireEvent.click(screen.getByText("Abrir turno"));
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Módulos" })).toBeTruthy());

    // Simula lo que hace `packages/desktop/src/main.tsx` al interceptar el botón nativo
    // de cerrar la ventana.
    const resultado = ejecutarManejadorCierreVentana();
    expect(await screen.findByText("Cerrar turno para salir de la aplicación")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("RD$ 100"), { target: { value: "1" } });
    fireEvent.click(screen.getByText("Cerrar turno", { selector: "button" }));

    expect(await screen.findByText("Confirmar cierre")).toBeTruthy();
    fireEvent.click(screen.getByText("Confirmar cierre"));

    await expect(resultado).resolves.toBe("cerrar");
    expect(await repos.corteCaja.turnoAbierto()).toBeNull();
  });

  it("cancelar el cierre de la ventana deja el turno abierto y no cierra la ventana", async () => {
    const { repos } = await montarConCajaExigida();

    await screen.findByText("¿Con cuánto efectivo empieza la caja?");
    fireEvent.click(screen.getByText("Abrir turno"));
    await waitFor(() => expect(screen.getByRole("navigation", { name: "Módulos" })).toBeTruthy());

    const resultado = ejecutarManejadorCierreVentana();
    await screen.findByText("Cerrar turno para salir de la aplicación");
    fireEvent.click(screen.getByText("Cancelar"));

    await expect(resultado).resolves.toBe("cancelar");
    expect((await repos.corteCaja.turnoAbierto())?.estado).toBe("abierto");
  });

  it("sin turno abierto, cerrar la ventana no pide nada", async () => {
    await montarConCajaExigida();
    await screen.findByText("¿Con cuánto efectivo empieza la caja?");
    // A propósito no abre turno: la compuerta de "abrir turno" sigue en pantalla, así que
    // `estadoTurno.abierto` es null y el manejador debe dejar cerrar sin preguntar nada.

    await expect(ejecutarManejadorCierreVentana()).resolves.toBe("cerrar");
  });

  describe("turno abierto por otro usuario: quién puede forzar el cierre", () => {
    async function montarConTurnoAjeno(rol: "supervisor" | "dueno" | "cajero") {
      const db = createNodeSqliteDriver();
      await migrate(db);
      await seed(db);
      const repos = crearRepos(db);
      await repos.negocio.guardar({ nombre_comercial: "Negocio Prueba", exige_caja_abierta: true });
      const portadorAdmin = crearPortadorSesion({
        usuarioId: "usuario-admin",
        rol: "dueno",
        permisos: permisosDeRol("dueno"),
      });
      await crearRepos(conSesion(db, portadorAdmin)).corteCaja.abrirTurno({ montoInicial: 100 });

      const entrante = await repos.usuario.crear({
        nombre: "Persona Entrante",
        rol,
        pin: "2222",
        activo: true,
      });
      render(
        <ProveedorSesion
          db={db}
          sesionInicial={{ usuarioId: entrante.id, rol, permisos: permisosDeRol(rol) }}
        >
          <ProveedorDatos>
            <AppShell plataforma="Web" />
          </ProveedorDatos>
        </ProveedorSesion>,
      );
      return repos;
    }

    it("un cajero solo puede volver al login: no ve el botón de forzar", async () => {
      await montarConTurnoAjeno("cajero");
      expect(await screen.findByText("Hay un turno abierto")).toBeTruthy();
      expect(screen.queryByText("Forzar cierre")).toBeNull();
    });

    it.each(["supervisor", "dueno"] as const)(
      "un %s puede forzar el cierre y sigue al flujo normal",
      async (rol) => {
        const repos = await montarConTurnoAjeno(rol);
        expect(await screen.findByText("Hay un turno abierto")).toBeTruthy();

        fireEvent.click(screen.getByText("Forzar cierre"));
        expect(await screen.findByText("Forzar cierre de turno")).toBeTruthy();

        fireEvent.change(screen.getByLabelText("RD$ 100"), { target: { value: "1" } });
        fireEvent.click(screen.getByText("Cerrar turno", { selector: "button" }));
        fireEvent.click(await screen.findByText("Confirmar cierre"));

        expect(await screen.findByText("¿Con cuánto efectivo empieza la caja?")).toBeTruthy();
        expect(await repos.corteCaja.turnoAbierto()).toBeNull();
        const [cerrado] = await repos.corteCaja.listar();
        expect(cerrado.efectivo_contado).toBe(100);
        expect(cerrado.usuario_id).toBe("usuario-admin");
      },
    );
  });
});
