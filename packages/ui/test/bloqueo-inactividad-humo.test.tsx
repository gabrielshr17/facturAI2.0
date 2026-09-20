// Pruebas de humo del bloqueo de sesión por inactividad (§ RBAC-07 parte B). No
// reimplementan ninguna regla: `debeBloquear` (@sfr/core, § dominio/sesion-vigencia.ts)
// y `usuarioRepo.autenticar` ya están probados a fondo por separado. Estas pruebas
// verifican que `AppShell` cablea el temporizador, el atajo manual, el guardia de PIN
// y — el punto crítico del brief — que el temporizador de inactividad NO provoca
// re-renders de `ProveedorDatos` (identidad de `repos` estable) ni relanza los
// `useEffect(..., [repo])` de pantallas como `SeccionBitacora` en cada tick.
//
// Nota sobre timers falsos: `screen.findByText`/`waitFor` de Testing Library dependen
// de `setTimeout` real para su polling, así que mezclarlos con `vi.useFakeTimers()`
// los cuelga (el reloj nunca avanza solo). Por eso cada `act(() => vi.advanceTimersByTime(...))`
// va seguido de una lectura SÍNCRONA (`getByText`/`queryByText`), nunca de `findByText`:
// `act` ya vació la cola de microtareas y aplicó el render antes de devolver el control.
import { useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate, seed, crearRepos, permisosDeRol, type PortadorSesion } from "@sfr/core";
import { createNodeSqliteDriver } from "../../core/src/db/drivers/node-sqlite.js";
import { AppShell } from "../src/AppShell.js";
import { ProveedorDatos, useRepos } from "../src/data/contexto.js";
import { ProveedorSesion } from "../src/sesion/contexto.js";

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

async function montarConCajero(pin: string) {
  const db = createNodeSqliteDriver();
  await migrate(db);
  await seed(db);
  const repos = crearRepos(db);
  const cajero = await repos.usuario.crear({ nombre: "Cajero Uno", rol: "cajero", pin, activo: true });
  const sesion: PortadorSesion = { usuarioId: cajero.id, rol: "cajero", permisos: permisosDeRol("cajero") };

  const resultado = render(
    <ProveedorSesion db={db} sesionInicial={sesion}>
      <ProveedorDatos><AppShell plataforma="Web" /></ProveedorDatos>
    </ProveedorSesion>,
  );
  return { ...resultado, db, repos, cajero };
}

function escribirPin(pin: string) {
  for (const digito of pin) {
    fireEvent.click(screen.getByRole("button", { name: digito }));
  }
}

function bloquearConAtajo() {
  act(() => {
    fireEvent.keyDown(window, { key: "l", ctrlKey: true });
  });
}

describe("Bloqueo por inactividad (humo, RBAC-07 parte B)", () => {
  it("Ctrl+L bloquea de inmediato y muestra el modal de PIN", async () => {
    await montarConCajero("1234");

    bloquearConAtajo();

    expect(screen.getByText("Pantalla bloqueada")).toBeTruthy();
  });

  it("Escape NO cierra el modal de bloqueo", async () => {
    await montarConCajero("1234");

    bloquearConAtajo();
    expect(screen.getByText("Pantalla bloqueada")).toBeTruthy();

    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(screen.getByText("Pantalla bloqueada")).toBeTruthy();
  });

  it("mientras está bloqueada, los atajos de pantalla (Ctrl+U) no responden", async () => {
    await montarConCajero("1234");

    bloquearConAtajo();
    expect(screen.getByText("Pantalla bloqueada")).toBeTruthy();

    // Ctrl+U es un atajo de pantalla observable (abre su propio modal) que usa el
    // MISMO mecanismo (`useAtajosTeclado`) que Alt+1..9: sirve de sonda para
    // comprobar que `establecerBloqueoGlobalAtajos` apaga todos los atajos por igual
    // mientras la pantalla está bloqueada.
    act(() => {
      fireEvent.keyDown(window, { key: "u", ctrlKey: true });
    });
    expect(screen.queryByText("¿Quién va a usar la caja ahora?")).toBeNull();
  });

  it("el PIN correcto del mismo usuario desbloquea; el incorrecto no", async () => {
    await montarConCajero("1234");

    bloquearConAtajo();
    expect(screen.getByText("Pantalla bloqueada")).toBeTruthy();

    // El hash de PIN (`@sfr/core`, § dominio/pin.ts) usa PBKDF2 real vía `crypto.subtle`
    // con 100,000 iteraciones: es trabajo de CPU real, no un timer, así que esta prueba
    // usa timers REALES (no llama a `vi.useFakeTimers()`) y espera con `waitFor` normal.
    escribirPin("9999");
    fireEvent.click(screen.getByText("Desbloquear (Enter)"));
    await waitFor(() => expect(screen.getByText("El PIN no es correcto.")).toBeTruthy());
    expect(screen.getByText("Pantalla bloqueada")).toBeTruthy();

    // `avisar()` (`useAlertas`) devuelve una promesa que solo se resuelve cuando se
    // descarta el aviso — hay que cerrarlo para que `intentarDesbloquear` termine de
    // limpiar el PIN antes del siguiente intento.
    fireEvent.click(screen.getByText(/Entendido/));
    await waitFor(() => expect(screen.queryByText("El PIN no es correcto.")).toBeNull());

    escribirPin("1234");
    fireEvent.click(screen.getByText("Desbloquear (Enter)"));
    await waitFor(() => expect(screen.queryByText("Pantalla bloqueada")).toBeNull());
  });

  it("el bloqueo automático ocurre exactamente al límite de 5 minutos de inactividad", async () => {
    vi.useFakeTimers();
    await montarConCajero("1234");

    // Justo por debajo del límite: todavía no debe bloquear.
    act(() => {
      vi.advanceTimersByTime(5 * 60_000 - 5_000);
    });
    expect(screen.queryByText("Pantalla bloqueada")).toBeNull();

    // Cruza el límite: el próximo chequeo (cada 5s) debe bloquear.
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText("Pantalla bloqueada")).toBeTruthy();
  });

  it("VERIFICACIÓN CRÍTICA: varios ticks del temporizador sin cruzar el límite no cambian la identidad de `repos` ni relanzan un useEffect([repo])", async () => {
    vi.useFakeTimers();
    const db = createNodeSqliteDriver();
    await migrate(db);
    await seed(db);
    const repos = crearRepos(db);
    const cajero = await repos.usuario.crear({ nombre: "Cajero Uno", rol: "cajero", pin: "1234", activo: true });
    const sesion: PortadorSesion = { usuarioId: cajero.id, rol: "cajero", permisos: permisosDeRol("cajero") };

    const identidadesRepos: unknown[] = [];
    let efectosDisparados = 0;

    // Imita exactamente el patrón de `SeccionBitacora.tsx`: un `useEffect(..., [repo])`
    // que dispararía una consulta de más cada vez que `repos` cambiara de identidad.
    function SondaEfectoSobreRepo() {
      const { bitacora } = useRepos();
      identidadesRepos.push(bitacora);
      useEffect(() => {
        efectosDisparados += 1;
      }, [bitacora]);
      return null;
    }

    render(
      <ProveedorSesion db={db} sesionInicial={sesion}>
        <ProveedorDatos>
          <SondaEfectoSobreRepo />
          <AppShell plataforma="Web" />
        </ProveedorDatos>
      </ProveedorSesion>,
    );

    expect(efectosDisparados).toBe(1);

    // Deja correr varios ticks del temporizador (5s cada uno) sin cruzar el límite de
    // 5 minutos ni tocar el teclado/mouse: si el temporizador viviera en estado en vez
    // de en refs, cada tick re-renderizaría el árbol y `repos` cambiaría de identidad.
    for (let i = 0; i < 12; i++) {
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
    }

    expect(efectosDisparados).toBe(1);
    expect(new Set(identidadesRepos).size).toBe(1);
  });
});
