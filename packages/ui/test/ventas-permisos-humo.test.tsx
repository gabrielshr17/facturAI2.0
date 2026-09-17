// Pruebas de humo de RBAC-06 sobre Ventas: el botón "Modificar" de la búsqueda de
// productos es SOLO cosmética (§ Ventas.tsx, abrirEdicionProducto) — el guardia real
// vive en `producto-repo.actualizar` desde RBAC-04, y esto solo verifica que el atajo
// visual respete el permiso `producto.editar` sin duplicar ninguna regla de negocio.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { permisosDeRol, type PortadorSesion } from "@sfr/core";
import { Ventas } from "../src/pantallas/Ventas.js";
import { ProveedorAlertas } from "../src/contexto/Alertas.js";
import { renderConDatos } from "./_render.js";

function sesionDe(rol: "cajero" | "dueno"): PortadorSesion {
  return { usuarioId: null, rol, permisos: permisosDeRol(rol) };
}

async function buscarArroz(): Promise<void> {
  // El ticket activo se crea de forma asíncrona al montar (§ "Cargando ticket…"): hay que
  // esperar a que el campo de búsqueda exista antes de escribir en él.
  const campo = await screen.findByLabelText("Buscar producto por nombre o código de barra");
  fireEvent.change(campo, { target: { value: "Arroz" } });
  await screen.findByRole("listbox", { name: "Resultados de la búsqueda" });
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  localStorage.clear();
  // jsdom no implementa `scrollIntoView` (§ Ventas.tsx, resultado resaltado de la búsqueda);
  // sin este relleno cualquier prueba que resalte un resultado revienta con un `TypeError`
  // que no tiene nada que ver con el permiso que esta prueba verifica.
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
});

describe("Ventas — botón Modificar por permiso (humo, RBAC-06)", () => {
  it("con producto.editar (dueño), el botón Modificar aparece en el resultado", async () => {
    await renderConDatos(
      <ProveedorAlertas><Ventas /></ProveedorAlertas>,
      sesionDe("dueno"),
    );
    await buscarArroz();
    const lista = screen.getByRole("listbox", { name: "Resultados de la búsqueda" });
    expect(within(lista).getByText("Modificar")).toBeTruthy();
  });

  it("sin producto.editar (cajero), el botón Modificar no aparece", async () => {
    await renderConDatos(
      <ProveedorAlertas><Ventas /></ProveedorAlertas>,
      sesionDe("cajero"),
    );
    await buscarArroz();
    const lista = screen.getByRole("listbox", { name: "Resultados de la búsqueda" });
    await waitFor(() => expect(within(lista).queryByText("Modificar")).toBeNull());
  });
});
