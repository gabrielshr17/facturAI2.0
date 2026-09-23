import { describe, it, expect, afterEach } from "vitest";
import {
  registrarManejadorCierreVentana,
  ejecutarManejadorCierreVentana,
} from "../src/cierreVentana.js";

describe("cierreVentana — puente entre AppShell y el cierre real de la ventana (escritorio)", () => {
  afterEach(async () => {
    // Deja el módulo sin manejador registrado entre pruebas.
    await ejecutarManejadorCierreVentana();
  });

  it("sin nadie registrado, deja cerrar", async () => {
    await expect(ejecutarManejadorCierreVentana()).resolves.toBe("cerrar");
  });

  it("delega en el manejador registrado", async () => {
    const desregistrar = registrarManejadorCierreVentana(async () => "cancelar");
    await expect(ejecutarManejadorCierreVentana()).resolves.toBe("cancelar");
    desregistrar();
  });

  it("desregistrar vuelve a dejar cerrar sin más", async () => {
    const desregistrar = registrarManejadorCierreVentana(async () => "cancelar");
    desregistrar();
    await expect(ejecutarManejadorCierreVentana()).resolves.toBe("cerrar");
  });

  it("desregistrar solo quita SU PROPIO manejador (no uno más nuevo que lo reemplazó)", async () => {
    const desregistrarViejo = registrarManejadorCierreVentana(async () => "cancelar");
    registrarManejadorCierreVentana(async () => "cerrar"); // reemplaza sin desregistrar el viejo
    desregistrarViejo(); // no debe tocar el nuevo
    await expect(ejecutarManejadorCierreVentana()).resolves.toBe("cerrar");
  });
});
