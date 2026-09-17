// Pruebas de humo de la pantalla de Acceso (§ RBAC-05). No reimplementan ninguna regla:
// solo comprueban que la pantalla reacciona correctamente a lo que YA devuelve
// `usuarioRepo.autenticar`/`cambiarPin` (probados a fondo en `packages/core/test/
// usuario-repo.test.ts`). El usuario semilla real es `usuario-admin` (`packages/core/src/
// db/seed.ts`), rol `dueno`, `pin_hash` NULL — por eso el primer escenario es "define tu PIN".
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Acceso } from "../src/pantallas/Acceso.js";
import { useSesion } from "../src/sesion/contexto.js";
import { renderConDatos } from "./_render.js";

function SondaAutenticado({ onCambio }: { onCambio: (autenticado: boolean) => void }) {
  const { autenticado } = useSesion();
  onCambio(autenticado);
  return null;
}

function escribirPin(pin: string) {
  for (const digito of pin) {
    fireEvent.click(screen.getByRole("button", { name: digito }));
  }
}

describe("Acceso (humo)", () => {
  it("primer arranque: el usuario semilla sin PIN pide definir uno tras el primer intento", async () => {
    await renderConDatos(<Acceso />);
    fireEvent.click(await screen.findByText("Administrador"));
    // El primer intento de acceso es indistinguible de un login normal para quien lo escribe
    // (no hay forma de saber de antemano que el usuario no tiene PIN sin consumir un intento):
    // se escribe cualquier PIN válido y `autenticar` responde `motivo: 'sin_pin'` ANTES de
    // comparar nada — usuario-repo.ts revisa `pin_hash == null` antes de tocar los intentos
    // fallidos, así que este primer intento no cuenta como un PIN incorrecto.
    escribirPin("0000");
    fireEvent.click(screen.getByText("Entrar (Enter)"));

    expect(await screen.findByText(/Define tu PIN/)).toBeTruthy();
    expect(screen.queryByText(/Hola, Administrador/)).toBeNull();
  });

  it("definir el PIN nuevo autentica y deja la sesión autenticada", async () => {
    let ultimoAutenticado = false;
    function ArbolDePrueba() {
      return (
        <>
          <SondaAutenticado onCambio={(a) => (ultimoAutenticado = a)} />
          <Acceso />
        </>
      );
    }
    await renderConDatos(<ArbolDePrueba />);
    fireEvent.click(await screen.findByText("Administrador"));
    escribirPin("0000");
    fireEvent.click(screen.getByText("Entrar (Enter)"));
    await screen.findByText(/Define tu PIN/);

    escribirPin("1234");
    fireEvent.click(screen.getByText("Entrar (Enter)"));

    await waitFor(() => expect(ultimoAutenticado).toBe(true));
  });

  it("un PIN incorrecto sobre un usuario que ya tiene PIN muestra el motivo real del repo", async () => {
    const { repos } = await renderConDatos(<Acceso />);
    await repos.usuario.cambiarPin({ usuarioId: "usuario-admin", pinNuevo: "9999", omitirPinActual: true });

    fireEvent.click(await screen.findByText("Administrador"));
    await screen.findByText(/Hola, Administrador/);

    escribirPin("1111");
    fireEvent.click(screen.getByText("Entrar (Enter)"));

    expect(await screen.findByText("El PIN no es correcto.")).toBeTruthy();
  });
});
