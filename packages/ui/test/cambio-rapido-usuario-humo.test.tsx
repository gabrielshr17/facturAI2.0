// Pruebas de humo del cambio rápido de usuario en el punto de venta (§ RBAC-07 parte C).
// Igual que `acceso-humo.test.tsx`, no reimplementan ninguna regla: `usuario-repo.autenticar`
// y `evaluarCambioUsuario` (`@sfr/core`) ya están probados a fondo por separado. Estas pruebas
// solo verifican que `AppShell` cablea el atajo, el guardia de ticket abierto y el modal.
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { permisosDeRol, type PortadorSesion } from "@sfr/core";
import { AppShell } from "../src/AppShell.js";
import { useSesion } from "../src/sesion/contexto.js";
import { renderConDatos } from "./_render.js";

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  localStorage.clear();
});

function SondaSesion({ onCambio }: { onCambio: (sesion: PortadorSesion) => void }) {
  const { sesion } = useSesion();
  onCambio(sesion);
  return null;
}

function escribirPin(pin: string) {
  for (const digito of pin) {
    fireEvent.click(screen.getByRole("button", { name: digito }));
  }
}

const SESION_DUENO: PortadorSesion = { usuarioId: "usuario-admin", rol: "dueno", permisos: permisosDeRol("dueno") };

describe("CambioRapidoUsuario (humo, RBAC-07 parte C)", () => {
  it("Ctrl+U sin tickets con contenido abre el selector de usuario", async () => {
    await renderConDatos(<AppShell plataforma="Web" />, SESION_DUENO);

    fireEvent.keyDown(window, { key: "u", ctrlKey: true });

    expect(await screen.findByText("¿Quién va a usar la caja ahora?")).toBeTruthy();
  });

  it("Escape cancela el modal sin cambiar la sesión", async () => {
    let ultimaSesion: PortadorSesion | null = null;
    function ArbolDePrueba() {
      return (
        <>
          <SondaSesion onCambio={(s) => (ultimaSesion = s)} />
          <AppShell plataforma="Web" />
        </>
      );
    }
    await renderConDatos(<ArbolDePrueba />, SESION_DUENO);

    fireEvent.keyDown(window, { key: "u", ctrlKey: true });
    await screen.findByText("¿Quién va a usar la caja ahora?");

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByText("¿Quién va a usar la caja ahora?")).toBeNull());
    expect(ultimaSesion!.usuarioId).toBe("usuario-admin");
  });

  it("seleccionar otro usuario y autenticar con su PIN cambia la sesión de verdad", async () => {
    const { repos } = await renderConDatos(<AppShell plataforma="Web" />, SESION_DUENO);
    await repos.usuario.crear({ nombre: "Cajero Dos", rol: "cajero", pin: "2222", activo: true });

    fireEvent.keyDown(window, { key: "u", ctrlKey: true });
    fireEvent.click(await screen.findByText("Cajero Dos"));

    escribirPin("2222");
    fireEvent.click(screen.getByText("Entrar (Enter)"));

    await waitFor(() => expect(screen.getByText("Cajero Dos")).toBeTruthy());
    expect(screen.queryByText("Cambiar a Cajero Dos")).toBeNull();
  });

  it("con un ticket abierto con líneas, Ctrl+U bloquea el cambio y no abre el selector", async () => {
    const { repos } = await renderConDatos(<AppShell plataforma="Web" />, SESION_DUENO);
    const ticket = await repos.factura.abrirTicket({});
    await repos.factura.agregarLinea(ticket.id, {
      descripcion: "Producto de prueba",
      cantidad: 1,
      precioUnitario: 100,
      impuestoTipo: "itbis18",
      tasaImpuesto: 0.18,
    });

    fireEvent.keyDown(window, { key: "u", ctrlKey: true });

    expect(await screen.findByText(/Hay un ticket abierto/)).toBeTruthy();
    expect(screen.queryByText("¿Quién va a usar la caja ahora?")).toBeNull();
  });
});
