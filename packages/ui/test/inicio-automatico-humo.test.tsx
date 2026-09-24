import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { permisosDeRol, type PortadorSesion } from "@sfr/core";
import { Configuracion } from "../src/pantallas/Configuracion.js";
import { ProveedorAlertas } from "../src/contexto/Alertas.js";
import {
  configurarAdaptadorInicioAutomatico,
  type AdaptadorInicioAutomatico,
} from "../src/sistema/inicio-automatico.js";
import { renderConDatos } from "./_render.js";

const sesionDueno: PortadorSesion = {
  usuarioId: null,
  rol: "dueno",
  permisos: permisosDeRol("dueno"),
};

function adaptadorCon(activoInicial: boolean): AdaptadorInicioAutomatico {
  let activo = activoInicial;
  return {
    estaActivo: vi.fn(async () => activo),
    activar: vi.fn(async () => {
      activo = true;
    }),
    desactivar: vi.fn(async () => {
      activo = false;
    }),
  };
}

async function montar() {
  await renderConDatos(
    <ProveedorAlertas>
      <Configuracion />
    </ProveedorAlertas>,
    sesionDueno,
  );
}

const ETIQUETA = "Iniciar facturAI al encender Windows";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  configurarAdaptadorInicioAutomatico(null);
});

describe("Configuración — iniciar con Windows", () => {
  it("sin adaptador (web) la opción no aparece", async () => {
    await montar();
    await screen.findByText("Respaldo y exportación");
    expect(screen.queryByLabelText(ETIQUETA)).toBeNull();
  });

  it("refleja el estado real de Windows: desactivado", async () => {
    configurarAdaptadorInicioAutomatico(adaptadorCon(false));
    await montar();
    const interruptor = (await screen.findByLabelText(ETIQUETA)) as HTMLInputElement;
    await waitFor(() => expect(interruptor.disabled).toBe(false));
    expect(interruptor.checked).toBe(false);
  });

  it("refleja el estado real de Windows: activado", async () => {
    configurarAdaptadorInicioAutomatico(adaptadorCon(true));
    await montar();
    const interruptor = (await screen.findByLabelText(ETIQUETA)) as HTMLInputElement;
    await waitFor(() => expect(interruptor.checked).toBe(true));
  });

  it("al activarlo llama al adaptador y queda activado", async () => {
    const adaptador = adaptadorCon(false);
    configurarAdaptadorInicioAutomatico(adaptador);
    await montar();
    const interruptor = (await screen.findByLabelText(ETIQUETA)) as HTMLInputElement;
    await waitFor(() => expect(interruptor.disabled).toBe(false));
    fireEvent.click(interruptor);
    await waitFor(() => expect(adaptador.activar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(interruptor.checked).toBe(true));
  });

  it("al desactivarlo llama al adaptador y queda desactivado", async () => {
    const adaptador = adaptadorCon(true);
    configurarAdaptadorInicioAutomatico(adaptador);
    await montar();
    const interruptor = (await screen.findByLabelText(ETIQUETA)) as HTMLInputElement;
    await waitFor(() => expect(interruptor.checked).toBe(true));
    fireEvent.click(interruptor);
    await waitFor(() => expect(adaptador.desactivar).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(interruptor.checked).toBe(false));
  });

  it("si Windows rechaza el cambio, muestra el error y el resto de Configuración sigue", async () => {
    const adaptador = adaptadorCon(false);
    adaptador.activar = vi.fn(async () => {
      throw new Error("acceso denegado");
    });
    configurarAdaptadorInicioAutomatico(adaptador);
    await montar();
    const interruptor = (await screen.findByLabelText(ETIQUETA)) as HTMLInputElement;
    await waitFor(() => expect(interruptor.disabled).toBe(false));
    fireEvent.click(interruptor);
    expect(await screen.findByText(/acceso denegado/)).toBeTruthy();
    expect(interruptor.checked).toBe(false);
    expect(screen.getByText("Respaldo y exportación")).toBeTruthy();
  });

  it("si no puede leer el estado, avisa que no está disponible", async () => {
    const adaptador = adaptadorCon(false);
    adaptador.estaActivo = vi.fn(async () => {
      throw new Error("plugin ausente");
    });
    configurarAdaptadorInicioAutomatico(adaptador);
    await montar();
    expect(await screen.findByText(/no está disponible/i)).toBeTruthy();
    expect(screen.getByText("Respaldo y exportación")).toBeTruthy();
  });
});
