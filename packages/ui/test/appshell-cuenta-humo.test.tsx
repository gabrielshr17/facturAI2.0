// Pruebas de humo de RBAC-06 sobre la cabecera de AppShell: nombre del usuario activo,
// su rol y el botón de cerrar sesión. Con `usuarioId: null` (SESION_LOCAL, el default
// de instalaciones/pruebas que montan `<AppShell>` sin pasar por `<Acceso>`) no debe
// mostrarse nada de esto ni reventar.
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { permisosDeRol, type PortadorSesion } from "@sfr/core";
import { AppShell } from "../src/AppShell.js";
import { renderConDatos } from "./_render.js";

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  localStorage.clear();
});

describe("AppShell — cuenta activa en la cabecera (humo, RBAC-06)", () => {
  it("sin usuario autenticado (usuarioId null) no muestra nombre ni botón de cerrar sesión", async () => {
    await renderConDatos(<AppShell plataforma="Web" />);
    expect(screen.queryByLabelText("Cerrar sesión")).toBeNull();
  });

  it("con un usuario autenticado, muestra su nombre, su rol y un botón de cerrar sesión funcional", async () => {
    // "usuario-admin" ("Administrador", rol dueño) lo crea `seed()` en cada base nueva
    // (§ db/seed.ts): usarlo evita el error de montar dos `renderConDatos` con bases
    // ":memory:" DISTINTAS, donde un usuario creado en la primera no existiría en la
    // segunda.
    const sesion: PortadorSesion = { usuarioId: "usuario-admin", rol: "dueno", permisos: permisosDeRol("dueno") };

    await renderConDatos(<AppShell plataforma="Web" />, sesion);

    expect(await screen.findByText("Administrador")).toBeTruthy();
    expect(screen.getByText("Dueño")).toBeTruthy();
    const botonSalir = screen.getByLabelText("Cerrar sesión");
    expect(botonSalir).toBeTruthy();
    fireEvent.click(botonSalir);
  });
});
