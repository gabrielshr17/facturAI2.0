// Pruebas de humo de RBAC-07 (parte A) sobre la pantalla Personal: el CRUD de usuarios NO
// reimplementa ninguna regla del repo (nombre obligatorio, PIN 4-6 dígitos, "no desactivar
// al único dueño"), así que estas pruebas solo verifican que el componente llama al repo
// correcto y muestra lo que el repo devuelve — la regla en sí ya está cubierta en
// `packages/core/test/usuario-repo.test.ts`.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { permisosDeRol, resolverPermisos, type PortadorSesion } from "@sfr/core";
import { AppShell } from "../src/AppShell.js";
import { Personal } from "../src/pantallas/Personal.js";
import { ProveedorAlertas } from "../src/contexto/Alertas.js";
import { renderConDatos } from "./_render.js";

function sesionDe(rol: "cajero" | "dueno"): PortadorSesion {
  return { usuarioId: null, rol, permisos: permisosDeRol(rol) };
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  localStorage.clear();
});

describe("Personal — visibilidad del módulo (humo, RBAC-07 parte A)", () => {
  it("con personal.gestionar (dueño), el módulo Personal aparece en el menú", async () => {
    await renderConDatos(<AppShell plataforma="Web" />, sesionDe("dueno"));
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    expect(within(nav).getByText("Personal")).toBeTruthy();
  });

  it("sin personal.gestionar (cajero), el módulo Personal no aparece", async () => {
    await renderConDatos(<AppShell plataforma="Web" />, sesionDe("cajero"));
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    expect(within(nav).queryByText("Personal")).toBeNull();
  });
});

describe("Personal — CRUD contra usuarioRepo (humo, RBAC-07 parte A)", () => {
  it("crear un usuario con nombre, rol y PIN inicial permite autenticarse después", async () => {
    const { repos } = await renderConDatos(<ProveedorAlertas><Personal /></ProveedorAlertas>);

    fireEvent.click(screen.getByText("+ Nuevo usuario (F6)"));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Cajero Uno" } });
    fireEvent.change(screen.getByLabelText("PIN inicial"), { target: { value: "1234" } });
    fireEvent.click(screen.getByText("Guardar (Ctrl+S)"));

    await waitFor(() => expect(screen.getByText("Cajero Uno")).toBeTruthy());

    const lista = await repos.usuario.listar();
    const creado = lista.find((u) => u.nombre === "Cajero Uno");
    expect(creado).toBeTruthy();

    const resultado = await repos.usuario.autenticar({ usuarioId: creado!.id, pin: "1234" });
    expect(resultado.ok).toBe(true);
  });

  it("intentar desactivar al único dueño muestra el ValidacionError del repo, no un error crudo", async () => {
    await renderConDatos(<ProveedorAlertas><Personal /></ProveedorAlertas>);

    await waitFor(() => expect(screen.getByText("Administrador")).toBeTruthy());
    const fila = screen.getByText("Administrador").closest("tr")!;
    fireEvent.click(within(fila).getByText("Desactivar"));

    // El diálogo de confirmación de useAlertas() aparece antes de llegar al repo.
    const confirmarBoton = await screen.findByText("Desactivar (Enter)");
    fireEvent.click(confirmarBoton);

    await screen.findByText(/No se puede desactivar al único dueño o superadmin activo/);
  });

  it("conceder una excepción de permiso se guarda como diferencia sobre el default del rol y resolverPermisos la refleja", async () => {
    const { repos } = await renderConDatos(<ProveedorAlertas><Personal /></ProveedorAlertas>);

    fireEvent.click(screen.getByText("+ Nuevo usuario (F6)"));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Cajero Excepción" } });
    fireEvent.change(screen.getByLabelText("PIN inicial"), { target: { value: "5678" } });
    // El rol por defecto del formulario ya es "cajero", que no trae `modulo.reportes`.
    fireEvent.click(screen.getByRole("checkbox", { name: /modulo · reportes/ }));
    fireEvent.click(screen.getByText("Guardar (Ctrl+S)"));

    await waitFor(() => expect(screen.getByText("Cajero Excepción")).toBeTruthy());

    const creado = (await repos.usuario.listar()).find((u) => u.nombre === "Cajero Excepción")!;
    expect(JSON.parse(creado.permisos_json!)).toEqual({ "modulo.reportes": true });

    const permisos = resolverPermisos(creado);
    expect(permisos.has("modulo.reportes")).toBe(true);
  });
});
