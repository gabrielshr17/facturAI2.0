// Pruebas de humo de la pantalla de Acceso (§ RBAC-05). No reimplementan ninguna regla:
// solo comprueban que la pantalla reacciona correctamente a lo que YA devuelve
// `usuarioRepo.autenticar`/`cambiarPin` (probados a fondo en `packages/core/test/
// usuario-repo.test.ts`). El usuario semilla real es `usuario-admin` (`packages/core/src/
// db/seed.ts`), rol `dueno`, `pin_hash` NULL — por eso el primer escenario es "define tu PIN".
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  SESION_LOCAL,
  conSesion,
  crearPortadorSesion,
  crearRepos,
  migrate,
  permisosDeRol,
  seed,
} from "@sfr/core";
import { createNodeSqliteDriver } from "../../core/src/db/drivers/node-sqlite.js";
import { ProveedorDatos } from "../src/data/contexto.js";
import { ProveedorSesion } from "../src/sesion/contexto.js";
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
    await screen.findByText(/Hola, Administrador/);
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
    await screen.findByText(/Hola, Administrador/);
    escribirPin("0000");
    fireEvent.click(screen.getByText("Entrar (Enter)"));
    await screen.findByText(/Define tu PIN/);

    escribirPin("1234");
    fireEvent.click(screen.getByText("Entrar (Enter)"));

    await waitFor(() => expect(ultimoAutenticado).toBe(true));
  });

  it("un PIN incorrecto sobre un usuario que ya tiene PIN muestra el motivo real del repo", async () => {
    const { repos } = await renderConDatos(<Acceso />);
    await repos.usuario.cambiarPin({
      usuarioId: "usuario-admin",
      pinNuevo: "9999",
      omitirPinActual: true,
    });

    fireEvent.click(await screen.findByText("Administrador"));
    await screen.findByText(/Hola, Administrador/);

    escribirPin("1111");
    fireEvent.click(screen.getByText("Entrar (Enter)"));

    expect(await screen.findByText("El PIN no es correcto.")).toBeTruthy();
  });

  describe("turno abierto por otro usuario", () => {
    async function montarAcceso(opciones: {
      turnoDeAdministrador: boolean;
      rolEntrante?: "cajero" | "supervisor";
    }) {
      const db = createNodeSqliteDriver();
      await migrate(db);
      await seed(db);
      const repos = crearRepos(db);
      await repos.usuario.crear({
        nombre: "Cajero Dos",
        rol: opciones.rolEntrante ?? "cajero",
        pin: "2222",
        activo: true,
      });
      if (opciones.turnoDeAdministrador) {
        const portador = crearPortadorSesion({
          usuarioId: "usuario-admin",
          rol: "dueno",
          permisos: permisosDeRol("dueno"),
        });
        await crearRepos(conSesion(db, portador)).corteCaja.abrirTurno({ montoInicial: 100 });
      }
      render(
        <ProveedorSesion db={db} sesionInicial={SESION_LOCAL}>
          <ProveedorDatos>
            <Acceso />
          </ProveedorDatos>
        </ProveedorSesion>,
      );
    }

    it("avisa al elegir el usuario, antes de pedir el PIN", async () => {
      await montarAcceso({ turnoDeAdministrador: true });

      fireEvent.click(await screen.findByText("Cajero Dos"));

      expect(await screen.findByText("Hay un turno abierto")).toBeTruthy();
      expect(screen.getByText(/Administrador tiene un turno de caja abierto/)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "1" })).toBeNull();
      expect(screen.queryByText(/Hola, Cajero Dos/)).toBeNull();
    });

    it("desde el aviso se vuelve a la lista de usuarios", async () => {
      await montarAcceso({ turnoDeAdministrador: true });

      fireEvent.click(await screen.findByText("Cajero Dos"));
      fireEvent.click(await screen.findByText("Volver"));

      expect(await screen.findByText("¿Quién va a usar la caja?")).toBeTruthy();
    });

    it("un cajero no puede continuar desde el aviso", async () => {
      await montarAcceso({ turnoDeAdministrador: true, rolEntrante: "cajero" });

      fireEvent.click(await screen.findByText("Cajero Dos"));

      await screen.findByText("Hay un turno abierto");
      expect(screen.queryByText("Continuar")).toBeNull();
    });

    it("un supervisor puede continuar al PIN para forzar el cierre", async () => {
      await montarAcceso({ turnoDeAdministrador: true, rolEntrante: "supervisor" });

      fireEvent.click(await screen.findByText("Cajero Dos"));
      await screen.findByText("Hay un turno abierto");
      expect(screen.getByText(/podrás cerrarlo a la fuerza/i)).toBeTruthy();

      fireEvent.click(screen.getByText("Continuar"));

      expect(await screen.findByText(/Hola, Cajero Dos/)).toBeTruthy();
    });

    it("quien abrió el turno entra normal y ve el teclado de PIN", async () => {
      await montarAcceso({ turnoDeAdministrador: true });

      fireEvent.click(await screen.findByText("Administrador"));

      expect(await screen.findByText(/Hola, Administrador/)).toBeTruthy();
      expect(screen.queryByText("Hay un turno abierto")).toBeNull();
    });

    it("sin turno abierto, cualquiera ve el teclado de PIN", async () => {
      await montarAcceso({ turnoDeAdministrador: false });

      fireEvent.click(await screen.findByText("Cajero Dos"));

      expect(await screen.findByText(/Hola, Cajero Dos/)).toBeTruthy();
      expect(screen.queryByText("Hay un turno abierto")).toBeNull();
    });
  });
});
