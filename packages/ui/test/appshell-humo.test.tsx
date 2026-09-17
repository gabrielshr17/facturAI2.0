// Pruebas de humo sobre AppShell. Actualizado por PLATAFORMA-07 (ola 2): antes de este
// refactor los nueve módulos estaban cableados a mano DENTRO de AppShell.tsx (unión de
// tipos, arreglo MODULOS, record de iconos y cadena de renders), y como el archivo no los
// exportaba, este test tenía que leer su código fuente con una expresión regular para no
// clonar esa lista a mano. Ahora `MODULOS` vive en `navegacion/modulos.ts` y SÍ se exporta:
// el regex ya no hace falta, se importa el arreglo real como cualquier otro módulo.
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "../src/AppShell.js";
import { MODULOS } from "../src/navegacion/modulos.js";
import { renderConDatos } from "./_render.js";

// jsdom arranca en 1024px de ancho, que cae en el tramo "medio" de useBreakpoint.ts: ahí la
// barra lateral ya se encogió a una tira de solo iconos y las etiquetas de los módulos dejan
// de tener un nodo de texto visible (solo queda el `aria-label` del botón). Estas pruebas de
// humo verifican la etiqueta VISIBLE, así que necesitan el tramo "amplio" (≥1100px), que es
// además el layout de escritorio real — el que se usa a diario.
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  localStorage.clear();
});

describe("AppShell (humo)", () => {
  it("el menú lateral renderiza exactamente los módulos actuales por su etiqueta visible", async () => {
    await renderConDatos(<AppShell plataforma="Web" />);
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    for (const modulo of MODULOS) {
      expect(within(nav).getByText(modulo.etiqueta)).toBeTruthy();
    }
  });

  it("existe el enlace 'Saltar al contenido' como primer elemento enfocable", async () => {
    await renderConDatos(<AppShell plataforma="Web" />);
    const enlace = screen.getByText("Saltar al contenido");
    expect(enlace.tagName).toBe("A");
    expect(enlace.getAttribute("href")).toBe("#contenido-principal");
    const focosables = document.querySelectorAll("a[href], button, input, select, textarea");
    expect(focosables[0]).toBe(enlace);
  });

  it("el módulo activo se marca con aria-current='page'", async () => {
    await renderConDatos(<AppShell plataforma="Web" />);
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    const activo = within(nav).getByText(MODULOS[0].etiqueta).closest("button");
    expect(activo?.getAttribute("aria-current")).toBe("page");
  });

  it("Alt+2 cambia el contenido principal al segundo módulo", async () => {
    await renderConDatos(<AppShell plataforma="Web" />);

    fireEvent.keyDown(window, { key: "2", altKey: true });

    const nav = screen.getByRole("navigation", { name: "Módulos" });
    const segundo = within(nav).getByText(MODULOS[1].etiqueta).closest("button");
    expect(segundo?.getAttribute("aria-current")).toBe("page");

    const titulo = screen.getByRole("heading", { level: 2 });
    expect(titulo.textContent).toContain(MODULOS[1].etiqueta);
  });
});
