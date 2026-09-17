// Pruebas del proveedor de sesión (§ RBAC-05): `useSesion` sigue EXACTAMENTE el molde de
// `useRepos`/`useAlertas` (lanza si falta el proveedor). A diferencia de PLATAFORMA-07,
// `<ProveedorSesion db={db}>` ahora es OBLIGATORIO por encima de `<ProveedorDatos>` — ya no
// existe el relleno `ProveedorSesionSiFalta` que montaba una sesión sin envolver el driver.
// La memoización de `ProveedorDatos` (`useMemo([db envuelto])`) se prueba pasando por
// `<ProveedorSesion>`, que es como se usa de verdad: la identidad de `repos` depende del
// driver YA ENVUELTO, que es estable mientras `<ProveedorSesion>` no se desmonte.
import { useState } from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { migrate, seed, SESION_LOCAL, type Repos } from "@sfr/core";
import { createNodeSqliteDriver } from "../../core/src/db/drivers/node-sqlite.js";
import { AppShell } from "../src/AppShell.js";
import { MODULOS } from "../src/navegacion/modulos.js";
import { ProveedorDatos, useRepos } from "../src/data/contexto.js";
import { ProveedorSesion, useSesion } from "../src/sesion/contexto.js";
import { renderConDatos } from "./_render.js";

function SondaSesion() {
  useSesion();
  return null;
}

describe("useSesion / ProveedorSesion", () => {
  it("useSesion fuera de ProveedorSesion lanza un Error con mensaje en español", () => {
    expect(() => render(<SondaSesion />)).toThrow(/useSesion debe usarse dentro de/);
  });

  it("sin ProveedorSesion explícito, la aplicación opera con SESION_LOCAL y todos los módulos visibles", async () => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
    await renderConDatos(<AppShell plataforma="Web" />);
    const nav = screen.getByRole("navigation", { name: "Módulos" });
    for (const modulo of MODULOS) {
      expect(nav.textContent).toContain(modulo.etiqueta);
    }
  });

  it("ProveedorDatos devuelve el MISMO objeto de repos en dos renders con el mismo db", async () => {
    const db = createNodeSqliteDriver();
    await migrate(db);
    await seed(db);

    const capturas: Repos[] = [];
    function Sonda() {
      const repos = useRepos();
      capturas.push(repos);
      return null;
    }
    function Envoltorio() {
      const [, forzar] = useState(0);
      return (
        <div>
          <button onClick={() => forzar((n) => n + 1)}>rerender</button>
          <Sonda />
        </div>
      );
    }

    render(
      <ProveedorSesion db={db} sesionInicial={SESION_LOCAL}>
        <ProveedorDatos>
          <Envoltorio />
        </ProveedorDatos>
      </ProveedorSesion>,
    );
    fireEvent.click(screen.getByText("rerender"));

    expect(capturas.length).toBeGreaterThanOrEqual(2);
    expect(capturas[0]).toBe(capturas[capturas.length - 1]);
  });
});
