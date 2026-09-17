// Pruebas del registro declarativo de módulos (§ PLATAFORMA-07, ola 2): el atajo es un
// dato fijo por módulo (nunca el índice del arreglo), un módulo con `atajo: null` es
// válido, y filtrar por permiso no debe reasignar ningún Alt+N a otro módulo ni dejar
// navegar hacia lo que la sesión no puede ver.
import { Info } from "lucide-react";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PERMISOS, type Permiso, type PortadorSesion } from "@sfr/core";
import { AppShell } from "../src/AppShell.js";
import { MODULOS, MODULO_POR_DEFECTO_ID, type ModuloDef } from "../src/navegacion/modulos.js";
import { renderConDatos } from "./_render.js";

function sesionSinPermisos(...quitar: Permiso[]): PortadorSesion {
  const permisos = new Set(PERMISOS);
  for (const p of quitar) permisos.delete(p);
  return { usuarioId: null, rol: "dueno", permisos };
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  localStorage.clear();
});

describe("MODULOS (registro declarativo)", () => {
  it("el menú renderiza un botón por cada entrada de MODULOS", async () => {
    await renderConDatos(<AppShell plataforma="Web" />);
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    // Con SESION_LOCAL (todos los permisos) cada entrada de MODULOS aparece por su
    // etiqueta: se cuenta a partir del arreglo importado, no de una lista escrita a mano.
    for (const modulo of MODULOS) {
      expect(within(nav).getByText(modulo.etiqueta)).toBeTruthy();
    }
  });

  it("agregar una entrada de prueba al registro la hace aparecer en el menú sin tocar AppShell", async () => {
    const moduloPrueba: ModuloDef = {
      id: "modulo-de-prueba",
      etiqueta: "Módulo de prueba",
      icono: Info,
      atajo: null,
      permiso: null,
      componente: () => <div>Contenido de prueba</div>,
    };
    MODULOS.push(moduloPrueba);
    try {
      await renderConDatos(<AppShell plataforma="Web" />);
      const nav = screen.getByRole("navigation", { name: "Módulos" });
      expect(within(nav).getByText("Módulo de prueba")).toBeTruthy();
    } finally {
      MODULOS.splice(MODULOS.indexOf(moduloPrueba), 1);
    }
  });

  it("con una sesión sin el permiso de un módulo, ese botón no se renderiza", async () => {
    const modulo = MODULOS.find((m) => m.permiso === "modulo.reportes")!;
    await renderConDatos(<AppShell plataforma="Web" />, sesionSinPermisos("modulo.reportes"));
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    expect(within(nav).queryByText(modulo.etiqueta)).toBeNull();
  });

  it("con esa misma sesión, pulsar el atajo del módulo sin permiso no cambia el contenido principal", async () => {
    const modulo = MODULOS.find((m) => m.permiso === "modulo.reportes")!;
    await renderConDatos(<AppShell plataforma="Web" />, sesionSinPermisos("modulo.reportes"));

    const numero = modulo.atajo!.replace("Alt+", "");
    fireEvent.keyDown(window, { key: numero, altKey: true });

    const titulo = screen.getByRole("heading", { level: 2 });
    expect(titulo.textContent).not.toContain(modulo.etiqueta);
  });

  it("quitar un módulo por permiso no cambia a qué módulo lleva otro Alt+N", async () => {
    const corteCaja = MODULOS.find((m) => m.permiso === "modulo.corte_caja")!;
    const reportes = MODULOS.find((m) => m.permiso === "modulo.reportes")!;
    await renderConDatos(<AppShell plataforma="Web" />, sesionSinPermisos("modulo.corte_caja"));

    fireEvent.keyDown(window, { key: reportes.atajo!.replace("Alt+", ""), altKey: true });

    const titulo = screen.getByRole("heading", { level: 2 });
    expect(titulo.textContent).toContain(reportes.etiqueta);
    expect(titulo.textContent).not.toContain(corteCaja.etiqueta);
  });

  it("un módulo con atajo null aparece en el menú y no registra ningún atajo de teclado", async () => {
    const moduloSinAtajo: ModuloDef = {
      id: "sin-atajo",
      etiqueta: "Sin atajo",
      icono: Info,
      atajo: null,
      permiso: null,
      componente: () => <div>Sin atajo</div>,
    };
    MODULOS.push(moduloSinAtajo);
    try {
      await renderConDatos(<AppShell plataforma="Web" />);
      const nav = screen.getByRole("navigation", { name: "Módulos" });
      expect(within(nav).getByText("Sin atajo")).toBeTruthy();

      // Ninguna combinación Alt+N (1..9, el rango que hoy existe) activa el módulo sin
      // atajo: no hay ningún número que lo "herede" por posición en el arreglo.
      for (let n = 1; n <= 9; n++) {
        fireEvent.keyDown(window, { key: String(n), altKey: true });
      }
      const titulo = screen.getByRole("heading", { level: 2 });
      expect(titulo.textContent).not.toContain("Sin atajo");
    } finally {
      MODULOS.splice(MODULOS.indexOf(moduloSinAtajo), 1);
    }
  });

  it("el módulo activo se guarda y se recupera al volver a montar AppShell", async () => {
    const segundoModulo = MODULOS[1];
    const primerMontaje = await renderConDatos(<AppShell plataforma="Web" />);
    fireEvent.click(screen.getByText(segundoModulo.etiqueta));
    // Sin desmontar antes del segundo `renderConDatos`, ambos AppShell quedarían en el
    // mismo DOM y `getByRole` empezaría a fallar por ambigüedad, no por un bug real.
    primerMontaje.unmount();

    await renderConDatos(<AppShell plataforma="Web" />);
    const titulo = screen.getByRole("heading", { level: 2 });
    expect(titulo.textContent).toContain(segundoModulo.etiqueta);
  });

  it("si el módulo persistido ya no está permitido, se abre Ventas", async () => {
    const reportes = MODULOS.find((m) => m.permiso === "modulo.reportes")!;
    localStorage.setItem("sfr-modulo-activo", reportes.id);

    await renderConDatos(<AppShell plataforma="Web" />, sesionSinPermisos("modulo.reportes"));

    const ventas = MODULOS.find((m) => m.id === MODULO_POR_DEFECTO_ID)!;
    const titulo = screen.getByRole("heading", { level: 2 });
    expect(titulo.textContent).toContain(ventas.etiqueta);
  });
});
