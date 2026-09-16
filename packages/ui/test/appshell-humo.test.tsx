// Pruebas de humo sobre AppShell TAL COMO ESTA HOY (PLATAFORMA-06 no lo toca: el registro
// declarativo de módulos es PLATAFORMA-07, tarea futura). Los nueve módulos y sus atajos
// Alt+N están cableados a mano en packages/ui/src/AppShell.tsx (unión de tipos, arreglo
// MODULOS, record de iconos y cadena de renders) y NO se exportan desde ahí — está
// prohibido tocar ese archivo en esta tarea. Para no clonar esa lista a mano en el test
// (lo que la desincronizaría del código el día que alguien cambie el arreglo real), este
// archivo lee el arreglo `MODULOS` del código fuente de AppShell.tsx con una expresión
// regular en vez de escribirlo de nuevo aquí.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppShell } from "../src/AppShell.js";
import { renderConDatos } from "./_render.js";

// jsdom arranca en 1024px de ancho, que cae en el tramo "medio" de useBreakpoint.ts: ahí la
// barra lateral ya se encogió a una tira de solo iconos y las etiquetas de los módulos dejan
// de tener un nodo de texto visible (solo queda el `aria-label` del botón). Estas pruebas de
// humo verifican la etiqueta VISIBLE, así que necesitan el tramo "amplio" (≥1100px), que es
// además el layout de escritorio real — el que se usa a diario.
beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
});

function etiquetasModulosReales(): string[] {
  // OJO: no se usa `new URL("../src/AppShell.tsx", import.meta.url)` directo — bajo el
  // entorno jsdom de este paquete, el `URL` global se resuelve contra `http://localhost:3000`
  // (la ubicación por defecto que jsdom le da a `window`) en vez de contra `import.meta.url`,
  // así que hay que pasar primero por `fileURLToPath` (que sí ve el import.meta.url real de
  // Node) y recién ahí unir la ruta relativa con `node:path`.
  const aqui = fileURLToPath(import.meta.url);
  const ruta = path.resolve(path.dirname(aqui), "../src/AppShell.tsx");
  const fuente = readFileSync(ruta, "utf-8");
  const arreglo = fuente.match(/const MODULOS: Modulo\[\] = \[([\s\S]*?)\];/);
  if (!arreglo) {
    throw new Error("No se encontró el arreglo MODULOS en AppShell.tsx: el brief asume ese nombre literal.");
  }
  return [...arreglo[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("AppShell (humo)", () => {
  it("el menú lateral renderiza exactamente los nueve módulos actuales por su etiqueta visible", async () => {
    const etiquetas = etiquetasModulosReales();
    expect(etiquetas).toHaveLength(9);

    await renderConDatos(<AppShell plataforma="Web" />);
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    for (const etiqueta of etiquetas) {
      expect(within(nav).getByText(etiqueta)).toBeTruthy();
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
    const etiquetas = etiquetasModulosReales();
    await renderConDatos(<AppShell plataforma="Web" />);
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    const activo = within(nav).getByText(etiquetas[0]).closest("button");
    expect(activo?.getAttribute("aria-current")).toBe("page");
  });

  it("Alt+2 cambia el contenido principal al segundo módulo", async () => {
    const etiquetas = etiquetasModulosReales();
    await renderConDatos(<AppShell plataforma="Web" />);

    fireEvent.keyDown(window, { key: "2", altKey: true });

    const nav = screen.getByRole("navigation", { name: "Módulos" });
    const segundo = within(nav).getByText(etiquetas[1]).closest("button");
    expect(segundo?.getAttribute("aria-current")).toBe("page");

    const titulo = screen.getByRole("heading", { level: 2 });
    expect(titulo.textContent).toContain(etiquetas[1]);
  });
});
