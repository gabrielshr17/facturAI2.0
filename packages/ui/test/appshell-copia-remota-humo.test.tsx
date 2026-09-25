import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { SESION_COPIA_REMOTA } from "@sfr/core";
import { AppShell } from "../src/AppShell.js";
import { renderConDatos } from "./_render.js";

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  localStorage.clear();
});

describe("AppShell con la sesión de la copia remota", () => {
  it("oculta Ventas y deja el corte de caja y los módulos de administración", async () => {
    await renderConDatos(<AppShell plataforma="Web" />, SESION_COPIA_REMOTA);

    const nav = screen.getByRole("navigation", { name: "Módulos" });
    expect(within(nav).queryByText("Ventas")).toBeNull();
    for (const etiqueta of ["Productos", "Clientes", "Compras", "Reportes", "Corte de caja"]) {
      expect(within(nav).getByText(etiqueta)).toBeTruthy();
    }
  });

  it("abre en un módulo permitido en vez de Ventas", async () => {
    await renderConDatos(<AppShell plataforma="Web" />, SESION_COPIA_REMOTA);

    const nav = screen.getByRole("navigation", { name: "Módulos" });
    const activo = nav.querySelector("[aria-current='page']");
    expect(activo?.textContent).not.toContain("Ventas");
    expect(activo).not.toBeNull();
  });
});
